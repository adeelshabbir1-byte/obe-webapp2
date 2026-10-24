import { redirect } from "next/navigation";
import Sources from "../../../components/regulations/Sources";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { prisma } from "../../../lib/db";
import { ActionForm } from "../../../components/fyp/FypClient";
import { cdb, CONSORTIUM_HINT, memberOf, rulesOn, type Member } from "../../../lib/consortium";
import { agreementsFor, institutionOf, KIND_LABEL, editionOf } from "../../../lib/consortiumAgreements";
import { curriculaWhere } from "../../../lib/curriculumLibrary";

export const dynamic = "force-dynamic";
export const metadata = { title: "Consortium agreements" };

const ST: Record<string, [string, string]> = { PROPOSED: ["Waiting for partner", "#B26A00"], ACTIVE: ["Active", "#2E7D32"], ENDED: ["Ended", "#6B7177"] };

// Agreements with partner universities: joint degree programmes and credit recognition. The Chairman proposes and
// answers; Subject Experts and the Chairman approve the course equivalences inside each agreement.
export default async function Agreements() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  const me = await institutionOf(user);
  if (!me) return shell(<div className="card">Your account is not part of an institute.</div>);
  const m = await memberOf(me).catch(() => undefined);
  if (m === undefined) return shell(<div className="err">{CONSORTIUM_HINT}</div>);
  if (m?.status !== "ACTIVE") return shell(<div className="card">Your university is not a consortium member yet. {user.role === "CHAIRMAN" ? <Link href="/consortium">Apply to join →</Link> : "Ask your Chairman to apply."}</div>);
  const ags = await agreementsFor(me);
  const members = ((await cdb.consortiumMember.findMany({ where: { status: "ACTIVE" } })) as Member[]).filter((x) => x.chairmanId !== me);
  const ids = Array.from(new Set([...members.map((x) => x.chairmanId), ...ags.flatMap((a) => a.parties.map((p) => p.chairmanId))]));
  const heads = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, instituteName: true, name: true } });
  const uni = (id: string) => heads.find((h) => h.id === id)?.instituteName || heads.find((h) => h.id === id)?.name || "—";
  const curs = await prisma.masterCurriculum.findMany({ where: { ...(await curriculaWhere(me)), status: { in: ["PUBLISHED", "DRAFT"] } }, select: { id: true, title: true, version: true, authority: true }, orderBy: [{ title: "asc" }, { version: "desc" }] });
  const curOpts: [string, string][] = [["", "—"], ...curs.map((c) => [c.id, `${c.title} ${c.version} (${c.authority})${editionOf(c.version) ? "" : " — no edition year"}`] as [string, string])];
  const eqCounts = (await cdb.consortiumEquivalence.groupBy({ by: ["agreementId", "status"], where: { agreementId: { in: ags.map((a) => a.id) } }, _count: { _all: true } }).catch(() => [])) as { agreementId: string; status: string; _count: { _all: number } }[];
  const cnt = (id: string, s?: string) => eqCounts.filter((x) => x.agreementId === id && (!s || x.status === s)).reduce((t, x) => t + x._count._all, 0);
  const { rules } = await rulesOn();
  const invites = ags.filter((a) => a.status === "PROPOSED" && a.parties.some((p) => p.chairmanId === me && p.status === "INVITED"));
  const head = user.role === "CHAIRMAN";
  return shell(<>
    <p className="small-note" style={{ margin: 0 }}><Link href="/consortium">← Consortium</Link></p>
    <h1 style={{ fontSize: 22, margin: "4px 0" }}>Agreements and course equivalence</h1>
    <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>An agreement is on one curriculum edition — a 2025 curriculum is never paired with a 2023 one. Once the partner accepts, OBEHUB pairs the courses and compares their CLOs, contact hours and lab split. At each university a Subject Expert and the Chairman approve every pair. <b>Joint degree</b>: both universities approve, and the approved matrix is what you submit to HEC for the programme NOC (agreement of at least {String(rules.mouMinYears)} years). <b>Credit recognition</b>: your university decides which of the partner&apos;s courses count for your students. <Sources targets={["page:joint", "rule:mouMinYears", "rule:matrixRequired", "rule:jointNocRequired"]} /></p>

    {head && invites.map((a) => (
      <div key={a.id} className="card" style={{ borderLeft: "4px solid #B26A00" }}>
        <b>{uni(a.parties.find((p) => p.role === "LEAD")!.chairmanId)}</b> proposes: {KIND_LABEL[a.kind]} — {a.title} ({a.edition} edition){a.mouStart && a.mouEnd ? `, ${a.mouStart.toISOString().slice(0, 10)} to ${a.mouEnd.toISOString().slice(0, 10)}` : ""}
        {a.note && <div className="small-note">{a.note}</div>}
        <ActionForm showMessage url="/api/consortium/agreements" fixed={{ action: "respond", agreementId: a.id, accept: true }} submit="Accept" fields={[{ name: "curriculumId", label: `Our ${a.edition} curriculum for this`, type: "select", width: 380, options: curOpts }]} />
        <ActionForm showMessage url="/api/consortium/agreements" fixed={{ action: "respond", agreementId: a.id, accept: false }} submit="Decline" collapsed openLabel="Decline…" fields={[]} />
      </div>))}

    <div className="card">
      <h3 style={{ marginTop: 0 }}>Agreements</h3>
      {!ags.length ? <p className="small-note">None yet.</p> :
        <table style={{ fontSize: 13 }}><thead><tr><th>Agreement</th><th>With</th><th>Edition</th><th>Status</th><th>Course pairs</th></tr></thead><tbody>{ags.map((a) => { const [l, c] = ST[a.status] || [a.status, "#555"]; return (
          <tr key={a.id}><td><Link href={`/consortium/agreements/${a.id}`}><b>{a.title}</b></Link><div className="small-note">{KIND_LABEL[a.kind]}</div></td>
            <td>{a.parties.filter((p) => p.chairmanId !== me).map((p) => uni(p.chairmanId)).join(", ")}</td><td>{a.edition}</td><td style={{ color: c, fontWeight: 700 }}>{l}</td>
            <td>{cnt(a.id) ? <><b style={{ color: "#2E7D32" }}>{cnt(a.id, "APPROVED")}</b> approved of {cnt(a.id)}{cnt(a.id, "REJECTED") ? <span style={{ color: "#C62828" }}> · {cnt(a.id, "REJECTED")} not equivalent</span> : null}</> : "—"}</td></tr>); })}</tbody></table>}
    </div>

    {head && <div className="card">
      <h3 style={{ marginTop: 0 }}>Propose an agreement</h3>
      {!members.length ? <p className="small-note">No other member universities yet.</p> :
        <ActionForm showMessage url="/api/consortium/agreements" fixed={{ action: "propose" }} submit="Send proposal"
          fields={[{ name: "kind", label: "Kind", type: "select", width: 300, options: [["", "—"], ["JOINT_DEGREE", KIND_LABEL.JOINT_DEGREE], ["CREDIT_RECOGNITION", KIND_LABEL.CREDIT_RECOGNITION]] }, { name: "partnerId", label: "Partner university", type: "select", width: 260, options: [["", "—"], ...members.map((x) => [x.chairmanId, uni(x.chairmanId)] as [string, string])] },
            { name: "curriculumId", label: "Our curriculum (its edition is the agreement's)", type: "select", width: 380, options: curOpts }, { name: "title", label: "Title (e.g. Joint BS Computer Science)", width: 280 },
            { name: "mouStart", label: "Agreement from (joint degree)", type: "date" }, { name: "mouEnd", label: "to", type: "date" }, { name: "note", label: "Message to the partner", type: "textarea" }]} />}
    </div>}
  </>);
}
