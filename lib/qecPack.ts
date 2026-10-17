import ExcelJS from "exceljs";
import { prisma } from "./db";
import { qdb, PROFORMAS, FACULTY_ITEMS, facultySummary, MIN_FACULTY_ANSWERS } from "./quality";
import { EVAL, evalSummary } from "./evaluations";

// The HEC QEC proforma pack: what the system holds for each proforma, counted and summarised, for the QEC / assessment team.
export async function qecStatus(chairmanId: string, leadIds: string[]) {
  const courses = await prisma.course.findMany({ where: { coordinatorId: { in: leadIds.concat(["none"]) } }, select: { id: true, code: true, title: true, instructor: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true } } }, take: 3000 });
  const ids = courses.map((c) => c.id);
  const evals = (await qdb.courseEvaluation.findMany({ where: { courseId: { in: ids.concat(["none"]) } }, select: { kind: true } }).catch(() => [])) as { kind: string }[];
  const reviews = await (qdb.courseReview?.count({ where: { courseId: { in: ids.concat(["none"]) } } }) as Promise<number> | undefined)?.catch(() => 0) ?? 0;
  const round = await qdb.facultySurveyRound.findFirst({ where: { chairmanId }, orderBy: { createdAt: "desc" } }).catch(() => null);
  const fs = round ? await qdb.facultySurveyAnswer.count({ where: { roundId: round.id } }).catch(() => 0) : 0;
  const surveys = await prisma.surveyResponse.findMany({ where: { submittedAt: { not: null }, surveyTemplate: { coordinatorId: { in: leadIds.concat(["none"]) } } }, select: { surveyTemplate: { select: { title: true, stakeholderType: true } } } });
  const st = (re: RegExp) => surveys.filter((s) => re.test(s.surveyTemplate.title)).length;
  const staff = (await prisma.user.findMany({ where: { OR: [{ managedById: chairmanId }, { managedById: { in: leadIds.concat(["none"]) } }] }, select: { id: true } })).map((u) => u.id);
  const profiles = await prisma.facultyProfile.count({ where: { userId: { in: staff.concat(["none"]) } } }).catch(() => 0);
  const count: Record<number, string> = {
    1: `${evals.filter((e) => e.kind === "COURSE").length} course evaluations`,
    2: `${reviews} teacher course reviews`,
    5: round ? `${fs} answers in "${round.title}"` : "no round yet",
    6: `${st(/exit/i)} graduating-student surveys`,
    7: `${st(/alumni/i)} alumni surveys`,
    8: `${st(/employer/i)} employer surveys`,
    9: `${evals.filter((e) => e.kind === "TEACHER").length} teacher evaluations`,
    10: `${profiles} faculty profiles`,
  };
  return { courses, count, round };
}

export async function qecWorkbook(chairmanId: string, leadIds: string[]) {
  const { courses, count, round } = await qecStatus(chairmanId, leadIds);
  const wb = new ExcelJS.Workbook();
  const sum = wb.addWorksheet("Summary");
  sum.addRow(["Proforma", "Title", "Held in OBEHUB as", "On record"]).font = { bold: true };
  for (const p of PROFORMAS) sum.addRow([p.no, p.title, p.where, count[p.no] || p.note || ""]);
  [10, 40, 50, 40].forEach((w, i) => { sum.getColumn(i + 1).width = w; });

  const ev = await evalSummary(courses.map((c) => c.id));
  for (const [kind, no] of [["COURSE", 1], ["TEACHER", 9]] as const) {
    const ws = wb.addWorksheet(`P${no} ${kind === "COURSE" ? "Course eval" : "Teacher eval"}`);
    ws.addRow(["Course", "Title", "Batch", "Teacher", "Responses", ...EVAL[kind].items.map(([, t]) => t), "Overall"]).font = { bold: true };
    for (const c of courses) { const e = ev.get(c.id)?.[kind]; if (!e || !e.n) continue; ws.addRow([c.code, c.title, `${c.batch?.degreeProgram || ""} ${c.batch?.batchName || ""}`, c.instructor?.name || "", e.n, ...EVAL[kind].items.map(([k]) => e.avg[k] ?? null), e.overall]); }
  }
  const p5 = wb.addWorksheet("P5 Faculty survey");
  if (round) {
    const ans = (await qdb.facultySurveyAnswer.findMany({ where: { roundId: round.id }, select: { answersJson: true, departmentId: true } })) as { answersJson: string; departmentId: string | null }[];
    const s = facultySummary(ans);
    p5.addRow([round.title, `${s.n} answers`]).font = { bold: true };
    if (s.n >= MIN_FACULTY_ANSWERS) for (const [k, t] of FACULTY_ITEMS) p5.addRow([t, s.avg[k]]);
    else p5.addRow([`Shown once at least ${MIN_FACULTY_ANSWERS} have answered.`]);
  } else p5.addRow(["No faculty survey round yet."]);
  p5.getColumn(1).width = 70;

  const answers = await prisma.surveyAnswer.findMany({ where: { surveyResponse: { submittedAt: { not: null } }, question: { surveyTemplate: { coordinatorId: { in: leadIds.concat(["none"]) } } } }, select: { ratingValue: true, question: { select: { text: true, surveyTemplate: { select: { title: true } } } } } });
  for (const [no, re, name] of [[6, /exit/i, "P6 Graduating"], [7, /alumni/i, "P7 Alumni"], [8, /employer/i, "P8 Employer"]] as const) {
    const ws = wb.addWorksheet(name);
    ws.addRow(["Survey", "Question", "Answers", "Average (1-5)", "% rated 3+"]).font = { bold: true };
    const m = new Map<string, number[]>();
    for (const a of answers) if (re.test(a.question.surveyTemplate.title)) { const k = `${a.question.surveyTemplate.title}\u0000${a.question.text}`; m.set(k, [...(m.get(k) || []), a.ratingValue]); }
    for (const [k, v] of Array.from(m.entries())) { const [t, q] = k.split("\u0000"); ws.addRow([t, q, v.length, Math.round((100 * v.reduce((x, y) => x + y, 0)) / v.length) / 100, Math.round((1000 * v.filter((x) => x >= 3).length) / v.length) / 10]); }
    if (!m.size) ws.addRow([`No submitted answers for Proforma ${no} yet.`]);
    ws.getColumn(1).width = 40; ws.getColumn(2).width = 70;
  }
  return wb.xlsx.writeBuffer();
}

/** Program Leads whose programs the person may see (the Program Lead: themselves). */
export async function leadsFor(user: { id: string; role: string }, chairmanId: string) {
  if (user.role === "PROGRAM_COORDINATOR") return [user.id];
  return (await prisma.user.findMany({ where: { managedById: chairmanId, role: "PROGRAM_COORDINATOR" }, select: { id: true } })).map((u) => u.id);
}
