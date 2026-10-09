import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { KIND_NAMES } from "../../../../lib/facultyProfile";

const ownerId = (u: { id: string }) => (u as { realUserId?: string }).realUserId || u.id;
const str = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const year = (v: unknown) => { const n = parseInt(String(v ?? ""), 10); return Number.isFinite(n) && n >= 1950 && n <= 2100 ? n : null; };

// Add (no id) or change (with id) one education / experience / paper / grant / project / event row of my own profile.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  if (!KIND_NAMES.includes(b.kind)) return NextResponse.json({ error: "unknown kind" }, { status: 400 });
  const title = str(b.title, 250);
  if (!title) return NextResponse.json({ error: "a title is required" }, { status: 400 });
  if (b.photo && (typeof b.photo !== "string" || !b.photo.startsWith("data:image/") || b.photo.length > 400_000)) return NextResponse.json({ error: "the picture is too large - choose a smaller one" }, { status: 400 });
  const data = {
    title, organisation: str(b.organisation, 250), role: str(b.role, 120), startYear: year(b.startYear), endYear: year(b.endYear),
    amount: str(b.amount, 80), status: str(b.status, 40), link: str(b.link, 400), details: str(b.details, 2000),
    ...(b.photo !== undefined ? { photo: b.photo || null } : {}),
  };
  const me = ownerId(user);
  if (b.id) {
    const mine = await prisma.facultyRecord.findFirst({ where: { id: b.id, userId: me } });
    if (!mine) return NextResponse.json({ error: "not found" }, { status: 404 });
    const rec = await prisma.facultyRecord.update({ where: { id: mine.id }, data });
    return NextResponse.json({ ok: true, record: rec });
  }
  const rec = await prisma.facultyRecord.create({ data: { userId: me, kind: b.kind, ...data } });
  return NextResponse.json({ ok: true, record: rec });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  const res = await prisma.facultyRecord.deleteMany({ where: { id, userId: ownerId(user) } });
  return NextResponse.json({ ok: res.count > 0 });
}
