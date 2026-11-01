import { NextRequest, NextResponse } from "next/server";
import { Packer } from "docx";
import { prisma } from "../../../../lib/db";
import { getAuthenticatedUser } from "../../../../lib/session";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { canWork, compliance, dataOf, isDdjd, KINDS, MOC_ITEMS, TYPE_RULE, type Prog } from "../../../../lib/collab";
import { toDocx, toPdf, type Block } from "../../../../lib/hecDoc";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;

// GET ?id=&doc=noc|audit|supplement|moc&format=pdf|docx — the HEC files for a joint degree / ODL programme, in PDF or
// Word: the NOC file (MoC items, CEM, conditions; ODL readiness), the audit pack, the Diploma Supplement (Annexure-IV)
// and the Memorandum of Commitment drafted from the wizard (Annexure-I vii a–r). Every rule carries its clause.
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cid = await chairmanIdFor(user as never);
  const p = (await db.collabProgramme?.findUnique({ where: { id: String(req.nextUrl.searchParams.get("id") || "") } })) as Prog | null;
  if (!p || p.chairmanId !== cid || !(await canWork(user as never, p))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const doc = req.nextUrl.searchParams.get("doc") || "noc";
  const word = req.nextUrl.searchParams.get("format") === "docx";
  const d = dataOf(p), c = compliance(p);
  const inst = await prisma.user.findUnique({ where: { id: cid }, select: { instituteName: true, instituteLogo: true } });
  const partners = (d.partners || []).map((x) => `${x.name}${x.country ? ` (${x.country})` : ""}`).join("; ");
  const date = new Date().toLocaleDateString("en-GB");
  const B: Block[] = [];
  if (doc === "supplement") {
    B.push({ t: "title", s: "Diploma Supplement", sub: `${p.title} · ${KINDS[p.kind]}` }, { t: "p", s: "Annexure-IV, HEC Policy on Dual, Double and Joint Degree Programmes 2026. Issued with the degree; it does not replace the degree certificate.", small: true });
    B.push({ t: "kv", rows: [["Holder", "(name, CNIC / passport, date of birth)"], ["Qualification", p.title], ["Type", `${KINDS[p.kind]} — ${TYPE_RULE[p.kind] || ""}`], ["Awarding institutions", `${inst?.instituteName || ""}${partners ? `; ${partners}` : ""}`], ["Language(s) of instruction", d.moc?.d || ""], ["Places of study", d.moc?.g || ""]] });
    if (d.cem?.length) B.push({ t: "table", cols: [["Course", 200], ["Credit hours", 70], ["Taught at", 200]], rows: d.cem.map((r) => [`${r.ours} ${r.oursTitle}`, r.ch, r.theirs ? "partner / either" : inst?.instituteName || ""]) });
  } else if (doc === "moc") {
    B.push({ t: "title", s: "Memorandum of Commitment (draft)", sub: `${p.title} · ${KINDS[p.kind]} · ${date}` }, { t: "p", s: "Drafted from the programme record under Annexure-I of the HEC Policy on Dual, Double and Joint Degree Programmes 2026. To be reviewed by each partner and signed by the heads of the institutions.", small: true });
    B.push({ t: "kv", rows: [["Parties", `${inst?.instituteName || ""}${partners ? `; ${partners}` : ""}`], ["Type of arrangement", `${KINDS[p.kind]} — ${TYPE_RULE[p.kind] || ""}`], ["Validity", `${d.mocFrom || "?"} to ${d.mocUntil || "?"} (at least 5 years — DDJD 2.iii)`], ["Focal persons (Annexure-I vi)", d.focal || "—"]] });
    for (const [k, label] of MOC_ITEMS) { B.push({ t: "h", s: `(${k}) ${label}` }, { t: "p", s: String(d.moc?.[k] || "[to be completed]") }); }
    if (d.fees) B.push({ t: "h", s: "Fee structure (DDJD 5.i–ii)" }, { t: "p", s: `${d.fees}${d.feeCapPct != null ? `\nCap on yearly increase: ${d.feeCapPct}%; no unilateral increase for the enrolled cohort.` : ""}` });
  } else {
    B.push({ t: "title", s: doc === "audit" ? "HEC audit pack" : "HEC NOC file", sub: `${p.title} · ${KINDS[p.kind]} · ${date}` });
    if (isDdjd(p.kind)) {
      B.push({ t: "kv", rows: [["Type", TYPE_RULE[p.kind] || ""], ["Partners", partners || "—"], ["MoC validity", `${d.mocFrom || "?"} – ${d.mocUntil || "?"}`], ["Joint moderation", d.moderationPct != null ? `${d.moderationPct}% of exams co-evaluated` : "—"]] });
      B.push({ t: "h", s: "Memorandum of Commitment — Annexure-I vii (a–r)" }, { t: "table", cols: [["Item", 260], ["Covered", 50], ["What the MoC says", 300]], rows: c.moc.map((m) => [m.label, m.done ? "yes" : "no", d.moc?.[m.key] || ""]) });
      if (d.cem?.length) B.push({ t: "h", s: "Credit Equivalency Matrix (Annexure-II)" }, { t: "table", cols: [["Our course", 150], ["Partner course", 150], ["CH", 30], ["Contact h", 50], ["Assessment", 90], ["Equivalent", 50]], rows: d.cem.map((r) => [`${r.ours} ${r.oursTitle}`, `${r.theirs} ${r.theirsTitle}`, r.ch, r.contactHours, r.assessment, r.ok ? "yes" : "no"]) });
    }
    B.push({ t: "h", s: "Conditions" }, { t: "table", cols: [["Condition (with clause)", 360], ["Met", 40], ["Evidence", 200]], rows: c.items.map((i) => [i.label, i.done ? "yes" : "no", i.note]) });
    if ((d.courses || []).length) B.push({ t: "h", s: "Courses and delivery mode (ODL 8)" }, { t: "table", cols: [["Course", 90], ["Mode", 60], ["CH", 30], ["F2F / live %", 70], ["Recorded min", 70], ["Lab h", 50], ["Teacher", 120]], rows: (d.courses || []).map((x) => [x.code, x.mode, x.ch, x.f2fPct ?? "", x.recordedMin ?? "", x.labH ?? "", x.teacher || ""]) });
    if (c.kpis.length && doc === "audit") B.push({ t: "h", s: "KPIs (Annexure-III)" }, { t: "table", cols: [["Indicator", 200], ["Benchmark", 80], ["Value", 80]], rows: c.kpis.map((k) => [k.label, `${k.key === "enrolment" ? "≥" : ">"} ${k.bench}%`, k.value ?? "—"]) });
    if (c.problems.length) { B.push({ t: "h", s: "Still to fix" }); for (const x of c.problems) B.push({ t: "p", s: `• ${x}` }); }
  }
  const name = `${doc}-${p.title.replace(/[^A-Za-z0-9]+/g, "-")}`;
  if (word) return new NextResponse(new Uint8Array(await Packer.toBuffer(toDocx(B, inst?.instituteLogo))), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${name}.docx"` } });
  return new NextResponse(new Uint8Array(await toPdf(B, `${inst?.instituteName || ""} — ${p.title}`, inst?.instituteLogo)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"` } });
}
export const GET = withErrors(GET_handler);
