import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { getAuthenticatedUser } from "../../../../lib/session";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { compliance, dataOf, isDdjd, KINDS, TYPE_RULE, type Prog } from "../../../../lib/collab";
import { PdfDoc } from "../../../../lib/pdfDoc";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;

// GET ?id=&doc=noc|supplement|audit — the HEC NOC file (DDJD: MoC items, CEM, conditions; ODL: the readiness file),
// the Diploma Supplement template (Annexure-IV) or the ODL audit pack; every rule with its clause.
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cid = await chairmanIdFor(user as never);
  const p = (await db.collabProgramme?.findUnique({ where: { id: String(req.nextUrl.searchParams.get("id") || "") } })) as Prog | null;
  if (!p || p.chairmanId !== cid) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const doc = req.nextUrl.searchParams.get("doc") || "noc";
  const d = dataOf(p), c = compliance(p);
  const inst = await prisma.user.findUnique({ where: { id: cid }, select: { instituteName: true, instituteLogo: true } });
  const pdf = await PdfDoc.create(`${inst?.instituteName || ""} — ${p.title}`);
  await pdf.image(inst?.instituteLogo, 60);
  const partners = (d.partners || []).map((x) => `${x.name}${x.country ? ` (${x.country})` : ""}`).join("; ");
  if (doc === "supplement") {
    pdf.title("Diploma Supplement", `${p.title} · ${KINDS[p.kind]}`);
    pdf.note("Annexure-IV, HEC Policy on Dual, Double and Joint Degree Programmes 2026. Issued with the degree; it does not replace the degree certificate.");
    pdf.kv([["Holder", "(name, CNIC / passport, date of birth)"], ["Qualification", p.title], ["Type", `${KINDS[p.kind]} — ${TYPE_RULE[p.kind] || ""}`], ["Awarding institutions", `${inst?.instituteName || ""}${partners ? `; ${partners}` : ""}`], ["Language(s) of instruction", d.moc?.d || ""], ["Places of study", d.moc?.g || ""]]);
    if (d.cem?.length) pdf.table([["Course", 200], ["Credit hours", 70], ["Taught at", 200]], d.cem.map((r) => [`${r.ours} ${r.oursTitle}`, r.ch, r.theirs ? "partner / either" : inst?.instituteName || ""]), { size: 8.5 });
  } else {
    pdf.title(doc === "audit" ? "HEC audit pack" : "HEC NOC file", `${p.title} · ${KINDS[p.kind]} · ${new Date().toLocaleDateString("en-GB")}`);
    if (isDdjd(p.kind)) {
      pdf.kv([["Type", TYPE_RULE[p.kind] || ""], ["Partners", partners || "—"], ["MoC validity", `${d.mocFrom || "?"} – ${d.mocUntil || "?"}`], ["Joint moderation", d.moderationPct != null ? `${d.moderationPct}% of exams co-evaluated` : "—"]]);
      pdf.text("Memorandum of Commitment — Annexure-I vii (a–r)", { bold: true, gap: 8 });
      for (const [i, m] of c.moc.entries()) pdf.text(`${m.done ? "✓" : "✗"} ${m.label}${d.moc?.[String.fromCharCode(97 + i)] ? ` — ${d.moc[String.fromCharCode(97 + i)]}` : ""}`.replace("✓", "[x]").replace("✗", "[ ]"), { size: 8.5 });
      if (d.cem?.length) { pdf.text("Credit Equivalency Matrix (Annexure-II)", { bold: true, gap: 8 }); pdf.table([["Our course", 150], ["Partner course", 150], ["CH", 30], ["Contact h", 50], ["Assessment", 90], ["Equivalent", 50]], d.cem.map((r) => [`${r.ours} ${r.oursTitle}`, `${r.theirs} ${r.theirsTitle}`, r.ch, r.contactHours, r.assessment, r.ok ? "yes" : "no"]), { size: 7.5 }); }
    }
    pdf.text("Conditions", { bold: true, gap: 8 });
    for (const i of c.items) pdf.text(`${i.done ? "[x]" : "[ ]"} ${i.label}${i.note ? ` — ${i.note}` : ""}`, { size: 8.5 });
    if ((d.courses || []).length) { pdf.text("Courses and delivery mode (ODL 8)", { bold: true, gap: 8 }); pdf.table([["Course", 90], ["Mode", 60], ["CH", 30], ["F2F / sync %", 70], ["Recorded min", 70], ["Lab h", 50], ["Teacher", 120]], (d.courses || []).map((x) => [x.code, x.mode, x.ch, x.f2fPct ?? "", x.recordedMin ?? "", x.labH ?? "", x.teacher || ""]), { size: 8 }); }
    if (c.kpis.length && doc === "audit") { pdf.text("KPIs (Annexure-III)", { bold: true, gap: 8 }); pdf.table([["Indicator", 200], ["Benchmark", 80], ["Value", 80]], c.kpis.map((k) => [k.label, `${k.key === "enrolment" ? "≥" : ">"} ${k.bench}%`, k.value ?? "—"]), { size: 8.5 }); }
    if (c.problems.length) { pdf.text("Still to fix", { bold: true, gap: 8 }); for (const x of c.problems) pdf.text(`• ${x}`, { size: 8.5 }); }
  }
  return new NextResponse(Buffer.from(await pdf.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${doc}-${p.title.replace(/[^A-Za-z0-9]+/g, "-")}.pdf"` } });
}
export const GET = withErrors(GET_handler);
