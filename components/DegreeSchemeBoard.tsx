"use client";

import { useEffect, useMemo, useState } from "react";

type Done = { courseCode: string; courseTitle: string; creditHours: number; termName: string; termYear: number; grade: string; gpaPoints: number | null; semesterNumber: number; failed: boolean; lowGrade: boolean; superseded: boolean; courseId: string | null; retakePlanned: boolean };
type Plan = { courseId: string; code: string; title: string; creditHours: number; courseType: string; nativeSemesterNumber: number | null; plannedSemesterNumber: number; hypotheticalGrade: string | null; currentlyEnrolled: boolean; kind: "new" | "retake" | "improvement"; previousGrade: string | null };
type Scheme = {
  student: { id: string; name: string; rollNumber: string; currentSemesterNumber: number; batch: string };
  programSemesters: number; maxSemester: number; minCredits: number; maxCredits: number;
  gradingScale: { letter: string; gpaValue: number }[]; completed: Done[]; planned: Plan[];
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
  const q = studentId ? `?studentId=${studentId}` : "";

  async function load() {
    const r = await fetch(`/api/degree-scheme${q}`);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) setError(d.error || "Could not load the degree plan."); else { setData(d); setError(""); }
  }
  useEffect(() => { load(); }, [studentId]);

  async function act(action: string, courseId: string, more: Record<string, unknown> = {}) {
    setBusy(courseId); setError("");
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
  async function clearGrades() {
    setBusy("grades");
    await fetch("/api/degree-scheme", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, action: "grades", grades: (data?.planned || []).filter((p) => p.hypotheticalGrade).map((p) => ({ courseId: p.courseId, grade: null })) }) });
    await load(); setBusy(""); onChange?.();
  }

  if (error && !data) return <div className="err">{error}</div>;
  if (!data || !calc) return <p style={{ fontSize: 13, color: "var(--slate)" }}>Loading the degree plan…</p>;

  const cur = data.student.currentSemesterNumber;
  const last = Math.max(data.programSemesters, ...data.planned.map((p) => p.plannedSemesterNumber), ...data.completed.map((c) => c.semesterNumber), cur) + extra;
  const semOptions = Array.from({ length: Math.max(last + 2, data.maxSemester) - cur + 1 }, (_, i) => cur + i);
  const finish = Math.max(cur, ...data.planned.map((p) => p.plannedSemesterNumber));
  const gradeColor = (c: Done) => (c.failed ? "#B3261E" : c.lowGrade ? "#B7791F" : c.superseded ? "var(--slate)" : "var(--sage)");
  const tag = (t: string, bg: string, fg: string) => <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: bg, color: fg, marginLeft: 6, whiteSpace: "nowrap" }}>{t}</span>;

  return (
    <div>
      {error && <div className="err">{error}</div>}
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

      {Array.from({ length: last }, (_, i) => i + 1).map((sem) => {
        const done = data.completed.filter((c) => c.semesterNumber === sem);
        const todo = data.planned.filter((p) => p.plannedSemesterNumber === sem);
        const plannedCr = todo.reduce((n, p) => n + p.creditHours, 0);
        const doneCr = done.reduce((n, c) => n + c.creditHours, 0);
        const over = sem >= cur && plannedCr > data.maxCredits;
        if (!done.length && !todo.length && sem > data.programSemesters && sem !== last) return null;
        return (
          <div key={sem} className="card" style={{ padding: "10px 14px", borderLeft: sem === cur ? "4px solid var(--brass)" : undefined }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
              <h3 style={{ fontSize: 14, margin: 0 }}>Semester {sem}{sem === cur ? " (current)" : sem < cur ? " (completed)" : sem > data.programSemesters ? " (extra semester)" : ""}</h3>
              <span style={{ fontSize: 12, color: over ? "#B3261E" : "var(--slate)" }}>
                {doneCr > 0 && `${doneCr} CH taken`}{doneCr > 0 && plannedCr > 0 && " · "}{plannedCr > 0 && `${plannedCr} CH planned`}{over && ` — over the ${data.maxCredits} CH limit`}
              </span>
            </div>
            <table style={{ width: "100%" }}>
              <tbody>
                {done.map((c, i) => (
                  <tr key={`d${i}`} style={{ opacity: c.superseded ? 0.6 : 1 }}>
                    <td style={{ width: 90, fontSize: 12.5 }}>{c.courseCode}</td>
                    <td style={{ fontSize: 12.5 }}>{c.courseTitle}
                      {c.failed && tag("Failed — retake needed", "#FBEAEA", "#B3261E")}
                      {c.lowGrade && !c.retakePlanned && tag("Low grade — can be repeated", "#FBEED2", "#96650F")}
                      {c.retakePlanned && tag("Repeat planned", "#EEF2FA", "#1B4F8A")}
                      {c.superseded && tag("replaced by a later attempt", "#F1F1EE", "var(--slate)")}
                    </td>
                    <td style={{ width: 50, fontSize: 12 }}>{c.creditHours} CH</td>
                    <td style={{ width: 95, fontSize: 11.5, color: "var(--slate)" }}>{c.termName} {c.termYear}</td>
                    <td style={{ width: 150, textAlign: "right" }}>
                      <b style={{ color: gradeColor(c), marginRight: 8 }}>{c.grade}</b>
                      {c.lowGrade && c.courseId && !c.retakePlanned && (
                        <select disabled={busy === c.courseId} value="" onChange={(e) => e.target.value && act("retake", c.courseId!, { semesterNumber: Number(e.target.value) })} style={{ fontSize: 11, padding: "2px 4px" }}>
                          <option value="">Repeat in…</option>
                          {semOptions.map((n) => <option key={n} value={n}>Sem {n}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
                {todo.map((p) => (
                  <tr key={p.courseId} style={{ background: "#FAFAF8" }}>
                    <td style={{ fontSize: 12.5 }}>{p.code}</td>
                    <td style={{ fontSize: 12.5 }}>{p.title}
                      {p.kind === "retake" && tag(`Retake (was ${p.previousGrade})`, "#FBEAEA", "#B3261E")}
                      {p.kind === "improvement" && tag(`Repeat to improve ${p.previousGrade}`, "#FBEED2", "#96650F")}
                      {p.currentlyEnrolled && tag("Enrolled now", "#E8F3EC", "#2E7D4F")}
                      {p.kind === "new" && p.nativeSemesterNumber && p.plannedSemesterNumber !== p.nativeSemesterNumber && tag(`moved from Sem ${p.nativeSemesterNumber}`, "#F1F1EE", "var(--slate)")}
                    </td>
                    <td style={{ fontSize: 12 }}>{p.creditHours} CH</td>
                    <td style={{ fontSize: 11.5, color: "var(--slate)" }}>{p.currentlyEnrolled ? "this semester" : "planned"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <select value={p.plannedSemesterNumber} disabled={busy === p.courseId || p.currentlyEnrolled} onChange={(e) => act("move", p.courseId, { semesterNumber: Number(e.target.value) })} title="Move to semester" style={{ fontSize: 11, padding: "2px 4px", marginRight: 4 }}>
                        {(semOptions.includes(p.plannedSemesterNumber) ? semOptions : [p.plannedSemesterNumber, ...semOptions]).map((n) => <option key={n} value={n}>Sem {n}</option>)}
                      </select>
                      <select value={p.hypotheticalGrade || ""} disabled={busy === p.courseId} onChange={(e) => act("grade", p.courseId, { grade: e.target.value || null })} title="Grade to aim for (what-if only)" style={{ fontSize: 11, padding: "2px 4px" }}>
                        <option value="">Grade?</option>
                        {data.gradingScale.map((g) => <option key={g.letter} value={g.letter}>{g.letter}</option>)}
                      </select>
                      {p.kind === "improvement" && <button onClick={() => act("cancel", p.courseId)} disabled={busy === p.courseId} title="Don't repeat this course" style={{ marginLeft: 4, fontSize: 11, border: 0, background: "none", color: "var(--rust)", cursor: "pointer" }}>✕</button>}
                    </td>
                  </tr>
                ))}
                {!done.length && !todo.length && <tr><td colSpan={5} style={{ fontSize: 12, color: "var(--slate)" }}>Nothing here yet — move courses into this semester with the &quot;Sem&quot; boxes.</td></tr>}
              </tbody>
            </table>
          </div>
        );
      })}
      <button className="btn" style={{ fontSize: 12 }} onClick={() => setExtra((x) => x + 1)}>+ Add another semester</button>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 8 }}>
        Grades and the &quot;Grade?&quot; boxes are a what-if: nothing here changes real results or registration. The plan is shared — the student, the advisor and the Program Lead all see and can change the same plan.
      </p>
    </div>
  );
}
