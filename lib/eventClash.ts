import { prisma } from "./db";

// What else is on when a society plans an event: holidays, exam sessions, national days, other society events, and —
// from the current timetable — which batches have class at that time and which are free.

const NATIONAL: [number, number, string][] = [
  [2, 5, "Kashmir Solidarity Day"], [3, 23, "Pakistan Day"], [5, 1, "Labour Day"], [5, 28, "Youm-e-Takbeer"],
  [8, 14, "Independence Day"], [11, 9, "Iqbal Day"], [12, 25, "Quaid-e-Azam Day"],
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const toH = (t: string | null | undefined) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m ? Number(m[1]) + Number(m[2]) / 60 : null; };

export async function eventClashes(chairmanId: string, date: string, start?: string | null, end?: string | null) {
  const d = new Date(date + "T00:00:00Z");
  const next = new Date(d.getTime() + 86400000);
  const s = toH(start) ?? 8, e = toH(end) ?? 18;
  const notes: { kind: string; text: string }[] = [];
  const nat = NATIONAL.find(([m, dd]) => d.getUTCMonth() + 1 === m && d.getUTCDate() === dd);
  if (nat) notes.push({ kind: "National", text: `${nat[2]} — public holiday` });
  if (d.getUTCDay() === 0) notes.push({ kind: "Weekend", text: "Sunday" });
  const leads = (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } })).map((u) => u.id);
  const [hol, exams, events] = await Promise.all([
    prisma.holiday.findMany({ where: { coordinatorId: { in: leads.concat(["none"]) }, date: { gte: d, lt: next } }, select: { label: true } }),
    prisma.examSession.findMany({ where: { chairmanId, startDate: { lte: next }, endDate: { gte: d } }, select: { name: true, examType: true } }),
    prisma.societyEvent.findMany({ where: { chairmanId, status: { in: ["APPROVED", "PROPOSED"] }, eventDate: { gte: d, lt: next } }, select: { title: true, startTime: true, endTime: true, status: true } }),
  ]);
  for (const h of Array.from(new Set(hol.map((x) => x.label)))) notes.push({ kind: "Holiday", text: h });
  for (const x of exams) notes.push({ kind: "Exams", text: `${x.name} (${x.examType}) — exam period` });
  for (const x of events) if ((toH(x.startTime) ?? 0) < e && s < (toH(x.endTime) ?? 24)) notes.push({ kind: "Event", text: `${x.title}${x.startTime ? ` ${x.startTime}–${x.endTime || ""}` : ""}${x.status === "PROPOSED" ? " (proposed)" : ""}` });

  // Timetable: the latest finished run of each scope.
  const day = DAYS[d.getUTCDay()];
  const runs = await prisma.timetableRun.findMany({ where: { chairmanId, status: "COMPLETED" }, orderBy: { createdAt: "desc" }, select: { id: true, scopeKey: true } });
  const latest = new Map<string, string>();
  for (const r of runs) if (!latest.has(r.scopeKey || "")) latest.set(r.scopeKey || "", r.id);
  const entries = latest.size ? await prisma.timetableEntry.findMany({ where: { timetableRunId: { in: Array.from(latest.values()) }, dayOfWeek: day }, select: { startHour: true, endHour: true, scheduleSection: { select: { courseId: true, groupId: true, sectionLabel: true } } } }) : [];
  const overlapping = entries.filter((x) => x.startHour < e && s < x.endHour);
  const courseIds = overlapping.map((x) => x.scheduleSection.courseId).filter((x): x is string => !!x);
  const groupIds = overlapping.map((x) => x.scheduleSection.groupId).filter((x): x is string => !!x);
  const [courses, members] = await Promise.all([
    prisma.course.findMany({ where: { id: { in: courseIds.concat(["none"]) } }, select: { id: true, code: true, batchId: true } }),
    prisma.courseEquivalenceMember.findMany({ where: { groupId: { in: groupIds.concat(["none"]) } }, select: { groupId: true, course: { select: { code: true, batchId: true } } } }),
  ]);
  const busy = new Map<string, string[]>(); // batchId -> what they have
  for (const x of overlapping) {
    const label = (code: string) => `${code} ${fmt(x.startHour)}–${fmt(x.endHour)}`;
    if (x.scheduleSection.courseId) { const c = courses.find((y) => y.id === x.scheduleSection.courseId); if (c?.batchId) busy.set(c.batchId, [...(busy.get(c.batchId) || []), label(c.code)]); }
    if (x.scheduleSection.groupId) for (const m of members.filter((y) => y.groupId === x.scheduleSection.groupId)) if (m.course.batchId) busy.set(m.course.batchId, [...(busy.get(m.course.batchId) || []), label(m.course.code)]);
  }
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: leads.concat(["none"]) }, students: { some: { status: "ACTIVE" } } }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { batchName: "asc" }] });
  const name = (b: { degreeProgram: string; batchName: string }) => `${b.degreeProgram} — ${b.batchName}`;
  return {
    day, notes, timetable: latest.size > 0,
    busy: batches.filter((b) => busy.has(b.id)).map((b) => ({ batch: name(b), classes: Array.from(new Set(busy.get(b.id))) })),
    free: batches.filter((b) => !busy.has(b.id)).map(name),
  };
}
const fmt = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
