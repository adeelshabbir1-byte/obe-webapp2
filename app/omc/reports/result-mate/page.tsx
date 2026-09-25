import { redirect } from "next/navigation";
import SortableTable from "../../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, coordinatorIdsFor, courseScopeFor, chairmanIdFor } from "../../../../lib/reportScope";
import { canViewReport, canEditReport } from "../../../../lib/reportAcl";
import { getPassingCriteria } from "../../../../lib/passingCriteria";
import LogCqiActionButton from "../../../../components/LogCqiActionButton";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import { computeResultMate } from "../../../../lib/resultMate";
import Shell from "../../../../components/Shell";
import DegreeBatchFilter from "../../../../components/DegreeBatchFilter";
import AutoSubmitSelect from "../../../../components/AutoSubmitSelect";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";
import GradeCutoffsForm from "../../../../components/GradeCutoffsForm";
import GradeBoundaryEditor from "../../../../components/GradeBoundaryEditor";
import { getGradingScaleForBatch } from "../../../../lib/gradingScaleLookup";

export default async function ResultMatePage({ searchParams }: { searchParams: { courseId?: string; degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.reports.result-mate"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  let courses = await prisma.course.findMany({
    where: { AND: [courseScopeFor(user), { instructorId: { not: null } }] },
    include: { batch: true, instructor: true },
    orderBy: { code: "asc" },
  });

  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  if (searchParams.batchId) courses = courses.filter((c) => c.batchId === searchParams.batchId);
  else if (searchParams.degree) courses = courses.filter((c) => c.batch?.degreeProgram === searchParams.degree);

    const selectedCourseId = searchParams.courseId || courses[0]?.id || "";
  const course = courses.find((c) => c.id === selectedCourseId);
  const result = selectedCourseId ? await computeResultMate(selectedCourseId) : null;
  const passCriteria = await getPassingCriteria(await chairmanIdFor(user));

  // Group instruments by type for the two-level table header (e.g. one
  // merged "Assignment" heading over A1/A2/A3, instead of repeating the
  // type name on every single column) — keeps more results visible at once.
  const TYPE_COLOR: Record<string, string> = {
    Assignment: "#2563EB", Quiz: "#16A34A", Project: "#7C3AED", Lab: "#EA580C", Midterm: "#DB2777", Final: "#CA8A04",
  };
  const groupedInstrumentTypes: { type: string; instruments: any[] }[] = [];
  if (result) {
    for (const inst of result.instruments) {
      const last = groupedInstrumentTypes[groupedInstrumentTypes.length - 1];
      if (last && last.type === inst.type) last.instruments.push(inst);
      else groupedInstrumentTypes.push({ type: inst.type, instruments: [inst] });
    }
  }

  const gradingScale = course?.batch ? await getGradingScaleForBatch(course.coordinatorId, course.batch) : [];
  const hasCutoffRole = course && (
    (user.role === "INSTRUCTOR" && course.instructorId === user.id) ||
    user.role === "CHAIRMAN"
  );
  const canEditCutoffs = hasCutoffRole && (await canEditReport(user, "omc.reports.result-mate"));
  const cutoffApiEndpoint = course
    ? (user.role === "CHAIRMAN" ? `/api/chairman/courses/${course.id}/grade-cutoffs` : `/api/instructor/courses/${course.id}/grade-cutoffs`)
    : "";

  const gradeBadge: Record<string, string> = { A: "badge-ok", B: "badge-ok", C: "badge-warn", D: "badge-warn", F: "badge-no" };

  return (
    <Shell roleLabel="Report Viewer" userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Result Mate" />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Relative grading, based on the class mean and standard deviation.
      </p>
      <div className="card no-print">
        <DegreeBatchFilter batches={allBatches.map((b) => ({ id: b.id, degreeProgram: b.degreeProgram, batchName: b.batchName }))} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} extraParams={{}} />
        <div style={{ marginTop: 10 }}>
        <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 10 }}>Course</label>
        <AutoSubmitSelect name="courseId" defaultValue={selectedCourseId} options={courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title}` }))} />
        </div>
      </div>

      {course && (
        <div className="card">
          <p style={{ fontSize: 12.5 }}><b>Course:</b> {course.code} — {course.title} &nbsp; <b>Instructor:</b> {course.instructor?.name || "—"}</p>
        </div>
      )}

      {result && (
        <>
          <div className="card">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 16px", minWidth: 120 }}>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Georgia, serif" }}>{result.stats.count}</div>
                <div style={{ fontSize: 11, color: "var(--slate)" }}>Students</div>
              </div>
              <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 16px", minWidth: 120 }}>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Georgia, serif" }}>{result.stats.mean}%</div>
                <div style={{ fontSize: 11, color: "var(--slate)" }}>Class Mean</div>
              </div>
              <div style={{ background: "var(--card)", border: "1px solid var(--line)", padding: "12px 16px", minWidth: 120 }}>
                <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "Georgia, serif" }}>{result.stats.sd}</div>
                <div style={{ fontSize: 11, color: "var(--slate)" }}>Std. Deviation</div>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>{result.cutoffsAreSet ? "Applied Grade Cutoffs" : "Suggested Grade Cutoffs"}</h3>
            <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
              {result.cutoffsAreSet
                ? "These are the actual cutoffs saved for this course — grades above are assigned using these, not the live computation."
                : "Computed from this class's mean/SD — no cutoffs have been saved for this course yet, so grades above use this live suggestion."}
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {[
                { grade: "A", cutoff: result.stats.mean + result.stats.sd, label: "and above" },
                { grade: "B", cutoff: result.stats.mean, label: `– ${Math.round((result.stats.mean + result.stats.sd) * 10) / 10}%` },
                { grade: "C", cutoff: result.stats.mean - result.stats.sd, label: `– ${result.stats.mean}%` },
                { grade: "D", cutoff: result.stats.mean - 2 * result.stats.sd, label: `– ${Math.round((result.stats.mean - result.stats.sd) * 10) / 10}%` },
                { grade: "F", cutoff: null, label: `below ${Math.round((result.stats.mean - 2 * result.stats.sd) * 10) / 10}%` },
              ].map((g) => (
                <div key={g.grade} style={{ background: "var(--paper)", border: "1px solid var(--line)", padding: "8px 14px", minWidth: 90, textAlign: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{g.grade}</div>
                  <div style={{ fontSize: 11, color: "var(--slate)" }}>{g.cutoff !== null ? `${Math.round(g.cutoff * 10) / 10}% ${g.label}` : g.label}</div>
                </div>
              ))}
            </div>
          </div>

          {canEditCutoffs && course && (
            <>
              <GradeBoundaryEditor
                apiEndpoint={cutoffApiEndpoint}
                students={result.rows.map((r) => ({ name: r.name, rollNumber: r.rollNumber, totalPct: r.totalPct }))}
                gradingScale={gradingScale.map((s) => ({ letter: s.letter, gpaValue: s.gpaValue }))}
                initialCutoffs={Object.fromEntries(
                  gradingScale.map((s) => {
                    const saved = result.savedCutoffs.find((c) => c.letter === s.letter);
                    if (saved) return [s.letter, saved.minPercent];
                    if (s.letter === "A") return [s.letter, Math.round((result.stats.mean + result.stats.sd) * 10) / 10];
                    if (s.letter === "B") return [s.letter, Math.round(result.stats.mean * 10) / 10];
                    if (s.letter === "C") return [s.letter, Math.round((result.stats.mean - result.stats.sd) * 10) / 10];
                    if (s.letter === "D") return [s.letter, Math.round((result.stats.mean - 2 * result.stats.sd) * 10) / 10];
                    return [s.letter, 0];
                  })
                )}
              />
              <GradeCutoffsForm
                courseId={course.id}
                apiEndpoint={cutoffApiEndpoint}
                gradingScale={gradingScale.map((s) => ({ letter: s.letter, gpaValue: s.gpaValue }))}
                savedCutoffs={result.savedCutoffs}
                suggestion={{
                  A: Math.round((result.stats.mean + result.stats.sd) * 10) / 10,
                  B: Math.round(result.stats.mean * 10) / 10,
                  C: Math.round((result.stats.mean - result.stats.sd) * 10) / 10,
                  D: Math.round((result.stats.mean - 2 * result.stats.sd) * 10) / 10,
                }}
              />
          </>
          )}

          {result.instruments.length > 0 && (
            <div className="card" style={{ overflowX: "auto" }}>
              <h3 style={{ fontSize: 14, marginBottom: 10 }}>Per-Assessment-Item Scores</h3>
              <SortableTable style={{ tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ width: 70 }}>Roll #</th><th rowSpan={2} style={{ width: 130 }}>Name</th>
                    {groupedInstrumentTypes.map((g) => (
                      <th key={g.type} colSpan={g.instruments.length} style={{ textAlign: "center", background: TYPE_COLOR[g.type] || "#94A3B8", color: "#fff" }}>{g.type}</th>
                    ))}
                  </tr>
                  <tr>
                    {result.instruments.map((i) => <th key={i.id} style={{ width: 56 }}>{i.label}<br /><span style={{ fontWeight: 400 }}>/{i.maxScore}</span></th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.studentId}>
                      <td>{r.rollNumber}</td><td>{r.name}</td>
                      {result.instruments.map((i) => <td key={i.id}>{r.rawScores[i.id] ?? "—"}</td>)}
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, borderTop: "2px solid var(--line)" }}>
                    <td colSpan={2}>Average</td>
                    {result.instruments.map((i) => <td key={i.id}>{i.average ?? "—"}</td>)}
                  </tr>
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={2}>Std. Deviation</td>
                    {result.instruments.map((i) => <td key={i.id}>{i.sd ?? "—"}</td>)}
                  </tr>
                </tbody>
              </SortableTable>
            </div>
          )}

          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ fontSize: 14, marginBottom: 4 }}>CLO Attainment, by Student</h3>
            <p style={{ fontSize: 11, color: "var(--slate)", marginBottom: 10 }}><span style={{ background: "#FFE8ED", color: "var(--rust)", fontWeight: 700, padding: "1px 6px" }}>Red</span> = below the {passCriteria.cloPct}% pass threshold for that CLO.</p>
            <SortableTable>
              <thead><tr><th>Roll #</th><th>Name</th>{result.cloCodes.map((c) => {
                const max = result.cloMaxWeight[c] || 0;
                const threshold = max * (passCriteria.cloPct / 100);
                const failCount = result.rows.filter((r) => (r.byClo[c] || 0) < threshold).length;
                return (
                  <th key={c}>
                    {c}
                    {(user.role === "CHAIRMAN" || user.role === "OMC") && failCount > 0 && (
                      <div className="no-print" style={{ marginTop: 4 }}>
                        <LogCqiActionButton
                          courseId={course?.id} sourceType="CLO" sourceReference={c}
                          defaultFinding={`${c} in ${course?.code}: ${failCount} of ${result.rows.length} students fell below the ${passCriteria.cloPct}% pass threshold.`}
                          metricBefore={Math.round(((result.rows.length - failCount) / result.rows.length) * 1000) / 10}
                        />
                      </div>
                    )}
                  </th>
                );
              })}<th>Total %</th><th>Grade</th></tr></thead>
              <tbody>
                {result.rows.length === 0 && <tr><td colSpan={result.cloCodes.length + 4} style={{ color: "var(--slate)" }}>No students enrolled, or no marks entered yet.</td></tr>}
                {result.rows.map((r) => (
                  <tr key={r.studentId}>
                    <td>{r.rollNumber}</td>
                    <td>{r.name}{r.isRepeat && <span className="badge badge-warn" style={{ marginLeft: 6 }}>Repeat</span>}</td>
                    {result.cloCodes.map((c) => {
                      const max = result.cloMaxWeight[c] || 0;
                      const threshold = max * (passCriteria.cloPct / 100);
                      const failed = max > 0 && (r.byClo[c] || 0) < threshold;
                      return <td key={c} style={failed ? { background: "#FFE8ED", color: "var(--rust)", fontWeight: 700 } : undefined} title={failed ? `Below the ${passCriteria.cloPct}% pass threshold (${threshold.toFixed(1)} of ${max})` : undefined}>{r.byClo[c] || 0}</td>;
                    })}
                    <td style={{ fontWeight: 600 }}>{r.totalPct}%</td>
                    <td><span className={`badge ${gradeBadge[r.grade]}`}>{r.grade}</span></td>
                  </tr>
                ))}
              </tbody>
            </SortableTable>
          </div>

          {result.ploLabels.length > 0 && (
            <div className="card" style={{ overflowX: "auto" }}>
              <h3 style={{ fontSize: 14, marginBottom: 4 }}>PLO Attainment, by Student</h3>
              <p style={{ fontSize: 11, color: "var(--slate)", marginBottom: 10 }}><span style={{ background: "#FFE8ED", color: "var(--rust)", fontWeight: 700, padding: "1px 6px" }}>Red</span> = below the {passCriteria.ploPct}% pass threshold for that PLO.</p>
              <SortableTable>
                <thead><tr><th>Roll #</th><th>Name</th>{result.ploLabels.map((p) => {
                  const max = result.ploMaxWeight[p] || 0;
                  const threshold = max * (passCriteria.ploPct / 100);
                  const failCount = result.rows.filter((r) => (r.byPlo[p] || 0) < threshold).length;
                  return (
                    <th key={p}>
                      {p}
                      {(user.role === "CHAIRMAN" || user.role === "OMC") && failCount > 0 && (
                        <div className="no-print" style={{ marginTop: 4 }}>
                          <LogCqiActionButton
                            courseId={course?.id} sourceType="PLO" sourceReference={p}
                            defaultFinding={`${p} in ${course?.code}: ${failCount} of ${result.rows.length} students fell below the ${passCriteria.ploPct}% pass threshold.`}
                            metricBefore={Math.round(((result.rows.length - failCount) / result.rows.length) * 1000) / 10}
                          />
                        </div>
                      )}
                    </th>
                  );
                })}</tr></thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.studentId}>
                      <td>{r.rollNumber}</td><td>{r.name}</td>
                      {result.ploLabels.map((p) => {
                        const max = result.ploMaxWeight[p] || 0;
                        const threshold = max * (passCriteria.ploPct / 100);
                        const failed = max > 0 && (r.byPlo[p] || 0) < threshold;
                        return <td key={p} style={failed ? { background: "#FFE8ED", color: "var(--rust)", fontWeight: 700 } : undefined} title={failed ? `Below the ${passCriteria.ploPct}% pass threshold (${threshold.toFixed(1)} of ${max})` : undefined}>{r.byPlo[p] || 0}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </SortableTable>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
