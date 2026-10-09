import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { labScope } from "../../../../lib/resources";

const str = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const optInt = (v: unknown, min = 0, max = 100000) => { if (v === "" || v == null) return null; const n = parseInt(String(v), 10); return Number.isFinite(n) && n >= min && n <= max ? n : null; };

// Adds or changes one line of PC specifications for a lab the person looks after.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const scope = await labScope(user);
  if (!scope || !scope.canEdit) return NextResponse.json({ error: "only the Lab Manager or the Institute Head can change lab data" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const lab = await prisma.labInfo.findFirst({ where: { id: String(b.labId || ""), chairmanId: scope.chairmanId, ...(scope.departmentIds ? { departmentId: { in: scope.departmentIds } } : {}) } });
  if (!lab) return NextResponse.json({ error: "lab not found" }, { status: 404 });
  const quantity = optInt(b.quantity, 1);
  if (!quantity) return NextResponse.json({ error: "enter how many computers of this kind there are" }, { status: 400 });
  const data = { quantity, makeModel: str(b.makeModel), processor: str(b.processor), ramGb: optInt(b.ramGb, 1, 4096), storage: str(b.storage), gpu: str(b.gpu), os: str(b.os), purchaseYear: optInt(b.purchaseYear, 1990, 2100), notes: str(b.notes, 500) };
  if (b.id) {
    const mine = await prisma.labComputerSpec.findFirst({ where: { id: String(b.id), labId: lab.id } });
    if (!mine) return NextResponse.json({ error: "not found" }, { status: 404 });
    await prisma.labComputerSpec.update({ where: { id: mine.id }, data });
  } else {
    await prisma.labComputerSpec.create({ data: { chairmanId: scope.chairmanId, labId: lab.id, ...data } });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const scope = await labScope(user);
  if (!scope || !scope.canEdit) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || "";
  const spec = await prisma.labComputerSpec.findFirst({ where: { id, chairmanId: scope.chairmanId } });
  if (!spec) return NextResponse.json({ ok: false });
  const lab = await prisma.labInfo.findFirst({ where: { id: spec.labId, ...(scope.departmentIds ? { departmentId: { in: scope.departmentIds } } : {}) } });
  if (!lab) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await prisma.labComputerSpec.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
