import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { chairmanIdFor } from "../../../lib/reportScope";
import { assistantConfig, usedToday, courseContext, SYSTEM_PROMPT, askClaude } from "../../../lib/obeAssistant";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const LEADERS = ["OMC", "CHAIRMAN", "HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"];

async function canUseCourse(user: { id: string; role: string }, courseId: string) {
  if (LEADERS.includes(user.role)) return true;
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { subjectExpertId: true, instructorId: true } });
  if (!c) return false;
  if (c.subjectExpertId === user.id || c.instructorId === user.id) return true;
  return (await prisma.courseSectionAssignment.count({ where: { courseId, instructorId: user.id } })) > 0;
}

// GET → is the assistant on for me, and how many questions are left today.
export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ enabled: false });
  const cfg = await assistantConfig(await chairmanIdFor(user).catch(() => ""));
  if (!cfg) return NextResponse.json({ enabled: false });
  return NextResponse.json({ enabled: true, left: Math.max(0, cfg.limit - (await usedToday(user.id))) });
}

// POST { courseId?, question, history: [{ q, a }] } → the assistant's answer.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const chairmanId = await chairmanIdFor(user).catch(() => "");
  const cfg = await assistantConfig(chairmanId);
  if (!cfg) return NextResponse.json({ error: "The OBE Assistant is not switched on for your institute." }, { status: 403 });
  if ((await usedToday(user.id)) >= cfg.limit) return NextResponse.json({ error: `You have used today's ${cfg.limit} questions. Try again tomorrow.` }, { status: 429 });
  const b = await req.json().catch(() => ({}));
  const question = String(b.question || "").trim().slice(0, 1500);
  if (!question) return NextResponse.json({ error: "Type a question." }, { status: 400 });
  const courseId = b.courseId ? String(b.courseId) : null;
  if (courseId && !(await canUseCourse(user, courseId))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const context = courseId ? await courseContext(courseId) : "";
  const history = (Array.isArray(b.history) ? b.history : []).slice(-4).flatMap((h: { q?: string; a?: string }) => [{ role: "user" as const, content: String(h.q || "").slice(0, 1500) }, { role: "assistant" as const, content: String(h.a || "").slice(0, 3000) }]).filter((m: { content: string }) => m.content);
  try {
    const answer = await askClaude(cfg, SYSTEM_PROMPT + (context ? `\n\nTHE FACULTY MEMBER'S COURSE (their own plan):\n${context}` : ""), [...history, { role: "user", content: question }]);
    await (prisma as unknown as Record<string, any>).obeChatLog.create({ data: { userId: user.id, chairmanId, courseId, question, answer: answer.slice(0, 8000) } }).catch(() => null);
    return NextResponse.json({ answer, left: Math.max(0, cfg.limit - (await usedToday(user.id))) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "The AI service could not be reached." }, { status: 502 });
  }
}
