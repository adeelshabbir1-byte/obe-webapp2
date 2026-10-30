import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import { navForRole } from "../../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../../lib/reportScope";
import { ActionForm } from "../../../../components/fyp/FypClient";
import CloMappingEditor from "../../../../components/CloMappingEditor";
import { LEVEL_LABEL, METHODS, type Method } from "../../../../lib/cloMethodCore";
import { CLO_HINT, courseCloResults, courseItems, courseSettings, labSync, limitsFor, planCheck, termLocks, typesOf, type ItemMapRow } from "../../../../lib/cloMethods";
import { ACTIONS, marksBoard, warningsOf } from "../../../../lib/itemWarnings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const methodOpts = (Object.keys(METHODS) as Method[]).map((m) => [m, `${METHODS[m].n}. ${METHODS[m].label}`] as [string, string]);

// One course's CLO attainment: the method in use, results per CLO (cleared vs target, levels, Not assessed, items left
// out with reasons), item mapping, early warnings with CQI actions, marks deadlines, the theory–lab sync, and the
// locked terms. For the course's teacher, Subject Expert, Program Lead, lab engineer, and the OMC / HOD.
export default async function CourseCloAttainment({ params, searchParams }: { params: { courseId: string }; searchParams: { source?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const c = await prisma.course.findUnique({ where: { id: params.courseId }, select: { id: true, code: true, title: true, courseType: true, instructorId: true, subjectExpertId: true, coordinatorId: true, labEngineerId: true, offeredTermName: true, offeredTermYear: true, coordinator: { select: { managedById: true } }, batch: { select: { degreeProgram: true, batchName: true } } } });
  if (!c) notFound();
  const teamIds = [c.instructorId, c.subjectExpertId, c.coordinatorId, c.labEngineerId];
  const inTeam = teamIds.includes(user.id);
  const oversight = ["OMC", "CHAIRMAN", "HEAD_OF_DEPARTMENT", "DEAN", "DEPARTMENT_COORDINATOR"].includes(user.role) && (await chairmanIdFor(user).catch(() => "")) === c.coordinator.managedById;
  if (!inTeam && !oversight) redirect("/dashboard");
  const source: "SE" | "INSTRUCTOR" = searchParams.source === "SE" || (!searchParams.source && user.id === c.subjectExpertId && user.id !== c.instructorId) ? "SE" : "INSTRUCTOR";
  let missing = false;
  const s = await courseSettings(c.id).catch(() => { missing = true; return null; });
  const ci = await courseItems(c.id, source);
  const [check, results, warnings, board, locks, types, limits, sync] = await Promise.all([
    planCheck(c.id, source).catch(() => null), source === "INSTRUCTOR" ? courseCloResults(c.id).catch(() => null) : Promise.resolve(null), warningsOf([c.id]), marksBoard([c.id]).catch(() => []),
    termLocks(c.id), typesOf(c.coordinator.managedById || "").catch(() => []), limitsFor(c.id).catch(() => []), labSync(c.id).catch(() => null),
  ]);
  const maps = ci.maps as Map<string, ItemMapRow>;
  const rows = ci.items.map((i) => { const m = maps.get(i.id); return { ...i, notForCloReason: m?.notForCloReason || null, excludedReason: m?.excludedReason || null, typeKey: m?.typeKey || null, faultyReason: m?.faultyReason || null }; });
  const instLabel = new Map(ci.items.map((i) => [i.id, i.label]));
  const canEdit = inTeam && !(source === "SE" && user.id !== c.subjectExpertId && user.id !== c.coordinatorId);
  const target = s?.targetPct ?? 60;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <p className="small-note" style={{ margin: 0 }}><Link href={user.id === c.instructorId ? `/instructor/courses/${c.id}/clos` : user.id === c.subjectExpertId ? `/subjectexpert/courses/${c.id}/clos` : "/omc/clo-attainment"}>← {c.code}</Link></p>
      <h1 style={{ fontSize: 22, margin: "2px 0 4px" }}>{c.code} {c.title} — CLO attainment</h1>
      <p className="small-note" style={{ margin: "0 0 8px" }}>{c.batch?.degreeProgram} {c.batch?.batchName} · {c.offeredTermName} {c.offeredTermYear} · <Link href={`?source=SE`}>Subject Expert&apos;s plan</Link>{source === "SE" ? " (shown)" : ""} · <Link href={`?source=INSTRUCTOR`}>Teacher&apos;s copy and results</Link>{source === "INSTRUCTOR" ? " (shown)" : ""}</p>
      {missing && <div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{CLO_HINT}</p></div>}
      {s && (
        <div className="card">
          <b>Method: {METHODS[results?.method || s.method].label}</b>{results?.locked ? <span className="small-note"> — locked with {c.offeredTermName} {c.offeredTermYear}{results.locked.recalculated ? " (recalculated by the OMC)" : ""}</span> : null}{s.courseOwnMethod ? <span className="small-note"> · this course&apos;s own (OMC approved)</span> : null}
          <span className="small-note"> · pass {s.passPct}%{s.method === "ITEMS" ? ` · ≥ ${s.itemsPct}% of items` : ""} · class target {s.targetPct}% · lab share {s.labSharePct}%{s.labPassOn ? ` · lab part ≥ ${s.labPassPct}% to pass` : ""}</span>
          {inTeam && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              <ActionForm url="/api/clo-method" fixed={{ action: "request", courseId: c.id, kind: "METHOD" }} submit="Ask the OMC" collapsed openLabel="Ask for a different method…" showMessage initial={{ method: s.method }} fields={[{ name: "method", label: "Method", type: "select", options: methodOpts, width: 220 }, { name: "reason", label: "Reason", type: "text", width: 280 }]} />
              {ci.hasLab && <ActionForm url="/api/clo-method" fixed={{ action: "request", courseId: c.id, kind: "LAB_SHARE" }} submit="Ask the OMC" collapsed openLabel="Ask for a different lab share…" showMessage initial={{ pct: s.labSharePct }} fields={[{ name: "pct", label: "Lab share of the grade %", type: "number", width: 120 }, { name: "reason", label: "Reason", type: "text", width: 280 }]} />}
            </div>
          )}
        </div>
      )}

      {results && (
        <>
          <h2 style={{ fontSize: 17, margin: "12px 0 6px" }}>Results per CLO</h2>
          <div className="card" style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", fontSize: 13 }}>
              <thead><tr><th>CLO</th><th>Cleared</th><th>Target</th><th>Levels</th><th>Not assessed</th><th>Class average</th></tr></thead>
              <tbody>{results.clos.map((r) => (
                <tr key={r.clo.id}><td><b>{r.clo.code}</b> <span className="small-note">{r.clo.part === "LAB" ? "lab" : ""}</span></td>
                  <td>{r.assessed ? <><b style={{ color: r.achieved ? "#2F7A4D" : "#B3261E" }}>{r.clearedPct}%</b> <span className="small-note">({r.cleared} of {r.assessed})</span></> : <span className="small-note">not assessed yet</span>}</td>
                  <td>{target}% — {r.achieved ? "achieved" : r.assessed ? "not achieved" : "—"}</td>
                  <td className="small-note">{(Object.keys(r.levels) as (keyof typeof LEVEL_LABEL)[]).map((k) => `${LEVEL_LABEL[k]} ${r.levels[k]}`).join(" · ")}</td>
                  <td>{r.notAssessed || "—"}</td><td>{r.avgPct ?? "—"}{r.avgPct !== null ? "%" : ""}</td></tr>
              ))}</tbody>
            </table>
            {results.leftOut.length > 0 && <div style={{ marginTop: 6 }}><b style={{ fontSize: 13 }}>Left out of CLO attainment</b>{results.leftOut.map((l) => <p key={l.id} className="small-note" style={{ margin: "2px 0" }}>{l.label} — {l.kind}{l.reason ? `: ${l.reason}` : ""}{l.noGrade ? " · also out of the grade" : ""}</p>)}</div>}
            {results.flags.length > 0 && <div style={{ marginTop: 6 }}>{results.flags.map((f) => <p key={f.itemId} style={{ margin: "2px 0", fontSize: 13, color: "#8A5A00" }}>⚠ {f.text} (flagged to the OMC)</p>)}</div>}
            <p className="small-note" style={{ margin: "6px 0 0" }}>Blank marks are absent and left out; a student with every item of a CLO blank is &quot;Not assessed&quot; and not counted in the target.</p>
          </div>
        </>
      )}

      <h2 style={{ fontSize: 17, margin: "12px 0 6px" }}>Mapping {source === "SE" ? "(Subject Expert's plan)" : "(teacher's copy)"}</h2>
      {check && check.blocking.length === 0 && check.breaches.length === 0 && <p className="small-note">Every item is mapped and every CLO is covered{ci.hasLab ? " (theory and lab)" : ""}.</p>}
      <CloMappingEditor courseId={c.id} source={source} items={rows} clos={ci.clos} method={s?.method || "GRADE"} limits={limits} types={types.filter((t) => !t.retired)} hasLab={ci.hasLab} canEdit={canEdit} />
      {sync && (sync.ahead.length > 0 || sync.unlinked.length > 0 || sync.practiceGaps.length > 0) && (
        <div className="card">
          <b>Theory–lab sync</b>
          {sync.ahead.map((a) => <p key={a.text} style={{ margin: "2px 0", fontSize: 13, color: a.reason ? "#8A5A00" : "#B3261E" }}>{a.reason ? "⚠" : "⛔"} {a.text}{a.reason ? ` — reason given: ${a.reason}` : ""}</p>)}
          {[...sync.unlinked, ...sync.practiceGaps].map((t) => <p key={t} className="small-note" style={{ margin: "2px 0" }}>⚠ {t}</p>)}
          <p className="small-note" style={{ margin: "4px 0 0" }}>Fix it on the <Link href={`${user.role === "LAB_ENGINEER" ? "/lab-engineer" : "/instructor"}/labs/${"labCourseId" in sync ? sync.labCourseId : ""}`}>lab plan</Link> (move the lab row or the lecture), or give a reason there.</p>
        </div>
      )}

      <h2 id="warnings" style={{ fontSize: 17, margin: "12px 0 6px" }}>Early warnings</h2>
      <div className="card">
        {warnings.length === 0 && <p className="small-note" style={{ margin: 0 }}>None — each item is checked when its marks are entered.</p>}
        {warnings.map((w) => {
          const effect = w.effectJson ? (JSON.parse(w.effectJson) as { line: string }).line : null;
          return (
            <div key={w.id} style={{ borderTop: "1px solid #eee", padding: "6px 0", fontSize: 13 }} data-warning={w.level}>
              <b style={{ color: w.level === "RED" ? "#B3261E" : "#B76E00" }}>{w.level === "RED" ? "🔴 Red" : "🟠 Amber"}</b> · {instLabel.get(w.instrumentId) || "Item"}{w.topic ? ` – ${w.topic}` : ""}: {Math.round(w.belowPct)}% of {w.sat} below the pass mark · <span className="small-note">{w.diagnosis}</span>
              {w.respondedAt ? <p className="small-note" style={{ margin: "2px 0" }}>Done: {(JSON.parse(w.actionsJson) as (keyof typeof ACTIONS)[]).map((a) => ACTIONS[a]).join(", ")} — {w.note}{effect ? <b> · {effect}</b> : " · effect shows when the next item on this topic is marked"} · <Link href="/cqi">CQI record</Link></p> : (
                <>
                  <p className="small-note" style={{ margin: "2px 0" }}>Waiting for a CQI action{w.stage !== "TEACHER" ? ` — escalated to the ${w.stage === "SE" ? "Subject Expert" : "Program Lead / HOD"}` : ""}.</p>
                  {inTeam && <ActionForm url="/api/clo-method" fixed={{ action: "respond", warningId: w.id }} submit="Record the action" collapsed openLabel="Choose CQI action(s)…" showMessage fields={[...(Object.keys(ACTIONS) as (keyof typeof ACTIONS)[]).map((k) => ({ name: k, label: ACTIONS[k], type: "checkbox" as const })), { name: "note", label: "Note (what, when)", type: "text", width: 320 }]} />}
                </>
              )}
            </div>
          );
        })}
      </div>

      <h2 style={{ fontSize: 17, margin: "12px 0 6px" }}>Marks within one week</h2>
      <div className="card" style={{ overflowX: "auto" }}>
        {board.length === 0 && <p className="small-note" style={{ margin: 0 }}>No item has a held date yet — it comes from the lecture log (or set it below).</p>}
        {board.length > 0 && <table className="table" style={{ width: "100%", fontSize: 13 }}><thead><tr><th>Item</th><th>Held</th><th>Due</th><th>Status</th></tr></thead><tbody>{board.map((b) => <tr key={b.instrumentId}><td>{b.label}</td><td>{new Date(b.heldOn).toISOString().slice(0, 10)}</td><td>{new Date(b.dueOn).toISOString().slice(0, 10)}</td><td style={{ color: b.stage === "OVERDUE" || b.stage === "ESCALATED" ? "#B3261E" : undefined }}>{b.stage === "DONE" ? (b.late ? "entered — late" : "entered") : b.stage === "ESCALATED" ? `overdue (working day ${b.day}) — HOD told` : b.stage === "OVERDUE" ? `overdue (working day ${b.day})` : b.stage === "REMIND" ? `due soon (working day ${b.day})` : `open (working day ${b.day})`}</td></tr>)}</tbody></table>}
        {inTeam && <ActionForm url="/api/clo-method" fixed={{ action: "held", courseId: c.id }} submit="Set" collapsed openLabel="Set or correct the date an item was held…" showMessage initial={{ instrumentId: ci.items[0]?.id }} fields={[{ name: "instrumentId", label: "Item", type: "select", options: ci.items.map((i) => [i.id, i.label] as [string, string]), width: 200 }, { name: "date", label: "Held on", type: "date", width: 150 }]} />}
      </div>

      {locks.length > 0 && (
        <>
          <h2 style={{ fontSize: 17, margin: "12px 0 6px" }}>Locked terms</h2>
          <div className="card">{locks.map((l) => { const st = JSON.parse(l.settingsJson) as { method: Method }; const rc = l.recalcSettingsJson ? (JSON.parse(l.recalcSettingsJson) as { method: Method }) : null; return <p key={`${l.termName}${l.termYear}`} style={{ margin: "2px 0", fontSize: 13 }}>{l.termName} {l.termYear}: {METHODS[st.method].label} (locked {new Date(l.lockedAt).toLocaleDateString("en-GB")}){rc ? ` · recalculated with ${METHODS[rc.method].label} on ${new Date(l.recalculatedAt!).toLocaleDateString("en-GB")} — both kept` : ""}</p>; })}</div>
        </>
      )}
    </Shell>
  );
}
