import { prisma } from "./db";

const pdb = prisma as unknown as Record<string, any>;
const DAY = 86400000;
export type PlanTask = { id: string; groupId: string | null; title: string; category: string; ownerId: string | null; ownerText: string | null; startDate: Date; endDate: Date; status: string; durationDays: number | null; dependsJson: string | null; fixedStart: boolean };

export const OPEN_HOUSE_TEMPLATE: [string, number, number][] = [
  ["Book the venue and stalls", -45, -30], ["Invite industry evaluators", -40, -14], ["Collect posters and abstracts from groups", -21, -7],
  ["Allocate stalls and print the floor plan", -10, -3], ["Print banners, standees and certificates", -10, -2], ["Send scoring links to evaluators", -7, -1],
  ["Refreshments and logistics", -7, 0], ["Media and photography", -3, 0], ["Set up the venue", -1, 0], ["Open house day", 0, 0], ["Results, awards and thank-you letters", 1, 7],
];
export const GROUP_PHASES = ["Literature review and requirements", "System design", "Implementation (part 1)", "Implementation (part 2) and integration", "Testing and evaluation", "Thesis writing and demo preparation"];

export async function planTasks(cycleId: string, groupId: string | null | "ALL") {
  try {
    return (await pdb.fypPlanTask.findMany({ where: { cycleId, ...(groupId === "ALL" ? {} : { groupId }) }, orderBy: [{ startDate: "asc" }, { orderIndex: "asc" }] })) as PlanTask[];
  } catch { return null; }
}

/** Open-house tasks dated around the cycle's open-house milestone. */
export async function addOpenHouseTemplate(cycleId: string, userId: string) {
  const oh = await prisma.fypMilestone.findFirst({ where: { cycleId, kind: "OPEN_HOUSE" }, orderBy: { dueDate: "asc" } });
  if (!oh) return "Add a “Demo / Open house” milestone with its date first.";
  const d0 = oh.dueDate.getTime();
  await pdb.fypPlanTask.createMany({ data: OPEN_HOUSE_TEMPLATE.map(([title, a, b], i) => ({ cycleId, groupId: null, title, category: "OPEN_HOUSE", startDate: new Date(d0 + a * DAY), endDate: new Date(d0 + b * DAY), orderIndex: i, createdById: userId, fixedStart: true, durationDays: Math.max(1, Math.round(((b - a) * 5) / 7) || 1) })) });
  return null;
}

/** A starting project plan for one group: six phases spread from now (or the first milestone) to the final evaluation. */
export async function addGroupTemplate(cycleId: string, groupId: string, userId: string) {
  const ms = await prisma.fypMilestone.findMany({ where: { cycleId }, orderBy: { dueDate: "asc" } });
  const fin = ms.filter((m) => ["FINAL", "THESIS", "OPEN_HOUSE"].includes(m.kind)).pop() || ms[ms.length - 1];
  if (!fin) return "Set the cycle's milestones first.";
  const start = Math.min(Date.now(), ms[0]?.dueDate.getTime() ?? Date.now());
  const span = Math.max(30 * DAY, fin.dueDate.getTime() - start), step = span / GROUP_PHASES.length;
  // Each phase follows the one before it (finish-to-start), with its length in working days.
  const ids = GROUP_PHASES.map(() => (globalThis.crypto as Crypto).randomUUID());
  await pdb.fypPlanTask.createMany({ data: GROUP_PHASES.map((title, i) => ({ id: ids[i], cycleId, groupId, title, category: "GROUP", startDate: new Date(start + i * step), endDate: new Date(start + (i + 1) * step - DAY), orderIndex: i, createdById: userId, durationDays: Math.max(3, Math.round((step / DAY) * 5 / 7)), fixedStart: i === 0, dependsJson: i ? JSON.stringify([ids[i - 1]]) : null })) });
  return null;
}

export function progress(tasks: PlanTask[], now = new Date()) {
  const done = tasks.filter((t) => t.status === "DONE").length;
  const overdue = tasks.filter((t) => t.status !== "DONE" && t.endDate < now).length;
  return { total: tasks.length, done, overdue, pct: tasks.length ? Math.round((100 * done) / tasks.length) : 0 };
}

/** The FYP Head's whole year, as a starting plan: steps in order, each with working days, anchored to the milestone dates where one exists. */
const YEAR: { title: string; days: number; after: number[]; anchor?: [string, number] }[] = [
  { title: "Announce the FYP cycle, eligibility and calendar", days: 3, after: [] },
  { title: "Call for project proposals from faculty and industry", days: 10, after: [0] },
  { title: "FYP Committee reviews and approves proposals", days: 7, after: [1] },
  { title: "Publish projects; students form groups and apply", days: 10, after: [2] },
  { title: "Allocate supervisors and confirm groups", days: 5, after: [3] },
  { title: "Form evaluation panels and book rooms", days: 5, after: [4] },
  { title: "Proposal defense (presentations)", days: 3, after: [5], anchor: ["PROPOSAL_DEFENSE", -1] },
  { title: "Share proposal-defense remarks; groups revise scope", days: 7, after: [6] },
  { title: "Monitor supervisor meetings and at-risk groups", days: 40, after: [7] },
  { title: "Mid-term evaluation (presentations)", days: 3, after: [8], anchor: ["MID_TERM", -1] },
  { title: "Invite external examiners and industry evaluators", days: 15, after: [9] },
  { title: "Thesis draft and similarity (plagiarism) check", days: 10, after: [9] },
  { title: "Final evaluation (presentations)", days: 3, after: [10, 11], anchor: ["FINAL", -1] },
  { title: "Demo / Open house", days: 1, after: [12], anchor: ["OPEN_HOUSE", 0] },
  { title: "Consolidate results; Chairman sign-off", days: 5, after: [12, 13] },
  { title: "Camera-ready thesis, repository and archive", days: 10, after: [14], anchor: ["THESIS", -9] },
  { title: "FYP yearbook, CV book and certificates", days: 7, after: [14] },
];
export async function addYearTemplate(cycleId: string, userId: string) {
  const ms = await prisma.fypMilestone.findMany({ where: { cycleId }, orderBy: { dueDate: "asc" } });
  const ids = YEAR.map(() => (globalThis.crypto as Crypto).randomUUID());
  const now = Date.now();
  await pdb.fypPlanTask.createMany({ data: YEAR.map((t, i) => {
    const m = t.anchor ? ms.find((x) => x.kind === t.anchor![0]) : null;
    const start = m ? new Date(m.dueDate.getTime() + t.anchor![1] * DAY) : new Date(now);
    return { id: ids[i], cycleId, groupId: null, title: t.title, category: t.anchor?.[0] === "OPEN_HOUSE" ? "OPEN_HOUSE" : "GENERAL", startDate: start, endDate: start, durationDays: t.days, fixedStart: !!m || i === 0, dependsJson: t.after.length && !m ? JSON.stringify(t.after.map((k) => ids[k])) : null, orderIndex: i, createdById: userId };
  }) });
  return null;
}
