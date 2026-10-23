import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import HowCalculated from "../../components/HowCalculated";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { REVIEW_ROLES } from "../../lib/reviewScope";
import { whoIs, staffOf, programsOf, day, parseJ } from "../../lib/registers";
import { cyclesOf, actionsOf, STAGES, stageOf, progressOf, canManageQaa, teamOf, QAA_HINT, type Member } from "../../lib/qaa";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
const iso = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

// HEC QAA self-assessment: each program's cycle from the Program Team to the closed implementation plan.
export default async function QaaPage({ searchParams }: { searchParams: { id?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const w = await whoIs(user as never);
  if (!w) redirect("/dashboard");
  const cycles = await cyclesOf(w.chairmanId);
  const mine = (cycles || []).filter((c) => teamOf(c).some((m) => m.userId === w.id));
  const actions = await actionsOf((cycles || []).map((c) => c.id));
  const owned = actions.filter((a) => a.ownerId === w.id);
  if (!REVIEW_ROLES.includes(user.role) && !w.qec && !mine.length && !owned.length) redirect("/dashboard");
  const manage = canManageQaa(w);
  const staff = await staffOf(w.chairmanId);
  const nameOf = (id: string | null) => staff.find((s) => s.id === id)?.name || "—";
  const sel = (cycles || []).find((c) => c.id === searchParams.id) || null;
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>QAA Self-Assessment</h1>
    <p className="small-note" style={{ marginBottom: 10 }}>HEC&apos;s program self-assessment, step by step: Program Team, self-assessment report, Assessment Team visit and report, implementation plan and its progress. Reminders go to the Program Team before the report is due and to each action&apos;s owner before its date.</p>
    {cycles === null && <div className="err">{QAA_HINT}</div>}{x}</Shell>;

  if (!sel) {
    const programs = await programsOf(w.chairmanId);
    return shell(<>
      {manage && <div className="card"><h3 style={{ marginTop: 0 }}>Start a self-assessment</h3><ActionForm url="/api/qaa" fixed={{ action: "create" }} submit="Start" fields={[{ name: "program", label: "Program", type: "select", options: programs.map((p) => [p, p] as [string, string]) }, { name: "title", label: "Title", placeholder: `Self-assessment ${new Date().getFullYear()}`, width: 260 }]} /></div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Program</th><th>Cycle</th><th>Stage reached</th><th>Implementation</th><th>SAR due</th></tr></thead>
          <tbody>{(cycles || []).map((c) => { const st = stageOf(c); const as = actions.filter((a) => a.cycleId === c.id); return (
            <tr key={c.id}><td><a href={`?id=${c.id}`}><b>{c.program}</b></a></td><td>{c.title}</td><td>{st >= STAGES.length ? <b style={{ color: "#1E6B3A" }}>Closed</b> : `${st} of ${STAGES.length}: next — ${STAGES[st].label}`}</td><td>{as.length ? `${progressOf(as)}% (${as.filter((a) => a.status === "DONE").length}/${as.length} actions done)` : "—"}</td><td style={{ color: c.sarDueAt && !c.sarSubmittedAt && new Date(c.sarDueAt) < new Date() ? "#B3261E" : undefined }}>{day(c.sarDueAt)}</td></tr>); })}
            {(cycles || []).length === 0 && <tr><td colSpan={5}>No self-assessment started yet.</td></tr>}</tbody>
        </table>
      </div>
      {owned.length > 0 && <div className="card"><h3 style={{ marginTop: 0 }}>Actions you own</h3>{owned.map((a) => <div key={a.id} style={{ fontSize: 13, margin: "4px 0" }}><a href={`?id=${a.cycleId}`}>{a.action}</a> — {a.status === "DONE" ? "done" : `${a.progressPct}%, due ${day(a.dueDate)}`}</div>)}</div>}
    </>);
  }

  const as = actions.filter((a) => a.cycleId === sel.id);
  const st = stageOf(sel);
  const pt = teamOf(sel), at = parseJ<Member[]>(sel.assessmentTeamJson, []), docs = parseJ<{ label: string; url: string; at: string }[]>(sel.documentsJson, []);
  const prog = progressOf(as);
  return shell(<>
    <p className="no-print" style={{ margin: "0 0 8px" }}><a href="/qaa">← All self-assessments</a></p>
    <div className="card">
      <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>{sel.program} — {sel.title}</h2>
      <ol style={{ display: "flex", flexWrap: "wrap", gap: 6, listStyle: "none", padding: 0, margin: "10px 0" }}>
        {STAGES.map((s, i) => <li key={s.key} title={s.what} style={{ padding: "6px 10px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, background: i < st ? "#1E6B3A" : i === st ? "#9A3412" : "#EFE7E9", color: i <= st ? "#fff" : "#5C5356" }}>{i + 1}. {s.label}{sel[s.key] ? ` · ${day(sel[s.key] as Date)}` : ""}</li>)}
      </ol>
      <p className="small-note" style={{ margin: 0 }}>{st < STAGES.length ? `Next: ${STAGES[st].what}` : "Every action is done and the cycle is closed."}</p>
      {manage && <div style={{ marginTop: 8 }}><ActionForm url="/api/qaa" fixed={{ action: "dates", id: sel.id }} submit="Save dates" collapsed openLabel="Record dates" initial={Object.fromEntries([...STAGES.map((s) => [s.key, iso(sel[s.key] as Date | null)]), ["sarDueAt", iso(sel.sarDueAt)]])} fields={[{ name: "sarDueAt", label: "SAR due", type: "date" }, ...STAGES.map((s) => ({ name: s.key as string, label: s.label, type: "date" as const }))]} /></div>}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 12 }}>
      <div className="card" style={{ margin: 0 }}><h3 style={{ marginTop: 0 }}>Program Team</h3>
        {pt.map((m, i) => <div key={i} style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>{m.name} <span className="small-note">{m.role}</span>{manage && <ActionButton url="/api/qaa" body={{ action: "unmember", id: sel.id, team: "PT", index: i }} label="Remove" className="act" />}</div>)}
        {!pt.length && <p className="small-note">Nobody yet.</p>}
        {manage && <ActionForm url="/api/qaa" fixed={{ action: "member", id: sel.id, team: "PT" }} submit="Add" collapsed openLabel="Add a member" fields={[{ name: "userId", label: "Member", type: "select", options: staff.map((s) => [s.id, s.name] as [string, string]) }, { name: "role", label: "Role", placeholder: "Convener / Member", width: 140 }]} />}
      </div>
      <div className="card" style={{ margin: 0 }}><h3 style={{ marginTop: 0 }}>Assessment Team</h3>
        {at.map((m, i) => <div key={i} style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>{m.name} <span className="small-note">{[m.role, m.organisation].filter(Boolean).join(", ")}</span>{manage && <ActionButton url="/api/qaa" body={{ action: "unmember", id: sel.id, team: "AT", index: i }} label="Remove" className="act" />}</div>)}
        {!at.length && <p className="small-note">Nobody yet.</p>}
        {manage && <ActionForm url="/api/qaa" fixed={{ action: "member", id: sel.id, team: "AT" }} submit="Add" collapsed openLabel="Add a member" fields={[{ name: "name", label: "Name", width: 170 }, { name: "role", label: "Role", placeholder: "Chair / Member / External", width: 140 }, { name: "organisation", label: "Organisation", width: 170 }]} />}
      </div>
      <div className="card" style={{ margin: 0 }}><h3 style={{ marginTop: 0 }}>Documents</h3>
        {docs.map((d, i) => <div key={i} style={{ fontSize: 13 }}><a href={d.url} target="_blank" rel="noreferrer">{d.label}</a> <span className="small-note">{day(d.at)}</span></div>)}
        {!docs.length && <p className="small-note">The SAR, the Assessment Team report and the notifications go here (links to the files or OBEHUB pages).</p>}
        {manage && <ActionForm url="/api/qaa" fixed={{ action: "document", id: sel.id }} submit="Add" collapsed openLabel="Add a document" fields={[{ name: "label", label: "Name", width: 170 }, { name: "url", label: "Link", placeholder: "https://… or /accreditation/sar", width: 220 }]} />}
      </div>
    </div>
    <div className="card"><h3 style={{ marginTop: 0 }}>Assessment Team&apos;s summary</h3>
      <p style={{ whiteSpace: "pre-wrap", fontSize: 13.5 }}>{sel.atSummary || <span className="small-note">Not written yet.</span>}</p>
      {manage && <ActionForm url="/api/qaa" fixed={{ action: "summary", id: sel.id }} submit="Save" collapsed openLabel="Write the summary" initial={{ atSummary: sel.atSummary || "" }} fields={[{ name: "atSummary", label: "Summary of findings and recommendations", type: "textarea", full: true }]} />}
    </div>
    <div className="card" style={{ overflowX: "auto" }}>
      <h3 style={{ marginTop: 0 }}>Implementation plan — {prog}% done</h3>
      <div style={{ height: 10, background: "#EFE7E9", borderRadius: 6, overflow: "hidden", marginBottom: 10 }}><div style={{ width: `${prog}%`, height: "100%", background: prog === 100 ? "#1E6B3A" : "#9A3412" }} /></div>
      <HowCalculated shows="Progress = the average of the actions' progress (a done action counts 100%).">{null}</HowCalculated>
      <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Finding</th><th>Action</th><th>Owner</th><th>Due</th><th>Progress</th><th></th></tr></thead>
        <tbody>{as.map((a) => { const late = a.status !== "DONE" && a.dueDate && new Date(a.dueDate) < new Date(); return (
          <tr key={a.id}><td>{a.finding}</td><td>{a.action}{a.progressNote && <div className="small-note" style={{ margin: 0 }}>{a.progressNote}</div>}</td><td>{nameOf(a.ownerId)}</td><td style={{ color: late ? "#B3261E" : undefined, fontWeight: late ? 700 : 400 }}>{day(a.dueDate)}</td><td style={{ fontWeight: 700, color: a.status === "DONE" ? "#1E6B3A" : "#9A3412" }}>{a.status === "DONE" ? `✓ done ${day(a.doneAt)}` : `${a.progressPct}%`}</td>
            <td>{a.status !== "DONE" && (manage || a.ownerId === w.id) && <ActionForm url="/api/qaa" fixed={{ action: "progress", actionId: a.id }} submit="Save" collapsed openLabel="Update" initial={{ progressPct: a.progressPct, progressNote: a.progressNote || "", done: false }} fields={[{ name: "progressPct", label: "Progress %", type: "number", width: 70 }, { name: "progressNote", label: "What was done", width: 220 }, { name: "done", label: "Done", type: "checkbox" }]} />}</td></tr>); })}
          {!as.length && <tr><td colSpan={6}>No action yet — add one for each finding of the Assessment Team.</td></tr>}</tbody>
      </table>
      {manage && <ActionForm url="/api/qaa" fixed={{ action: "addAction", id: sel.id }} submit="Add" collapsed openLabel="Add an action" fields={[{ name: "finding", label: "Finding", width: 240 }, { name: "actionText", label: "Action", width: 240 }, { name: "ownerId", label: "Owner", type: "select", options: staff.map((s) => [s.id, s.name] as [string, string]) }, { name: "dueDate", label: "Due", type: "date" }]} />}
    </div>
  </>);
}
