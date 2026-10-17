import { prisma } from "./db";

const pdb = prisma as unknown as Record<string, any>;
const DAY = 86400000;
export type PlanTask = { id: string; groupId: string | null; title: string; category: string; ownerId: string | null; ownerText: string | null; startDate: Date; endDate: Date; status: string };

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
  await pdb.fypPlanTask.createMany({ data: OPEN_HOUSE_TEMPLATE.map(([title, a, b], i) => ({ cycleId, groupId: null, title, category: "OPEN_HOUSE", startDate: new Date(d0 + a * DAY), endDate: new Date(d0 + b * DAY), orderIndex: i, createdById: userId })) });
  return null;
}

/** A starting project plan for one group: six phases spread from now (or the first milestone) to the final evaluation. */
export async function addGroupTemplate(cycleId: string, groupId: string, userId: string) {
  const ms = await prisma.fypMilestone.findMany({ where: { cycleId }, orderBy: { dueDate: "asc" } });
  const fin = ms.filter((m) => ["FINAL", "THESIS", "OPEN_HOUSE"].includes(m.kind)).pop() || ms[ms.length - 1];
  if (!fin) return "Set the cycle's milestones first.";
  const start = Math.min(Date.now(), ms[0]?.dueDate.getTime() ?? Date.now());
  const span = Math.max(30 * DAY, fin.dueDate.getTime() - start), step = span / GROUP_PHASES.length;
  await pdb.fypPlanTask.createMany({ data: GROUP_PHASES.map((title, i) => ({ cycleId, groupId, title, category: "GROUP", startDate: new Date(start + i * step), endDate: new Date(start + (i + 1) * step - DAY), orderIndex: i, createdById: userId })) });
  return null;
}

export function progress(tasks: PlanTask[], now = new Date()) {
  const done = tasks.filter((t) => t.status === "DONE").length;
  const overdue = tasks.filter((t) => t.status !== "DONE" && t.endDate < now).length;
  return { total: tasks.length, done, overdue, pct: tasks.length ? Math.round((100 * done) / tasks.length) : 0 };
}
