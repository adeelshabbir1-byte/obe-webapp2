import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "../../lib/db";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { chairmanIdFor, roleLabel } from "../../lib/reportScope";
import { staffOf } from "../../lib/registers";
import { ASSIGNERS, compliance, dataOf, DDJD_CHECKS, isDdjd, KINDS, KPI, listFor, missingIn, MOC_ITEMS, ODL_CHECKS, stepsOf, TYPE_RULE } from "../../lib/collab";
import { Assign, Cem, CemOk, Check, Courses, Field, Kpis, MocField, NewProg, Partners, SameDiscipline } from "./CollabForms";

export const dynamic = "force-dynamic";
const LEADERS = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR"];

// Dual / Double / Joint degrees and ODL (Adeel prompt §34) as a step-by-step wizard. The Dean (or Institute Head) assigns
// each programme to one person, who sees it in "Working as → Joint degrees & ODL" and leads it through the steps.
export default async function CollabPage({ searchParams }: { searchParams: { id?: string; step?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const cid = await chairmanIdFor(user as never);
  const leader = LEADERS.includes(user.role);
  const all = await listFor(cid);
  const list = leader ? all : all.filter((x) => dataOf(x).ownerId === user.id);
  const p = searchParams.id ? list.find((x) => x.id === searchParams.id) : list.length === 1 && !leader ? list[0] : null;
  const canAssign = ASSIGNERS.includes(user.role);
  const staff = canAssign ? await staffOf(cid) : [];
  const box = { border: "1px solid var(--line, #ddd)", borderRadius: 10, padding: 14, background: "var(--card, #fff)" } as const;

  if (!p) return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Joint degrees and ODL</h1>
      <p className="small-note">Dual, double and joint degrees with partner universities, and Open &amp; Distance Learning programmes or single courses — each worked through step by step, with every HEC condition and its clause. One platform that meets every HEC system requirement for all partners.</p>
      {leader && <div style={{ ...box, margin: "12px 0" }}><b>Start a programme</b> <NewProg kinds={KINDS} /></div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginTop: 12 }}>
        {list.map((x) => { const c = compliance(x); const steps = stepsOf(x.kind); const done = steps.filter((s) => !missingIn(x, s).length).length; const d = dataOf(x); return (
          <Link key={x.id} href={`/collab?id=${x.id}`} style={{ ...box, textDecoration: "none", color: "inherit", display: "block" }}>
            <div className="small-note">{KINDS[x.kind]}</div>
            <b style={{ fontSize: 15 }}>{x.title}</b>
            <div style={{ height: 6, background: "#eee", borderRadius: 3, margin: "8px 0 4px" }}><div style={{ width: `${(100 * done) / steps.length}%`, height: 6, borderRadius: 3, background: done === steps.length ? "#1E6B3A" : "#1B5FAA" }} /></div>
            <div style={{ fontSize: 12.5 }}>Step {Math.min(done + 1, steps.length)} of {steps.length} · {done}/{steps.length} done · enrolment {c.enrolmentOpen ? "open" : "locked"}</div>
            <div className="small-note">Lead: {d.ownerName || "not assigned"}</div>
          </Link>); })}
      </div>
      {!list.length && <p className="small-note" style={{ marginTop: 12 }}>{leader ? "No programme yet — start one above." : "No programme has been assigned to you."}</p>}
    </Shell>
  );

  const d = dataOf(p) as Record<string, any>;
  const steps = stepsOf(p.kind);
  const si = Math.max(0, Math.min(steps.length - 1, Number(searchParams.step || 0) || 0));
  const st = steps[si];
  const missing = missingIn(p, st);
  const c = compliance(p);
  const checkLabel = new Map(isDdjd(p.kind) ? DDJD_CHECKS : ODL_CHECKS);
  const curricula = st.widgets.includes("cem") ? (await prisma.masterCurriculum.findMany({ where: { OR: [{ chairmanId: cid }, { chairmanId: null }] }, select: { id: true, title: true, version: true, authority: true }, take: 100 })).map((m) => ({ id: m.id, label: `${m.authority} ${m.title} ${m.version}` })) : [];
  const allMissing = steps.flatMap((s, i) => missingIn(p, s).map((m) => ({ step: i, m })));
  const href = (i: number) => `/collab?id=${p.id}&step=${i}`;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div className="small-note"><Link href="/collab">Joint degrees and ODL</Link> › {KINDS[p.kind]}</div>
      <h1 style={{ fontSize: 22, margin: "2px 0 4px" }}>{p.title}</h1>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 13, marginBottom: 10 }}>
        <span style={{ padding: "2px 10px", borderRadius: 12, background: c.enrolmentOpen ? "#E6F4EA" : "#FFF1D6" }}>Enrolment {c.enrolmentOpen ? "open" : `locked — ${c.lockReason}`}</span>
        <span>Lead: <b>{d.ownerName || "not assigned"}</b></span>
        {canAssign && <Assign id={p.id} current={d.ownerId || ""} staff={staff} />}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 230px) minmax(0, 1fr)", gap: 14, alignItems: "start" }} className="collab-grid">
        <style>{"@media (max-width: 760px) { .collab-grid { grid-template-columns: 1fr !important; } }"}</style>
        <nav aria-label="Steps" style={{ ...box, padding: 8 }}>
          {steps.map((s, i) => { const n = missingIn(p, s).length; return (
            <Link key={s.key} href={href(i)} aria-current={i === si ? "step" : undefined} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 8px", borderRadius: 8, textDecoration: "none", color: "inherit", background: i === si ? "rgba(27,95,170,.10)" : undefined, fontWeight: i === si ? 700 : 400, fontSize: 13 }}>
              <span style={{ flex: "0 0 22px", height: 22, borderRadius: 11, display: "grid", placeItems: "center", fontSize: 11.5, color: "#fff", background: n ? (i === si ? "#1B5FAA" : "#9AA3AD") : "#1E6B3A" }}>{n ? i + 1 : "✓"}</span>
              <span style={{ flex: 1 }}>{s.title}</span>{n > 0 && <span className="small-note">{n}</span>}
            </Link>); })}
          <div className="small-note" style={{ padding: "8px 8px 2px" }}>{allMissing.length ? `${allMissing.length} things still missing for HEC` : "Everything HEC asks for is in place ✓"}</div>
        </nav>
        <section style={box}>
          <div className="small-note">Step {si + 1} of {steps.length}</div>
          <h2 style={{ fontSize: 18, margin: "2px 0 6px" }}>{st.title}</h2>
          <p style={{ fontSize: 13.5, marginTop: 0 }}>{st.intro}</p>
          {si === 0 && TYPE_RULE[p.kind] && <p className="small-note">{TYPE_RULE[p.kind]}</p>}

          {st.widgets.includes("partners") && <Partners id={p.id} partners={d.partners || []} />}
          {st.widgets.includes("same") && p.kind === "DOUBLE" && <SameDiscipline id={p.id} value={d.sameDiscipline !== false} />}
          {st.widgets.includes("cem") && <>
            <div style={{ margin: "6px 0" }}><Cem id={p.id} curricula={curricula} /></div>
            {(d.cem || []).length > 0 && <div style={{ overflowX: "auto" }}><table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Our course</th><th>Partner course</th><th>CH</th><th>Contact h</th><th>Assessment · equivalent</th></tr></thead><tbody>{(d.cem || []).map((r: any, i: number) => <tr key={i}><td>{r.ours} {r.oursTitle}</td><td>{r.theirs ? `${r.theirs} ${r.theirsTitle}` : <span className="small-note">no match</span>}</td><td>{r.ch}</td><td>{r.contactHours}</td><td><CemOk id={p.id} i={i} cem={d.cem} /></td></tr>)}</tbody></table></div>}
          </>}
          {st.widgets.includes("courses") && <Courses id={p.id} courses={d.courses || []} />}

          {st.moc.length > 0 && <div style={{ marginTop: 10 }}><b style={{ fontSize: 13 }}>What the MoC says</b>{st.moc.map((k) => <div key={k} style={{ margin: "6px 0", fontSize: 13 }}>({k}) {MOC_ITEMS.find((x) => x[0] === k)?.[1]}<br /><MocField id={p.id} k={k} value={d.moc?.[k] || ""} all={d.moc || {}} /></div>)}</div>}
          {st.fields.map(([k, label, t]) => <Field key={k} id={p.id} k={k} label={label} type={t} value={d[k] == null ? "" : String(d[k])} />)}
          {st.checks.length > 0 && <div style={{ marginTop: 10 }}><b style={{ fontSize: 13 }}>HEC conditions</b>{st.checks.map((k) => <div key={k} style={{ margin: "6px 0", fontSize: 13 }}>{checkLabel.get(k)}<br /><Check id={p.id} k={k} done={!!d.checks?.[k]?.done} note={d.checks?.[k]?.note || ""} all={d.checks || {}} /></div>)}</div>}
          {st.widgets.includes("moc-all") && <div style={{ marginTop: 10, fontSize: 12.5 }}><b style={{ fontSize: 13 }}>MoC checklist — Annexure-I vii (a–r)</b><div style={{ columns: "2 240px", marginTop: 4 }}>{c.moc.map((m) => <div key={m.key} style={{ color: m.done ? "#1E6B3A" : "#B3261E" }}>{m.done ? "✓" : "✗"} {m.label}</div>)}</div></div>}
          {st.widgets.includes("kpis") && <div style={{ marginTop: 12 }}><b style={{ fontSize: 13 }}>Yearly KPIs (Annexure-III)</b><Kpis id={p.id} kpis={d.kpis || {}} defs={KPI} /></div>}
          {st.widgets.includes("docs") && <p style={{ marginTop: 12 }}><a className="btn btn-sm" href={`/api/collab/pdf?id=${p.id}&doc=noc`}>HEC NOC file (PDF)</a> <a className="btn btn-sm" href={`/api/collab/pdf?id=${p.id}&doc=audit`}>Audit pack (PDF)</a> {isDdjd(p.kind) && <><a className="btn btn-sm" href={`/api/collab/pdf?id=${p.id}&doc=supplement`}>Diploma Supplement (PDF)</a> <a className="btn-link" href={`/programme/${p.id}`} target="_blank">Public programme page</a></>}</p>}

          <div style={{ marginTop: 14, padding: 10, borderRadius: 8, background: missing.length ? "#FFF6E5" : "#E6F4EA", fontSize: 13 }}>
            {missing.length ? <><b>Still missing in this step</b><ul style={{ margin: "4px 0 0 18px", padding: 0 }}>{missing.map((m) => <li key={m}>{m}</li>)}</ul></> : <b>This step is complete ✓</b>}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
            {si > 0 ? <Link className="btn btn-secondary btn-sm" href={href(si - 1)}>← {steps[si - 1].title}</Link> : <span />}
            {si < steps.length - 1 ? <Link className="btn btn-sm" href={href(si + 1)}>Next: {steps[si + 1].title} →</Link> : <Link className="btn btn-sm" href="/collab">Done</Link>}
          </div>
        </section>
      </div>
    </Shell>
  );
}
