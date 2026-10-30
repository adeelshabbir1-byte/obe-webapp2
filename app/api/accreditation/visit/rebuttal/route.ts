import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType } from "docx";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { govScope, inScope } from "../../../../../lib/accreditation/governance";
import { BODIES, type BodyKey } from "../../../../../lib/accreditation/bodies";
import { vdb, data, FINDING_TYPES, POSITIONS, OUTCOMES, labelOf, parseFinding, type VItem } from "../../../../../lib/accreditation/visit";
import { withErrors } from "../../../../../lib/apiHandler";

/** GET ?cycleId=&kind=rebuttal|compliance — the formal rebuttal letter, or the compliance report on accepted findings, as Word. */
async function GET_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const sc = await govScope(user);
  const c = await prisma.accreditationCycle.findUnique({ where: { id: q.get("cycleId") || "" } });
  if (!sc || !c || !inScope(sc, c)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const kind = q.get("kind") === "compliance" ? "compliance" : "rebuttal";
  const items = (await vdb.visitItem.findMany({ where: { cycleId: c.id, kind: { in: ["FINDING", "REPORT"] } }, orderBy: { sort: "asc" } })) as VItem[];
  const report = data(items.find((i) => i.kind === "REPORT") || { dataJson: "{}" });
  const findings = items.filter((i) => i.kind === "FINDING").map((i, n) => ({ n: n + 1, d: data(i), f: parseFinding(i), status: i.status, due: i.dueDate ? new Date(i.dueDate).toISOString().slice(0, 10) : "" }));
  const council = BODIES[c.body as BodyKey]?.name || c.body;
  const inst = await prisma.user.findUnique({ where: { id: c.chairmanId }, select: { name: true, instituteName: true } as never }) as unknown as { name: string; instituteName?: string | null } | null;
  const P = (t: string, o: { bold?: boolean; size?: number; italics?: boolean } = {}) => new Paragraph({ children: [new TextRun({ text: t, bold: o.bold, italics: o.italics, size: o.size || 22 })], spacing: { after: 120 } });
  const cell = (t: string, bold = false) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t, bold, size: 20 })] })], width: { size: 3000, type: WidthType.DXA } });
  const kids: (Paragraph | Table)[] = [];
  const today = new Date().toISOString().slice(0, 10);
  kids.push(P(inst?.instituteName || inst?.name || "", { bold: true, size: 26 }));
  kids.push(P(`Date: ${today}`));
  kids.push(P(`To: ${council}`));
  kids.push(new Paragraph({ text: kind === "rebuttal" ? `Response to the visit report — ${c.program}` : `Compliance report on the visit findings — ${c.program}`, heading: HeadingLevel.HEADING_1 }));
  kids.push(P(`Visit: ${c.title}${c.visitDate ? `, held ${c.visitDate.toISOString().slice(0, 10)}` : ""}.${report.reportReceived ? ` Report received ${report.reportReceived}.` : ""}${report.reference ? ` Reference: ${report.reference}.` : ""}`));
  if (kind === "rebuttal") {
    const reb = findings.filter((x) => x.f.position === "REBUT" || x.f.position === "PARTIAL");
    const acc = findings.filter((x) => x.f.needsAction && x.f.position !== "REBUT" && x.f.position !== "PARTIAL");
    kids.push(P(`We thank the panel for its visit and report. We respectfully submit our response: ${reb.length} finding(s) we ask the council to reconsider, with evidence, and ${acc.length} finding(s) we accept, with the corrective action planned.`));
    if (reb.length) kids.push(new Paragraph({ text: "Findings we ask the council to reconsider", heading: HeadingLevel.HEADING_2 }));
    for (const x of reb) {
      kids.push(new Paragraph({ text: `${x.n}. ${labelOf(FINDING_TYPES, x.f.type)}${x.d.criterion ? ` — ${x.d.criterion}` : ""} (${labelOf(POSITIONS, x.f.position)})`, heading: HeadingLevel.HEADING_3 }));
      kids.push(P("Panel's observation:", { bold: true })); kids.push(P(x.d.observation || "—", { italics: true }));
      kids.push(P("Our response:", { bold: true })); kids.push(P(x.f.rebuttal || x.d.response || "—"));
      if (x.f.evidence.length) { kids.push(P("Evidence attached:", { bold: true })); x.f.evidence.forEach((e, i) => kids.push(P(`Annex ${x.n}.${i + 1}: ${e.name} — ${e.url.startsWith("/") ? "uploaded to OBEHUB" : e.url}`))); }
      if (x.f.position === "PARTIAL" && x.d.action) { kids.push(P("What we will still do:", { bold: true })); kids.push(P(x.d.action)); }
    }
    if (acc.length) {
      kids.push(new Paragraph({ text: "Findings we accept", heading: HeadingLevel.HEADING_2 }));
      kids.push(new Table({ rows: [new TableRow({ children: [cell("No.", true), cell("Finding", true), cell("Corrective action", true), cell("Due", true)] }), ...acc.map((x) => new TableRow({ children: [cell(String(x.n)), cell(`${labelOf(FINDING_TYPES, x.f.type)}: ${x.d.observation || ""}`), cell(x.d.action || x.d.response || ""), cell(x.due)] }))] }));
    }
  } else {
    const list = findings.filter((x) => x.f.needsAction);
    kids.push(P(`Progress on the ${list.length} finding(s) that needed action: ${list.filter((x) => x.f.outcome === "STRENGTH").length} now a strength, ${list.filter((x) => x.f.outcome === "RESOLVED").length} resolved, ${list.filter((x) => x.f.outcome === "IMPROVING").length} improving, ${list.filter((x) => x.f.outcome === "OPEN").length} not started.`));
    for (const x of list) {
      kids.push(new Paragraph({ text: `${x.n}. ${labelOf(FINDING_TYPES, x.f.type)}${x.d.criterion ? ` — ${x.d.criterion}` : ""}: ${labelOf(OUTCOMES, x.f.outcome)} (${x.f.pct}%)`, heading: HeadingLevel.HEADING_3 }));
      kids.push(P(`Finding: ${x.d.observation || "—"}`, { italics: true }));
      if (x.d.action) kids.push(P(`Action: ${x.d.action}`));
      if (x.f.metricBefore || x.f.metricAfter) kids.push(P(`Measure: ${x.f.metricBefore || "—"} → ${x.f.metricAfter || "—"}`));
      for (const p of x.f.progress) kids.push(P(`${p.on} (${p.pct}%) — ${p.note} — ${p.by}`, { size: 20 }));
      if (x.f.outcomeNote) kids.push(P(`Evidence of the result: ${x.f.outcomeNote}`));
      x.f.evidence.forEach((e, i) => kids.push(P(`Annex ${x.n}.${i + 1}: ${e.name}`, { size: 20 })));
    }
  }
  kids.push(P("")); kids.push(P("Signed: ______________________   Institute Head / Head of Department"));
  const buf = await Packer.toBuffer(new Document({ sections: [{ children: kids }] }));
  const fname = `${kind === "rebuttal" ? "Rebuttal" : "Compliance report"} - ${c.program}.docx`.replace(/[^\w .-]+/g, "");
  return new NextResponse(buf as unknown as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${fname}"` } });
}
export const GET = withErrors(GET_handler);
