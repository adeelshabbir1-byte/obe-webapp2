import JSZip from "jszip";
import { Document, HeadingLevel, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { prisma } from "../db";
import { buildNbeacSar } from "../nbeacSar";
import { nbeacWordDocument } from "../nbeacWord";
import { sarScope } from "../sarAccess";
import { MEETING_KINDS } from "../evidenceFiles";
import { BODIES, type BodyKey } from "./bodies";
import { CATALOGUE } from "./catalogue";
import { cycleView, parseData } from "./governance";
import type { SourceResult } from "./sources";

// The visit dossier: one ZIP laid out the way the council's inspectors read it — a folder per criterion (NCEAC, HEC) or
// form (NBEAC), each task's form as a Word document with the data the system filled in, the checklist the assignee
// confirmed and the sign-off, the task's evidence beside it; the full NBEAC SAR for business programs; the evidence files,
// meeting minutes and CQI records; an index page and a manifest of every file.

const MAX_ATTACHMENTS = 150 * 1024 * 1024;
const safe = (s: string, n = 80) => s.replace(/[\\/:*?"<>|\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n) || "untitled";
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "—");
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const STATUS: Record<string, string> = { OPEN: "Not assigned", ASSIGNED: "Assigned", RETURNED: "Returned for changes", SUBMITTED: "Signed off by the assignee", APPROVED: "Approved" };

const p = (text: string, opts: { bold?: boolean; size?: number; italics?: boolean } = {}) => new Paragraph({ children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size ?? 20 })] });
const h = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_2) => new Paragraph({ heading: level, spacing: { before: 240, after: 80 }, children: [new TextRun({ text })] });
const cell = (text: string, head = false) => new TableCell({ shading: head ? { type: ShadingType.CLEAR, fill: "F4EFE1" } : undefined, children: String(text).split("\n").map((l) => new Paragraph({ children: [new TextRun({ text: l, bold: head, size: 17 })] })) });
const table = (columns: string[], rows: (string | number)[][]) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: columns.map((c) => cell(c, true)) }), ...rows.map((r) => new TableRow({ children: r.map((c) => cell(c === "" ? "—" : String(c))) }))] });

function sourceBlocks(results: SourceResult[]) {
  const out: (Paragraph | Table)[] = [];
  for (const r of results) {
    out.push(h(r.title, HeadingLevel.HEADING_3));
    if (r.note) out.push(p(r.note, { size: 18, italics: true }));
    if (r.rows.length && r.columns.length) out.push(table(r.columns, r.rows));
    else if (!r.checks.length) out.push(p("No records.", { italics: true, size: 18 }));
    if (r.checks.length) out.push(table(["Check", "Done", "Of"], r.checks.map((c) => [c.label, c.done, c.total])));
  }
  return out;
}

export async function buildDossier(cycleId: string): Promise<{ buffer: Buffer; filename: string } | null> {
  const cv = await cycleView(cycleId, { withSources: true });
  if (!cv) return null;
  const { cycle } = cv;
  const body = cycle.body as BodyKey;
  const cat = CATALOGUE[body];
  const tasks = await prisma.accreditationTask.findMany({ where: { cycleId } });
  const taskIds = tasks.map((t) => t.id).concat("none");
  const [files, events] = await Promise.all([
    prisma.accreditationTaskFile.findMany({ where: { taskId: { in: taskIds } }, orderBy: { createdAt: "asc" } }),
    prisma.accreditationTaskEvent.findMany({ where: { taskId: { in: taskIds } }, orderBy: { createdAt: "asc" } }),
  ]);
  const ids = Array.from(new Set(tasks.flatMap((t) => [t.assigneeId, t.submittedById, t.reviewedById, t.assignedById]).concat(events.map((e) => e.byId)).filter((x): x is string => !!x)));
  const people = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const name = (id: string | null | undefined) => (id ? people.get(id) || "—" : "—");
  const zip = new JSZip();
  const root = zip.folder(safe(`${cycle.program} - ${body} dossier`))!;
  const manifest: string[][] = [["Path", "What it is", "Source"]];
  let attached = 0;
  const add = (folder: JSZip, path: string, data: Buffer | string, what: string, source: string, base = "") => { folder.file(path, data); manifest.push([`${base}${path}`, what, source]); };
  const attach = (folder: JSZip, base: string, fileName: string, b64: string, what: string, source: string) => {
    const size = Math.floor((b64.length * 3) / 4);
    if (attached + size > MAX_ATTACHMENTS) { manifest.push([`${base}${fileName}`, `${what} — NOT INCLUDED (the dossier reached its size limit; download it from the system)`, source]); return; }
    attached += size;
    add(folder, safe(fileName, 120), Buffer.from(b64, "base64"), what, source, base);
  };
  const groupFolder = (key: string) => `${BODIES[body].groupLabel} ${key} - ${safe(cat.groups.find((g) => g.key === key)?.title || key, 60)}`;

  // ---- one folder per criterion / form, one Word form per task
  for (const def of cat.tasks) {
    const t = tasks.find((x) => x.code === def.code), v = cv.tasks.find((x) => x.code === def.code);
    if (!t || !v) continue;
    const gname = groupFolder(def.group);
    const folder = root.folder(gname)!;
    const d = parseData(t);
    const doc = new Document({ sections: [{ children: [
      new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: `${def.code} ${def.title}` })] }),
      p(`${cycle.program} — ${BODIES[body].name}. ${BODIES[body].groupLabel} ${def.group}: ${cat.groups.find((g) => g.key === def.group)?.title || ""}.`, { size: 18 }),
      p(def.purpose),
      table(["Status", "Progress", "Assigned to", "Signed off", "Approved"], [[STATUS[t.status] || t.status, `${v.progress}%`, name(t.assigneeId), t.submittedAt ? `${name(t.submittedById)}, ${day(t.submittedAt)}` : "—", t.status === "APPROVED" ? `${name(t.reviewedById)}, ${day(t.reviewedAt)}` : "—"]]),
      h("What the system holds"), ...sourceBlocks(cv.sources.get(t.id) || []),
      h("Confirmed by the assignee"), table(["Point", "Confirmed"], def.checklist.map((c) => [c, d.checked?.[c] ? "Yes" : "No"])),
      ...((def.fields || []).flatMap((f) => [h(f.label, HeadingLevel.HEADING_3), ...(d.fields?.[f.key] || "—").split(/\n+/).map((l) => p(l))])),
      ...(t.reviewNote ? [h("Reviewer's note", HeadingLevel.HEADING_3), p(t.reviewNote)] : []),
      ...(v.gaps.length ? [h("Gaps found"), ...v.gaps.map((g) => new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: g.text, size: 18 })] }))] : []),
    ] }] });
    add(folder, `${safe(`${def.code} ${def.title}`)}.docx`, await Packer.toBuffer(doc), `Task form ${def.code}`, "Accreditation task", `${gname}/`);
    const mine = files.filter((f) => f.taskId === t.id);
    if (mine.length) { const ev = folder.folder(safe(`${def.code} evidence`))!; for (const f of mine) attach(ev, `${gname}/${safe(`${def.code} evidence`)}/`, f.fileName, f.data, f.title, `Attached to task ${def.code} by ${name(f.uploadedById)}`); }
  }

  // ---- evidence files filed under the accreditation criteria (Evidence files page)
  const evidence = await prisma.evidenceFile.findMany({ where: { chairmanId: cycle.chairmanId, OR: [{ leadId: cycle.leadId }, { leadId: null }] }, orderBy: { createdAt: "asc" } });
  for (const e of evidence) {
    const crit = e.criterion && body === "NCEAC" && cat.groups.some((g) => g.key === String(e.criterion)) ? String(e.criterion) : null;
    const base = crit ? `${groupFolder(crit)}/Evidence files/` : "Evidence files/";
    attach(root.folder(base.slice(0, -1))!, base, e.fileName, e.data, e.title, `Evidence file${e.criterion ? ` (criterion ${e.criterion})` : ""}`);
  }

  // ---- NBEAC: the full SAR and the documents kept with its registers
  if (body === "NBEAC" && cycle.departmentId) {
    const head = await prisma.user.findUnique({ where: { id: cycle.chairmanId } });
    if (head) {
      const scope = await sarScope({ ...head, role: "CHAIRMAN" } as never);
      const sar = await buildNbeacSar({ id: head.id, role: "CHAIRMAN" }, scope, cycle.departmentId).catch(() => null);
      const sarFolder = root.folder("NBEAC SAR")!;
      if (sar) add(sarFolder, `NBEAC SAR - ${safe(sar.school)}.docx`, await Packer.toBuffer(nbeacWordDocument(sar)), "The Self-Assessment Report, Forms 1 to 7", "NBEAC SAR builder", "NBEAC SAR/");
      const recs = await prisma.accreditationRecord.findMany({ where: { chairmanId: cycle.chairmanId, fileData: { not: null }, OR: [{ departmentId: cycle.departmentId }, { departmentId: null }], NOT: { kind: { in: ["GRIEVANCE", "UNFAIR_MEANS", "PLAGIARISM_CASE", "STUDENT_MISCONDUCT", "EMPLOYEE_MISCONDUCT", "HARASSMENT", "FACULTY_EXIT"] } } }, select: { kind: true, title: true, fileName: true, fileData: true, dataJson: true } });
      for (const r of recs) {
        let appendix = "";
        try { appendix = String(JSON.parse(r.dataJson || "{}").appendix || ""); } catch { appendix = ""; }
        const sub = safe(appendix ? `Appendix ${appendix}` : r.kind.toLowerCase().replace(/_/g, " "), 70);
        attach(sarFolder.folder(`Documents/${sub}`)!, `NBEAC SAR/Documents/${sub}/`, r.fileName || `${r.title}.bin`, r.fileData!, r.title, "Accreditation data register");
      }
    }
  }

  // ---- meeting minutes of the last two years
  const since = new Date(Date.now() - 2 * 365 * 864e5);
  const minutes = await prisma.meetingMinutes.findMany({ where: { chairmanId: cycle.chairmanId, data: { not: null }, meetingDate: { gte: since }, OR: [{ leadId: cycle.leadId }, { leadId: null }] }, orderBy: { meetingDate: "asc" } });
  for (const m of minutes) attach(root.folder("Meetings and minutes")!, "Meetings and minutes/", `${day(m.meetingDate)} ${MEETING_KINDS[m.kind] || m.kind} - ${m.fileName || m.title}`, m.data!, m.title, "Meetings & Minutes");

  // ---- CQI records
  const cqi = cv.sources ? Array.from(cv.sources.values()).flat().find((r) => r.key === "cqi") : undefined;
  if (cqi) {
    const csv = [cqi.columns, ...cqi.rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    add(root.folder("CQI")!, "CQI records.csv", "﻿" + csv, "CQI findings, actions and status", "CQI Records", "CQI/");
  }

  // ---- readiness summary, index page and manifest
  const summary = new Document({ sections: [{ children: [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: `${cycle.program} – ${body} Visit Readiness` })] }),
    p(`${cycle.title}${cycle.visitDate ? ` — visit on ${day(cycle.visitDate)}` : ""}. ${BODIES[body].framework}. Prepared ${day(new Date())}.`, { size: 18 }),
    p(`Overall readiness: ${cv.overall}%`, { bold: true, size: 26 }),
    h(`By ${BODIES[body].groupLabel.toLowerCase()}`), table([BODIES[body].groupLabel, "Readiness", "Tasks"], cv.groups.map((g) => [`${g.key}. ${g.title}`, `${g.pct}%`, g.tasks])),
    h("Tasks"), table(["Task", "Status", "Assigned to", "Progress"], cv.tasks.map((v) => { const t = tasks.find((x) => x.id === v.id)!; return [`${v.code} ${v.title}`, STATUS[v.status] || v.status, name(t.assigneeId), `${v.progress}%`]; })),
    h("Gaps"), ...(cv.gaps.length ? cv.gaps.map((g) => new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: g.text, size: 18 })] })) : [p("None found.")]),
  ] }] });
  add(root, "00 Readiness summary.docx", await Packer.toBuffer(summary), "Readiness, tasks and gaps", "Visit Readiness");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(cycle.program)} — ${body} dossier</title><style>body{font-family:system-ui,sans-serif;max-width:960px;margin:24px auto;padding:0 16px;color:#241A1D}h1{color:#7E2435}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #E6DEDB;padding:6px 8px;text-align:left}th{background:#F4EFE1}.bad{color:#B3261E}</style></head><body>
<h1>${esc(cycle.program)} — ${esc(BODIES[body].name)}</h1><p>${esc(cycle.title)}${cycle.visitDate ? ` · visit on ${day(cycle.visitDate)}` : ""} · ${esc(BODIES[body].framework)} · prepared ${day(new Date())}</p>
<p><b>Overall readiness: ${cv.overall}%</b> · ${cv.tasks.filter((t) => t.status === "APPROVED").length} of ${cv.tasks.length} tasks approved · ${cv.gaps.length} gaps</p>
<table><tr><th>${BODIES[body].groupLabel}</th><th>Readiness</th></tr>${cv.groups.map((g) => `<tr><td>${g.key}. ${esc(g.title)}</td><td>${g.pct}%</td></tr>`).join("")}</table>
<h2>Contents</h2><table><tr><th>File</th><th>What it is</th><th>From</th></tr>${manifest.slice(1).map((m) => `<tr><td>${esc(m[0])}</td><td${/NOT INCLUDED/.test(m[1]) ? ' class="bad"' : ""}>${esc(m[1])}</td><td>${esc(m[2])}</td></tr>`).join("")}</table>
${cv.gaps.length ? `<h2>Gaps</h2><ul>${cv.gaps.map((g) => `<li class="bad">${esc(g.text)}</li>`).join("")}</ul>` : ""}</body></html>`;
  root.file("00 Index.html", html);
  root.file("manifest.csv", "﻿" + manifest.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n"));
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  return { buffer, filename: `${safe(`${cycle.program} ${body} dossier ${day(new Date())}`).replace(/\s+/g, "-")}.zip` };
}
