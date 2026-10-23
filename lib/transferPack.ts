import JSZip from "jszip";
import { prisma } from "./db";

// The pack a transferring-out student takes to the new university: the transcript and the outline of every course on it
// (CLOs, weekly topics, assessment weights, textbook), as printable pages in one ZIP.

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const page = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;font-size:13px;max-width:900px;margin:24px auto;color:#222}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px 6px;text-align:left}th{background:#eee}h1{font-size:20px}h2{font-size:15px;margin-top:18px}</style></head><body>${body}</body></html>`;

export async function transferPack(studentId: string) {
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { name: true, rollNumber: true, batchId: true, batch: { select: { degreeProgram: true, batchName: true, coordinator: { select: { managedBy: { select: { instituteName: true, name: true } } } } } } } });
  if (!st) return null;
  const recs = await prisma.studentTranscriptRecord.findMany({ where: { studentId }, orderBy: [{ termYear: "asc" }, { termName: "desc" }] });
  const inst = st.batch.coordinator.managedBy?.instituteName || "";
  const zip = new JSZip();
  let credits = 0, points = 0;
  for (const r of recs) if (r.gpaPoints !== null) { credits += r.creditHours; points += r.gpaPoints * r.creditHours; }
  zip.file("01 Transcript.html", page(`Transcript — ${st.name}`, `<h1>${esc(inst)} — Transcript</h1><p><b>${esc(st.name)}</b> (${esc(st.rollNumber)}) · ${esc(st.batch.degreeProgram)} — ${esc(st.batch.batchName)}</p>
    <table><tr><th>Term</th><th>Code</th><th>Course</th><th>Credit hours</th><th>Grade</th><th>Grade points</th></tr>${recs.map((r) => `<tr><td>${esc(r.termName)} ${esc(r.termYear)}</td><td>${esc(r.courseCode)}</td><td>${esc(r.courseTitle)}</td><td>${r.creditHours}</td><td>${esc(r.grade)}</td><td>${r.gpaPoints ?? "—"}</td></tr>`).join("")}</table>
    <p>CGPA (all attempts with grade points): <b>${credits ? (points / credits).toFixed(2) : "—"}</b>. TR = transferred credit, no grade points. W = withdrawn.</p>`));
  const codes = Array.from(new Set(recs.map((r) => r.courseCode)));
  const courses = await prisma.course.findMany({ where: { code: { in: codes }, batch: { students: { some: { id: studentId } } } }, select: { id: true, code: true, title: true, creditHours: true, textbook: true, catalogDescription: true, assignmentPct: true, quizPct: true, projectPct: true, labPct: true, midtermPct: true, finalPct: true } });
  const all = courses.length ? courses : await prisma.course.findMany({ where: { code: { in: codes }, batchId: st.batchId }, select: { id: true, code: true, title: true, creditHours: true, textbook: true, catalogDescription: true, assignmentPct: true, quizPct: true, projectPct: true, labPct: true, midtermPct: true, finalPct: true } });
  let i = 2;
  for (const c of all) {
    const [clos, lectures] = await Promise.all([
      prisma.cLO.findMany({ where: { courseId: c.id, source: "SE" }, orderBy: { orderIndex: "asc" }, select: { code: true, statement: true, bloomLevel: true } }),
      prisma.lectureRow.findMany({ where: { courseId: c.id, source: "SE" }, orderBy: { lectureNumber: "asc" }, select: { week: true, topic: true, subtopic: true } }),
    ]);
    const weeks = new Map<number, string[]>();
    for (const l of lectures) weeks.set(l.week, [...(weeks.get(l.week) || []), [l.topic, l.subtopic].filter(Boolean).join(": ")]);
    zip.file(`${String(i++).padStart(2, "0")} ${c.code} outline.html`.replace(/[\\/:*?"<>|]/g, "-"), page(`${c.code} ${c.title}`, `<h1>${esc(c.code)} ${esc(c.title)}</h1><p>${c.creditHours} credit hours · ${esc(inst)}</p>
      ${c.catalogDescription ? `<h2>Description</h2><p>${esc(c.catalogDescription)}</p>` : ""}
      <h2>Course Learning Outcomes</h2><table><tr><th>CLO</th><th>Statement</th><th>Bloom</th></tr>${clos.map((x) => `<tr><td>${esc(x.code)}</td><td>${esc(x.statement)}</td><td>${esc(x.bloomLevel)}</td></tr>`).join("")}</table>
      <h2>Assessment</h2><p>Assignments ${c.assignmentPct}% · Quizzes ${c.quizPct}% · Project ${c.projectPct}% · Lab ${c.labPct}% · Midterm ${c.midtermPct}% · Final ${c.finalPct}%</p>
      <h2>Weekly topics</h2><table><tr><th>Week</th><th>Topics</th></tr>${Array.from(weeks.entries()).sort((a, b) => a[0] - b[0]).map(([w, t]) => `<tr><td>${w}</td><td>${t.map(esc).join("<br>")}</td></tr>`).join("")}</table>
      ${c.textbook ? `<h2>Textbook</h2><p>${esc(c.textbook)}</p>` : ""}`));
  }
  return { name: `${st.rollNumber} transfer pack.zip`, buffer: await zip.generateAsync({ type: "nodebuffer" }) };
}
