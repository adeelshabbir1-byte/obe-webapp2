import { rdb, parseJ, type Who } from "./registers";

// HEC QAA self-assessment of a program, in the order HEC's Self-Assessment Manual sets: the Program Team is formed, it
// writes the Self-Assessment Report (SAR), the Assessment Team visits and reports, an implementation plan is agreed on
// its findings, and progress is tracked until every action is done.

export const QAA_HINT = "The QAA self-assessment cycle needs prisma/migration_qaa.sql — run it in Supabase.";
export type Cycle = { id: string; chairmanId: string; program: string; title: string; ptFormedAt: Date | null; sarDueAt: Date | null; sarSubmittedAt: Date | null; atVisitAt: Date | null; atReportAt: Date | null; planApprovedAt: Date | null; closedAt: Date | null; programTeamJson: string; assessmentTeamJson: string; documentsJson: string; atSummary: string | null; createdAt: Date };
export type Action = { id: string; cycleId: string; finding: string; action: string; ownerId: string | null; dueDate: Date | null; status: string; progressPct: number; progressNote: string | null; doneAt: Date | null };
export type Member = { userId?: string; name: string; role: string; organisation?: string };

export const STAGES: { key: keyof Cycle; label: string; what: string }[] = [
  { key: "ptFormedAt", label: "Program Team formed", what: "The Head forms the Program Team (3–5 faculty) and notifies it." },
  { key: "sarSubmittedAt", label: "SAR submitted to QEC", what: "The Program Team writes the Self-Assessment Report against HEC's criteria and sends it to QEC." },
  { key: "atVisitAt", label: "Assessment Team visit", what: "QEC sends an Assessment Team (with an outside member) to review the SAR and visit the department." },
  { key: "atReportAt", label: "Assessment Team report", what: "The Assessment Team gives its findings and recommendations." },
  { key: "planApprovedAt", label: "Implementation plan agreed", what: "The department and QEC agree the actions, owners and dates for each finding." },
  { key: "closedAt", label: "Cycle closed", what: "Every action is done and verified; the cycle is closed." },
];
export function stageOf(c: Cycle) { const i = STAGES.findIndex((s) => !c[s.key]); return i < 0 ? STAGES.length : i; }
export function progressOf(actions: Action[]) { return actions.length ? Math.round(actions.reduce((t, a) => t + (a.status === "DONE" ? 100 : a.progressPct), 0) / actions.length) : 0; }
export const canManageQaa = (w: Who) => w.leader || w.qec;

export async function cyclesOf(chairmanId: string) {
  try { return (await rdb.qaaCycle.findMany({ where: { chairmanId }, orderBy: { createdAt: "desc" } })) as Cycle[]; } catch { return null; }
}
export async function actionsOf(cycleIds: string[]) {
  return (await rdb.qaaAction.findMany({ where: { cycleId: { in: cycleIds.concat(["none"]) } }, orderBy: [{ dueDate: "asc" }] }).catch(() => [])) as Action[];
}
export const teamOf = (c: Cycle) => parseJ<Member[]>(c.programTeamJson, []);

/** Daily: remind the Program Team a week before the SAR is due, and action owners 7 and 3 days before, on the day and a week after. */
export async function remindQaa(now = new Date()) {
  const { notifyUsers } = await import("./notifications");
  const today = now.toISOString().slice(0, 10);
  const daysTo = (d: Date) => Math.round((new Date(d).getTime() - now.getTime()) / 864e5);
  let sent = 0;
  const cycles = (await rdb.qaaCycle.findMany({ where: { closedAt: null } }).catch(() => [])) as Cycle[];
  for (const c of cycles) {
    if (c.sarDueAt && !c.sarSubmittedAt && [7, 3, 0].includes(daysTo(c.sarDueAt))) {
      await notifyUsers(teamOf(c).map((m) => m.userId), { kind: "QAA", title: `${c.program}: the self-assessment report is due ${daysTo(c.sarDueAt) ? `in ${daysTo(c.sarDueAt)} days` : "today"}`, href: `/qaa?id=${c.id}` });
      sent++;
    }
  }
  const actions = (await rdb.qaaAction.findMany({ where: { status: { not: "DONE" }, dueDate: { not: null }, cycleId: { in: cycles.map((c) => c.id).concat(["none"]) } } }).catch(() => [])) as (Action & { lastRemindedOn: string | null })[];
  for (const a of actions) {
    const d = daysTo(a.dueDate!);
    if (![7, 3, 0, -7].includes(d) || a.lastRemindedOn === today || !a.ownerId) continue;
    const c = cycles.find((x) => x.id === a.cycleId);
    await notifyUsers([a.ownerId], { kind: "QAA", title: `${c?.program || "QAA"}: action ${d < 0 ? "overdue" : d === 0 ? "due today" : `due in ${d} days`} — ${a.action.slice(0, 80)}`, href: `/qaa?id=${a.cycleId}` });
    await rdb.qaaAction.update({ where: { id: a.id }, data: { lastRemindedOn: today } });
    sent++;
  }
  return sent;
}
