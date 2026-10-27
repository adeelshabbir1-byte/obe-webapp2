import { NextResponse } from "next/server";
import { timetableActor, READ_ONLY } from "../../../../lib/timetableAccess";
import { getMaxSection, setMaxSection, STUDENT_SECTIONS_HINT } from "../../../../lib/studentSections";
import { writeAuditLog } from "../../../../lib/audit";

/** GET — the department timetable's settings (the section limit). */
export async function GET() {
  const actor = await timetableActor();
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ maxSection: await getMaxSection(actor.chairmanId, actor.scope.key), canEdit: actor.canEdit });
}

/** PUT { maxSection } — the Department Coordinator sets the most students in one section (default 50). */
export async function PUT(req: Request) {
  const actor = await timetableActor();
  if (!actor) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!actor.canEdit) return NextResponse.json({ error: READ_ONLY(actor) }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const n = Number(body.maxSection);
  if (!Number.isFinite(n) || n < 5 || n > 500) return NextResponse.json({ error: "The section limit must be between 5 and 500 students." }, { status: 400 });
  let v: number;
  try { v = await setMaxSection(actor.chairmanId, actor.scope.key, n, actor.user.id); } catch { return NextResponse.json({ error: STUDENT_SECTIONS_HINT }, { status: 500 }); }
  await writeAuditLog({ actorUserId: actor.user.id, action: "TIMETABLE_SECTION_LIMIT_SET", entityType: "TimetableScope", entityId: actor.scope.key, metadata: { maxSection: v } }).catch(() => null);
  return NextResponse.json({ maxSection: v, message: `Sections hold at most ${v} students. Run "Auto-generate sections" to apply it.` });
}
