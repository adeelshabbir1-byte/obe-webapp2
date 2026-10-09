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
  return NextResponse.json(await loadSplit(s.chairmanId, s.departmentId, user.role === "CHAIRMAN" ? null : s.departmentId));
}

// body: { departmentId?, assignments: [{ key, ownerId | null }] } - null clears the choice (back to "not decided").
export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const s = await scope(user, body.departmentId || null);
  if (!s) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!Array.isArray(body.assignments)) return NextResponse.json({ error: "assignments are required" }, { status: 400 });

  // Any Program Lead of the institute may be named; another department's lead must be accepted by his Chairman first.
  const leads = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: s.chairmanId, departmentId: { not: null } }, select: { id: true, departmentId: true } });
  const leadDept = new Map<string, string | null>(leads.map((l) => [l.id, l.departmentId]));
  let set = 0, cleared = 0;
  for (const a of body.assignments as { key: string; ownerId: string | null }[]) {
    const key = String(a.key || "").trim().toLowerCase();
    if (!key) continue;
    const where = { chairmanId_departmentId_courseKey: { chairmanId: s.chairmanId, departmentId: s.departmentId, courseKey: key } };
    if (!a.ownerId) { await prisma.courseOwner.deleteMany({ where: { chairmanId: s.chairmanId, departmentId: s.departmentId, courseKey: key } }); cleared++; continue; }
    if (!leadDept.has(a.ownerId)) return NextResponse.json({ error: "that person is not a Program Lead of this institute" }, { status: 400 });
    const ownerDepartmentId = leadDept.get(a.ownerId) || s.departmentId;
    const status = ownerDepartmentId === s.departmentId ? "ACCEPTED" : "PENDING";
    await prisma.courseOwner.upsert({ where, update: { ownerId: a.ownerId, ownerDepartmentId, status, assignedById: user.id }, create: { chairmanId: s.chairmanId, departmentId: s.departmentId, courseKey: key, ownerId: a.ownerId, ownerDepartmentId, status, assignedById: user.id } });
    set++;
  }
  await writeAuditLog({ actorUserId: user.id, action: "COURSE_SPLIT_UPDATED", entityType: "Department", entityId: s.departmentId, metadata: { set, cleared } });
  return NextResponse.json({ ok: true, set, cleared });
}

// A course another department is asked to take can be accepted by that department's Chairman, by the Dean of its faculty,
// or by the Program Lead who would handle it. The Institute Head does not have to, but can.
// body: { id, action: "ACCEPT" | "DECLINE" } or { action: "ACCEPT_ALL" }
export async function PATCH(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !["HEAD_OF_DEPARTMENT", "CHAIRMAN", "DEAN", "PROGRAM_COORDINATOR"].includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById || "";
  const facultyDepts = user.role === "DEAN" ? new Set((await prisma.department.findMany({ where: { chairmanId, facultyId: user.facultyId || "none" }, select: { id: true } })).map((d) => d.id)) : null;
  const canAnswer = (r: { ownerId: string; ownerDepartmentId: string | null }) =>
    user.role === "CHAIRMAN" ? true
    : user.role === "HEAD_OF_DEPARTMENT" ? r.ownerDepartmentId === user.departmentId
    : user.role === "DEAN" ? !!r.ownerDepartmentId && !!facultyDepts?.has(r.ownerDepartmentId)
    : r.ownerId === user.id;

  if (body.action === "ACCEPT_ALL") {
    const pending = await prisma.courseOwner.findMany({ where: { chairmanId, status: "PENDING" } });
    const mine = pending.filter(canAnswer);
    if (mine.length) await prisma.courseOwner.updateMany({ where: { id: { in: mine.map((m) => m.id) } }, data: { status: "ACCEPTED" } });
    await writeAuditLog({ actorUserId: user.id, action: "COURSE_SPLIT_ACCEPTED_ALL", entityType: "CourseOwner", entityId: user.id, metadata: { count: mine.length } as never });
    return NextResponse.json({ ok: true, count: mine.length });
  }

  const row = await prisma.courseOwner.findFirst({ where: { id: String(body.id || ""), chairmanId, status: "PENDING" } });
  if (!row) return NextResponse.json({ error: "request not found" }, { status: 404 });
  if (!canAnswer(row)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (body.action === "ACCEPT") await prisma.courseOwner.update({ where: { id: row.id }, data: { status: "ACCEPTED" } });
  else if (body.action === "DECLINE") await prisma.courseOwner.delete({ where: { id: row.id } });
  else return NextResponse.json({ error: "action must be ACCEPT, DECLINE or ACCEPT_ALL" }, { status: 400 });
  await writeAuditLog({ actorUserId: user.id, action: body.action === "ACCEPT" ? "COURSE_SPLIT_ACCEPTED" : "COURSE_SPLIT_DECLINED", entityType: "CourseOwner", entityId: row.id });
  return NextResponse.json({ ok: true });
}
