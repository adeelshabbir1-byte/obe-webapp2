"use client";

import { useEffect, useMemo, useState } from "react";
import DegreePlanGenerator from "./DegreePlanGenerator";

type Done = { courseCode: string; courseTitle: string; creditHours: number; termName: string; termYear: number; grade: string; gpaPoints: number | null; semesterNumber: number; failed: boolean; lowGrade: boolean; superseded: boolean; courseId: string | null; retakePlanned: boolean; withdrawn?: boolean };
type Plan = { courseId: string; code: string; title: string; creditHours: number; courseType: string; nativeSemesterNumber: number | null; plannedSemesterNumber: number; hypotheticalGrade: string | null; currentlyEnrolled: boolean; kind: "new" | "retake" | "improvement"; previousGrade: string | null; source?: string | null; plannedBatch?: string | null; summer?: boolean };
type Scheme = {
  student: { id: string; name: string; rollNumber: string; currentSemesterNumber: number; batch: string };
  programSemesters: number; maxSemester: number; minCredits: number; maxCredits: number;
  gradingScale: { letter: string; gpaValue: number }[]; completed: Done[]; planned: Plan[];
  lock: { by: string; at: string; note: string | null } | null;
  rules: { limit: { max: number; why: string }; selfBlocked: boolean; earned: number; maxNew: number; lowCgpa: boolean; threshold: number } | null;
  editedBy: "student" | "staff";
  baseTerm?: number; terms?: Record<number, string>;
  offerings?: Record<string, { term: number; batch: string; semester: number; ownBatch: boolean; sameProgram: boolean; students: number }[]>;
  attendance?: Record<string, { pct: number | null; attended: number; held: number; canMiss: number | null; standing: string; minPct: number }>;
};

// The whole degree, semester by semester: courses already taken (with grades) and courses still to take (movable),
// with retakes for F / improvement for D, hypothetical grades and the projected CGPA. Used by the student, the advisor
// and the program staff (pass studentId for the latter).
export default function DegreeSchemeBoard({ studentId, onChange }: { studentId?: string; onChange?: () => void }) {
  const [data, setData] = useState<Scheme | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [extra, setExtra] = useState(0);
  const [target, setTarget] = useState<number | null>(null);
  const [scope, setScope] = useState<"next" | "degree">("next");
  const [regResult, setRegResult] = useState<string>("");
  const [moveNote, setMoveNote] = useState<string>("");
  const q = studentId ? `?studentId=${studentId}` : "";

  async function load() {
    const r = await fetch(`/api/degree-scheme${q}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setError(d.error || "Could not load the degree plan."); else { setData(d); setError(""); }
  }
  useEffect(() => { load(); }, [studentId]);

  async function act(action: string, courseId: string, more: Record<string, unknown> = {}) {
    setBusy(courseId); setError(""); setMoveNote("");
    // Show the result straight away (GPA / CGPA recalculate at once); the saved plan is reloaded after.
    if (data && (action === "grade" || action === "move")) {
      setData({ ...data, planned: data.planned.map((p) => p.courseId !== courseId ? p : action === "grade" ? { ...p, hypotheticalGrade: (more.grade as string | null) ?? null } : { ...p, plannedSemesterNumber: Number(more.semesterNumber) }) });
      if (action === "move") {
        const p = data.planned.find((x) => x.courseId === courseId);
        if (p) setMoveNote(`${p.code} → Semester ${more.semesterNumber}${data.terms?.[Number(more.semesterNumber)] ? ` (${data.terms[Number(more.semesterNumber)]})` : ""}: ${joinText({ ...p, plannedSemesterNumber: Number(more.semesterNumber) })}`);
      }
    }
    const r = await fetch("/api/degree-scheme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, action, courseId, ...more }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setError(d.error || "Could not save.");
    await load(); setBusy(""); onChange?.();
  }

  const calc = useMemo(() => {
    if (!data) return null;
    const pts = (l: string) => data.gradingScale.find((g) => g.letter === l)?.gpaValue;
    const best = new Map<string, { p: number; cr: number }>();
    for (const c of data.completed) {
      if (c.gpaPoints === null) continue;
      const k = c.courseCode.toUpperCase(); const b = best.get(k);
      if (!b || c.gpaPoints > b.p) best.set(k, { p: c.gpaPoints, cr: c.creditHours });
    }
    let P = 0, C = 0; best.forEach((b) => { P += b.p * b.cr; C += b.cr; });
    const real = C ? P / C : null;
    // Projected: a hypothetical grade replaces the earlier attempt of the same course if it is better (best attempt counts).
    const proj = new Map(best);
    for (const p of data.planned) {
      const v = p.hypotheticalGrade ? pts(p.hypotheticalGrade) : undefined;
      if (v === undefined) continue;
      const k = p.code.toUpperCase(); const b = proj.get(k);
      if (!b || v > b.p) proj.set(k, { p: v, cr: p.creditHours });
    }
    let P2 = 0, C2 = 0; proj.forEach((b) => { P2 += b.p * b.cr; C2 += b.cr; });
    return { real, projected: C2 ? P2 / C2 : null, earned: Array.from(best.values()).filter((b) => b.p > 0).reduce((n, b) => n + b.cr, 0) };
  }, [data]);

  // What average grade the coming semester(s) need for a CGPA target. Best attempt counts, so a retake replaces the
  // earlier grade (its credit hours are not added again) while a new course adds its credit hours.
  const targetPlan = useMemo(() => {
    if (!data || !calc) return null;
    const scaleAsc = [...data.gradingScale].sort((a, b) => a.gpaValue - b.gpaValue);
    const maxGp = scaleAsc.length ? scaleAsc[scaleAsc.length - 1].gpaValue : 4;
    const lowestPass = scaleAsc.find((g) => g.gpaValue > 0);
    const best = new Map<string, { p: number; cr: number }>();
    for (const c of data.completed) {
      if (c.gpaPoints === null) continue;
      const k = c.courseCode.toUpperCase(); const b = best.get(k);
      if (!b || c.gpaPoints > b.p) best.set(k, { p: c.gpaPoints, cr: c.creditHours });
    }
    let P = 0, C = 0; best.forEach((b) => { P += b.p * b.cr; C += b.cr; });
    const now = C ? P / C : null;
    const milestones = [2, 2.5, 3, 3.5, 4];
    const goal = target ?? (now === null || now < 2 ? 2 : milestones.find((m) => m > now + 0.001) ?? 4);
    const cur = data.student.currentSemesterNumber;
    const sems = Array.from(new Set(data.planned.filter((p) => p.plannedSemesterNumber >= cur && p.creditHours > 0).map((p) => p.plannedSemesterNumber))).sort((a, b) => a - b);
    const need = (courses: Plan[]) => {
      let newCr = 0, allCr = 0, oldPts = 0;
      for (const p of courses) {
        const prev = best.get(p.code.toUpperCase());
        allCr += p.creditHours;
        if (prev) oldPts += prev.p * prev.cr; else newCr += p.creditHours;
      }
      if (!allCr) return null;
      return { avg: (goal * (C + newCr) - P + oldPts) / allCr, credits: allCr };
    };
    const letterFor = (x: number) => scaleAsc.find((g) => g.gpaValue > 0 && g.gpaValue >= x - 1e-9) || null;
    const coursesUpTo = (n: number) => data.planned.filter((p) => p.plannedSemesterNumber >= cur && p.plannedSemesterNumber <= n && p.creditHours > 0);
    const firstSem = sems[0];
    const scopeCourses = scope === "next" ? (firstSem ? coursesUpTo(firstSem) : []) : coursesUpTo(Math.max(...sems, cur));
    const r = need(scopeCourses);
    // Earliest semester by which the goal is still reachable (average needed no higher than the top grade).
    let earliest: { sem: number; avg: number } | null = null;
    for (const n of sems) { const x = need(coursesUpTo(n)); if (x && x.avg <= maxGp + 1e-9) { earliest = { sem: n, avg: x.avg }; break; } }
    return { now, goal, firstSem, scopeCourses, r, letter: r ? letterFor(r.avg) : null, maxGp, lowestPass, earliest, letterFor };
  }, [data, calc, target, scope]);

  async function applySuggested() {
    if (!targetPlan?.r || !targetPlan.letter) return;
    const grade = targetPlan.r.avg <= (targetPlan.lowestPass?.gpaValue ?? 0) ? targetPlan.lowestPass?.letter : targetPlan.letter.letter;
    setBusy("grades"); setError("");
    const r = await fetch("/api/degree-scheme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, action: "grades", grades: targetPlan.scopeCourses.map((p) => ({ courseId: p.courseId, grade })) }) });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error || "Could not apply the grades.");
    await load(); setBusy(""); onChange?.();
  }
  async function staffAction(action: "lock" | "unlock" | "register") {
    let note = "";
    if (action === "lock") { const n = prompt("Lock this plan. Optional note for the student (e.g. why these courses):", ""); if (n === null) return; note = n; }
    if (action === "register" && !confirm("Register this student now in the courses planned for the current semester (offered ones only, within the registration rules)?")) return;
    setBusy(action); setError(""); setRegResult("");
    const r = await fetch("/api/degree-scheme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, action, note }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) setError(d.error || "Could not do that.");
    else if (action === "register") setRegResult([
      d.registered?.length ? `Registered: ${d.registered.join(", ")} (${d.load} of ${d.limit?.max} credit hours, limit for ${d.limit?.why}).` : "Nothing new to register.",
      d.blocked?.length ? `Not registered: ${d.blocked.map((x: { code: string; reason: string }) => `${x.code} — ${x.reason}`).join(" | ")}` : "",
      d.notOffered?.length ? `Not offered this term: ${d.notOffered.join(", ")}.` : "",
    ].filter(Boolean).join(" "));
    await load(); setBusy(""); onChange?.();
  }
  async function clearGrades() {
    setBusy("grades");
    await fetch("/api/degree-scheme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, action: "grades", grades: (data?.planned || []).filter((p) => p.hypotheticalGrade).map((p) => ({ courseId: p.courseId, grade: null })) }) });
    await load(); setBusy(""); onChange?.();
  }

  /** The batch a planned course would be studied with, in the term the student plans to take it. */
  function joins(p: Plan) {
    if (!data?.offerings || data.baseTerm === undefined) return null;
    const term = data.baseTerm + p.plannedSemesterNumber - 1;
    const list = (data.offerings[p.code.trim().toUpperCase()] || []).filter((o) => o.term === term);
    const own = list.find((o) => o.ownBatch);
    const others = list.filter((o) => !o.ownBatch).sort((a, b) => Number(b.sameProgram) - Number(a.sameProgram));
    return { term, own: !!own, others };
  }
  function joinText(p: Plan) {
    const j = joins(p);
    if (!j) return "";
    if (j.own) return "studied with your own batch.";
    if (j.others.length) return `you would join ${j.others.map((o) => `${o.batch} (their Semester ${o.semester})`).join(" or ")}.`;
    return "no batch has this course that term — it would need a special section. Check with your advisor.";
  }

  if (error && !data) return <div className="err">{error}</div>;
  if (!data || !calc) return <p style={{ fontSize: 13, color: "var(--slate)" }}>Loading the degree plan…</p>;

  const cur = data.student.currentSemesterNumber;
  const last = Math.max(data.programSemesters, ...data.planned.map((p) => p.plannedSemesterNumber), ...data.completed.map((c) => c.semesterNumber), cur) + extra;
  const semOptions = Array.from({ length: Math.max(last + 2, data.maxSemester) - cur + 1 }, (_, i) => cur + i);
  const finish = Math.max(cur, ...data.planned.map((p) => p.plannedSemesterNumber));
  // Row colours: passed green, failed red, dropped orange, replaced grey, to study blue, being studied now amber.
  const ROW = { pass: "#C8EBD4", fail: "#F8C9C9", drop: "#FBD9A8", old: "#E0E0E0", todo: "#CFE0FA", now: "#FFE49A" };
  const doneBg = (c: Done) => (c.superseded ? ROW.old : c.withdrawn ? ROW.drop : c.failed ? ROW.fail : ROW.pass);
  const att = (code: string) => data.attendance?.[code.trim().toUpperCase()];
  const gradeColor = (c: Done) => (c.failed ? "#B3261E" : c.lowGrade ? "#B7791F" : c.superseded ? "var(--slate)" : "var(--sage)");
  const tag = (t: string, bg: string, fg: string) => <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: bg, color: fg, marginLeft: 6, whiteSpace: "nowrap" }}>{t}</span>;

  // Grades for a semester GPA target: start every course at the lowest pass and raise the biggest courses first, a step
  // at a time, until the semester's GPA reaches the target.
  async function semesterTarget(sem: number, goal: number) {
    if (!data) return;
    const todo = data.planned.filter((p) => p.plannedSemesterNumber === sem && p.creditHours > 0);
    const scale = data.gradingScale.filter((g) => g.gpaValue > 0).sort((a, b) => a.gpaValue - b.gpaValue);
    if (!todo.length || !scale.length) return;
    const idx = new Map(todo.map((p) => [p.courseId, 0]));
    const gpa = () => todo.reduce((a, p) => a + scale[idx.get(p.courseId)!].gpaValue * p.creditHours, 0) / todo.reduce((a, p) => a + p.creditHours, 0);
    const order = todo.slice().sort((a, b) => b.creditHours - a.creditHours);
    let guard = 0;
    while (gpa() < goal - 1e-9 && guard++ < 500) {
      const c = order.filter((p) => idx.get(p.courseId)! < scale.length - 1).sort((a, b) => idx.get(a.courseId)! - idx.get(b.courseId)! || b.creditHours - a.creditHours)[0];
      if (!c) break;
      idx.set(c.courseId, idx.get(c.courseId)! + 1);
    }
    if (gpa() < goal - 1e-9) { setError(`A ${goal.toFixed(2)} GPA can't be reached in semester ${sem} even with the top grade in every course.`); return; }
    setBusy("grades");
    const r = await fetch("/api/degree-scheme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, action: "grades", grades: todo.map((p) => ({ courseId: p.courseId, grade: scale[idx.get(p.courseId)!].letter })) }) });
    if (!r.ok) setError((await r.json().catch(() => ({}))).error || "Could not save.");
    await load(); setBusy(""); onChange?.();
  }

  return (
    <div>
      {error && <div className="err">{error}</div>}
      <DegreePlanGenerator studentId={studentId} onApplied={() => { load(); onChange?.(); }} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {[
          ["CGPA now", calc.real !== null ? calc.real.toFixed(2) : "—", calc.real !== null && calc.real < 2 ? "#B3261E" : undefined],
          ["Projected CGPA", calc.projected !== null ? calc.projected.toFixed(2) : "—", calc.projected !== null && calc.projected < 2 ? "#B3261E" : "var(--sage)"],
          ["Credit hours passed", String(calc.earned), undefined],
          ["Credit hours still to take", String(data.planned.filter((p) => p.kind === "new").reduce((n, p) => n + p.creditHours, 0)), undefined],
          ["Planned to finish in", `Semester ${finish}${finish > data.programSemesters ? ` (+${finish - data.programSemesters})` : ""}`, finish > data.programSemesters ? "#B7791F" : undefined],
        ].map(([l, v, c]) => (
          <div key={l} style={{ border: "1px solid var(--line)", background: "var(--card, #fff)", padding: "8px 14px", minWidth: 120 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: c || "inherit" }}>{v}</div><div style={{ fontSize: 11, color: "var(--slate)" }}>{l}</div>
          </div>
        ))}
      </div>
      {data.rules && (
        <p style={{ fontSize: 12, color: "var(--slate)", margin: "0 0 10px" }}>
          This semester: up to <b>{data.rules.limit.max}</b> credit hours ({data.rules.limit.why}){data.rules.lowCgpa ? <> · at most <b>{data.rules.maxNew}</b> new course(s), retakes first</> : null} · <b>{data.rules.earned}</b> credit hours earned (courses such as FYP need a minimum).
          {data.rules.selfBlocked ? " The student can't register themself; the advisor registers them from the locked plan." : ""}
        </p>
      )}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12, padding: "8px 12px", border: "1px solid var(--line)", background: data.lock ? "#EEF2FA" : "#FAFAF8" }}>
        <span style={{ fontSize: 13 }}>
          {data.lock ? <>🔒 Plan locked by <b>{data.lock.by}</b> on {new Date(data.lock.at).toLocaleDateString("en-GB")}{data.lock.note ? <> — <i>{data.lock.note}</i></> : null}{data.editedBy === "student" ? ". Only your advisor can move courses now; registration follows this plan." : "."}</> : data.editedBy === "student" ? "Your advisor can lock this plan; registration then follows it." : "Plan not locked."}
        </span>
        {data.editedBy === "staff" && (
          <span style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
            {data.lock
              ? <button className="btn" style={{ fontSize: 12 }} disabled={!!busy} onClick={() => staffAction("unlock")}>Unlock plan</button>
              : <button className="btn btn-brass" style={{ fontSize: 12 }} disabled={!!busy} onClick={() => staffAction("lock")}>Lock plan</button>}
            <button className="btn btn-brass" style={{ fontSize: 12 }} disabled={!!busy} onClick={() => staffAction("register")} title="Register the courses planned for the current semester">{busy === "register" ? "Registering…" : `Register Semester ${data.student.currentSemesterNumber} from plan`}</button>
          </span>
        )}
      </div>
      {regResult && <p style={{ fontSize: 12.5, background: "#E8F3EC", padding: "8px 12px", marginTop: -4 }}>{regResult}</p>}
      {calc.real !== null && calc.real < 2 && (
        <p style={{ fontSize: 12.5, background: "#FBEAEA", color: "#8A1C1C", padding: "8px 12px", marginBottom: 12 }}>
          CGPA is below 2.00. Plan retakes of F courses and repeats of D-grade courses in coming semesters, set the grade you aim for, and watch the projected CGPA. Keep each semester within {data.minCredits}–{data.maxCredits} credit hours.
        </p>
      )}

      {targetPlan && targetPlan.firstSem && (
        <div className="card" style={{ borderColor: "var(--brass)", padding: "12px 14px" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <b style={{ fontSize: 14 }}>CGPA target</b>
            <select value={targetPlan.goal} onChange={(e) => setTarget(Number(e.target.value))} style={{ padding: "4px 8px" }}>
              {[2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4].map((g) => <option key={g} value={g}>{g.toFixed(2)}</option>)}
            </select>
            <span style={{ fontSize: 13 }}>in</span>
            <select value={scope} onChange={(e) => setScope(e.target.value as "next" | "degree")} style={{ padding: "4px 8px" }}>
              <option value="next">the next semester (Semester {targetPlan.firstSem})</option>
              <option value="degree">all remaining semesters</option>
            </select>
          </div>
          {targetPlan.r && (() => {
            const avg = targetPlan.r.avg, cr = targetPlan.r.credits, L = targetPlan.letter;
            const where = scope === "next" ? `Semester ${targetPlan.firstSem}'s ${cr} credit hours` : `the remaining ${cr} credit hours`;
            if (avg <= (targetPlan.lowestPass?.gpaValue ?? 0)) return <p style={{ fontSize: 13, margin: "8px 0 0", color: "var(--sage)" }}>Passing every course in {where} (grade {targetPlan.lowestPass?.letter} or better) is enough to reach {targetPlan.goal.toFixed(2)}.</p>;
            if (avg > targetPlan.maxGp + 1e-9) return (
              <p style={{ fontSize: 13, margin: "8px 0 0", color: "#B3261E" }}>
                Not reachable in {where}: it would need an average of {avg.toFixed(2)} grade points, above the top grade.
                {targetPlan.earliest ? <> The earliest it can be reached is by the end of <b>Semester {targetPlan.earliest.sem}</b>, with an average of <b>{targetPlan.earliest.avg.toFixed(2)}</b> ({targetPlan.letterFor(targetPlan.earliest.avg)?.letter ?? "—"} or better) in every course until then. Choose &quot;all remaining semesters&quot;, move retakes earlier, or lower the target.</> : <> Even the whole remaining degree is not enough — plan more repeats of low grades.</>}
              </p>
            );
            return (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 13, margin: 0 }}>
                  To reach <b>{targetPlan.goal.toFixed(2)}</b>{targetPlan.now !== null ? <> (now {targetPlan.now.toFixed(2)})</> : null}, {where} need an average of <b>{avg.toFixed(2)}</b> grade points —
                  {" "}<b>{L?.letter}</b> or better in every course{targetPlan.scopeCourses.some((p) => p.kind !== "new") ? ", counting the retakes as replacing their earlier grades" : ""}.
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                  <button className="btn btn-brass" style={{ fontSize: 12 }} disabled={busy === "grades"} onClick={applySuggested}>Fill in {L?.letter} for these {targetPlan.scopeCourses.length} course(s)</button>
                  <button className="btn" style={{ fontSize: 12 }} disabled={busy === "grades"} onClick={clearGrades}>Clear all target grades</button>
                </div>
                <p style={{ fontSize: 11.5, color: "var(--slate)", margin: "6px 0 0" }}>Then change any single grade in the &quot;Grade?&quot; boxes below — a higher grade in one course allows a lower one in another; the projected CGPA above shows the result.</p>
              </div>
            );
          })()}
        </div>
      )}

      {moveNote && <p style={{ fontSize: 12.5, background: "#EEF2FA", color: "#1B4F8A", padding: "8px 12px", margin: "0 0 12px" }}>{moveNote}</p>}

      <div className="tr-sheet">
        <div className="tr-head">
          <div><div className="tr-title">Academic Record &amp; Degree Plan</div><div className="tr-sub">{data.student.name} · {data.student.rollNumber} · {data.student.batch}</div></div>
          <div className="tr-legend">
            {([["Passed", ROW.pass], ["Failed", ROW.fail], ["Dropped / withdrawn", ROW.drop], ["Replaced by a later attempt", ROW.old], ["Studying now", ROW.now], ["Still to study", ROW.todo]] as [string, string][]).map(([l, c]) => <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 8 }}><span style={{ width: 12, height: 12, background: c, border: "1px solid var(--line)", display: "inline-block" }} />{l}</span>)}
            <span style={{ textDecoration: "line-through", color: "var(--slate)" }}>moved out</span> · <i>italic = projected from &quot;what-if&quot; grades</i>
          </div>
        </div>
        {(() => {
          // Running totals, semester by semester, the way a transcript prints them. Best attempt counts for CGPA.
          const pts = (l: string | null) => (l ? data.gradingScale.find((g) => g.letter === l)?.gpaValue : undefined);
          const best = new Map<string, { p: number; cr: number }>();
          let projectedSoFar = false;
          const blocks: JSX.Element[] = [];
          for (let sem = 1; sem <= last; sem++) {
            const done = data.completed.filter((c) => c.semesterNumber === sem);
            const todo = data.planned.filter((p) => p.plannedSemesterNumber === sem);
            // Courses of this semester's own scheme that were moved to another semester (shown struck out, no credit hours here).
            const movedOut = data.planned.filter((p) => p.kind === "new" && p.nativeSemesterNumber === sem && p.plannedSemesterNumber !== sem);
            if (!done.length && !todo.length && !movedOut.length && sem > data.programSemesters && sem !== last) continue;
            let sP = 0, sC = 0, ungraded = 0, hypo = false;
            for (const c of done) {
              if (c.gpaPoints === null) continue;
              sP += c.gpaPoints * c.creditHours; sC += c.creditHours;
              const k = c.courseCode.toUpperCase(); const bb = best.get(k);
              if (!bb || c.gpaPoints > bb.p) best.set(k, { p: c.gpaPoints, cr: c.creditHours });
            }
            for (const p of todo) {
              const v = pts(p.hypotheticalGrade);
              if (v === undefined) { if (p.creditHours > 0) ungraded += p.creditHours; continue; }
              if (p.creditHours === 0) continue;
              hypo = true; sP += v * p.creditHours; sC += p.creditHours;
              const k = p.code.toUpperCase(); const bb = best.get(k);
              if (!bb || v > bb.p) best.set(k, { p: v, cr: p.creditHours });
            }
            if (hypo) projectedSoFar = true;
            let cP = 0, cC = 0; best.forEach((x) => { cP += x.p * x.cr; cC += x.cr; });
            const sgpa = sC ? sP / sC : null, cgpa = cC ? cP / cC : null;
            const earned = Array.from(best.values()).filter((x) => x.p > 0).reduce((n, x) => n + x.cr, 0);
            const plannedCr = todo.reduce((n, p) => n + p.creditHours, 0);
            const doneCr = done.reduce((n, c) => n + c.creditHours, 0);
            const over = sem >= cur && plannedCr > data.maxCredits;
            const state = sem < cur ? "done" : sem === cur ? "cur" : "plan";
            const term = data.terms?.[sem];
            const proj = hypo || (projectedSoFar && sem >= cur);
            blocks.push(
              <section key={sem} className={`tr-term ${state}`}>
                <header>
                  <b>Semester {sem}</b>{term && <span className="tr-termname">{term}</span>}
                  <span className={`tr-chip ${state}`}>{state === "done" ? "Completed" : state === "cur" ? "Current" : sem > data.programSemesters ? "Extra semester" : "Planned"}</span>
                  {state !== "done" && todo.some((p) => p.creditHours > 0) && (
                    <select className="tr-grade" value="" disabled={!!busy} onChange={(e) => e.target.value && semesterTarget(sem, Number(e.target.value))} title="Fill in the grades needed for this semester's GPA" style={{ marginLeft: 8 }}>
                      <option value="">GPA target…</option>
                      {[2, 2.5, 3, 3.5, 4].map((g) => <option key={g} value={g}>{g.toFixed(2)}</option>)}
                    </select>
                  )}
                  <span className="tr-load" style={{ color: over ? "#B3261E" : undefined }}>{doneCr > 0 && `${doneCr} CH taken`}{doneCr > 0 && plannedCr > 0 && " · "}{plannedCr > 0 && `${plannedCr} CH planned`}{over && ` — over the ${data.maxCredits} CH limit`}</span>
                </header>
                {!done.length && !todo.length && !movedOut.length ? <p style={{ fontSize: 12, color: "var(--slate)", margin: 0, padding: "8px 18px" }}>Nothing here yet — move courses into this semester with the &quot;Sem&quot; boxes.</p> : <>
                <table className="tr-table">
                  <colgroup><col style={{ width: 88 }} /><col /><col style={{ width: 44 }} /><col style={{ width: 70 }} /><col style={{ width: 52 }} /><col style={{ width: 58 }} /><col style={{ width: "26%" }} /><col style={{ width: 172 }} /></colgroup>
                  <thead><tr><th>Code</th><th>Course title</th><th className="n">CH</th><th className="n">Grade</th><th className="n">GP</th><th className="n">QP</th><th>Notes</th><th className="tr-act">Semester</th></tr></thead>
                  <tbody>
                    {done.map((c, i) => (
                      <tr key={`d${i}`} className={c.superseded ? "sup" : ""} style={{ background: doneBg(c) }}>
                        <td className="code">{c.courseCode}</td>
                        <td>{c.courseTitle}</td>
                        <td className="n">{c.creditHours}</td>
                        <td className="n"><b style={{ color: gradeColor(c) }}>{c.grade}</b></td>
                        <td className="n">{c.gpaPoints !== null ? c.gpaPoints.toFixed(2) : "—"}</td>
                        <td className="n">{c.gpaPoints !== null ? (c.gpaPoints * c.creditHours).toFixed(2) : "—"}</td>
                        <td className="notes">
                          {c.withdrawn && tag("Dropped", "#FDEBD3", "#8A4B08")}
                          {(c.failed || c.withdrawn) && (() => { const again = data.planned.find((p) => p.code.trim().toUpperCase() === c.courseCode.trim().toUpperCase()); return again ? tag(`→ planned again in Sem ${again.plannedSemesterNumber}`, "#EEF2FA", "#1B4F8A") : null; })()}
                          {c.failed && !c.withdrawn && tag("Failed — retake needed", "#FBEAEA", "#B3261E")}
                          {c.lowGrade && !c.retakePlanned && tag("Low grade — can be repeated", "#FBEED2", "#96650F")}
                          {c.retakePlanned && tag("Repeat planned", "#EEF2FA", "#1B4F8A")}
                          {c.superseded && tag("replaced by a later attempt", "#F1F1EE", "var(--slate)")}
                        </td>
                        <td className="tr-act">
                          {c.lowGrade && c.courseId && !c.retakePlanned && !(data.lock && data.editedBy === "student") && (
                            <select disabled={busy === c.courseId} value="" onChange={(e) => e.target.value && act("retake", c.courseId!, { semesterNumber: Number(e.target.value) })}>
                              <option value="">Repeat in…</option>
                              {semOptions.map((n) => <option key={n} value={n}>Sem {n}{data.terms?.[n] ? ` · ${data.terms[n]}` : ""}</option>)}
                            </select>
                          )}
                        </td>
                      </tr>
                    ))}
                    {todo.map((p) => {
                      const v = pts(p.hypotheticalGrade);
                      const j = joins(p);
                      return (
                        <tr key={p.courseId} className="plan" style={{ background: p.currentlyEnrolled ? ROW.now : ROW.todo }}>
                          <td className="code">{p.code}</td>
                          <td>{p.title}</td>
                          <td className="n">{p.creditHours}</td>
                          <td className="n">
                            <select className="tr-grade" value={p.hypotheticalGrade || ""} disabled={busy === p.courseId} onChange={(e) => act("grade", p.courseId, { grade: e.target.value || null })} title="What-if grade — changes the GPA and CGPA below at once">
                              <option value="">—</option>
                              {data.gradingScale.map((g) => <option key={g.letter} value={g.letter}>{g.letter}</option>)}
                            </select>
                          </td>
                          <td className="n"><i>{v !== undefined ? v.toFixed(2) : ""}</i></td>
                          <td className="n"><i>{v !== undefined ? (v * p.creditHours).toFixed(2) : ""}</i></td>
                          <td className="notes">
                            {p.kind === "retake" && tag(`Retake (was ${p.previousGrade})`, "#FBEAEA", "#B3261E")}
                            {p.kind === "improvement" && tag(`Repeat to improve ${p.previousGrade}`, "#FBEED2", "#96650F")}
                            {p.currentlyEnrolled && tag("Enrolled now", "#E8F3EC", "#2E7D4F")}
                            {p.currentlyEnrolled && (() => { const a = att(p.code); if (!a || a.pct === null) return tag("Attendance: not marked yet", "#F1F1EE", "var(--slate)"); const bad = a.pct < a.minPct, near = !bad && a.pct < a.minPct + 5; return tag(`Attendance ${a.pct}% (${a.attended}/${a.held})${a.canMiss !== null ? ` · can miss ${a.canMiss}` : ""}`, bad ? "#FBEAEA" : near ? "#FBEED2" : "#E8F3EC", bad ? "#B3261E" : near ? "#96650F" : "#2E7D4F"); })()}
                            {p.source && tag(p.source === "SYSTEM" ? "suggested by the system" : p.source === "STUDENT" ? "suggested by the student" : "set by the advisor", "#F1F1EE", "var(--slate)")}
                            {p.summer && tag("Summer", "#FFF3D6", "#7A5208")}
                            {p.kind === "new" && p.nativeSemesterNumber && p.plannedSemesterNumber !== p.nativeSemesterNumber && tag(`came from Sem ${p.nativeSemesterNumber}${data.terms?.[p.nativeSemesterNumber] ? ` (${data.terms[p.nativeSemesterNumber]})` : ""}`, "#EEF2FA", "#1B4F8A")}
                            {j && !j.own && (j.others.length
                              ? tag(`Joins ${j.others[0].batch} (their Sem ${j.others[0].semester})${j.others.length > 1 ? ` +${j.others.length - 1}` : ""}`, "#E8F3EC", "#2E7D4F")
                              : tag("No batch takes it this term", "#FBEAEA", "#B3261E"))}
                          </td>
                          <td className="tr-act">
                            <select value={p.plannedSemesterNumber} disabled={busy === p.courseId || p.currentlyEnrolled || (!!data.lock && data.editedBy === "student")} onChange={(e) => act("move", p.courseId, { semesterNumber: Number(e.target.value) })} title="Move to another semester — shows which batch you would join">
                              {(semOptions.includes(p.plannedSemesterNumber) ? semOptions : [p.plannedSemesterNumber, ...semOptions]).map((n) => {
                                const t = data.baseTerm !== undefined ? data.baseTerm + n - 1 : null;
                                const offered = t !== null && (data.offerings?.[p.code.trim().toUpperCase()] || []).some((o) => o.term === t);
                                return <option key={n} value={n}>Sem {n}{data.terms?.[n] ? ` · ${data.terms[n]}` : ""}{data.offerings ? (offered ? " ✓" : " ✗") : ""}</option>;
                              })}
                            </select>
                            {p.kind === "improvement" && <button onClick={() => act("cancel", p.courseId)} disabled={busy === p.courseId} title="Don't repeat this course" className="tr-x">✕</button>}
                          </td>
                        </tr>
                      );
                    })}
                    {movedOut.map((p) => (
                      <tr key={`m${p.courseId}`} style={{ color: "var(--slate)" }}>
                        <td className="code" style={{ textDecoration: "line-through" }}>{p.code}</td>
                        <td style={{ textDecoration: "line-through" }}>{p.title}</td>
                        <td className="n" title="Not counted in this semester">({p.creditHours})</td>
                        <td className="n">—</td><td className="n" /><td className="n" />
                        <td className="notes">{tag(`moved to Sem ${p.plannedSemesterNumber}${data.terms?.[p.plannedSemesterNumber] ? ` (${data.terms[p.plannedSemesterNumber]})` : ""} — not counted here`, "#F1F1EE", "var(--slate)")}</td>
                        <td className="tr-act" />
                      </tr>
                    ))}
                  </tbody>
                </table>
                <footer>
                  <span>Semester: <b>{sC}</b> CH graded{ungraded ? <span className="tr-muted"> ({ungraded} CH without a grade yet)</span> : null}</span>
                  <span className={hypo ? "tr-proj" : ""}>GPA <b>{sgpa !== null ? sgpa.toFixed(2) : "—"}</b></span>
                  <span>Cumulative: <b>{earned}</b> CH passed</span>
                  <span className={proj ? "tr-proj" : ""} style={{ color: cgpa !== null && cgpa < 2 ? "#B3261E" : undefined }}>CGPA <b>{cgpa !== null ? cgpa.toFixed(2) : "—"}</b>{proj ? " (projected)" : ""}</span>
                </footer>
                </>}
              </section>,
            );
          }
          return blocks;
        })()}
      </div>
      <button className="btn" style={{ fontSize: 12 }} onClick={() => setExtra((x) => x + 1)}>+ Add another semester</button>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 8 }}>
        ✓ / ✗ in the semester box: whether any batch studies that course in that term. GP = grade points, QP = quality points (CH × GP); GPA = QP ÷ CH of the semester, CGPA counts the best attempt of every course. Grades in the boxes are a what-if: nothing here changes real results or registration. The plan is shared — the student, the advisor and the Program Lead all see and can change the same plan.
      </p>
    </div>
  );
}
