import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "../../lib/db";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import Tabs from "../../components/Tabs";
import { navForRole } from "../../components/reportNav";
import { chairmanIdFor, roleLabel } from "../../lib/reportScope";
import { claimAmounts, comparison, dataOf, eventsOf, examinerSuggestions, KINDS, kindOf, list, paperCoverage, ratesOf, sessionalVsFinal, sideOf, viewData } from "../../lib/affWork";
import { getFlag } from "../../lib/scopedSettings";
import { Ack, Codes, EditRecord, Marks, Move, NewRecord, RatesForm, ScriptMarks } from "./AffForms";

export const dynamic = "force-dynamic";

// Affiliation: university ↔ colleges (Adeel prompt §28–30). One register per kind with its workflow, plus reports.
export default async function AffiliationPage({ searchParams }: { searchParams: { tab?: string; open?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const inst = await chairmanIdFor(user as never);
  const s = await sideOf(user as never, inst);
  const shell = (body: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><h1>Affiliation</h1>{body}</Shell>;
  if (!s.universityId || (!s.asUni && !s.asCollege)) return shell(<div className="card"><p>Your institute is not an affiliating university with colleges, nor an affiliated college. The link is set on <Link href="/chairman/affiliates">Affiliated colleges</Link>.</p></div>);
  const side = s.asUni ? "UNI" : "COLLEGE";
  const tab = searchParams.tab || "APPLICATION";
  const colleges = s.colleges.map((c) => ({ id: c.collegeId, name: c.head?.instituteName || c.head?.name || "College" }));
  const colName = new Map(colleges.map((c) => [c.id, c.name]));
  const tabs = [...KINDS.map((k) => ({ key: k.key, label: k.label })), ...(side === "UNI" ? [{ key: "REPORTS", label: "Comparison reports" }, { key: "RATES", label: "Examiner rates" }] : [])];
  if (tab === "REPORTS" && side === "UNI") {
    const [cmp, gap] = await Promise.all([comparison(s.universityId), sessionalVsFinal(s.universityId)]);
    const codes = Array.from(new Set(cmp.map((c) => c.code))).sort();
    const acc = await list(s.universityId, "ACCREDITATION");
    return shell(<><Tabs base="/affiliation" current={tab} tabs={tabs} />
      <div className="card" style={{ marginBottom: 10, overflowX: "auto" }}><h3 style={{ marginTop: 0, fontSize: 15 }}>Colleges compared — pass rate / mean, per course</h3>
        <table className="table" style={{ fontSize: 12 }}><thead><tr><th style={{ textAlign: "left" }}>Course</th>{colleges.map((c) => <th key={c.id}>{c.name}</th>)}</tr></thead><tbody>{codes.map((code) => { const vals = colleges.map((c) => cmp.filter((x) => x.code === code && x.collegeId === c.id)); const all = cmp.filter((x) => x.code === code); const avg = all.length ? Math.round(all.reduce((a, x) => a + x.passRate, 0) / all.length) : 0; return <tr key={code}><td><b>{code}</b> <span className="small-note">avg {avg}%</span></td>{vals.map((v, i) => <td key={i} style={{ textAlign: "center", color: v[0] && v[0].passRate < avg - 15 ? "#B3261E" : undefined }}>{v[0] ? `${v[0].passRate}% / ${v[0].mean}` : "—"}</td>)}</tr>; })}</tbody></table>
        <p className="small-note">Red: more than 15 points below the university average. Each college sees only its own figures against the average.</p></div>
      <div className="card" style={{ marginBottom: 10 }}><h3 style={{ marginTop: 0, fontSize: 15 }}>Sessional vs final (read-only — never changes marks)</h3><table className="table" style={{ fontSize: 12 }}><tbody>{gap.slice(0, 60).map((g, i) => <tr key={i} style={{ color: g.flag ? "#B3261E" : undefined }}><td>{g.college}</td><td>{g.code}</td><td>sessional {g.sessional}%</td><td>final {g.final}%</td><td>{g.flag ? "⚠ large gap" : ""}</td></tr>)}</tbody></table></div>
      <div className="card"><h3 style={{ marginTop: 0, fontSize: 15 }}>Programs without council accreditation</h3><ul style={{ fontSize: 13 }}>{acc.filter((a) => a.status !== "ACCREDITED").map((a) => <li key={a.id}>{colName.get(a.collegeId || "")}: {dataOf(a).program} — {a.status.toLowerCase()}</li>)}{acc.filter((a) => a.status === "ACCREDITED" && dataOf(a).validUntil && new Date(dataOf(a).validUntil) < new Date(Date.now() + 180 * 864e5)).map((a) => <li key={a.id}>{colName.get(a.collegeId || "")}: {dataOf(a).program} — accreditation expires {dataOf(a).validUntil}</li>)}</ul></div>
    </>);
  }
  if (tab === "RATES" && side === "UNI") return shell(<><Tabs base="/affiliation" current={tab} tabs={tabs} /><div className="card"><RatesForm rates={await ratesOf(s.universityId) as never} /></div></>);
  const k = kindOf(tab) || KINDS[0];
  const rows = await list(s.universityId, k.key, side === "COLLEGE" ? inst : null);
  const rates = k.key === "CLAIM" ? await ratesOf(s.universityId) : null;
  const open = searchParams.open ? rows.find((r) => r.id === searchParams.open) : null;
  const ev = open ? await eventsOf(open.id) : [];
  const cover = open && open.kind === "FINAL_PAPER" && (side === "UNI" || "topics" in viewData(open, side)) ? await paperCoverage(open as never, side === "COLLEGE" ? inst : null) : [];
  if (open && open.kind === "FINAL_PAPER" && side === "UNI") await (await import("../../lib/audit")).writeAuditLog({ actorUserId: user.id, action: "FINAL_PAPER_VIEWED", entityType: "AffRecord", entityId: open.id }).catch(() => null);
  const sugg = open && open.kind === "SESSION" && side === "UNI" ? await examinerSuggestions(open as never) : null;
  const names = new Map((await prisma.user.findMany({ where: { id: { in: ev.map((e) => e.byId).concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return shell(<>
    <Tabs base="/affiliation" current={k.key} tabs={tabs.map((t) => ({ ...t, badge: t.key === k.key ? rows.length || null : null }))} />
    <p className="small-note">You are working as the {side === "UNI" ? "affiliating university" : "affiliated college"}. {k.createdBy === side ? "" : `${k.label} are started by the ${k.createdBy === "UNI" ? "university" : "college"}.`}</p>
    {k.createdBy === side && <div style={{ marginBottom: 10 }}><NewRecord kind={k.key} fields={k.fields} side={side} colleges={colleges} /></div>}
    <div className="card"><table className="table" style={{ fontSize: 12.5, width: "100%" }}><tbody>{await Promise.all(rows.map(async (r) => {
      const d = viewData(r, side);
      const amounts = rates ? claimAmounts(d, rates) : null;
      const ack = k.key === "NOTICE" && side === "COLLEGE" ? await getFlag(inst, `aff:ack:${r.id}`) : null;
      return <tr key={r.id}><td><Link href={`/affiliation?tab=${k.key}&open=${r.id}`}><b>{r.title}</b></Link> <span className="small-note">{r.collegeId ? colName.get(r.collegeId) || "" : "all colleges"}</span>{amounts && <div className="small-note">fees Rs {amounts.taxable} − tax {amounts.tax} = {amounts.netFees} · TA/DA (tax-free) Rs {amounts.tada} · total Rs {amounts.total}</div>}</td><td>{r.status.toLowerCase().replace(/_/g, " ")}</td><td>{new Date(r.updatedAt).toLocaleDateString("en-GB")}</td><td>{k.key === "NOTICE" && side === "COLLEGE" ? (ack ? <span className="small-note">acknowledged ✓</span> : <Ack id={r.id} />) : null}{k.key === "APPLICATION" && ["APPROVED", "CONDITIONAL"].includes(r.status) && <a className="small-note" href={`/api/affiliation/letter?id=${r.id}`}>letter (PDF)</a>}</td></tr>;
    }))}</tbody></table>{rows.length === 0 && <p className="small-note">Nothing yet.</p>}</div>
    {open && (() => { const d = viewData(open, side); const m = k.moves[open.status]; return (
      <div className="card" style={{ marginTop: 10 }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>{open.title} — {open.status.toLowerCase().replace(/_/g, " ")}</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div style={{ fontSize: 12.5 }}>{k.fields.map((f) => <div key={f.key}><span className="small-note">{f.label}:</span> {String(d[f.key] ?? "") || "—"}</div>)}</div>
          <EditRecord id={open.id} fields={k.fields} side={side} data={d} />
        </div>
        {cover.length > 0 && <div style={{ marginTop: 8, fontSize: 12.5 }}><b>Coverage of the disclosed lectures</b>{cover.map((c) => <div key={c.collegeId} style={{ color: c.missing.length ? "#b3261e" : "#1b5e20" }}>{side === "UNI" ? `${colName.get(c.collegeId) || "College"}: ` : ""}{c.taught}/{c.of} taught{c.missing.length ? ` — not yet: ${c.missing.length > 12 ? `${c.missing.slice(0, 12).map((n) => `L${n}`).join(", ")}…` : c.missing.map((n) => `L${n}`).join(", ")}` : " ✓"}</div>)}</div>}
        {sugg && <div style={{ marginTop: 8, fontSize: 12.5 }}>{sugg.split.length > 0 && <div><b>Sessions at this centre</b> ({sugg.capacity} per session): {sugg.split.join(" · ")}</div>}<b>Suggested external examiners</b> <span className="small-note">(paste the record id into “External examiner”)</span><ul style={{ margin: "4px 0" }}>{sugg.ranked.map((e) => <li key={e.id} style={{ color: e.ok ? undefined : "#999" }}>{e.name} — {e.institute}, {e.city} · {e.duties} duties · <code>{e.id}</code>{e.ok ? "" : ` ✗ ${e.why.join(", ")}`}</li>)}</ul></div>}
        {k.key === "EXAMINER" && side === "UNI" && <div style={{ marginTop: 8 }}><a className="btn-link" href={`/api/affiliation/letter?doc=tax&id=${open.id}&year=${new Date().getFullYear()}`}>Tax deduction certificate {new Date().getFullYear()} (PDF)</a></div>}
        {k.key === "MARKING" && side === "UNI" && (() => { const key = (d.key || {}) as Record<string, string>; const codes = Object.keys(key); const marks = (d.marks || {}) as Record<string, number | null>; return <div style={{ marginTop: 8 }}>
          {!codes.length ? <Codes id={open.id} /> : open.status === "MARKING" ? <><b>Marks by code</b> <span className="small-note">(the marker sees only codes)</span><ScriptMarks id={open.id} codes={codes} marks={marks} max={Number(d.maxMarks) || 100} /></> : open.status === "DECODED" ? <><b>Decoded (Controller&apos;s office)</b><table className="table" style={{ fontSize: 12 }}><tbody>{codes.map((c) => <tr key={c}><td>{key[c]}</td><td>{marks[c] ?? "—"}</td></tr>)}</tbody></table></> : <span className="small-note">{codes.length} scripts coded. Move to Marking to enter marks.</span>}
        </div>; })()}
        {k.key === "SESSION" && <div style={{ marginTop: 8 }}><Marks id={open.id} rows={d.marks || []} side={side} /></div>}
        {m && m.by === side && <div style={{ marginTop: 8 }}>Next: <Move id={open.id} to={m.to} /></div>}
        <details style={{ marginTop: 8 }}><summary className="small-note" style={{ cursor: "pointer" }}>Trail ({ev.length})</summary><ul style={{ fontSize: 12 }}>{ev.map((e, i) => <li key={i}>{new Date(e.at).toLocaleString("en-GB")} · {names.get(e.byId) || "—"} · {e.action.toLowerCase()}{e.note ? ` — ${e.note}` : ""}</li>)}</ul></details>
      </div>); })()}
  </>);
}
