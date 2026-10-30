import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { chairmanIdFor, coordinatorIdsFor } from "../../../../../lib/reportScope";
import { accessFor, db, planRows, planSettings } from "../../../../../lib/topicPlan";
import { backfillTopicPerformance, hardestTopics, performanceOf, sectionsCompared } from "../../../../../lib/topicPerformance";
import { topicKey } from "../../../../../lib/topicPlanCore";
import { forbidden, wsUser } from "../../../../../lib/topicApi";
import { withErrors } from "../../../../../lib/apiHandler";

export const maxDuration = 300;

// GET ?courseId=&plan= — how students did on each topic (overall / last 3 / last offering), with the teaching notes,
// ready help and "hardest topic" votes of the course. GET ?program=1 (Program Lead / OMC) — the hardest topics of the
// program and sections compared (never shown to students; small sections hidden).
async function GET_handler(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (sp.get("program")) {
    const user = await getAuthenticatedUser();
    if (!user || !["PROGRAM_COORDINATOR", "OMC", "CHAIRMAN"].includes(user.role)) return forbidden();
    const ids = user.role === "PROGRAM_COORDINATOR" ? [user.id] : await coordinatorIdsFor(user);
    const s = await planSettings(await chairmanIdFor(user));
    return NextResponse.json({ hardest: await hardestTopics(ids, s.minStudents), sections: await sectionsCompared(ids, s.minSection), minStudents: s.minStudents, minSection: s.minSection });
  }
  const user = await wsUser();
  if (!user) return forbidden();
  const a = await accessFor(user, String(sp.get("courseId") || ""), sp.get("plan") === "SE" ? "SE" : sp.get("plan") === "INSTRUCTOR" ? "INSTRUCTOR" : null);
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
  const s = await planSettings(await chairmanIdFor(user));
  const rows = await planRows(a.planCourseId, a.plan);
  const meta = new Map(((await db.topicMeta.findMany({ where: { lectureRowId: { in: rows.map((r) => r.id).concat("none") } } }).catch(() => [])) as { lectureRowId: string; movedFrom: string | null }[]).map((m) => [m.lectureRowId, m.movedFrom]));
  const perf = await performanceOf(a.planCourseId, rows.map((r) => ({ id: r.id, topic: r.topic, movedFrom: meta.get(r.id) || null })), s.minStudents);
  const [notes, help] = await Promise.all([
    db.topicNote.findMany({ where: { coordinatorId: a.coordinatorId, courseCode: a.code }, orderBy: { at: "desc" }, take: 300 }).catch(() => []) as Promise<{ topicKey: string; note: string; termLabel: string | null; byUserId: string; at: Date }[]>,
    db.topicHelp.findMany({ where: { coordinatorId: a.coordinatorId, courseCode: a.code }, orderBy: { at: "desc" } }).catch(() => []) as Promise<{ id: string; topicKey: string; kind: string; title: string; url: string | null }[]>,
  ]);
  const names = new Map((await prisma.user.findMany({ where: { id: { in: notes.map((n) => n.byUserId).concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const byRow: Record<string, { notes: { note: string; term: string | null; by: string; at: Date }[]; help: { id: string; kind: string; title: string; url: string | null }[] }> = {};
  for (const r of rows) {
    const k = topicKey(r.topic);
    byRow[r.id] = { notes: notes.filter((n) => n.topicKey === k).map((n) => ({ note: n.note, term: n.termLabel, by: names.get(n.byUserId) || "", at: n.at })), help: help.filter((h) => h.topicKey === k) };
  }
  return NextResponse.json({ perf, extras: byRow, minStudents: s.minStudents });
}

// POST { backfill: true } — the one-time back-fill of past offerings (OMC, Program Lead or Head of the institute).
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !["PROGRAM_COORDINATOR", "OMC", "CHAIRMAN"].includes(user.role)) return forbidden();
  const b = await req.json().catch(() => ({}));
  if (!b.backfill) return NextResponse.json({ error: "unknown action" }, { status: 400 });
  return NextResponse.json(await backfillTopicPerformance(await chairmanIdFor(user)));
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
