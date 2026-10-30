import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "../../../../../lib/db";
import { accessFor, db, MISSING } from "../../../../../lib/topicPlan";
import { topicKey } from "../../../../../lib/topicPlanCore";
import { forbidden, wsUser } from "../../../../../lib/topicApi";
import { withErrors } from "../../../../../lib/apiHandler";

// POST { courseId, topic, note } — a teaching note on a topic, kept by course code so the next offering's teacher sees it.
// POST { courseId, topic, help: { kind: PRACTICE|MATERIAL|REMEDIATION, title, url } } — ready help for a usually-hard
// topic, offered to the instructor a week before its lecture.
async function POST_handler(req: NextRequest) {
  const user = await wsUser();
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  const a = await accessFor(user, String(b.courseId || ""));
  const topic = String(b.topic || "").trim().slice(0, 300);
  if (!a || !topic) return NextResponse.json({ error: "not found" }, { status: 404 });
  const c = await prisma.course.findUnique({ where: { id: a.courseId }, select: { subjectExpertId: true, instructorId: true, offeredTermName: true, offeredTermYear: true } });
  if (c?.subjectExpertId !== user.id && c?.instructorId !== user.id) return NextResponse.json({ error: "Only this course's Subject Expert or Instructor adds notes and help." }, { status: 403 });
  try {
    if (b.help) {
      const title = String(b.help.title || "").trim().slice(0, 200);
      if (!title) return NextResponse.json({ error: "Give the help a title." }, { status: 400 });
      await db.topicHelp.create({ data: { id: randomUUID(), coordinatorId: a.coordinatorId, courseCode: a.code, topicKey: topicKey(topic), kind: ["PRACTICE", "MATERIAL", "REMEDIATION"].includes(b.help.kind) ? b.help.kind : "MATERIAL", title, url: typeof b.help.url === "string" && /^https?:\/\//.test(b.help.url) ? b.help.url.slice(0, 500) : null, byUserId: user.id } });
    } else {
      const note = String(b.note || "").trim().slice(0, 2000);
      if (!note) return NextResponse.json({ error: "Write the note." }, { status: 400 });
      await db.topicNote.create({ data: { id: randomUUID(), coordinatorId: a.coordinatorId, courseCode: a.code, topicKey: topicKey(topic), topic, courseId: a.courseId, termLabel: `${c?.offeredTermName || ""} ${c?.offeredTermYear || ""}`.trim() || null, note, byUserId: user.id } });
    }
  } catch { return NextResponse.json({ error: MISSING }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
export const POST = withErrors(POST_handler);
