import { randomUUID } from "crypto";
import { prisma } from "./db";

// FYP head's extra settings per cycle, the co-supervisors of groups, and evaluator scaling.
//   coSupervisorPct — the co-supervisor's share in each milestone (next to supervisor / internal / external)
//   scaling         — NONE | ZSCORE | SHIFT: correct strict and lenient internal / external evaluators per milestone
//   minEvaluators   — a panel milestone counts only when this many evaluators have marked the student
//   minMeetings     — supervision meetings expected; fewer is flagged next to the grade
// Scaling: each evaluator's marks are compared with everyone's on the same milestone. SHIFT moves an evaluator's marks
// by the gap between their average and the overall average; ZSCORE also evens out how spread out their marks are.
// Only evaluators who marked at least MIN_N students are adjusted, by at most CAP marks (of 100), within 0–100.

const fdb = prisma as unknown as Record<string, any>;
export const FYP_EXTRA_HINT = "Run prisma/migration_fyp_elections.sql in Supabase for co-supervisors and scaling.";
export const MIN_N = 5, CAP = 15;
export type CycleExtra = { coSupervisorPct: number; scaling: "NONE" | "ZSCORE" | "SHIFT"; minEvaluators: number; minMeetings: number };
export const DEFAULT_EXTRA: CycleExtra = { coSupervisorPct: 0, scaling: "NONE", minEvaluators: 1, minMeetings: 0 };

export async function cycleExtra(cycleId: string): Promise<CycleExtra> {
  try { const r = await fdb.fypCycleExtra.findUnique({ where: { cycleId } }); return r ? { coSupervisorPct: r.coSupervisorPct, scaling: r.scaling, minEvaluators: r.minEvaluators, minMeetings: r.minMeetings } : DEFAULT_EXTRA; } catch { return DEFAULT_EXTRA; }
}
export async function saveCycleExtra(cycleId: string, x: CycleExtra) {
  await fdb.fypCycleExtra.upsert({ where: { cycleId }, create: { id: randomUUID(), cycleId, ...x, updatedAt: new Date() }, update: { ...x, updatedAt: new Date() } });
}

export async function coSupervisors(groupIds: string[]): Promise<Map<string, string>> {
  try { const rows = (await fdb.fypCoSupervisor.findMany({ where: { groupId: { in: groupIds.concat(["none"]) } } })) as { groupId: string; userId: string }[]; return new Map(rows.map((r) => [r.groupId, r.userId])); } catch { return new Map(); }
}
export async function setCoSupervisor(groupId: string, userId: string | null) {
  await fdb.fypCoSupervisor.deleteMany({ where: { groupId } });
  if (userId) await fdb.fypCoSupervisor.create({ data: { id: randomUUID(), groupId, userId, createdAt: new Date() } });
}

/** One evaluator's mark (0–100) of one student at one milestone. */
export type Mark = { milestoneId: string; evaluatorKey: string; role: string; studentId: string; pct: number };
export type EvaluatorStat = { milestoneId: string; evaluatorKey: string; n: number; mean: number; sd: number; overall: number; overallSd: number; adjusted: boolean };

const sd = (xs: number[], m: number) => (xs.length > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)) : 0);

/** Per milestone, each internal / external evaluator's average against everyone's, and a function to adjust a mark. */
export function scaler(marks: Mark[], mode: CycleExtra["scaling"]) {
  const stats = new Map<string, EvaluatorStat>();
  const panel = marks.filter((m) => m.role === "INTERNAL" || m.role === "EXTERNAL");
  for (const ms of Array.from(new Set(panel.map((m) => m.milestoneId)))) {
    const here = panel.filter((m) => m.milestoneId === ms);
    const all = here.map((m) => m.pct);
    const overall = all.reduce((a, b) => a + b, 0) / (all.length || 1);
    const osd = sd(all, overall);
    for (const ev of Array.from(new Set(here.map((m) => m.evaluatorKey)))) {
      const xs = here.filter((m) => m.evaluatorKey === ev).map((m) => m.pct);
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      stats.set(`${ms}|${ev}`, { milestoneId: ms, evaluatorKey: ev, n: xs.length, mean, sd: sd(xs, mean), overall, overallSd: osd, adjusted: mode !== "NONE" && xs.length >= MIN_N });
    }
  }
  const adjust = (m: Mark) => {
    if (mode === "NONE" || (m.role !== "INTERNAL" && m.role !== "EXTERNAL")) return m.pct;
    const s = stats.get(`${m.milestoneId}|${m.evaluatorKey}`);
    if (!s || s.n < MIN_N) return m.pct;
    let v = mode === "ZSCORE" && s.sd > 0.5 && s.overallSd > 0 ? s.overall + ((m.pct - s.mean) / s.sd) * s.overallSd : m.pct + (s.overall - s.mean);
    v = Math.max(m.pct - CAP, Math.min(m.pct + CAP, v));
    return Math.max(0, Math.min(100, v));
  };
  return { stats: Array.from(stats.values()), adjust };
}

/** Supervision meetings of each group with each student's attendance. */
export async function meetingsOf(groupIds: string[]) {
  const ms = await prisma.fypMeeting.findMany({ where: { groupId: { in: groupIds.concat(["none"]) } }, select: { id: true, groupId: true, heldAt: true }, orderBy: { heldAt: "asc" } }).catch(() => []);
  const att = ms.length ? await prisma.fypMeetingAttendance.findMany({ where: { meetingId: { in: ms.map((m) => m.id) } } }).catch(() => []) : [];
  return (groupId: string, studentId: string) => {
    const mine = ms.filter((m) => m.groupId === groupId);
    return { held: mine.length, attended: mine.filter((m) => att.some((a) => a.meetingId === m.id && a.studentId === studentId && a.present)).length, dates: mine.map((m) => m.heldAt.toISOString().slice(0, 10)) };
  };
}
