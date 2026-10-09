import { logChange } from "../../../lib/changeLog";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { labScope } from "../../../lib/resources";

const str = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const int = (v: unknown) => { const n = parseInt(String(v ?? ""), 10); return Number.isFinite(n) && n >= 0 ? n : 0; };

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const scope = await labScope(user);
  if (!scope || !scope.canEdit) return NextResponse.json({ error: "only the Lab Manager or the Institute Head can change lab data" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const name = str(b.name, 120);
  if (!name) return NextResponse.json({ error: "the lab needs a name" }, { status: 400 });
  const computers = int(b.computers);
  const working = Math.min(int(b.computersWorking), computers);
  // A Lab Manager always works in their own department; the Institute Head names the department.
  let departmentId: string | null = scope.departmentIds ? scope.departmentIds[0] || null : str(b.departmentId, 60);
  if (!scope.departmentIds && departmentId) {
    const d = await prisma.department.findFirst({ where: { id: departmentId, chairmanId: scope.chairmanId } });
    if (!d) return NextResponse.json({ error: "department not found" }, { status: 400 });
  }
  const last = typeof b.lastAudit === "string" && b.lastAudit ? new Date(b.lastAudit) : null;
  const data = {
    name, departmentId, location: str(b.location, 160), seats: int(b.seats), computers, computersWorking: working,
    software: str(b.software, 2000), equipment: str(b.equipment, 2000), internetMbps: b.internetMbps === "" || b.internetMbps == null ? null : int(b.internetMbps),
    lastAudit: last && !isNaN(last.getTime()) ? last : null, notes: str(b.notes, 2000), updatedById: user.id,
  };
  try {
    if (b.id) {
      const mine = await prisma.labInfo.findFirst({ where: { id: b.id, chairmanId: scope.chairmanId, ...(scope.departmentIds ? { departmentId: { in: scope.departmentIds } } : {}) } });
      if (!mine) return NextResponse.json({ error: "lab not found" }, { status: 404 });
      await prisma.labInfo.update({ where: { id: mine.id }, data });
    } else {
      await prisma.labInfo.create({ data: { chairmanId: scope.chairmanId, ...data } });
    }
  } catch {
    return NextResponse.json({ error: "a lab with that name already exists" }, { status: 409 });
  }
  await logChange(scope.chairmanId, "LABS", `Lab ${b.id ? "updated" : "added"}: ${name} (${computers} computers, ${working} working)`, user.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const scope = await labScope(user);
  if (!scope || !scope.canEdit) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id") || "";
  const r = await prisma.labInfo.deleteMany({ where: { id, chairmanId: scope.chairmanId, ...(scope.departmentIds ? { departmentId: { in: scope.departmentIds } } : {}) } });
  return NextResponse.json({ ok: r.count > 0 });
}
