import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import { navForRole } from "../../../../components/reportNav";
import { roleLabel } from "../../../../lib/reportScope";
import { govScope, inScope, assignablePeople } from "../../../../lib/accreditation/governance";
import { BODIES, type BodyKey } from "../../../../lib/accreditation/bodies";
import { vdb, data, FINDING_TYPES, type VItem } from "../../../../lib/accreditation/visit";
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

    <div className="card"><h3 style={{ marginTop: 0 }}>Findings and responses</h3>
      <p className="small-note">Record the panel&apos;s exit-meeting findings and the visit report. Each concern, weakness or deficiency gets a response, a corrective action and an owner; close it when done. These feed the next CQI cycle.</p>
      {findings.map((f) => { const d = data(f); const t = FINDING_TYPES.find((x) => x[0] === d.type)?.[1] || d.type; return (
        <div key={f.id} style={{ borderTop: "1px solid #E3E9F0", padding: "8px 0", fontSize: 13.5 }}>
          <div><b style={{ color: d.type === "STRENGTH" ? "#1F5E36" : d.type === "DEFICIENCY" ? "#B3261E" : d.type === "WEAKNESS" ? "#A35A00" : undefined }}>{t}</b> {d.criterion && <span className="small-note">· {d.criterion}</span>} <span className="small-note">· {f.status === "DONE" ? "closed" : f.status === "IN_PROGRESS" ? "in progress" : "open"}{f.ownerId ? ` · ${names.get(f.ownerId)}` : ""}{f.dueDate ? ` · due ${day(f.dueDate)}` : ""}</span></div>
          <div>{d.observation}</div>
          {d.response && <div><i>Response:</i> {d.response}</div>}{d.action && <div><i>Action:</i> {d.action}</div>}
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
        <table><thead><tr><th>Finding</th><th>Response and action</th><th>Status</th></tr></thead><tbody>{prevFindings.map((f) => { const d = data(f); return <tr key={f.id}><td style={{ fontSize: 12.5 }}><b>{FINDING_TYPES.find((x) => x[0] === d.type)?.[1]}</b> {d.criterion && `(${d.criterion})`} {d.observation}</td><td style={{ fontSize: 12.5 }}>{d.response}{d.action ? ` — ${d.action}` : ""}</td><td style={{ color: f.status === "DONE" ? "#1F5E36" : "#B3261E" }}>{f.status === "DONE" ? "Complied" : f.status === "IN_PROGRESS" ? "In progress" : "Pending"}</td></tr>; })}</tbody></table>
        {!prevFindings.length && <p className="small-note">No findings were recorded for the previous visit.</p>}
        <p className="small-note">Update these on <Link href={`/accreditation/visit/${prevCycle.id}`}>the previous visit&apos;s page</Link>.</p></> : <p className="small-note">This is the program&apos;s first visit recorded in the system.</p>}
    </div>
  </>);
}