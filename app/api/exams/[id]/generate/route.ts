import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { writeAuditLog } from "../../../../../lib/audit";
import { loadSession, generate, allocate, EXAM_MANAGERS } from "../../../../../lib/exams";

export const maxDuration = 300;

// POST { mode: "dates" | "rooms" } — make the date sheet (keeps papers moved by hand) and then rooms, seats and
// invigilators; or only redo rooms, seats and invigilators for the dates as they are.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user || !EXAM_MANAGERS.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const s = await loadSession(params.id);
  if (!s || s.chairmanId !== user.id) return NextResponse.json({ error: "not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  if (b.mode === "rooms") { await allocate(s.id); return NextResponse.json({ ok: true }); }
  const r = await generate(s.id);
  if ("error" in r) return NextResponse.json({ error: r.error }, { status: 400 });
  await writeAuditLog({ actorUserId: user.id, action: "EXAM_DATESHEET_GENERATED", entityType: "ExamSession", entityId: s.id, metadata: { placed: r.placed ?? 0, unplaced: r.unplaced ?? 0 } });
  return NextResponse.json(r);
}
