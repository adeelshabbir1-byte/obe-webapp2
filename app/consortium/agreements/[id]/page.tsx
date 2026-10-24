import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import { navForRole } from "../../../../components/reportNav";
import { roleLabel } from "../../../../lib/reportScope";
import Shell from "../../../../components/Shell";
import { prisma } from "../../../../lib/db";
import { ActionForm, ActionButton } from "../../../../components/fyp/FypClient";
import { CONSORTIUM_HINT } from "../../../../lib/consortium";
import { matrix, institutionOf, KIND_LABEL, requiredSides, type Approval } from "../../../../lib/consortiumAgreements";
import { countsTowardDegree } from "../../../../lib/courseTypes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agreement" };

const ST: Record<string, [string, string]> = { PROPOSED: ["To approve", "#B26A00"], APPROVED: ["Equivalent", "#2E7D32"], REJECTED: ["Not equivalent", "#C62828"] };
const pctCol = (n: number) => (n >= 85 ? "#2E7D32" : n >= 70 ? "#B26A00" : "#C62828");

export default async function AgreementPage({ params, searchParams }: { params: { id: string }; searchParams: { show?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  const me = await institutionOf(user);
  const m = await matrix(params.id).catch(() => undefined);
  if (m === undefined) return shell(<div className="err">{CONSORTIUM_HINT}</div>);
  if (!m) notFound();
  const a = m.agreement;
  if (!a.parties.some((p) => p.chairmanId === me)) notFound();
  const lead = a.parties.find((p) => p.role === "LEAD")!, partner = a.parties.find((p) => p.role !== "LEAD")!;
  const cur = (id: string | null) => m.curricula.find((c) => c.id === id);
  const hats = [user.role, user.secondaryRole, user.tertiaryRole, ...((user as { extraRoles?: string[] }).extraRoles || [])];
  const canDecide = user.role === "CHAIRMAN" || hats.includes("SUBJECT_EXPERT");
  const slot = user.role === "CHAIRMAN" ? "chair" : "se";
  const show = searchParams.show || "todo";
  const rows = m.rows.filter((r) => show === "all" || (show === "todo" ? r.status === "PROPOSED" : r.status === show.toUpperCase()));
  const n = (s: string) => m.rows.filter((r) => r.status === s).length;
  const paired = new Set(m.rows.flatMap((r) => [r.courseA, r.courseB]));
  const [unA, unB] = await Promise.all([lead, partner].map((p) => p.curriculumId ? prisma.masterCourse.findMany({ where: { masterCurriculumId: p.curriculumId }, select: { id: true, code: true, title: true, category: true }, orderBy: { code: "asc" } }) : Promise.resolve([])));
  const openA = unA.filter((c) => !paired.has(c.id) && countsTowardDegree(c.category)), openB = unB.filter((c) => !paired.has(c.id));
  const apText = (x?: Approval) => (x ? `${x.ok ? "✓" : "✗"} ${x.name}, ${x.at.slice(0, 10)}${x.note ? ` — ${x.note}` : ""}` : "—");
  const chip = (t: string, col: string) => <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 999, border: `1px solid ${col}`, color: col, whiteSpace: "nowrap" }}>{t}</span>;
  const tab = (k: string, l: string) => <Link href={`?show=${k}`} className={show === k ? "btn btn-sm" : "btn btn-secondary btn-sm"}>{l}</Link>;
  return shell(<>
    <p className="small-note" style={{ margin: 0 }}><Link href="/consortium/agreements">← Agreements</Link></p>
    <h1 style={{ fontSize: 22, margin: "4px 0" }}>{a.title}</h1>
    <div className="card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, fontSize: 13 }}>
      <div><div className="small-note">{KIND_LABEL[a.kind]}</div><b>{a.status === "ACTIVE" ? "Active" : a.status === "PROPOSED" ? "Waiting for the partner" : "Ended"}</b> · {a.edition} edition{a.rulesVersion ? ` · rules v${a.rulesVersion}` : ""}{a.mouStart && a.mouEnd ? <div className="small-note">Agreement {a.mouStart.toISOString().slice(0, 10)} to {a.mouEnd.toISOString().slice(0, 10)}</div> : null}</div>
      {[lead, partner].map((p) => <div key={p.chairmanId}><div className="small-note">{p.role === "LEAD" ? "Proposed by" : "Partner"}</div><b>{m.uni(p.chairmanId)}</b><div className="small-note">{cur(p.curriculumId) ? `${cur(p.curriculumId)!.title} ${cur(p.curriculumId)!.version} (${cur(p.curriculumId)!.authority})` : "curriculum not chosen yet"}</div></div>)}
      <div><div className="small-note">Course pairs</div><b style={{ color: "#2E7D32" }}>{n("APPROVED")}</b> equivalent · <b style={{ color: "#B26A00" }}>{n("PROPOSED")}</b> to approve · <b style={{ color: "#C62828" }}>{n("REJECTED")}</b> not equivalent
        <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}><a className="btn btn-secondary btn-sm" href={`/api/consortium/agreements/${a.id}/matrix`}>Download matrix (Excel)</a>
          {a.status === "ACTIVE" && <><ActionButton showMessage url="/api/consortium/agreements" body={{ action: "autoPair", agreementId: a.id }} label="Find more pairs" className="btn btn-secondary btn-sm" /><ActionButton showMessage url="/api/consortium/agreements" body={{ action: "refreshAll", agreementId: a.id }} label="Recompare" className="btn btn-secondary btn-sm" /></>}</div></div>
    </div>
    {a.kind === "JOINT_DEGREE" && <p className="small-note">For the HEC NOC: every course of the joint programme needs an equivalent pair approved by both universities. The Excel matrix lists CLO coverage, contact hours, lab split, Bloom levels and each approval.</p>}

    {a.status === "ACTIVE" && <>
      <div style={{ display: "flex", gap: 6, margin: "8px 0" }}>{tab("todo", `To approve (${n("PROPOSED")})`)}{tab("approved", `Equivalent (${n("APPROVED")})`)}{tab("rejected", `Not equivalent (${n("REJECTED")})`)}{tab("all", `All (${m.rows.length})`)}</div>
      <div className="card" style={{ padding: 0 }}>
        {!rows.length ? <p className="small-note" style={{ padding: 14 }}>Nothing here.</p> : rows.map((r) => {
          const e = r.evidence; const [l, c] = ST[r.status] || [r.status, "#555"];
          const mineIsA = me === r.chairmanA; const need = requiredSides(a, r);
          const mySide = r.approvals[me!] || {}; const iDecide = canDecide && need.includes(me!);
          const theirMissing = mineIsA ? e.missingInA : e.missingInB;
          return (
            <details key={r.id} style={{ borderBottom: "1px solid var(--line, #E1E5EA)", padding: "10px 14px" }}>
              <summary style={{ cursor: "pointer", display: "grid", gridTemplateColumns: "minmax(200px,1fr) minmax(200px,1fr) auto", gap: 10, alignItems: "center" }}>
                <span><b>{r.A.code}</b> {r.A.title} <span className="small-note">{r.A.creditHours}{r.A.lab ? ` (${r.A.creditHours - r.A.lab}+${r.A.lab})` : ""} CH</span></span>
                <span>↔ <b>{r.B.code}</b> {r.B.title} <span className="small-note">{r.B.creditHours}{r.B.lab ? ` (${r.B.creditHours - r.B.lab}+${r.B.lab})` : ""} CH</span></span>
                <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {chip(`CLOs ${e.coverAB}% / ${e.coverBA}%`, pctCol(Math.min(e.coverAB, e.coverBA)))}{e.flags.length ? chip(`${e.flags.length} difference${e.flags.length > 1 ? "s" : ""}`, "#B26A00") : chip("matches", "#2E7D32")}<b style={{ color: c, fontSize: 12 }}>{l}</b></span>
              </summary>
              <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                {e.flags.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "#B26A00" }}>{e.flags.map((f) => <li key={f}>{f}</li>)}</ul>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12.5 }}>
                  {([[r.A, e.missingInB, m.uni(r.chairmanA)], [r.B, e.missingInA, m.uni(r.chairmanB)]] as const).map(([x, miss, u]) => (
                    <div key={x.id}><b>{u}</b> — {x.clos.length} CLO(s)<ol style={{ margin: "4px 0", paddingLeft: 18 }}>{x.clos.map((cl, i) => <li key={i} style={{ color: miss.includes(cl.statement) ? "#C62828" : undefined }}><span className="small-note">{cl.bloomLevel}</span> {cl.statement}{miss.includes(cl.statement) ? " — not covered by the other course" : ""}</li>)}</ol></div>))}
                </div>
                <div style={{ fontSize: 12.5, display: "grid", gap: 2 }}>
                  {need.map((s) => <div key={s}><b>{m.uni(s)}</b>: Subject Expert {apText(r.approvals[s]?.se)} · Chairman {apText(r.approvals[s]?.chair)}</div>)}
                  {a.kind === "CREDIT_RECOGNITION" && <div className="small-note">Credit recognition — only {m.uni(r.chairmanA)} decides.</div>}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {iDecide && !mySide[slot as "se" | "chair"] && <>
                    <ActionButton showMessage url="/api/consortium/agreements" body={{ action: "decide", id: r.id, ok: true }} label={`Approve as ${slot === "chair" ? "Chairman" : "Subject Expert"}`} />
                    <ActionButton showMessage url="/api/consortium/agreements" body={{ action: "decide", id: r.id, ok: false }} label="Not equivalent" className="btn btn-secondary btn-sm" askNote="Why are these courses not equivalent?" noteRequired /></>}
                  {iDecide && mySide[slot as "se" | "chair"] && <span className="small-note">You have decided on this pair.</span>}
                  {theirMissing.length > 0 && (user.role === "CHAIRMAN" || hats.includes("SUBJECT_EXPERT")) && <ActionButton showMessage url="/api/consortium/agreements" body={{ action: "adopt", id: r.id }} label={`Equalise: add their ${theirMissing.length} CLO(s) to our course`} className="btn btn-secondary btn-sm" confirmText="Add the partner's CLOs that your course does not cover to your own course? Approvals of this pair start again." />}
                </div>
              </div>
            </details>);
        })}
      </div>
      {(openA.length > 0 && openB.length > 0) && <div className="card"><h3 style={{ marginTop: 0 }}>Pair courses by hand</h3><p className="small-note" style={{ marginTop: 0 }}>{openA.length} degree course(s) of {m.uni(lead.chairmanId)} have no pair yet.</p>
        <ActionForm showMessage url="/api/consortium/agreements" fixed={{ action: "pair", agreementId: a.id }} submit="Add pair" fields={[{ name: "courseA", label: m.uni(lead.chairmanId), type: "select", width: 340, options: [["", "—"], ...openA.map((c) => [c.id, `${c.code} ${c.title}`] as [string, string])] }, { name: "courseB", label: m.uni(partner.chairmanId), type: "select", width: 340, options: [["", "—"], ...openB.map((c) => [c.id, `${c.code} ${c.title}`] as [string, string])] }]} /></div>}
    </>}
  </>);
}
