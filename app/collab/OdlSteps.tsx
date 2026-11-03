import Link from "next/link";
import { prisma } from "../../lib/db";
import { dataOf, type Prog, type Step } from "../../lib/collab";
import { ODL_ROLES, programsOf, type Auto } from "../../lib/odlWizard";
import { READINESS, lmsCoverage, TOOLS } from "../../lib/teachingToolsCore";
import { runningOf } from "../../lib/teachingTools";
import { FacultyPick, PerCh, ProgramPick, ReadinessRow, RolePick, SendBos } from "./OdlForms";

// The 8-step ODL wizard's own widgets (queue item 14 A). Every rule is shown with its clause in the HEC ODL policy.
const chip = (c: string) => <span style={{ fontSize: 11, padding: "0 6px", borderRadius: 8, background: "#EEF3FA", color: "#1B5FAA", whiteSpace: "nowrap" }}>ODL {c}</span>;
const mark = (ok: boolean) => <b style={{ color: ok ? "#1E6B3A" : "#B3261E" }}>{ok ? "✓" : "✗"}</b>;
const db = prisma as unknown as Record<string, any>;

export default async function OdlSteps({ p, st, staff }: { p: Prog; st: Step; staff: { id: string; name: string }[] }) {
  const d = dataOf(p) as Record<string, any>;
  const a = (d.auto || {}) as Auto;
  const out: JSX.Element[] = [];
  if (st.widgets.includes("odl-auto")) {
    const programs = await programsOf(p.chairmanId);
    const committees = ((await db.cmtCommittee?.findMany({ where: { chairmanId: p.chairmanId, type: { in: ["BOS", "ACADEMIC_COUNCIL"] } }, select: { id: true, name: true, type: true } }).catch(() => [])) || []) as { id: string; name: string; type: string }[];
    const fact = (label: string, clause: string, f?: { ok: boolean; evidence: string }) => <div style={{ margin: "6px 0", fontSize: 13 }}>{mark(!!f?.ok)} {label} {chip(clause)}<div className="small-note" style={{ marginLeft: 18 }}>{f?.evidence || "not checked yet"}</div></div>;
    out.push(<div key="auto" style={{ margin: "8px 0", padding: 10, borderRadius: 8, background: "#F7F9FC" }}>
      <b style={{ fontSize: 13 }}>From OBEHUB&apos;s records</b> <span className="small-note">checked {a.at ? a.at.slice(0, 16).replace("T", " ") : "now"}</span>
      {fact("At least two batches of the same programme completed face-to-face", "2.2", a.twoBatches)}
      <div style={{ marginLeft: 18 }}><ProgramPick id={p.id} value={d.degreeProgram || ""} programs={programs} /></div>
      {fact("Approved by the statutory bodies (Board of Studies and Academic Council)", "2.3", a.statutory)}
      <div style={{ marginLeft: 18 }}><SendBos id={p.id} committees={committees.map((c) => ({ id: c.id, label: `${c.name} (${c.type === "BOS" ? "Board of Studies" : "Academic Council"})` }))} /></div>
      {fact("Full-time, regular faculty designated for ODL", "2.5", a.faculty)}
      <div style={{ marginLeft: 18 }}><FacultyPick id={p.id} chosen={d.odlFaculty || []} staff={staff} /></div>
      <p className="small-note" style={{ margin: "6px 0 0" }}>A condition met from the records is ticked for you; the others below need your evidence.</p>
    </div>);
  }
  if (st.widgets.includes("readiness")) {
    const areas = Array.from(new Set(READINESS.map((q) => q.area)));
    const yes = READINESS.filter((q) => d.readiness?.[q.n]?.yes || a.readiness?.[q.n]?.ok).length;
    out.push(<div key="ready" style={{ marginTop: 8 }}>
      <b style={{ fontSize: 13 }}>HEC Toolkit Part-B: Program Readiness</b> <span className="small-note">{yes} of {READINESS.length} answered Yes</span>
      {areas.map((ar) => <details key={ar} open={READINESS.some((q) => q.area === ar && !(d.readiness?.[q.n]?.yes || a.readiness?.[q.n]?.ok))} style={{ margin: "6px 0" }}><summary style={{ fontSize: 13, fontWeight: 600 }}>{ar}</summary>
        {READINESS.filter((q) => q.area === ar).map((q) => { const au = a.readiness?.[q.n]; return <div key={q.n} style={{ margin: "6px 0 6px 10px", fontSize: 13 }}>
          {q.n}. {q.q} {chip(q.clause)}
          {au && <div className="small-note" style={{ color: au.ok ? "#1E6B3A" : "#8A5A00" }}>{au.ok ? "✓ from OBEHUB:" : "OBEHUB shows:"} {au.evidence}</div>}
          {!au?.ok && <div><ReadinessRow id={p.id} n={q.n} yes={!!d.readiness?.[q.n]?.yes} evidence={d.readiness?.[q.n]?.evidence || ""} /></div>}
        </div>; })}
      </details>)}
    </div>);
  }
  if (st.widgets.includes("roles")) out.push(<div key="roles" style={{ marginTop: 8 }}><b style={{ fontSize: 13 }}>The ODL team</b>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 6 }}>{ODL_ROLES.map(([k, label, cl]) => <div key={k}><RolePick id={p.id} k={k} label={`${label} (${cl})`} value={d.roles?.[k]?.id || ""} staff={staff} /></div>)}</div></div>);
  if (st.widgets.includes("content")) out.push(<div key="content" style={{ marginTop: 10 }}><b style={{ fontSize: 13 }}>Modules per course</b>
    {!Object.keys(a.content || {}).length ? <p className="small-note">Add the ODL courses in the Delivery plan step first.</p> :
    <table className="table" style={{ fontSize: 12.5, marginTop: 4 }}><thead><tr><th>Course</th><th>Lecture modules ready</th><th>SE sign-off</th><th>Instructional Designer</th><th /></tr></thead><tbody>
      {Object.entries(a.content || {}).map(([code, c]) => <tr key={code}><td>{code}</td><td>{c.courseId ? `${c.modules} of ${c.lectures}` : "not in OBEHUB"}</td><td>{c.seAt ? `✓ ${c.seAt.slice(0, 10)}` : "—"}</td><td>{c.idAt ? `✓ ${c.idAt.slice(0, 10)}` : "—"}</td><td>{c.courseId && <Link href={`/odl-content/${c.courseId}?prog=${p.id}`}>Open the content builder</Link>}</td></tr>)}
    </tbody></table>}
    <p className="small-note">A module is ready when it has a video or reading, and self-assessment questions. Editing a module after sign-off asks for a new review.</p></div>);
  if (st.widgets.includes("delivery")) out.push(<div key="delivery" style={{ marginTop: 12 }}><b style={{ fontSize: 13 }}>Credit-hour check per course</b> <span className="small-note">recorded minutes from the content modules (YouTube lengths when connected), live share from each lecture&apos;s mode, discussion hours from Moodle forums, assignments and quizzes from the plan</span>
    <div style={{ margin: "4px 0" }}><PerCh id={p.id} value={!!d.activitiesPerCh} /></div>
    {Object.entries(a.delivery || {}).map(([code, x]) => <div key={code} style={{ marginTop: 6 }}><b style={{ fontSize: 13 }}>{code}</b> {x.courseId && <Link className="small-note" href={`/course-tools/${x.courseId}`}>teaching tools for this course</Link>}
      {x.lines.length ? <table className="table" style={{ fontSize: 12.5 }}><tbody>{x.lines.map((l) => <tr key={l.rule}><td>{mark(l.ok)}</td><td>{l.rule} {chip(l.clause)}{l.note && <div className="small-note">{l.note}</div>}</td><td>need {l.need}</td><td>have {l.have}</td></tr>)}</tbody></table> : <div className="small-note">{x.failing.join("; ")}</div>}</div>)}</div>);
  if (st.widgets.includes("lms")) {
    const cov = lmsCoverage((a.lms?.tools || []) as never);
    out.push(<div key="lms" style={{ marginTop: 10 }}><b style={{ fontSize: 13 }}>LMS features {chip("10.ii")}</b> <span className="small-note">connected: {(a.lms?.tools || []).map((t) => TOOLS[t as keyof typeof TOOLS]?.label || t).join(", ") || "none"} · <Link href="/teaching-tools">Teaching tools</Link></span>
      <div style={{ overflowX: "auto" }}><table className="table" style={{ fontSize: 12.5 }}><thead><tr><th /><th>Feature</th><th>In OBEHUB</th><th>Moodle</th><th>Classroom</th><th>Teams</th></tr></thead><tbody>
        {cov.map((f) => <tr key={f.n}><td>{mark(f.ok)}</td><td>{f.n}. {f.name}</td><td>{f.obehub ? <Link href={f.obehub}>yes</Link> : "—"}</td>{(["MOODLE", "GOOGLE", "MICROSOFT"] as const).map((t) => <td key={t} style={{ fontWeight: f.by.includes(t) ? 700 : 400, color: f[t] === "no" ? "#9AA3AD" : undefined }}>{f[t]}</td>)}</tr>)}
      </tbody></table></div>
      <div style={{ fontSize: 13, marginTop: 6 }}>Accounts {chip("10.i.b")}: {a.lms?.students ?? 0} student enrolments in the ODL courses; {a.lms?.coursesLinked ?? 0} course–tool links for {a.lms?.courses ?? 0} courses. Access to each course is limited to its teacher, its students and the HOD {chip("10.i.e")} — OBEHUB enforces this by role.</div>
      <div style={{ marginTop: 6 }}><RolePick id={p.id} k="lmsAdmin" label="LMS administrator (10.i.c)" value={d.roles?.lmsAdmin?.id || ""} staff={staff} /></div></div>);
  }
  if (st.widgets.includes("running")) {
    const ids = Object.entries(a.delivery || {}).filter(([, x]) => x.courseId) as [string, { courseId: string }][];
    const runs = await Promise.all(ids.map(async ([code, x]) => ({ code, courseId: x.courseId, r: await runningOf(x.courseId) })));
    out.push(<div key="running" style={{ marginTop: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}><b style={{ fontSize: 13 }}>This term, week by week</b> <a className="btn btn-sm btn-secondary" href={`/api/odl-evidence?id=${p.id}`}>⬇ Evidence file (PDF)</a></div>
      {!runs.length && <p className="small-note">Add the ODL courses in the Delivery plan step first.</p>}
      {runs.map(({ code, courseId, r }) => <div key={code} style={{ marginTop: 8 }}><b style={{ fontSize: 13 }}>{code}</b> <span className="small-note">{r.enrolled} enrolled · <Link href={`/course-tools/${courseId}`}>live sessions and tools</Link></span>
        {!r.weeks.length ? <div className="small-note">No live sessions or discussion activity yet.</div> :
        <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Week</th><th>Live: held / planned</th><th>Recordings</th><th>Attendance</th><th>Forum posts (teacher)</th><th>Discussion h</th><th>Late</th></tr></thead><tbody>
          {r.weeks.map((w) => <tr key={w.week}><td>{w.week}</td><td>{w.held} / {w.planned}{w.notHeld ? ` (${w.notHeld} not held)` : ""}</td><td>{w.recordings}</td><td>{w.attendancePct == null ? "—" : `${w.attendancePct}%`}</td><td>{w.posts} ({w.teacherPosts})</td><td>{w.discussionH || "—"}</td><td style={{ color: w.late.length ? "#B3261E" : undefined }}>{w.late.join("; ") || "—"}</td></tr>)}
        </tbody></table>}</div>)}
    </div>);
  }
  return <>{out}</>;
}
