import { prisma } from "./db";
import { notifyStudents } from "./studentNotices";

// Student and parent notifications. Every event shows in the student's in-app bell; SMS / WhatsApp go out only for
// the kinds the student has not switched off (StudentAlertPref) and only when the institute has a gateway set up.
// Guardians get a weekly summary with the read-only parent link.

const adb = prisma as unknown as Record<string, any>;
export const STUDENT_KINDS: [string, string][] = [
  ["REGISTRATION", "Course registration and advisor decisions"], ["HOLD", "Registration holds"], ["RESULT", "Results published, re-checking"],
  ["ATTENDANCE", "Attendance below the limit"], ["FEE", "Fee invoices, dues and receipts"], ["FEEDBACK", "Feedback / survey windows"],
  ["STATUS", "Status changes (freeze, transfer, readmission)"], ["EXAM", "Exams, admit cards, debarred lists"], ["COUNSELLING", "Counselling"],
];

export async function prefsOf(studentIds: string[]) {
  const rows = (await adb.studentAlertPref.findMany({ where: { studentId: { in: studentIds.concat("none") } } }).catch(() => [])) as { studentId: string; offJson: string; parentWeekly: boolean }[];
  return new Map(rows.map((r) => { let off: string[] = []; try { off = JSON.parse(r.offJson); } catch { off = []; } return [r.studentId, { off: new Set(off), parentWeekly: r.parentWeekly }] as const; }));
}
export async function savePrefs(studentId: string, off: string[], parentWeekly: boolean) {
  const offJson = JSON.stringify(off.filter((k) => STUDENT_KINDS.some(([x]) => x === k)));
  await adb.studentAlertPref.upsert({ where: { studentId }, create: { studentId, offJson, parentWeekly }, update: { offJson, parentWeekly, updatedAt: new Date() } });
}

async function chairmanOf(studentId: string) {
  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { batch: { select: { coordinator: { select: { managedById: true } } } } } });
  return s?.batch.coordinator.managedById || null;
}

/** Tell students (one institute) — never throws. */
export async function tellStudents(studentIds: string[], kind: string, title: string, body?: string, href?: string) {
  try {
    if (!studentIds.length) return;
    const cid = await chairmanOf(studentIds[0]);
    const prefs = await prefsOf(studentIds);
    const sms = studentIds.filter((id) => !prefs.get(id)?.off.has(kind));
    const quiet = studentIds.filter((id) => !sms.includes(id));
    if (sms.length) await notifyStudents(sms, { kind, title, body, href }, cid);
    if (quiet.length) await notifyStudents(quiet, { kind, title, body, href });
  } catch { /* best effort */ }
}

/** Daily (cron): attendance below the limit (Mondays, once a week), fee due in 3 days, and the guardians' weekly summary. */
export async function dailyStudentAlerts(now = new Date()) {
  let sent = 0;
  const monday = now.getUTCDay() === 1;
  // Fees due in the next 3 days, unpaid.
  try {
    const soon = new Date(now.getTime() + 3 * 864e5), from = new Date(now.getTime() + 2 * 864e5);
    const inv = (await adb.feeInvoice.findMany({ where: { status: { in: ["UNPAID", "PARTIAL"] }, dueDate: { gte: from, lt: soon } }, select: { studentId: true, amount: true, paid: true, dueDate: true } })) as { studentId: string; amount: number; paid: number; dueDate: Date }[];
    for (const i of inv) { await tellStudents([i.studentId], "FEE", `Fee due on ${i.dueDate.toDateString()}`, `Rs ${(i.amount - (i.paid || 0)).toLocaleString("en-PK")} is outstanding; a late fine may apply after the due date.`, "/student/fees"); sent++; }
  } catch { /* no fee tables */ }
  // Feedback window opening today: students of each course are told once.
  try {
    const { settingsFor, windowOf } = await import("./questionnaires");
    const today = now.toISOString().slice(0, 10);
    const heads = await prisma.user.findMany({ where: { role: "CHAIRMAN", isActive: true }, select: { id: true } });
    for (const h of heads) {
      const s = await settingsFor(h.id);
      if (s.fromWeek === null) continue;
      const courses = await prisma.course.findMany({ where: { isOffered: true, coordinator: { managedById: h.id } }, select: { id: true, code: true } });
      for (const c of courses) {
        const w = await windowOf(c.id, s, now);
        if (w.opensOn !== today) continue;
        const en = await prisma.studentEnrollment.findMany({ where: { courseId: c.id, status: "ACTIVE" }, select: { studentId: true } });
        await tellStudents(en.map((e) => e.studentId), "FEEDBACK", `Feedback is open: ${c.code}`, `Please give your feedback on the course and teacher by ${w.closesOn}. It is anonymous.`, "/student/course-survey");
        sent += en.length;
      }
    }
  } catch { /* feedback not set up */ }
  if (monday) {
    // Attendance below the limit in current courses.
    try {
      const { attendancePolicy, coursesAttendance } = await import("./attendance");
      const heads = await prisma.user.findMany({ where: { role: "CHAIRMAN", isActive: true }, select: { id: true } });
      for (const h of heads) {
        const courses = await prisma.course.findMany({ where: { isOffered: true, coordinator: { managedById: h.id } }, select: { id: true } });
        if (!courses.length) continue;
        const p = await attendancePolicy(h.id);
        const { shortages } = await coursesAttendance(courses.map((c) => c.id), p);
        const by = new Map<string, string[]>();
        for (const s of shortages) by.set(s.studentId, (by.get(s.studentId) || []).concat(`${s.code} ${s.pct.toFixed(0)}%`));
        for (const [sid, list] of Array.from(by.entries())) { await tellStudents([sid], "ATTENDANCE", `Attendance below ${p.minPct}%`, `${list.join(", ")}. Below the limit you may be debarred from the final exam.`, "/student/attendance"); sent++; }
      }
    } catch { /* attendance not set up */ }
    sent += await parentSummaries().catch(() => 0);
  }
  return sent;
}

/** Weekly guardian summary by SMS / WhatsApp: attendance, current marks and fees at a glance, with the parent link. */
export async function parentSummaries() {
  const contacts = (await adb.studentContact.findMany({ where: { guardianPhone: { not: null } }, select: { studentId: true, guardianPhone: true } }).catch(() => [])) as { studentId: string; guardianPhone: string }[];
  if (!contacts.length) return 0;
  const prefs = await prefsOf(contacts.map((c) => c.studentId));
  const { parentLink } = await import("./parentLink");
  const { sendAlert } = await import("./messaging");
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://obe-webapp2.vercel.app";
  let n = 0;
  for (const c of contacts) {
    if (prefs.get(c.studentId)?.parentWeekly === false) continue;
    const st = await prisma.student.findUnique({ where: { id: c.studentId }, select: { name: true, status: true, batch: { select: { coordinator: { select: { managedById: true } } } } } });
    if (!st || st.status !== "ACTIVE" || !st.batch.coordinator.managedById) continue;
    const token = await parentLink(c.studentId, "system").catch(() => null);
    if (!token) continue;
    const due = ((await adb.feeInvoice.findMany({ where: { studentId: c.studentId, status: { in: ["UNPAID", "PARTIAL"] } }, select: { amount: true, paid: true, discount: true, fine: true } }).catch(() => [])) as { amount: number; paid: number; discount: number; fine: number }[]).reduce((a, i) => a + i.amount - (i.discount || 0) + (i.fine || 0) - (i.paid || 0), 0);
    await sendAlert(st.batch.coordinator.managedById, "PARENT_SUMMARY", [{ to: c.guardianPhone }], `Weekly update: ${st.name}`, `${due > 0 ? `Fee outstanding Rs ${due.toLocaleString("en-PK")}. ` : ""}Attendance, marks and results: ${base}/parent/${token}`).catch(() => null);
    n++;
  }
  return n;
}
