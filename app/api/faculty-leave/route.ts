import { onEmployeeLeft } from "../../../lib/exitSurveys";
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { appraiseesFor } from "../../../lib/appraisal";
import { ldb, LEAVE_KINDS, LEAVE_MANAGERS, affectedCourses, type LeaveRow } from "../../../lib/facultyLeave";

// POST { userId, kind, fromTerm, toTerm, allowDesign, note, disableLogin } — record that a teacher is away (or has left).
// Returns the courses they still hold in those terms, so they can be taken back straight away.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !LEAVE_MANAGERS.includes(user.role)) return NextResponse.json({ error: "Only the Institute Head or a Chairman records faculty leave." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const { chairmanId, people } = await appraiseesFor(user);
  const userId = String(b.userId || "");
  if (!people.some((p) => p.id === userId)) return NextResponse.json({ error: "Choose a teacher in your area." }, { status: 400 });
  const kind = LEAVE_KINDS[b.kind] ? String(b.kind) : "";
  if (!kind) return NextResponse.json({ error: "Choose the kind of leave." }, { status: 400 });
  const fromTerm = parseInt(String(b.fromTerm), 10);
  const toTerm = kind === "LEFT" || b.toTerm === "" || b.toTerm === null || b.toTerm === undefined ? null : parseInt(String(b.toTerm), 10);
  if (!Number.isInteger(fromTerm) || (toTerm !== null && (!Number.isInteger(toTerm) || toTerm < fromTerm))) return NextResponse.json({ error: "Choose the first and last semester of the leave." }, { status: 400 });
  const row = (await ldb.facultyLeave.create({ data: { userId, chairmanId, kind, fromTerm, toTerm, allowDesign: !!b.allowDesign && kind !== "LEFT", note: b.note ? String(b.note).slice(0, 1000) : null, createdById: user.id } })) as LeaveRow;
  if (kind === "LEFT") await onEmployeeLeft(userId, chairmanId, user.id);
  if (kind === "LEFT" && b.disableLogin !== false) await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
  await writeAuditLog({ actorUserId: user.id, action: "FACULTY_LEAVE_RECORDED", entityType: "User", entityId: userId, metadata: { kind, fromTerm, toTerm } });
  return NextResponse.json({ ok: true, id: row.id, affected: await affectedCourses(row) });
}
