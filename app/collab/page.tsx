import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "../../lib/db";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { chairmanIdFor, roleLabel } from "../../lib/reportScope";
import { compliance, dataOf, isDdjd, KINDS, listFor, TYPE_RULE } from "../../lib/collab";
import { Basics, Cem, CemOk, Check, MocField, NewProg } from "./CollabForms";

export const dynamic = "force-dynamic";

// Dual / Double / Joint degrees and ODL (Adeel prompt §34) — one place for the HEC conditions, MoC, CEM, NOC, KPIs.
export default async function CollabPage({ searchParams }: { searchParams: { id?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const cid = await chairmanIdFor(user as never);
  const list = await listFor(cid);
  const p = searchParams.id ? list.find((x) => x.id === searchParams.id) : null;
  const d = p ? dataOf(p) : null;
  const c = p ? compliance(p) : null;
  const curricula = p && isDdjd(p.kind) ? (await prisma.masterCurriculum.findMany({ where: { OR: [{ chairmanId: cid }, { chairmanId: null }] }, select: { id: true, title: true, version: true, authority: true }, take: 100 })).map((m) => ({ id: m.id, label: `${m.authority} ${m.title} ${m.version}` })) : [];
  const box = { border: "1px solid var(--line, #ddd)", borderRadius: 8, padding: 12, marginTop: 12 } as const;
  return (
    <Shell userName={user.name} roleLabel={roleLabel(user.role)} navLinks={navForRole(user.role)}>
      <h1>Joint degrees and ODL</h1>
      <p className="small-note">Dual, double and joint degree programmes with partner universities (Pakistani or foreign) and Open &amp; Distance Learning programmes or courses — every condition from the HEC DDJD Policy 2026 and the HEC ODL Policy / Toolkit, with its clause. Enrolment stays locked until the NOC (and, for a joint degree, the published programme information) is recorded.</p>
      <div style={box}><b>Start a programme</b> <NewProg kinds={KINDS} /></div>
      <table className="table" style={{ marginTop: 12 }}><thead><tr><th>Programme</th><th>Type</th><th>Ready</th><th>Enrolment</th><th /></tr></thead><tbody>
        {list.map((x) => { const cc = compliance(x); return <tr key={x.id}><td>{x.title}</td><td>{KINDS[x.kind]}</td><td>{cc.items.filter((i) => i.done).length + cc.moc.filter((i) => i.done).length}/{cc.items.length + cc.moc.length}{cc.problems.length ? ` · ${cc.problems.length} to fix` : ""}</td><td>{cc.enrolmentOpen ? "open" : "locked"}</td><td><Link href={`/collab?id=${x.id}`}>Open</Link></td></tr>; })}
        {!list.length && <tr><td colSpan={5} className="small-note">None yet.</td></tr>}
      </tbody></table>
      {p && d && c && <>
        <h2 style={{ marginTop: 20 }}>{p.title} <span className="small-note">{KINDS[p.kind]}</span></h2>
        {TYPE_RULE[p.kind] && <p className="small-note">{TYPE_RULE[p.kind]}</p>}
        <p><a className="btn btn-sm" href={`/api/collab/pdf?id=${p.id}&doc=noc`}>HEC NOC file (PDF)</a> <a className="btn btn-sm" href={`/api/collab/pdf?id=${p.id}&doc=audit`}>Audit pack (PDF)</a> {isDdjd(p.kind) && <a className="btn btn-sm" href={`/api/collab/pdf?id=${p.id}&doc=supplement`}>Diploma Supplement template (PDF)</a>}</p>
        <div style={{ ...box, background: c.enrolmentOpen ? "#eef9ee" : "#fff4e5" }}>{c.enrolmentOpen ? "Enrolment open." : `Enrolment locked: ${c.lockReason}`}{c.problems.length > 0 && <ul style={{ margin: "6px 0 0" }}>{c.problems.map((x) => <li key={x}>{x}</li>)}</ul>}</div>
        <div style={box}><b>Details</b><Basics id={p.id} d={d as Record<string, unknown>} ddjd={isDdjd(p.kind)} /></div>
        <div style={box}><b>Conditions</b><table className="table"><tbody>{c.items.map((i) => <tr key={i.key}><td style={{ fontSize: 12.5 }}>{i.label}</td><td><Check id={p.id} k={i.key} done={i.done} note={i.note} all={d.checks || {}} /></td></tr>)}</tbody></table></div>
        {isDdjd(p.kind) && <div style={box}><b>Memorandum of Commitment — Annexure-I vii (a–r)</b><table className="table"><tbody>{c.moc.map((m) => <tr key={m.key}><td style={{ fontSize: 12.5 }}>{m.done ? "✓" : "○"} {m.label}</td><td><MocField id={p.id} k={m.key} value={d.moc?.[m.key] || ""} all={d.moc || {}} /></td></tr>)}</tbody></table></div>}
        {isDdjd(p.kind) && <div style={box}><b>Credit Equivalency Matrix (Annexure-II)</b> <span className="small-note">Drafted from two curricula in OBEHUB; same subject + same credit hours = equivalent. Check each line.</span><div style={{ margin: "6px 0" }}><Cem id={p.id} curricula={curricula} /></div>
          {(d.cem || []).length > 0 && <table className="table"><thead><tr><th>Our course</th><th>Partner course</th><th>CH</th><th>Contact h</th><th>Assessment · equivalent</th></tr></thead><tbody>{(d.cem || []).map((r, i) => <tr key={i}><td>{r.ours} {r.oursTitle}</td><td>{r.theirs ? `${r.theirs} ${r.theirsTitle}` : <span className="small-note">no match</span>}</td><td>{r.ch}</td><td>{r.contactHours}</td><td><CemOk id={p.id} i={i} cem={d.cem || []} /></td></tr>)}</tbody></table>}</div>}
        {c.kpis.length > 0 && <div style={box}><b>KPIs (Annexure-III)</b><table className="table"><tbody>{c.kpis.map((k) => <tr key={k.key}><td>{k.label}</td><td>{k.key === "enrolment" ? "≥" : ">"} {k.bench}%</td><td>{k.value ?? "—"}</td><td>{k.ok == null ? "" : k.ok ? "✓ meets" : "✗ below"}</td></tr>)}</tbody></table></div>}
      </>}
    </Shell>
  );
}
