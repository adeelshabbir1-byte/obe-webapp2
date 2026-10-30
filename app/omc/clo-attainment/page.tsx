import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../lib/reportScope";
import { ActionButton, ActionForm } from "../../../components/fyp/FypClient";
import { LEVEL_LABEL, METHODS, type Method } from "../../../lib/cloMethodCore";
import { CLO_HINT, compareCourse, faultyQueue, methodSettings, openRequests, typesOf } from "../../../lib/cloMethods";
import { changeLog, programScope, warnSettingsFor, WARN_FIELDS } from "../../../lib/itemWarnings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "CLO attainment method" };
const VIEW = ["OMC", "CHAIRMAN", "HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR", "PROGRAM_LEAD"];
const methodOpts = (Object.keys(METHODS) as Method[]).map((m) => [m, `${METHODS[m].n}. ${METHODS[m].label}`] as [string, string]);
const WARN_LABEL: Record<string, string> = { passPct: "Pass mark for the warning %", amberPct: "Amber when more than % below", redPct: "Red when more than % below", respondDays: "Days to respond", escalateDays: "Days per escalation step", marksDays: "Marks due (working days)", remind1: "First reminder (working day)", remind2: "Second reminder (working day)", redDay: "Overdue from working day", escalateDay: "HOD from working day", lateMode: "Late entry" };

// OMC: how CLO attainment is worked out (institute default, per program), course requests for their own method or lab
// share, faulty items, the assessment types list, and early-warning / marks-deadline defaults. Program Leads set their
// program's warning and deadline settings here (final, no approval).
export default async function CloAttainmentAdmin({ searchParams }: { searchParams: { tab?: string; program?: string; course?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!VIEW.includes(user.role)) redirect("/dashboard");
  const chairmanId = await chairmanIdFor(user);
  const omc = ["OMC", "CHAIRMAN"].includes(user.role);
  const pl = ["PROGRAM_COORDINATOR", "PROGRAM_LEAD"].includes(user.role);
  const tabs: [string, string][] = [...(omc || !pl ? [["method", "Method"], ["requests", "Course requests"], ["faulty", "Faulty items"], ["types", "Assessment types"]] as [string, string][] : []), ["warnings", "Warnings & marks deadline"], ["compare", "Compare methods"]];
  const tab = tabs.some(([k]) => k === searchParams.tab) ? searchParams.tab! : tabs[0][0];
  const leads = (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } })).map((u) => u.id);
  const myBatches = await prisma.batch.findMany({ where: { coordinatorId: pl ? user.id : { in: leads.concat("none") } }, select: { degreeProgram: true } });
  const programs = Array.from(new Set(myBatches.map((b) => b.degreeProgram))).sort();
  let missing = false;
  const ms = await methodSettings(chairmanId, searchParams.program || null).catch(() => { missing = true; return null; });
  const T = (k: string, l: string) => <Link key={k} href={`/omc/clo-attainment?tab=${k}`} className={`btn btn-sm ${tab === k ? "btn-brass" : "btn-secondary"}`}>{l}</Link>;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>CLO attainment</h1>
      <p className="small-note" style={{ marginBottom: 8 }}>How a student clears a CLO, and when the class achieves it. The method in force when a term&apos;s results are approved is saved with that term; changing it later never changes past reports unless you use &quot;Recalculate past terms&quot;. <Link href="/omc/assessment-rules">Assessment rules (limits) →</Link></p>
      {missing && <div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{CLO_HINT}</p></div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>{tabs.map(([k, l]) => T(k, l))}</div>

      {tab === "method" && ms && (
        <>
          <div className="card">
            <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>The four methods</h2>
            {(Object.keys(METHODS) as Method[]).map((m) => <p key={m} style={{ margin: "3px 0", fontSize: 13 }}><b>{METHODS[m].n}. {METHODS[m].label}{m === "GRADE" ? " (default)" : ""}</b> — {METHODS[m].text}</p>)}
            <p className="small-note" style={{ margin: "6px 0 0" }}>&quot;Item&quot; = a quiz, assignment, lab, project, or one mid / final question mapped to the CLO. A blank mark is absent (left out); 0 counts. A student whose items for a CLO are all blank is &quot;Not assessed&quot; — shown apart, not counted in the class target.</p>
          </div>
          <form method="get" className="card" style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <input type="hidden" name="tab" value="method" />
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Settings for<select name="program" defaultValue={searchParams.program || ""}><option value="">The institute (default)</option>{programs.map((p) => <option key={p} value={p}>{p}{ms && searchParams.program === p && ms.program ? " (own)" : ""}</option>)}</select></label>
            <button className="btn btn-secondary btn-sm">Show</button>
          </form>
          {(() => {
            const s = searchParams.program ? ms.effective : ms.institute;
            return (
              <div className="card">
                <p style={{ margin: "0 0 6px", fontSize: 13 }}>{searchParams.program ? (ms.program ? <>This program has its own settings (institute: {METHODS[ms.institute.method].label}).</> : <>Uses the institute&apos;s settings — saving here gives {searchParams.program} its own.</>) : "The institute's default for every program without its own."} Now: <b>{METHODS[s.method].label}</b> · pass {s.passPct}% · {s.method === "ITEMS" ? `clear ≥ ${s.itemsPct}% of items · ` : ""}class target {s.targetPct}% · levels Excellent ≥ {s.levels.excellent} · Good {s.levels.good}–{s.levels.excellent - 1} · Satisfactory {s.levels.satisfactory}–{s.levels.good - 1} · Not met &lt; {s.levels.satisfactory} · faulty flag below {s.faultyAvgPct}% · lab share {s.labSharePct}%{s.labPassOn ? ` · lab part ≥ ${s.labPassPct}% to pass` : ""}</p>
                {omc ? (
                  <ActionForm url="/api/clo-method" fixed={{ action: "settings", program: searchParams.program || "" }} submit="Save settings" done="Saved — used from now on (locked terms keep theirs)." collapsed openLabel="Change settings"
                    initial={{ method: s.method, passPct: s.passPct, itemsPct: s.itemsPct, targetPct: s.targetPct, excellent: s.levels.excellent, good: s.levels.good, satisfactory: s.levels.satisfactory, faultyAvgPct: s.faultyAvgPct, labSharePct: s.labSharePct, labPassOn: s.labPassOn, labPassPct: s.labPassPct }}
                    fields={[{ name: "method", label: "Method", type: "select", options: methodOpts, width: 240 }, { name: "passPct", label: "Pass mark per student %", type: "number", width: 110 }, { name: "itemsPct", label: "Method 2: clear ≥ X% of items", type: "number", width: 110 }, { name: "targetPct", label: "Class target: % of students", type: "number", width: 110 },
                      { name: "excellent", label: "Excellent ≥", type: "number", width: 80 }, { name: "good", label: "Good ≥", type: "number", width: 80 }, { name: "satisfactory", label: "Satisfactory ≥", type: "number", width: 90 }, { name: "faultyAvgPct", label: "Flag item when class average below %", type: "number", width: 110 },
                      { name: "labSharePct", label: "Default lab share of the grade %", type: "number", width: 110 }, { name: "labPassOn", label: "Separate lab pass rule", type: "checkbox" }, { name: "labPassPct", label: "…at least % in the lab part", type: "number", width: 100 }]} />
                ) : <p className="small-note" style={{ margin: 0 }}>The OMC changes these.</p>}
              </div>
            );
          })()}
          {omc && (
            <div className="card">
              <b>Recalculate past terms</b>
              <p className="small-note" style={{ margin: "4px 0" }}>Works out every locked term again with today&apos;s settings. Both versions are kept; reports show the recalculated one.</p>
              <ActionButton url="/api/clo-method" body={{ action: "recalc", program: searchParams.program || null }} label={`Recalculate past terms${searchParams.program ? ` (${searchParams.program})` : ""}`} className="btn btn-secondary btn-sm" confirmText="Recalculate past terms with today's settings? The original results are kept beside the new ones." showMessage />
            </div>
          )}
        </>
      )}

      {tab === "requests" && (
        <div className="card">
          <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>A course&apos;s own method or lab share</h2>
          <p className="small-note" style={{ margin: "0 0 6px" }}>Two OMC approvals (or the course&apos;s panel this semester) decide. Asked for from the course&apos;s CLO page with a reason.</p>
          {(await openRequests(chairmanId).catch(() => [])).map((r) => (
            <div key={r.id} style={{ borderTop: "1px solid #eee", padding: "6px 0", fontSize: 13 }}>
              <b>{r.course}</b> — {r.kind === "METHOD" ? `method: ${METHODS[(r.value.method as Method) || "GRADE"].label}` : `lab share: ${r.value.pct}%`} · <span className="small-note">{r.reason} · {r.votes}</span>
              {omc && <span style={{ display: "inline-flex", gap: 6, marginLeft: 8 }}><ActionButton url="/api/clo-method" body={{ action: "vote", id: r.id, approve: true }} label="Approve" showMessage /><ActionButton url="/api/clo-method" body={{ action: "vote", id: r.id, approve: false }} label="Reject" className="btn btn-secondary btn-sm" askNote="Reason for rejecting" noteRequired showMessage /></span>}
            </div>
          ))}
        </div>
      )}

      {tab === "faulty" && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>Items flagged by class average</h2>
          <p className="small-note" style={{ margin: "0 0 6px" }}>Absent students are left out of the average. Marking an item faulty leaves it out of CLO attainment (method 2: out of the item count; methods 3 and 4: the other weights re-normalised). It still counts in the grade unless you also leave it out of the grade — then the grade is worked out on the remaining marks and an approved result goes back for approval. Decisions are logged and show in the course&apos;s CLO report and course file.</p>
          <table className="table" style={{ width: "100%", fontSize: 13 }}>
            <thead><tr><th>Course</th><th>Item</th><th>Class average</th><th>Status</th><th></th></tr></thead>
            <tbody>{(await faultyQueue(chairmanId).catch(() => [])).map((f) => (
              <tr key={f.instrumentId}>
                <td><Link href={`/courses/${f.courseId}/clo-attainment`}>{f.course}</Link></td><td>{f.label}</td><td><b style={{ color: "#B3261E" }}>{f.avg}%</b> <span className="small-note">({f.students} sat)</span></td>
                <td className="small-note">{f.faulty ? `Faulty — ${f.reason}${f.noGrade ? " · out of the grade" : ""}` : "Flagged"}</td>
                <td>{omc && (f.faulty ? <ActionButton url="/api/clo-method" body={{ action: "faulty", instrumentId: f.instrumentId, faulty: false, reason: "cleared" }} label="Clear" className="btn btn-secondary btn-sm" /> : (
                  <ActionForm url="/api/clo-method" fixed={{ action: "faulty", instrumentId: f.instrumentId, faulty: true }} submit="Mark faulty" collapsed openLabel="Mark faulty…" initial={{ noGrade: false }} fields={[{ name: "reason", label: "Why", type: "text", width: 220 }, { name: "noGrade", label: "Also exclude from the grade", type: "checkbox" }]} />))}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab === "types" && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>Assessment types (theory and lab)</h2>
          <p className="small-note" style={{ margin: "0 0 6px" }}>Every graded item belongs to a type; the type sets its defaults, which the Subject Expert can change per item within your limits. &quot;Not graded&quot; types (surveys) are indirect evidence for GA reports only and never count in CLO marks. CCP / CEP is tracked per program for NCEAC / PEC.</p>
          {omc && <ActionForm url="/api/clo-method" fixed={{ action: "type" }} submit="Add type" collapsed openLabel="+ Add a type" initial={{ part: "BOTH", marking: "MARKS", graded: true }} fields={[{ name: "name", label: "Name", type: "text", width: 200 }, { name: "family", label: "Group", type: "text", width: 150 }, { name: "part", label: "Part", type: "select", options: [["THEORY", "Theory"], ["LAB", "Lab"], ["BOTH", "Both"]] }, { name: "marking", label: "Marking", type: "select", options: [["MARKS", "Marks"], ["RUBRIC", "Rubric"], ["AUTO", "Auto-graded"], ["PASS_FAIL", "Pass / fail"]] }, { name: "group", label: "Group work", type: "checkbox" }, { name: "defaultNotForClo", label: "Not for CLO by default", type: "checkbox" }, { name: "graded", label: "Graded", type: "checkbox" }, { name: "evidence", label: "Evidence expected", type: "text", width: 140 }]} />}
          <table className="table" style={{ width: "100%", fontSize: 12 }}>
            <thead><tr><th>Type</th><th>Group</th><th>Part</th><th>Marking</th><th>Individual / group</th><th>CLO default</th><th>Evidence</th><th></th></tr></thead>
            <tbody>{(await typesOf(chairmanId).catch(() => [])).map((t) => (
              <tr key={t.id} style={{ opacity: t.retired ? 0.5 : 1 }}>
                <td>{t.name}{t.ccp ? " · CCP/CEP" : ""}{t.retired ? " (retired)" : ""}</td><td>{t.family}</td><td>{t.part === "BOTH" ? "Theory / Lab" : t.part === "LAB" ? "Lab" : "Theory"}</td><td>{t.marking.replace("_", "/").toLowerCase()}</td><td>{t.group ? "group (+ peer)" : "individual"}</td>
                <td>{!t.graded ? "never (not graded)" : t.defaultNotForClo ? "Not for CLO" : "mapped"}</td><td>{t.evidence}</td>
                <td>{omc && <ActionButton url="/api/clo-method" body={{ action: "type", key: t.key, name: t.name, family: t.family, part: t.part, marking: t.marking, group: t.group, defaultNotForClo: t.defaultNotForClo, evidence: t.evidence, graded: t.graded, ccp: t.ccp, retired: !t.retired }} label={t.retired ? "Restore" : "Retire"} className="btn btn-secondary btn-sm" />}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab === "warnings" && await (async () => {
        const program = pl ? (searchParams.program && programs.includes(searchParams.program) ? searchParams.program : programs[0]) : null;
        const ws = await warnSettingsFor(chairmanId, user.departmentId, pl ? user.id : null, program);
        const values = (s: Record<string, unknown>) => Object.fromEntries(WARN_FIELDS.map((k) => [k, s[k]]));
        const fields = WARN_FIELDS.map((k) => (k === "lateMode" ? { name: k, label: WARN_LABEL[k], type: "select" as const, options: [["STAMP", "Allowed, stamped late"], ["LOCK", "Locked until the HOD unlocks"]] as [string, string][] } : { name: k, label: WARN_LABEL[k], type: "number" as const, width: 110 }));
        const log = await changeLog(chairmanId, "WARN", 20);
        return (
          <>
            <div className="card">
              <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>Early warning and marks within one week</h2>
              <p className="small-note" style={{ margin: "0 0 6px" }}>Each time an item&apos;s marks are entered, its topic and CLO are checked: <b>red</b> when more than {ws.effective.redPct}% of those who sat it are below {ws.effective.passPct}%, <b>amber</b> above {ws.effective.amberPct}%. A lab item alerts the theory teacher of the linked topic (lab engineer and SE copied). The teacher answers within {ws.effective.respondDays} days with a CQI action, else it goes to the SE, then the Program Lead / HOD. Marks are due on working day {ws.effective.marksDays} after the item (weekends and holidays skipped): reminders on days {ws.effective.remind1} and {ws.effective.remind2}, red from day {ws.effective.redDay}, the HOD from day {ws.effective.escalateDay}. Changes apply to items not yet due or not yet warned.</p>
              {omc && <ActionForm url="/api/clo-method" fixed={{ action: "warnDept", departmentId: user.departmentId || null }} submit="Save department default" done="Saved." collapsed openLabel="Change department default" initial={values(ws.dept)} fields={fields} />}
            </div>
            {pl && program && (
              <div className="card">
                <form method="get" style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 6 }}><input type="hidden" name="tab" value="warnings" /><label style={{ fontSize: 12, display: "grid", gap: 3 }}>Program<select name="program" defaultValue={program}>{programs.map((p) => <option key={p}>{p}</option>)}</select></label><button className="btn btn-secondary btn-sm">Show</button></form>
                <table className="table" style={{ fontSize: 12 }}><thead><tr><th>Setting</th><th>Department default</th><th>Your program</th></tr></thead>
                  <tbody>{WARN_FIELDS.map((k) => <tr key={k}><td>{WARN_LABEL[k]}</td><td>{String(ws.dept[k])}</td><td>{ws.program && ws.program[k] !== undefined ? <b>{String(ws.program[k])}</b> : <span className="small-note">default</span>}</td></tr>)}</tbody></table>
                <ActionForm url="/api/clo-method" fixed={{ action: "warnProgram", program }} submit="Save for my program" done="Saved — your setting is final." collapsed openLabel="Set for my program" initial={values(ws.effective)} fields={fields} />
                {ws.program && <ActionButton url="/api/clo-method" body={{ action: "warnProgram", program, reset: true }} label="Use department default" className="btn btn-secondary btn-sm" confirmText="Go back to the department default for every setting?" />}
                <p className="small-note">Scope: {programScope(user.id, program).split("|")[1]}. Your setting overrides the department default without approval.</p>
              </div>
            )}
            <div className="card">
              <b>Change log</b>
              {log.length === 0 && <p className="small-note" style={{ margin: 0 }}>No changes yet.</p>}
              {log.map((l, i) => <p key={i} className="small-note" style={{ margin: "2px 0" }}>{new Date(l.at).toLocaleString("en-GB")} · {l.by} · {l.scope.startsWith("PROGRAM:") ? `program ${l.scope.split("|")[1]}` : "department default"} · {WARN_LABEL[l.field] || l.field}: {l.oldValue} → {l.newValue}</p>)}
            </div>
          </>
        );
      })()}

      {tab === "compare" && await (async () => {
        const courses = await prisma.course.findMany({ where: { coordinatorId: pl ? user.id : { in: leads.concat("none") }, studentMarks: { some: {} } }, select: { id: true, code: true, title: true, offeredTermName: true, offeredTermYear: true, batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: [{ offeredTermYear: "desc" }, { code: "asc" }], take: 300 });
        const pick = courses.find((c) => c.id === searchParams.course) || null;
        const rows = pick ? await compareCourse(pick.id) : [];
        return (
          <>
            <form method="get" className="card" style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <input type="hidden" name="tab" value="compare" />
              <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Course (last terms with marks)<select name="course" defaultValue={pick?.id || ""} style={{ minWidth: 300 }}><option value="">— choose —</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} {c.title} · {c.batch?.degreeProgram} {c.batch?.batchName} · {c.offeredTermName} {c.offeredTermYear}</option>)}</select></label>
              <button className="btn btn-brass btn-sm">Compare</button>
            </form>
            {pick && (
              <div className="card" style={{ overflowX: "auto" }}>
                <table className="table" style={{ width: "100%", fontSize: 13 }}>
                  <thead><tr><th>CLO</th>{(Object.keys(METHODS) as Method[]).map((m) => <th key={m}>{METHODS[m].n}. {METHODS[m].label}</th>)}</tr></thead>
                  <tbody>{rows.map((r) => (
                    <tr key={r.clo.id}><td style={{ whiteSpace: "nowrap" }}><b>{r.clo.code}</b><div className="small-note">{r.clo.part === "LAB" ? "lab" : "theory"}</div></td>
                      {r.methods.map((m) => m.assessed === 0 ? <td key={m.method} className="small-note">{m.method === "WEIGHTS" ? "No method-3 weights entered yet (the Subject Expert enters them in the plan)." : "No marks yet."}</td> : <td key={m.method}><b style={{ color: m.achieved ? "#2F7A4D" : "#B3261E" }}>{m.clearedPct}%</b> cleared <span className="small-note">({m.cleared} of {m.assessed}{m.notAssessed ? `, ${m.notAssessed} not assessed` : ""})</span><div className="small-note">{(Object.keys(m.levels) as (keyof typeof LEVEL_LABEL)[]).map((k) => `${LEVEL_LABEL[k]} ${m.levels[k]}`).join(" · ")}</div></td>)}</tr>
                  ))}</tbody>
                </table>
                <p className="small-note">Green = the class achieved the CLO (cleared ≥ the target).</p>
              </div>
            )}
          </>
        );
      })()}
    </Shell>
  );
}
