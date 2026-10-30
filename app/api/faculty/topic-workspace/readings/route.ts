import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db";
import { chairmanIdFor } from "../../../../../lib/reportScope";
import { accessFor, db, setMeta, MISSING } from "../../../../../lib/topicPlan";
import { mapTopics, readingOf, tocFor } from "../../../../../lib/bookChapters";
import { isExamTopic } from "../../../../../lib/teachingAnalysis";
import { forbidden, wsUser } from "../../../../../lib/topicApi";
import { withErrors } from "../../../../../lib/apiHandler";

export const maxDuration = 60;

// POST { courseId, plan, toc? } — maps each topic of the plan to the required book's chapter and section. Readings a
// person typed are kept; ones filled in earlier by the system are refreshed. Without the book's contents (and no AI
// model) it asks for them to be pasted once.
async function POST_handler(req: NextRequest) {
  const user = await wsUser();
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  const a = await accessFor(user, String(b.courseId || ""), b.plan === "INSTRUCTOR" ? "INSTRUCTOR" : b.plan === "SE" ? "SE" : null);
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (a.mode !== "APPLY") return NextResponse.json({ error: `Only the owner of this plan maps its readings (${a.why}).` }, { status: 403 });
  const book = (a.textbook || "").split(/\r?\n|;/).map((x) => x.trim()).filter(Boolean)[0] || "";
  if (!book) return NextResponse.json({ error: "Choose the course's required book first (course outline → Textbook)." }, { status: 400 });
  const chairmanId = await chairmanIdFor(user);
  const toc = await tocFor(chairmanId, book, typeof b.toc === "string" ? b.toc : null, user.id).catch(() => null);
  if (toc && "error" in toc) return NextResponse.json({ error: toc.error }, { status: 400 });
  if (!toc) return NextResponse.json({ needToc: true, book });
  const rows = (await prisma.lectureRow.findMany({ where: { courseId: a.planCourseId, source: a.plan }, select: { id: true, topic: true }, orderBy: { lectureNumber: "asc" } })).filter((r) => r.topic.trim() && !isExamTopic(r.topic));
  let meta: { lectureRowId: string; reading: string | null; readingAuto: boolean }[] = [];
  try { meta = await db.topicMeta.findMany({ where: { lectureRowId: { in: rows.map((r) => r.id).concat("none") } } }); } catch { return NextResponse.json({ error: MISSING }, { status: 500 }); }
  const typed = new Set(meta.filter((m) => m.reading && !m.readingAuto).map((m) => m.lectureRowId));
  const todo = rows.filter((r) => !typed.has(r.id));
  const mapped = await mapTopics(chairmanId, todo.map((r) => r.topic), toc.entries);
  let filled = 0; const unmatched: string[] = [];
  for (const [i, r] of todo.entries()) {
    const m = mapped[i];
    if (!m.entry) { unmatched.push(r.topic); await setMeta(r.id, a.planCourseId, { reading: null, readingAuto: true }, user.id); continue; }
    await setMeta(r.id, a.planCourseId, { reading: readingOf(m.entry), readingAuto: true }, user.id);
    filled++;
  }
  return NextResponse.json({ ok: true, book, source: toc.source, filled, kept: typed.size, unmatched });
}
export const POST = withErrors(POST_handler);
