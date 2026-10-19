import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { earlyWarning } from "./earlyWarning";

// Jobs the daily cron runs on Mondays (and once a year):
//  • Early warning — each advisor hears how many of their students are at high risk this week.
//  • Automatic CQI — a CLO that missed its target in the last two offerings of a course opens an improvement record for
//    the course (once; not again while one is open), so the loop the councils ask about is never forgotten.
//  • Each January — Program Leads are reminded to send the yearly alumni and employer surveys (PEO attainment data).

const TARGET = 60; // % of students reaching a CLO

export async function autoCqi(chairmanId: string) {
  const leads = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } });
  const snaps = await prisma.attainmentSnapshot.findMany({ where: { coordinatorId: { in: leads.map((l) => l.id).concat(["none"]) } }, orderBy: [{ termYear: "desc" }, { termName: "desc" }] });
  const byCourse = new Map<string, typeof snaps>();
  for (const s of snaps) { const k = `${s.coordinatorId}|${s.courseLabel.split(" — ")[0].trim()}`; byCourse.set(k, [...(byCourse.get(k) || []), s]); }
  let opened = 0;
  for (const [k, list] of Array.from(byCourse.entries())) {
    if (list.length < 2) continue;
    const [coordinatorId, code] = k.split("|");
    const rate = (s: (typeof list)[number]) => { try { return new Map((JSON.parse(s.cloStatsJson) as { code: string; passCount: number; failCount: number }[]).map((c) => [c.code, c.passCount + c.failCount ? (100 * c.passCount) / (c.passCount + c.failCount) : null])); } catch { return new Map(); } };
    const [a, b] = [rate(list[0]), rate(list[1])];
    const course = await prisma.course.findFirst({ where: { coordinatorId, code }, orderBy: { createdAt: "desc" }, select: { id: true, batchId: true, subjectExpertId: true, instructorId: true } });
    if (!course) continue;
    for (const [clo, r1] of Array.from(a.entries())) {
      const r2 = b.get(clo);
      if (r1 === null || r2 === null || r2 === undefined || r1 >= TARGET || r2 >= TARGET) continue;
      const open = await prisma.cqiRecord.findFirst({ where: { courseId: course.id, sourceType: "CLO", sourceReference: clo, status: { in: ["open", "in-progress"] } } });
      if (open) continue;
      await prisma.cqiRecord.create({ data: { chairmanId, authorId: coordinatorId, batchId: course.batchId, courseId: course.id, sourceType: "CLO", sourceReference: clo, metricBefore: Math.round(r1), finding: `${code} ${clo}: only ${Math.round(r2)}% (${list[1].termName} ${list[1].termYear}) and ${Math.round(r1)}% (${list[0].termName} ${list[0].termYear}) of students reached it — under the ${TARGET}% target two offerings in a row. Opened automatically.` } });
      await notifyUsers([coordinatorId, course.subjectExpertId, course.instructorId], { kind: "CQI", title: `${code} ${clo} missed its target twice`, body: "An improvement record was opened. Write the action and, next term, check its effect.", href: "/chairman/cqi" });
      opened++;
    }
  }
  return opened;
}

export async function runWeekly(now: Date) {
  const heads = await prisma.user.findMany({ where: { role: "CHAIRMAN", isActive: true }, select: { id: true } });
  let warned = 0, cqi = 0;
  for (const h of heads) {
    const rows = await earlyWarning(h.id).catch(() => []);
    const per = new Map<string, number>();
    for (const r of rows) if (r.level === "HIGH" && r.advisorId) per.set(r.advisorId, (per.get(r.advisorId) || 0) + 1);
    for (const [advisor, n] of Array.from(per.entries())) { await notifyUsers([advisor], { kind: "EARLY_WARNING", title: `${n} of your students at high risk this week`, body: "Attendance, marks so far, CGPA or missed work. Talk to them early.", href: "/early-warning" }); warned++; }
    cqi += await autoCqi(h.id).catch(() => 0);
    if (now.getUTCMonth() === 0 && now.getUTCDate() <= 7) {
      const leads = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: h.id, isActive: true }, select: { id: true } });
      await notifyUsers(leads.map((l) => l.id), { kind: "SURVEY", title: "Time for the yearly alumni and employer surveys", body: "Send this year's alumni and employer surveys — they are the evidence for PEO attainment. Teachers can also ask alumni directly from Alumni Voice.", href: "/coordinator/surveys" });
    }
  }
  return { warned, cqi };
}
