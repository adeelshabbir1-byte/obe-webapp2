import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { loadSplit } from "../../../lib/courseSplit";

// The Chairman (department head) decides who handles each course in his department; the Institute Head can do it for any department.
async function scope(user: { id: string; role: string; managedById: string | null; departmentId?: string | null }, departmentId: string | null) {
  if (user.role === "HEAD_OF_DEPARTMENT") return user.departmentId && user.managedById ? { chairmanId: user.managedById, departmentId: user.departmentId } : null;
  if (user.role === "CHAIRMAN" && departmentId) {
    const d = await prisma.department.findFirst({ where: { id: departmentId, chairmanId: user.id } });
    return d ? { chairmanId: user.id, departmentId: d.id } : null;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const s = await scope(user, new URL(req.url).searchParams.get("departmentId"));
  if (!s) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await loadSplit(s.chairmanId, s.departmentId));
}

// body: { departmentId?, assignments: [{ key, ownerId | null }] } - null clears the choice (back to "not decided").
export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const s = await scope(user, body.departmentId || null);
  if (!s) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!Array.isArray(body.assignments)) return NextResponse.json({ error: "assignments are required" }, { status: 400 });

  const leads = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: s.chairmanId, departmentId: s.departmentId }, select: { id: true } });
  const leadIds = new Set(leads.map((l) => l.id));
  let set = 0, cleared = 0;
  for (const a of body.assignments as { key: string; ownerId: string | null }[]) {
    const key = String(a.key || "").trim().toLowerCase();
    if (!key) continue;
    const where = { chairmanId_departmentId_courseKey: { chairmanId: s.chairmanId, departmentId: s.departmentId, courseKey: key } };
    if (!a.ownerId) { await prisma.courseOwner.deleteMany({ where: { chairmanId: s.chairmanId, departmentId: s.departmentId, courseKey: key } }); cleared++; continue; }
    if (!leadIds.has(a.ownerId)) return NextResponse.json({ error: "that person is not a Program Lead of this department" }, { status: 400 });
    await prisma.courseOwner.upsert({ where, update: { ownerId: a.ownerId, assignedById: user.id }, create: { chairmanId: s.chairmanId, departmentId: s.departmentId, courseKey: key, ownerId: a.ownerId, assignedById: user.id } });
    set++;
  }
  await writeAuditLog({ actorUserId: user.id, action: "COURSE_SPLIT_UPDATED", entityType: "Department", entityId: s.departmentId, metadata: { set, cleared } });
  return NextResponse.json({ ok: true, set, cleared });
}
