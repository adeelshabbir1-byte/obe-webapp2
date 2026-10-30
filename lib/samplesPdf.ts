import { PDFDocument } from "pdf-lib";
import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { PdfDoc, clean } from "./pdfDoc";
import { courseSampling, COURSE_SAMPLE, LEVELS } from "./portfolio";
import { readStored } from "./sampleStorage";

// "Print / PDF course-file samples": one PDF per course (or per assessment) with a cover page, the question paper, the
// best / average / weakest samples with their marks and CLO attainment, and the scanned scripts themselves — ready for
// the course file and accreditation. Students appear by roll number only unless names are asked for.

type Who = { id: string; role: string; managedById: string | null };
/** The course's Instructor and Subject Expert, its Program Lead, and the institute's HOD / Dean / OMC / Head. */
export async function canSeeSamples(user: Who, courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { instructorId: true, subjectExpertId: true, coordinatorId: true, coordinator: { select: { managedById: true } } } });
  if (!c) return false;
  if ([c.instructorId, c.subjectExpertId, c.coordinatorId].includes(user.id)) return true;
  if (!["HEAD_OF_DEPARTMENT", "DEAN", "OMC", "CHAIRMAN", "DEPARTMENT_COORDINATOR"].includes(user.role)) return false;
  return (await chairmanIdFor(user).catch(() => null)) === c.coordinator.managedById;
}

export async function samplesPdf(courseId: string, opts: { instrumentId?: string | null; names?: boolean }) {
  const course = await prisma.course.findUniqueOrThrow({ where: { id: courseId }, select: { code: true, title: true, offeredTermName: true, offeredTermYear: true, instructor: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true } } } });
  const data = await courseSampling(courseId);
  const items = data.items.filter((i) => !opts.instrumentId || i.id === opts.instrumentId);
  const { computeResultMate } = await import("./resultMate");
  const rm = await computeResultMate(courseId).catch(() => null);
  const rowOf = new Map((rm?.rows || []).map((r) => [r.studentId, r]));
  const paper = await prisma.paperDistributionItem.findMany({ where: { courseId, source: "INSTRUCTOR" }, orderBy: [{ examType: "asc" }, { questionNo: "asc" }], select: { examType: true, questionNo: true, topicText: true, marks: true, cognitiveLevel: true, clo: { select: { code: true } } } });
  const who = (s: { rollNumber: string; name: string } | undefined) => (s ? (opts.names ? `${s.rollNumber} — ${s.name}` : s.rollNumber) : "—");
  const term = `${course.offeredTermName || ""} ${course.offeredTermYear || ""}`.trim();
  const pdf = await PdfDoc.create(`${course.code} course-file samples`);
  // Cover page.
  pdf.title(`${course.code} — ${course.title}`, `Course-file samples · best, average and weakest scripts${term ? ` · ${term}` : ""}`);
  pdf.kv([["Program", course.batch ? `${course.batch.degreeProgram} — ${course.batch.batchName}` : "—"], ["Instructor", course.instructor?.name || "—"], ["Assessments", items.map((i) => i.label).join(", ") || "—"], ["Students", opts.names ? "named" : "roll numbers only (names hidden)"], ["Generated", new Date().toISOString().slice(0, 10)]]);
  const attachments: { title: string; ref: string }[] = [];
  for (const it of items) {
    pdf.newPage();
    pdf.title(`${it.label}${it.type !== "Course" ? ` (${it.type})` : ""}`, `CLOs: ${it.clos.join(", ") || "—"} · out of ${it.maxScore}${it.type === "Course" ? "%" : ""} · ${it.scored} student(s) marked`);
    // The question paper (midterm / final questions with CLO and Bloom), or what the assessment covers.
    const qs = paper.filter((q) => (it.type === "Midterm" || it.type === "Final") && q.examType === it.type);
    if (qs.length) { pdf.text("Question paper", { bold: true }); pdf.table([["Q", 30], ["Question / topic", 300], ["CLO", 50], ["Bloom", 50], ["Marks", 50]], qs.map((q) => [q.questionNo, q.topicText, q.clo?.code || "—", q.cognitiveLevel || "—", q.marks])); }
    else pdf.note(it.type === "Course" ? "Whole course: students ranked by total %." : "Question paper: see the assessment brief in the course file.");
    pdf.text("Samples", { bold: true });
    const rows = LEVELS.map(([lvl, label]) => {
      const s = it.samples.find((x: { level: string }) => x.level === lvl) as { studentId: string; score: number | null; fileUrl: string; fileName: string; student?: { rollNumber: string; name: string } } | undefined;
      const sug = (it.suggest as Record<string, { id: string; rollNumber: string; name: string; score: number } | null>)[lvl];
      const sid = s?.studentId || sug?.id;
      const stud = s?.student || (sug ? { rollNumber: sug.rollNumber, name: sug.name } : undefined);
      const score = s?.score ?? sug?.score ?? null;
      const r = sid ? rowOf.get(sid) : undefined;
      const clo = r ? it.clos.map((c) => { const max = rm?.cloMaxWeight[c] || 0; return max ? `${c} ${Math.round((100 * (r.byClo[c] || 0)) / max)}%` : null; }).filter(Boolean).join(" · ") : "";
      if (s?.fileUrl) attachments.push({ title: `${it.label} — ${label}: ${who(stud)}`, ref: s.fileUrl });
      return [label, who(stud), score == null ? "—" : `${score}${it.type === "Course" ? "%" : ` / ${it.maxScore}`}`, clo || "—", s ? "attached" : "not uploaded"];
    });
    pdf.table([["Sample", 60], ["Student", 140], ["Marks", 70], ["CLO attainment (course so far)", 170], ["Script", 70]], rows);
  }
  // The scanned scripts, after the summary pages.
  for (const a of attachments) {
    const f = await readStored(a.ref).catch(() => null);
    if (!f) { pdf.newPage(); pdf.title(a.title); pdf.note("The scanned script could not be read from storage."); continue; }
    try {
      if (/pdf/i.test(f.type)) {
        const src = await PDFDocument.load(f.buf, { ignoreEncryption: true });
        const pages = await pdf.doc.copyPages(src, src.getPageIndices());
        pdf.newPage(); pdf.title(a.title); pdf.note(`${pages.length} page(s) follow.`);
        for (const p of pages) pdf.doc.addPage(p);
      } else if (/png|jpe?g/i.test(f.type)) {
        const img = /png/i.test(f.type) ? await pdf.doc.embedPng(f.buf) : await pdf.doc.embedJpg(f.buf);
        const page = pdf.doc.addPage([595.28, 841.89]);
        const w = 515, h = Math.min(740, (img.height / img.width) * w);
        page.drawText(clean(a.title).slice(0, 90), { x: 40, y: 810, size: 10, font: pdf.bold });
        page.drawImage(img, { x: 40, y: 790 - h, width: w, height: h });
      } else { pdf.newPage(); pdf.title(a.title); pdf.note(`Attached file of type ${f.type} — open it in the app.`); }
    } catch { pdf.newPage(); pdf.title(a.title); pdf.note("The scanned script could not be added to the PDF."); }
  }
  return { bytes: await pdf.save(), name: `${course.code.replace(/[^A-Za-z0-9-]/g, "")}-samples${opts.instrumentId && opts.instrumentId !== COURSE_SAMPLE ? "-assessment" : ""}.pdf` };
}
