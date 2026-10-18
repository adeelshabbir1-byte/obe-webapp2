import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import { navForRole } from "../../../../components/reportNav";
import { roleLabel } from "../../../../lib/reportScope";
import { govScope, inScope, assignablePeople } from "../../../../lib/accreditation/governance";
import { BODIES, type BodyKey } from "../../../../lib/accreditation/bodies";
import { vdb, data, FINDING_TYPES, POSITIONS, DECISIONS, OUTCOMES, labelOf, parseFinding, type VItem } from "../../../../lib/accreditation/visit";
import VisitEvidence from "../../../../components/VisitEvidence";
import { ActionForm, ActionButton } from "../../../../components/fyp/FypClient";
import PrintButton from "../../../../components/PrintButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visit plan" };

// The visit itself: agenda, panel, logistics checklist, and the panel's findings with responses and owners.
export default async function VisitPage({ params }: { params: { cycleId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const sc = await govScope(user);
  if (!sc) redirect("/dashboard");
  const c = await prisma.accreditationCycle.findUnique({ where: { id: params.cycleId } }).catch(() => null);
  if (!c || !inScope(sc, c)) notFound();
  const edit = sc.canManage || c.leadId === user.id;
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  const items = ((await vdb.visitItem.findMany({ where: { cycleId: c.id }, orderBy: [{ sort: "asc" }, { createdAt: "asc" }] }).catch(() => null)) as VItem[] | null);
  if (items === null) return shell(<div className="err">Run prisma/migration_visit.sql first.</div>);
  const people = edit ? await assignablePeople(sc) : [];
  const ownerIds = items.map((i) => i.ownerId).filter((x): x is string => !!x);
  const names = new Map((await prisma.user.findMany({ where: { id: { in: [...ownerIds, ...people.map((p) => p.id)] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const of = (k: string) => items.filter((i) => i.kind === k);
  const agenda = of("AGENDA").sort((a, b) => `${data(a).day} ${data(a).time}`.localeCompare(`${data(b).day} ${data(b).time}`));
  const logistics = of("LOGISTICS"), panel = of("PANEL"), findings = of("FINDING");
  const ownerOpts: [string, string][] = [["", "— owner —"], ...people.map((p) => [p.id, p.name] as [string, string])];
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  const btn = (i: VItem, next: string, label: string) => <ActionButton url="/api/accreditation/visit" body={{ cycleId: c.id, action: "status", id: i.id, status: next }} label={label} className="btn btn-secondary btn-sm" />;
  const del = (i: VItem) => <ActionButton url="/api/accreditation/visit" body={{ cycleId: c.id, action: "delete", id: i.id }} label="✕" className="btn btn-secondary btn-sm" confirmText="Remove?" />;
  const agendaF = [{ name: "day", label: "Day", width: 70 }, { name: "time", label: "Time", width: 70 }, { name: "session", label: "Session", width: 260 }, { name: "with", label: "With", width: 200 }, { name: "venue", label: "Venue", width: 120 }, { name: "host", label: "Host", width: 140 }];
  const findF = [{ name: "criterion", label: BODIES[c.body as BodyKey]?.groupLabel || "Criterion", width: 90 }, { name: "type", label: "Type", type: "select" as const, options: FINDING_TYPES }, { name: "observation", label: "Panel's observation", type: "textarea" as const }, { name: "response", label: "Our response", type: "textarea" as const }, { name: "action", label: "Corrective action", type: "textarea" as const }, { name: "ownerId", label: "Owner", type: "select" as const, options: ownerOpts }, { name: "dueDate", label: "Due", type: "date" as const }];
  const plan = of("IMPLEMENTATION");
  const prevCycle = await prisma.accreditationCycle.findFirst({ where: { leadId: c.leadId, body: c.body, id: { not: c.id }, createdAt: { lt: c.createdAt } }, orderBy: { createdAt: "desc" } });
  const prevFindings = prevCycle ? ((await vdb.visitItem.findMany({ where: { cycleId: prevCycle.id, kind: "FINDING" }, orderBy: { sort: "asc" } })) as VItem[]).filter((f) => data(f).type !== "STRENGTH") : [];
  const planF = [{ name: "finding", label: "Finding / weakness addressed", type: "textarea" as const }, { name: "action", label: "Action", type: "textarea" as const }, { name: "responsible", label: "Responsible", width: 160 }, { name: "resources", label: "Resources needed", width: 180 }, { name: "timeline", label: "Timeline", width: 120 }, { name: "indicator", label: "How success is measured", width: 220 }];
  const openF = findings.filter((f) => f.status !== "DONE" && data(f).type !== "STRENGTH").length;
  const report = data(of("REPORT")[0] || { dataJson: "{}" });
  const daysLeft = report.rebuttalDue && !report.rebuttalSent ? Math.ceil((Date.parse(report.rebuttalDue) - Date.now()) / 86400000) : null;
  const parsed = findings.map((f) => ({ f, p: parseFinding(f) }));
  const toFix = parsed.filter((x) => x.p.needsAction);
  const count = (o: string) => toFix.filter((x) => x.p.outcome === o).length;
  const rebutted = parsed.filter((x) => x.p.position === "REBUT" || x.p.position === "PARTIAL");
  const OUT_COLOUR: Record<string, string> = { OPEN: "#B3261E", IMPROVING: "#A35A00", RESOLVED: "#1F5E36", STRENGTH: "#1F5E36" };
  const bar = (pct: number) => <span style={{ display: "inline-block", width: 90, height: 8, background: "#E3E9F0", borderRadius: 4, verticalAlign: "middle", marginRight: 6 }}><span style={{ display: "block", width: `${pct}%`, height: 8, background: pct >= 100 ? "#1F5E36" : "#A35A00", borderRadius: 4 }} /></span>;
  return shell(<>
    <div className="no-print" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
      <Link href={`/accreditation/readiness/${c.id}`}>← Visit tasks &amp; dossier</Link><PrintButton label="Print visit plan" />
    </div>
    <h1 style={{ fontSize: 22, marginBottom: 2 }}>{c.title}</h1>
    <p className="small-note">{BODIES[c.body as BodyKey]?.name || c.body} · {c.program} · visit {c.visitDate ? day(c.visitDate) : "date not set"} · {logistics.filter((l) => l.status === "DONE").length}/{logistics.length} arrangements done · {openF} findings open</p>
    {edit && !agenda.length && !logistics.length && <div className="card no-print"><ActionButton url="/api/accreditation/visit" body={{ cycleId: c.id, action: "template" }} label={`Load the standard ${c.body} two-day agenda and checklist`} /></div>}

    <div className="card"><h3 style={{ marginTop: 0 }}>Agenda</h3>
      <table><thead><tr><th>Day</th><th>Time</th><th>Session</th><th>With</th><th>Venue</th><th>Host</th>{edit && <th className="no-print" />}</tr></thead>
        <tbody>{agenda.map((a) => { const d = data(a); return <tr key={a.id}><td>{d.day}</td><td>{d.time}</td><td><b>{d.session}</b></td><td>{d.with}</td><td>{d.venue}</td><td>{d.host}</td>{edit && <td className="no-print" style={{ whiteSpace: "nowrap" }}><ActionForm url="/api/accreditation/visit" fixed={{ cycleId: c.id, action: "edit", kind: "AGENDA", id: a.id }} submit="Save" collapsed openLabel="Edit" initial={d} fields={agendaF} /> {del(a)}</td>}</tr>; })}</tbody></table>
      {edit && <div className="no-print"><ActionForm url="/api/accreditation/visit" fixed={{ cycleId: c.id, action: "add", kind: "AGENDA" }} submit="Add" collapsed openLabel="Add session" initial={{ day: "Day 1" }} fields={agendaF} /></div>}
    </div>

    <div className="card"><h3 style={{ marginTop: 0 }}>Panel</h3>
      {panel.map((p) => { const d = data(p); return <div key={p.id} style={{ fontSize: 13.5 }}><b>{d.name}</b> {d.role && `· ${d.role}`} {d.organization && `· ${d.organization}`} <span className="small-note">{[d.contact, d.arrival && `arrives ${d.arrival}`].filter(Boolean).join(" · ")}</span> {edit && <span className="no-print">{del(p)}</span>}</div>; })}
      {!panel.length && <p className="small-note">Add the panel members once the council confirms them.</p>}
      {edit && <div className="no-print"><ActionForm url="/api/accreditation/visit" fixed={{ cycleId: c.id, action: "add", kind: "PANEL" }} submit="Add" collapsed openLabel="Add panel member" initial={{ role: "Member" }} fields={[{ name: "name", label: "Name", width: 180 }, { name: "role", label: "Role (Convener / Member / Observer)", width: 160 }, { name: "organization", label: "Organization", width: 200 }, { name: "contact", label: "Phone / email", width: 160 }, { name: "arrival", label: "Arrival / travel", width: 160 }]} /></div>}
    </div>

    <div className="card"><h3 style={{ marginTop: 0 }}>Arrangements</h3>
      {logistics.map((l) => { const d = data(l); return <div key={l.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, padding: "2px 0" }}><span style={{ color: l.status === "DONE" ? "#1F5E36" : "#B3261E" }}>{l.status === "DONE" ? "✓" : "○"}</span><span style={{ flex: 1 }}>{d.task}{d.note ? <span className="small-note"> — {d.note}</span> : null}{l.ownerId ? <span className="small-note"> · {names.get(l.ownerId)}</span> : null}{l.dueDate ? <span className="small-note"> · by {day(l.dueDate)}</span> : null}</span>
        {edit && <span className="no-print" style={{ display: "flex", gap: 4 }}>{l.status === "DONE" ? btn(l, "OPEN", "Undo") : btn(l, "DONE", "Done")}<ActionForm url="/api/accreditation/visit" fixed={{ cycleId: c.id, action: "edit", kind: "LOGISTICS", id: l.id }} submit="Save" collapsed openLabel="Edit" initial={{ ...d, ownerId: l.ownerId || "", dueDate: day(l.dueDate) }} fields={[{ name: "task", label: "Task", width: 260 }, { name: "note", label: "Note", width: 200 }, { name: "ownerId", label: "Owner", type: "select", options: ownerOpts }, { name: "dueDate", label: "By", type: "date" }]} />{del(l)}</span>}</div>; })}
      {edit && <div className="no-print"><ActionForm url="/api/accreditation/visit" fixed={{ cycleId: c.id, action: "add", kind: "LOGISTICS" }} submit="Add" collapsed openLabel="Add arrangement" fields={[{ name: "task", label: "Task", width: 260 }, { name: "ownerId", label: "Owner", type: "select", options: ownerOpts }, { name: "dueDate", label: "By", type: "date" }]} /></div>}
    </div>

    <div className="card"><h3 style={{ marginTop: 0 }}>Visit report and rebuttal</h3>
      <p className="small-note">When the council sends the visit report, record the date and the deadline to respond. For each finding below, say whether we accept it, partially accept it or rebut it, attach evidence, and download the rebuttal letter to send. When the council rules, record its decision on each rebutted point.</p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13.5 }}>
        <span>Report received: <b>{report.reportReceived || "—"}</b></span><span>Respond by: <b style={{ color: daysLeft !== null && daysLeft <= 3 ? "#B3261E" : undefined }}>{report.rebuttalDue || "—"}</b>{daysLeft !== null && <span className="small-note"> ({daysLeft >= 0 ? `${daysLeft} days left` : `${-daysLeft} days late`})</span>}</span>
        <span>Rebuttal sent: <b>{report.rebuttalSent || "—"}</b></span><span>Council decision: <b>{report.decisionReceived || "—"}</b></span>{report.reference && <span>Ref: {report.reference}</span>}
      </div>
      <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
        {edit && <ActionForm url="/api/accreditation/visit" fixed={{ cycleId: c.id, action: "report" }} submit="Save" collapsed openLabel="Set report dates" initial={report} fields={[{ name: "reportReceived", label: "Report received", type: "date" }, { name: "rebuttalDue", label: "Respond by", type: "date" }, { name: "rebuttalSent", label: "Rebuttal sent", type: "date" }, { name: "decisionReceived", label: "Council decision received", type: "date" }, { name: "reference", label: "Council reference no.", width: 160 }]} />}
        <a className="btn btn-brass btn-sm" href={`/api/accreditation/visit/rebuttal?cycleId=${c.id}&kind=rebuttal`}>⬇ Rebuttal letter (Word){rebutted.length ? ` — ${rebutted.length} point${rebutted.length === 1 ? "" : "s"}` : ""}</a>
        <a className="btn btn-secondary btn-sm" href={`/api/accreditation/visit/rebuttal?cycleId=${c.id}&kind=compliance`}>⬇ Compliance report (Word)</a>
      </div>
    </div>

    {toFix.length > 0 && <div className="card"><h3 style={{ marginTop: 0 }}>Progress on accepted findings</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
        {([["Need action", String(toFix.length)], ["Now a strength", String(count("STRENGTH"))], ["Resolved", String(count("RESOLVED"))], ["Improving", String(count("IMPROVING"))], ["Not started", String(count("OPEN"))], ["Average progress", `${Math.round(toFix.reduce((t, x) => t + x.p.pct, 0) / toFix.length)}%`]] as [string, string][]).map(([l, v]) => <div key={l} className="card" style={{ margin: 0 }}><div className="small-note">{l}</div><div style={{ fontSize: 19, fontWeight: 700 }}>{v}</div></div>)}
      </div>
      {parsed.filter((x) => x.p.withdrawn).length > 0 && <p className="small-note">{parsed.filter((x) => x.p.withdrawn).length} finding(s) withdrawn after our rebuttal — no action needed.</p>}
    </div>}

    <div className="card"><h3 style={{ marginTop: 0 }}>Findings and responses</h3>
      <p className="small-note">Record the panel&apos;s exit-meeting findings and the visit report. Each concern, weakness or deficiency gets a response, a corrective action and an owner; close it when done. These feed the next CQI cycle.</p>
      {findings.map((f) => { const d = data(f); const t = FINDING_TYPES.find((x) => x[0] === d.type)?.[1] || d.type; return (
        <div key={f.id} style={{ borderTop: "1px solid #E3E9F0", padding: "8px 0", fontSize: 13.5 }}>
          <div><b style={{ color: d.type === "STRENGTH" ? "#1F5E36" : d.type === "DEFICIENCY" ? "#B3261E" : d.type === "WEAKNESS" ? "#A35A00" : undefined }}>{t}</b> {d.criterion && <span className="small-note">· {d.criterion}</span>} <span className="small-note">· {f.status === "DONE" ? "closed" : f.status === "IN_PROGRESS" ? "in progress" : "open"}{f.ownerId ? ` · ${names.get(f.ownerId)}` : ""}{f.dueDate ? ` · due ${day(f.dueDate)}` : ""}</span></div>
          <div>{d.observation}</div>
          {d.response && <div><i>Response:</i> {d.response}</div>}{d.action && <div><i>Action:</i> {d.action}</div>}
          {(() => { const p = parseFinding(f); if (d.type === "STRENGTH") return null; return (<div style={{ marginTop: 4, padding: "6px 8px", background: "rgba(0,0,0,0.025)", borderRadius: 6 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span>Our position: <b style={{ color: p.position === "REBUT" ? "#1B6CA8" : undefined }}>{p.position ? labelOf(POSITIONS, p.position) : "not decided"}</b></span>
              {p.position && p.position !== "ACCEPT" && <span>Council: <b style={{ color: p.decision === "ACCEPTED" ? "#1F5E36" : p.decision === "REJECTED" ? "#B3261E" : "#A35A00" }}>{labelOf(DECISIONS, p.decision)}</b>{p.decisionNote ? <span className="small-note"> — {p.decisionNote}</span> : null}</span>}
              {p.needsAction && <span>{bar(p.pct)}{p.pct}% · <b style={{ color: OUT_COLOUR[p.outcome] }}>{labelOf(OUTCOMES, p.outcome)}</b>{(p.metricBefore || p.metricAfter) && <span className="small-note"> · {p.metricBefore || "—"} → {p.metricAfter || "—"}</span>}</span>}
            </div>
            {p.rebuttal && <div><i>Rebuttal:</i> {p.rebuttal}</div>}
            <VisitEvidence cycleId={c.id} id={f.id} evidence={p.evidence} edit={edit} />
            {p.progress.length > 0 && <details style={{ fontSize: 12.5 }}><summary>Progress log ({p.progress.length})</summary><ul style={{ margin: "4px 0", paddingLeft: 18 }}>{p.progress.slice().reverse().map((g, k) => <li key={k}>{g.on} · {g.pct}% · {g.note} <span className="small-note">— {g.by}</span></li>)}</ul></details>}
            {p.outcomeNote && <div><i>Result:</i> {p.outcomeNote}</div>}
            {edit && <div className="no-print" style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
              <ActionForm url="/api/accreditation/visit" fixed={{ cycleId: c.id, action: "position", id: f.id }} submit="Save" collapsed openLabel={p.position ? "Change position" : "Accept / rebut"} initial={{ position: p.position || "ACCEPT", rebuttal: p.rebuttal }} fields={[{ name: "position", label: "Our position", type: "select", options: POSITIONS }, { name: "rebuttal", label: "Rebuttal: why the finding is wrong or overstated, and what the evidence shows (needed to rebut)", type: "textarea", full: true }]} />
              {p.position && p.position !== "ACCEPT" && <ActionForm url="/api/accreditation/visit" fixed={{ cycleId: c.id, action: "decision", id: f.id }} submit="Save" collapsed openLabel="Council's decision" initial={{ decision: p.decision || "PENDING", decisionNote: p.decisionNote }} fields={[{ name: "decision", label: "Decision", type: "select", options: DECISIONS }, { name: "decisionNote", label: "Council's words / note", type: "textarea", full: true }]} />}
              {p.needsAction && <ActionForm url="/api/accreditation/visit" fixed={{ cycleId: c.id, action: "progress", id: f.id }} submit="Add" collapsed openLabel="Log progress" initial={{ pct: String(p.pct) }} fields={[{ name: "pct", label: "% done", type: "number", width: 70 }, { name: "note", label: "What was done", type: "textarea", full: true }]} />}
              {p.needsAction && <ActionForm url="/api/accreditation/visit" fixed={{ cycleId: c.id, action: "outcome", id: f.id }} submit="Save" collapsed openLabel="Set result" initial={{ outcome: p.outcome, outcomeNote: p.outcomeNote, metricBefore: p.metricBefore, metricAfter: p.metricAfter }} fields={[{ name: "outcome", label: "Result", type: "select", options: OUTCOMES }, { name: "metricBefore", label: "Measure at the visit", placeholder: "e.g. 2 PhD faculty", width: 160 }, { name: "metricAfter", label: "Measure now", placeholder: "e.g. 5 PhD faculty", width: 160 }, { name: "outcomeNote", label: "Evidence it is resolved / now a strength", type: "textarea", full: true }]} />}
            </div>}
          </div>); })()}
          {edit && <div className="no-print" style={{ display: "flex", gap: 4, marginTop: 4 }}>{f.status !== "IN_PROGRESS" && f.status !== "DONE" && btn(f, "IN_PROGRESS", "Start")}{f.status !== "DONE" ? btn(f, "DONE", "Close") : btn(f, "OPEN", "Reopen")}<ActionForm url="/api/accreditation/visit" fixed={{ cycleId: c.id, action: "edit", kind: "FINDING", id: f.id }} submit="Save" collapsed openLabel="Edit" initial={{ ...d, ownerId: f.ownerId || "", dueDate: day(f.dueDate) }} fields={findF} />{del(f)}</div>}
        </div>); })}
      {edit && findings.length > 0 && <p className="small-note no-print">For HEC self-assessment: the findings above are the Assessment Team&apos;s report; turn them into the Implementation Plan below.</p>}
      {edit && <div className="no-print"><ActionForm url="/api/accreditation/visit" fixed={{ cycleId: c.id, action: "add", kind: "FINDING" }} submit="Add" collapsed openLabel="Add finding" initial={{ type: "CONCERN" }} fields={findF} /></div>}
    </div>

    <div className="card"><h3 style={{ marginTop: 0 }}>Implementation plan</h3>
      <p className="small-note">Actions agreed after the visit (HEC calls this the Implementation Plan): who does what, by when, with what resources, and how success is measured.</p>
      {plan.length > 0 && <table><thead><tr><th>Finding</th><th>Action</th><th>Responsible</th><th>Resources</th><th>Timeline</th><th>Measure</th><th>Status</th>{edit && <th className="no-print" />}</tr></thead>
        <tbody>{plan.map((p) => { const d = data(p); return <tr key={p.id}><td style={{ fontSize: 12.5 }}>{d.finding}</td><td style={{ fontSize: 12.5 }}>{d.action}</td><td>{d.responsible}</td><td>{d.resources}</td><td>{d.timeline}</td><td style={{ fontSize: 12.5 }}>{d.indicator}</td><td>{p.status === "DONE" ? "Done" : p.status === "IN_PROGRESS" ? "In progress" : "Open"}</td>
          {edit && <td className="no-print" style={{ whiteSpace: "nowrap" }}>{p.status !== "DONE" ? btn(p, "DONE", "Done") : btn(p, "OPEN", "Reopen")} <ActionForm url="/api/accreditation/visit" fixed={{ cycleId: c.id, action: "edit", kind: "IMPLEMENTATION", id: p.id }} submit="Save" collapsed openLabel="Edit" initial={d} fields={planF} /> {del(p)}</td>}</tr>; })}</tbody></table>}
      {edit && <div className="no-print"><ActionForm url="/api/accreditation/visit" fixed={{ cycleId: c.id, action: "add", kind: "IMPLEMENTATION" }} submit="Add" collapsed openLabel="Add plan item" fields={planF} /></div>}
    </div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Compliance with the previous visit</h3>
      {prevCycle ? <>
        <p className="small-note">{prevCycle.title}{prevCycle.visitDate ? ` (${day(prevCycle.visitDate)})` : ""}: every concern, weakness and deficiency, what was done, and its status. This becomes the compliance chapter of the SAR.</p>
        {(() => { const pp = prevFindings.map((f) => ({ f, d: data(f), p: parseFinding(f) })); const live = pp.filter((x) => !x.p.withdrawn); const gone = pp.filter((x) => x.p.withdrawn); return <>
          <p style={{ fontSize: 13.5 }}>{live.length} finding(s) to show: <b style={{ color: "#1F5E36" }}>{live.filter((x) => x.p.outcome === "STRENGTH").length} now strengths</b>, {live.filter((x) => x.p.outcome === "RESOLVED").length} resolved, {live.filter((x) => x.p.outcome === "IMPROVING").length} improving, <b style={{ color: "#B3261E" }}>{live.filter((x) => x.p.outcome === "OPEN").length} not started</b>.</p>
          <table><thead><tr><th>Finding</th><th>Our position</th><th>Action and progress</th><th>Result</th></tr></thead><tbody>{live.map(({ f, d, p }) => <tr key={f.id}>
            <td style={{ fontSize: 12.5 }}><b>{FINDING_TYPES.find((x) => x[0] === d.type)?.[1]}</b> {d.criterion && `(${d.criterion})`} {d.observation}</td>
            <td style={{ fontSize: 12.5 }}>{p.position ? labelOf(POSITIONS, p.position) : "Accept"}{p.position && p.position !== "ACCEPT" ? <div className="small-note">{labelOf(DECISIONS, p.decision)}</div> : null}</td>
            <td style={{ fontSize: 12.5 }}>{d.action || d.response}<div>{bar(p.pct)}{p.pct}%{p.progress.length ? ` · last update ${p.progress.at(-1)?.on}` : ""}</div>{(p.metricBefore || p.metricAfter) && <div className="small-note">{p.metricBefore || "—"} → {p.metricAfter || "—"}</div>}</td>
            <td style={{ color: OUT_COLOUR[p.outcome], fontWeight: 700 }}>{labelOf(OUTCOMES, p.outcome)}{p.outcomeNote && <div className="small-note" style={{ fontWeight: 400 }}>{p.outcomeNote}</div>}</td></tr>)}</tbody></table>
          {gone.length > 0 && <p className="small-note">Withdrawn after our rebuttal, no action needed: {gone.map(({ d }) => `${d.criterion ? `${d.criterion}: ` : ""}${(d.observation || "").slice(0, 80)}`).join(" · ")}</p>}
        </>; })()}
        {!prevFindings.length && <p className="small-note">No findings were recorded for the previous visit.</p>}
        <p className="small-note">Update these on <Link href={`/accreditation/visit/${prevCycle.id}`}>the previous visit&apos;s page</Link>.</p></> : <p className="small-note">This is the program&apos;s first visit recorded in the system.</p>}
    </div>
  </>);
}