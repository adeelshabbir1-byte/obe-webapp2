import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "../../../../../lib/db";
import { notifyUsers } from "../../../../../lib/notifications";
import { accessFor, db, MISSING } from "../../../../../lib/topicPlan";
import { topicKey } from "../../../../../lib/topicPlanCore";
import { forbidden, wsUser, LINK_ROLES } from "../../../../../lib/topicApi";
import { withErrors } from "../../../../../lib/apiHandler";

// The comment thread of one topic (Subject Expert, Instructor, Program Lead).
async function GET_handler(req: NextRequest) {
  const user = await wsUser(LINK_ROLES);
  if (!user) return forbidden();
  const sp = req.nextUrl.searchParams;
  const a = await accessFor(user, String(sp.get("courseId") || ""));
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
  const rows = (await db.topicComment.findMany({ where: { courseId: a.planCourseId, topicKey: topicKey(String(sp.get("topic") || "")) }, orderBy: { at: "asc" } }).catch(() => [])) as { id: string; userId: string; body: string; at: Date }[];
  const names = new Map((await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId).concat("none") } }, select: { id: true, name: true, role: true } })).map((u) => [u.id, u]));
  return NextResponse.json({ comments: rows.map((r) => ({ id: r.id, body: r.body, at: r.at, by: names.get(r.userId)?.name || "", role: names.get(r.userId)?.role || "" })) });
}
async function POST_handler(req: NextRequest) {
  const user = await wsUser(LINK_ROLES);
  if (!user) return forbidden();
  const b = await req.json().catch(() => ({}));
  const a = await accessFor(user, String(b.courseId || ""));
  const body = String(b.body || "").trim().slice(0, 2000), topic = String(b.topic || "").trim();
  if (!a || !topic) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!body) return NextResponse.json({ error: "Write the comment." }, { status: 400 });
  try { await db.topicComment.create({ data: { id: randomUUID(), courseId: a.planCourseId, lectureRowId: typeof b.lectureRowId === "string" ? b.lectureRowId : null, topicKey: topicKey(topic), userId: user.id, body } }); } catch { return NextResponse.json({ error: MISSING }, { status: 500 }); }
  const c = await prisma.course.findUnique({ where: { id: a.courseId }, select: { subjectExpertId: true, instructorId: true, coordinatorId: true } });
  await notifyUsers([c?.subjectExpertId, c?.instructorId, c?.coordinatorId], { kind: "TOPIC_SUGGESTION", title: `${user.name} commented on "${topic}" (${a.code})`, body: body.slice(0, 200), href: "/faculty/topic-workspace", exceptId: user.id });
  return NextResponse.json({ ok: true });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
