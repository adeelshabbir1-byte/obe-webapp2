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
import ChapterTabs from "../../../../components/sar/ChapterTabs";
import { chapterStatuses } from "../../../../lib/sarStatus";

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
  const statuses = await chapterStatuses(c.id, d.body, chs, d.narr, gaps);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <p><Link href={`/accreditation/readiness/${c.id}`}>← {c.title}</Link></p>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Self-Assessment Report</h1>
      <p className="small-note">{BODIES[c.body as BodyKey]?.name} · {c.program}. The SAR is generated from live data every time you download it: GA attainment (direct and indirect), curriculum, knowledge profile and complex problems, CLO results, evaluations, students and placements, faculty and CVs, labs, CQI, previous-visit compliance and the implementation plan. Each chapter is a tab coloured by where it stands — grey not started, amber in progress, blue written with no data missing, green ready, red changed since approval. Write the narrative for each chapter; it is kept across regenerations. Then download the Word file, edit it if you like, and save it as PDF.</p>
      <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <a className="btn" href={`/api/accreditation/sar/${c.id}`}>Download SAR (Word)</a>
        <a className="btn btn-secondary" href={`/api/accreditation/cycles/${c.id}/dossier`}>Download evidence dossier (ZIP)</a>
        <a className="btn btn-secondary" href={`/accreditation/visit/${c.id}`}>Visit plan, findings, implementation plan</a>
        <span className="small-note">{gaps.length ? `${gaps.length} items still missing` : "Complete"}</span>
      </div>
      <ChapterTabs cycleId={c.id} userId={user.id} canEdit={edit} statuses={statuses}
        chapters={chs.map((ch) => ({ key: ch.key, title: ch.title, prompt: ch.prompt, text: d.narr.get(ch.key) || "", gaps: gaps.filter((g) => g.ch === ch.key && !g.text.startsWith("Narrative")).map((g) => g.text) }))} />
    </Shell>
  );
}
