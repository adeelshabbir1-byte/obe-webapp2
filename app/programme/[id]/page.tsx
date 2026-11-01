import { notFound } from "next/navigation";
import { prisma } from "../../../lib/db";
import { compliance, dataOf, isDdjd, KINDS, TYPE_RULE, type Prog } from "../../../lib/collab";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;

// The public programme page that must be published before enrolment (HEC DDJD Policy 2026, 2.iv): the nature of the
// arrangement, partners, degree(s), credit distribution, mobility, language and the full fee structure. No login.
export default async function ProgrammePage({ params }: { params: { id: string } }) {
  const p = (await db.collabProgramme?.findUnique({ where: { id: params.id } }).catch(() => null)) as Prog | null;
  if (!p || !isDdjd(p.kind)) notFound();
  const d = dataOf(p), c = compliance(p);
  const inst = await prisma.user.findUnique({ where: { id: p.chairmanId }, select: { instituteName: true, instituteLogo: true } });
  const ch = (d.cem || []).reduce((a, r) => a + (r.ch || 0), 0);
  const row = (k: string, v?: string | number | null) => (v ? <tr><th style={{ textAlign: "left", padding: "6px 12px 6px 0", verticalAlign: "top", width: 220 }}>{k}</th><td style={{ padding: 6, whiteSpace: "pre-wrap" }}>{v}</td></tr> : null);
  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
      {inst?.instituteLogo && <img src={inst.instituteLogo} alt="" style={{ height: 56 }} />}
      <h1 style={{ marginBottom: 4 }}>{p.title}</h1>
      <p style={{ color: "#555", marginTop: 0 }}>{KINDS[p.kind]} · {inst?.instituteName}{(d.partners || []).length ? ` with ${(d.partners || []).map((x) => x.name + (x.country ? ` (${x.country})` : "")).join(", ")}` : ""}</p>
      <p>{TYPE_RULE[p.kind]}</p>
      {!d.published && <p style={{ padding: 10, background: "#fdecea", borderRadius: 8 }}>Draft — not published yet.</p>}
      <p style={{ padding: 10, borderRadius: 8, background: c.enrolmentOpen ? "#eef9ee" : "#fff4e5" }}>{c.enrolmentOpen ? `Admissions open${d.seats ? ` — ${d.seats} seats` : ""}. HEC NOC ${d.nocNo}${d.nocUntil ? `, valid until ${d.nocUntil}` : ""}.` : "Admissions are not open yet."}</p>
      <table style={{ borderCollapse: "collapse", width: "100%" }}><tbody>
        {row("Degree(s) awarded", p.kind === "JOINT" ? "One degree, jointly awarded and signed by all partners" : "Two degrees, one by each awarding partner")}
        {row("Academic structure", d.moc?.b)}
        {row("Learning outcomes", d.moc?.c)}
        {row("Language(s) of instruction", d.moc?.d)}
        {row("Admission requirements", d.moc?.e)}
        {row("Assessment and grading", d.moc?.f)}
        {row("Places of study", d.moc?.g)}
        {row("Student mobility", d.moc?.h)}
        {row("Residency requirements", d.moc?.i)}
        {row("Credit hours (mapped)", ch || null)}
        {row("Full fee structure", d.fees)}
        {row("Cap on yearly fee increase", d.feeCapPct != null ? `${d.feeCapPct}% (no unilateral increase for the enrolled cohort)` : null)}
        {row("Refunds and exit pathways", d.moc?.k)}
        {row("If the programme ends", d.moc?.o ? `Teach-out plan: ${d.moc.o}` : null)}
        {row("Complaints", "First to the institution; then to the Higher Education Commission (HEC DDJD Policy 2026, section 9).")}
      </tbody></table>
      {(d.cem || []).length > 0 && <><h2>Courses and where they are taught</h2><table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}><thead><tr><th style={{ textAlign: "left" }}>Course</th><th>CH</th><th style={{ textAlign: "left" }}>Equivalent at partner</th></tr></thead><tbody>{(d.cem || []).map((r, i) => <tr key={i} style={{ borderTop: "1px solid #eee" }}><td>{r.ours} {r.oursTitle}</td><td style={{ textAlign: "center" }}>{r.ch}</td><td>{r.theirs ? `${r.theirs} ${r.theirsTitle}` : "—"}</td></tr>)}</tbody></table></>}
      <p style={{ color: "#777", fontSize: 12, marginTop: 24 }}>Published under the HEC Policy on Dual, Double and Joint Degree Programmes 2026 (2.iv). Last updated {new Date(p.updatedAt).toLocaleDateString("en-GB")}.</p>
    </main>
  );
}
