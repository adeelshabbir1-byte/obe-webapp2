import { prisma } from "./db";
import { edb, post } from "./erp";

export type FeeLine = { name: string; amount: number; account: string };

/** Invoice lines for one student of a batch for a term, from the program's fee structure (intake session = batch start year). */
export async function feeLinesFor(chairmanId: string, batch: { id: string; degreeProgram: string; startYear: number; startTerm: string }, termName: string, termYear: number, studentId: string) {
  const all = await prisma.feeStructure.findMany({ where: { chairmanId, degreeProgram: batch.degreeProgram } });
  const fs = all.find((f) => f.session.startsWith(String(batch.startYear))) || all.sort((a, b) => b.session.localeCompare(a.session))[0];
  if (!fs) return null;
  const lines: FeeLine[] = [];
  const firstTerm = batch.startTerm === termName && batch.startYear === termYear;
  if (firstTerm && fs.admissionFee) lines.push({ name: "Admission fee", amount: fs.admissionFee, account: "4010" });
  if (fs.perCreditHour) {
    const ch = (await prisma.studentEnrollment.findMany({ where: { studentId, status: "ACTIVE", course: { isOffered: true, offeredTermName: termName, offeredTermYear: termYear } }, select: { course: { select: { creditHours: true } } } })).reduce((s, e) => s + e.course.creditHours, 0);
    if (ch) lines.push({ name: `Tuition (${ch} credit hours × ${fs.perCreditHour})`, amount: ch * fs.perCreditHour, account: "4000" });
    else if (fs.tuitionPerSemester) lines.push({ name: "Tuition fee", amount: fs.tuitionPerSemester, account: "4000" });
  } else if (fs.tuitionPerSemester) lines.push({ name: "Tuition fee", amount: fs.tuitionPerSemester, account: "4000" });
  if (fs.labFee) lines.push({ name: "Lab fee", amount: fs.labFee, account: "4020" });
  if (fs.examFee) lines.push({ name: "Examination fee", amount: fs.examFee, account: "4020" });
  if (fs.otherFee) lines.push({ name: "Other charges", amount: fs.otherFee, account: "4030" });
  return lines;
}

export const balanceOf = (i: { amount: number; discount: number; fine: number; paid: number }) => Math.round(i.amount - i.discount + i.fine - i.paid);
export const statusOf = (i: { amount: number; discount: number; fine: number; paid: number }) => (balanceOf(i) <= 0 ? "PAID" : i.paid > 0 ? "PARTIAL" : "UNPAID");

/** Issue invoices for every active student of a batch (skips students who already have one for that term). */
export async function issueForBatch(chairmanId: string, userId: string, batchId: string, termName: string, termYear: number, dueDate: Date) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, degreeProgram: true, startYear: true, startTerm: true } });
  if (!batch) return { error: "Batch not found." };
  const students = await prisma.student.findMany({ where: { batchId, status: "ACTIVE" }, select: { id: true } });
  const have = new Set(((await edb.feeInvoice.findMany({ where: { chairmanId, termName, termYear, studentId: { in: students.map((s) => s.id) } }, select: { studentId: true } })) as { studentId: string }[]).map((x) => x.studentId));
  let made = 0;
  for (const s of students) {
    if (have.has(s.id)) continue;
    const lines = await feeLinesFor(chairmanId, batch, termName, termYear, s.id);
    if (!lines) return { error: `No fee structure for ${batch.degreeProgram}. Set it in Finance → Fees & scholarships.` };
    const amount = lines.reduce((t, l) => t + l.amount, 0);
    if (!amount) continue;
    const inv = await edb.feeInvoice.create({ data: { chairmanId, studentId: s.id, termName, termYear, linesJson: JSON.stringify(lines), amount, dueDate } });
    const byAcct = new Map<string, number>(); lines.forEach((l) => byAcct.set(l.account, (byAcct.get(l.account) || 0) + l.amount));
    await post(chairmanId, userId, `Fee invoice ${termName} ${termYear}`, [["1100", amount, 0], ...Array.from(byAcct.entries()).map(([a, v]) => [a, 0, v] as [string, number, number])], "FEE_INVOICE", inv.id);
    made++;
    await (await import("./studentAlerts")).tellStudents([s.id], "FEE", `Fee invoice ${termName} ${termYear}: Rs ${amount.toLocaleString("en-PK")}`, `Due on ${dueDate.toDateString()}.`, "/student/fees");
  }
  return { made };
}
