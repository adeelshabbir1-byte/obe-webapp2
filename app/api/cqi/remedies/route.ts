import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { getAuthenticatedUser } from "../../../../lib/session";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { choose, closeWith, excuse } from "../../../../lib/prereqRemedy";
import { canDo } from "../../../../lib/delegation";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;

// POST { action: choose {id, remedy, note} | close {id, afterPct} | excuse {id, reason} (PL) | bank {courseCode, topic, video, examples, practice, quiz} (SE) }
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  try {
    if (b.action === "choose") { await choose(user, String(b.id), String(b.remedy), String(b.note || "")); return NextResponse.json({ ok: true }); }
    if (b.action === "close") return NextResponse.json({ effective: await closeWith(user, String(b.id), Number(b.afterPct)) });
    if (b.action === "excuse") {
      if (!["PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN"].includes(user.role) && !(await canDo(user, "pl.review")).ok) return NextResponse.json({ error: "Only the Program Lead excuses it." }, { status: 403 });
      await excuse(user, String(b.id), String(b.reason || "")); return NextResponse.json({ ok: true });
    }
    if (b.action === "bank") {
      const cid = await chairmanIdFor(user as never);
      const code = String(b.courseCode || "").toUpperCase(), topic = String(b.topic || "").slice(0, 200);
      const se = await prisma.course.findFirst({ where: { code: { equals: code, mode: "insensitive" }, subjectExpertId: user.id } });
      if (!se && !["PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT"].includes(user.role)) return NextResponse.json({ error: "Only the course's Subject Expert keeps its remedy bank." }, { status: 403 });
      const data = { video: b.video || null, examples: b.examples || null, practice: b.practice || null, quiz: b.quiz || null, byId: user.id, updatedAt: new Date() };
      await db.topicRemedy.upsert({ where: { chairmanId_courseCode_topic: { chairmanId: cid, courseCode: code, topic } }, create: { chairmanId: cid, courseCode: code, topic, ...data }, update: data });
      return NextResponse.json({ ok: true });
    }
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
export const POST = withErrors(POST_handler);
