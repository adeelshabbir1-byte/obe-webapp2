import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import { navForRole } from "../../../../components/reportNav";
import { roleLabel } from "../../../../lib/reportScope";
import { govScope, inScope } from "../../../../lib/accreditation/governance";
import { BODIES, type BodyKey } from "../../../../lib/accreditation/bodies";
import { sarData, sarGaps, chapters } from "../../../../lib/sarBuilder";
import { ActionForm } from "../../../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Self-Assessment Report" };

// The one-click SAR: what is still missing, the narrative for each chapter, and the Word download.
export default async function SarPage({ params }: { params: { cycleId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const s = await govScope(user);
  const c = await prisma.accreditationCycle.findUnique({ where: { id: params.cycleId } }).catch(() => null);
  if (!s || !c || !inScope(s, c)) notFound();
  const edit = s.canManage || c.leadId === user.id;
  const d = await sarData(c.id);
  if (!d) notFound();
  const gaps = sarGaps(d);
  const chs = chapters(d.body);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <p><Link href={`/accreditation/readiness/${c.id}`}>← {c.title}</Link></p>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Self-Assessment Report</h1>
      <p className="small-note">{BODIES[c.body as BodyKey]?.name} · {c.program}. The SAR is generated from live data every time you download it: GA attainment (direct and indirect), curriculum, knowledge profile and complex problems, CLO results, evaluations, students and placements, faculty and CVs, labs, CQI, previous-visit compliance and the implementation plan. Write the narrative for each chapter below; it is kept across regenerations. Then download the Word file, edit it if you like, and save it as PDF.</p>
      <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <a className="btn" href={`/api/accreditation/sar/${c.id}`}>Download SAR (Word)</a>
        <a className="btn btn-secondary" href={`/api/accreditation/cycles/${c.id}/dossier`}>Download evidence dossier (ZIP)</a>
        <a className="btn btn-secondary" href={`/accreditation/visit/${c.id}`}>Visit plan, findings, implementation plan</a>
        <span className="small-note">{gaps.length ? `${gaps.length} items still missing` : "Complete"}</span>
      </div>
      {gaps.filter((g) => !g.text.startsWith("Narrative")).length > 0 && <div className="card" style={{ borderLeft: "4px solid #B3261E" }}><b>Data still missing</b><ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13 }}>{gaps.filter((g) => !g.text.startsWith("Narrative")).map((g, i) => <li key={i}><b>{chs.find((x) => x.key === g.ch)?.title}:</b> {g.text}</li>)}</ul></div>}
      {chs.map((ch, i) => { const t = d.narr.get(ch.key) || ""; return (
        <div key={ch.key} className="card">
          <b>{i + 1}. {ch.title}</b> {t.trim() ? <span style={{ color: "#1F5E36", fontSize: 12 }}>✓ written</span> : <span style={{ color: "#B3261E", fontSize: 12 }}>not written</span>}
          <div className="small-note">{ch.prompt}</div>
          {t && <div style={{ fontSize: 13, whiteSpace: "pre-wrap", margin: "4px 0" }}>{t.length > 600 ? `${t.slice(0, 600)}…` : t}</div>}
          {edit && <ActionForm url={`/api/accreditation/sar/${c.id}`} fixed={{ sectionKey: ch.key }} submit="Save" collapsed openLabel={t ? "Edit" : "Write"} initial={{ text: t }} fields={[{ name: "text", label: ch.title, type: "textarea" }]} />}
        </div>); })}
    </Shell>
  );
}
