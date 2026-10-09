import { prisma } from "./db";

type Open = { id: string; key: string; assigneeId: string | null; dueDate: Date; completedAt: Date | null };
type Evidence = { all: Date | null; by: Map<string, Date>; own?: boolean };
const DAY = 86400000;
const latest = (a: Date | null, b: Date | null) => (a && b ? (a > b ? a : b) : a || b);

/** Where the work behind a non-course task shows up in the system. Returns the newest record since `since`. */
async function evidenceFor(key: string, chairmanId: string, since: Date, people: string[]): Promise<Evidence | null> {
  const none: Evidence = { all: null, by: new Map() };
  const after = { gte: since };
  switch (key) {
    case "ADMISSION_DATA": {
      const r = await prisma.admissionCriteria.findFirst({ where: { chairmanId, updatedAt: after } as never, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } });
      return { ...none, all: r ? (r.updatedAt as Date) : null };
    }
    case "BUDGET_ENTRY": case "SPEND_MID": case "SPEND_END": {
      const kinds = key === "BUDGET_ENTRY" ? ["BUDGET"] : ["SPENT", "INCOME"];
      const r = await prisma.financeEntry.findFirst({ where: { chairmanId, kind: { in: kinds }, updatedAt: after } as never, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } });
      return { ...none, all: r ? (r.updatedAt as Date) : null };
    }
    case "LIBRARY": case "STOCK_CHECK": {
      const r = (await prisma.libraryInfo.findUnique({ where: { chairmanId }, select: { updatedAt: true, lastStockCheck: true } })) as unknown as { updatedAt: Date; lastStockCheck: Date | null } | null;
      const d = key === "STOCK_CHECK" ? r?.lastStockCheck || null : r?.updatedAt || null;
      return { ...none, all: d && d >= since ? d : null };
    }
    case "PROFILE": {
      if (!people.length) return none;
      const rows = (await prisma.facultyProfile.findMany({ where: { userId: { in: people }, updatedAt: after } as never, select: { userId: true, updatedAt: true } })) as unknown as { userId: string; updatedAt: Date }[];
      return { all: null, by: new Map(rows.map((r) => [r.userId, r.updatedAt])) };
    }
    case "ECA": {
      const leads = (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId } as never, select: { id: true } })) as unknown as { id: string }[];
      const r = await prisma.activityLog.findFirst({ where: { coordinatorId: { in: leads.map((l) => l.id).concat(["none"]) }, createdAt: after } as never, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      return { ...none, all: r ? (r.createdAt as Date) : null };
    }
    case "OMC_BEFORE": case "OMC_MID": case "OMC_TASKS": case "BOS": case "BPF": case "FACULTY_MEETING": case "IAB": {
      const kind = key.startsWith("OMC") ? "OMC" : key === "FACULTY_MEETING" ? "FACULTY" : key;
      const rows = (await prisma.meetingMinutes.findMany({ where: { chairmanId, kind, meetingDate: after } as never, select: { createdById: true, meetingDate: true } })) as unknown as { createdById: string; meetingDate: Date }[];
      const by = new Map<string, Date>(); let all: Date | null = null;
      for (const r of rows) { by.set(r.createdById, latest(by.get(r.createdById) || null, r.meetingDate) as Date); all = latest(all, r.meetingDate); }
      return { all, by, own: true };
    }
    case "STUDENT_ENTRY": {
      const leads = (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId } as never, select: { id: true } })) as unknown as { id: string }[];
      const r = await prisma.student.findFirst({ where: { createdAt: after, batch: { coordinatorId: { in: leads.map((l) => l.id).concat(["none"]) } } } as never, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      return { ...none, all: r ? (r.createdAt as Date) : null };
    }
    default: return null;
  }
}

/** Tick off non-course tasks when the matching record exists in the system. The completion date is the date of that record. */
export async function autoTick(chairmanId: string, rows: Open[]) {
  if (!rows.length) return;
  const byKey = new Map<string, Open[]>();
  for (const r of rows) byKey.set(r.key, [...(byKey.get(r.key) || []), r]);
  const now = new Date();
  const ticks = new Map<string, Date>();
  for (const [key, list] of Array.from(byKey.entries())) {
    const since = new Date(Math.min(...list.map((r) => r.dueDate.getTime())) - 120 * DAY);
    const ev = await evidenceFor(key, chairmanId, since, list.map((r) => r.assigneeId).filter(Boolean) as string[]);
    if (!ev) continue;
    for (const r of list) {
      const d = r.assigneeId ? ev.by.get(r.assigneeId) || (ev.own ? null : ev.all) : ev.all;
      if (d) { ticks.set(r.id, d > now ? now : d); }
    }
  }
  if (!ticks.size) return;
  // group by date to keep this to a few writes
  const byDate = new Map<number, string[]>();
  for (const [id, d] of Array.from(ticks.entries())) byDate.set(d.getTime(), [...(byDate.get(d.getTime()) || []), id]);
  for (const [t, ids] of Array.from(byDate.entries())) await prisma.deadline.updateMany({ where: { id: { in: ids }, completedAt: null } as never, data: { completedAt: new Date(t) } as never });
  for (const r of rows) { const d = ticks.get(r.id); if (d) r.completedAt = d; }
}
