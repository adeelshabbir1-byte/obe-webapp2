import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, roleLabel, coordinatorIdsFor, chairmanIdFor } from "../../../../lib/reportScope";
import { canViewReport } from "../../../../lib/reportAcl";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import { computeCoAttainment } from "../../../../lib/attainmentLevels";
import { getPassingCriteria } from "../../../../lib/passingCriteria";
import Shell from "../../../../components/Shell";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";
import AutoSubmitSelect from "../../../../components/AutoSubmitSelect";
import SimpleBarChart from "../../../../components/SimpleBarChart";

function levelFromPct(actualPct: number, targetPct = 60): number {
  if (actualPct >= targetPct + 10) return 3;
  if (actualPct >= targetPct) return 2;
  if (actualPct >= targetPct - 10) return 1;
  return 0;
}

export default async function AttainmentAnalyticsPage({ searchParams }: { searchParams: { courseId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.reports.attainment-analytics"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const offeredCourses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, isOffered: true, instructorId: { not: null } },
    orderBy: { code: "asc" },
  });
  const selectedCourseId = searchParams.courseId || offeredCourses[0]?.id || "";
  const selectedCourse = offeredCourses.find((c) => c.id === selectedCourseId);

  const passCriteria = await getPassingCriteria(await chairmanIdFor(user));
  const coData = selectedCourseId ? await computeCoAttainment(selectedCourseId, passCriteria) : null;

  // Session-wise: average attainment level per term, across every historical
  // snapshot for this program (a default 60% target is used here since
  // exact per-CO targets aren't preserved in the older snapshot format).
  const snapshots = await prisma.attainmentSnapshot.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ termYear: "asc" }] });
  const byTerm = new Map<string, { totalLevel: number; count: number }>();
  for (const s of snapshots) {
    const cloStats = JSON.parse(s.cloStatsJson) as { passCount: number; failCount: number }[];
    for (const c of cloStats) {
      const total = c.passCount + c.failCount;
      if (total === 0) continue;
      const pct = (c.passCount / total) * 100;
      const key = `${s.termName} ${s.termYear}`;
      const entry = byTerm.get(key) || { totalLevel: 0, count: 0 };
      entry.totalLevel += levelFromPct(pct); entry.count++;
      byTerm.set(key, entry);
    }
  }
  const sessionTrend = Array.from(byTerm.entries()).map(([term, v]) => ({ label: term, value: Math.round((v.totalLevel / v.count) * 100) / 100 }));

  // Subject-wise: every currently-offered course's overall attainment level.
  const subjectRows: { label: string; value: number }[] = [];
  for (const c of offeredCourses) {
    const data = await computeCoAttainment(c.id, passCriteria);
    if (data.rows.length === 0) continue;
    const avgLevel = Math.round((data.rows.reduce((s, r) => s + r.level, 0) / data.rows.length) * 100) / 100;
    subjectRows.push({ label: c.code, value: avgLevel });
  }

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Program Attainment Analytics" />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        NBA / Washington-Accord style attainment — target vs actual per CO, POs scored on a 0–3 scale, trends across
        semesters, and a side-by-side view of every subject. This sits alongside, not in place of, the existing
        pass/fail-based CLO/PLO reports.
      </p>

      <div className="card no-print">
        <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 10 }}>Course (for CO/PO panels)</label>
        <AutoSubmitSelect name="courseId" defaultValue={selectedCourseId} options={offeredCourses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title}` }))} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 4 }}>CO Attainment{selectedCourse ? ` — ${selectedCourse.code}` : ""}</h3>
          <p style={{ fontSize: 11, color: "var(--slate)", marginBottom: 12 }}>Target % vs actual % of students who attained each CO.</p>
          {!coData || coData.rows.length === 0 ? (
            <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No CLOs with marks yet for this course.</p>
          ) : (
            <>
              <SimpleBarChart bars={coData.rows.map((r) => ({ label: `${r.code} Target`, value: r.targetPct, color: "#038666" }))} unit="%" />
              <div style={{ height: 10 }} />
              <SimpleBarChart bars={coData.rows.map((r) => ({ label: `${r.code} Actual`, value: r.actualPct, color: "#CA8A04" }))} unit="%" />
            </>
          )}
        </div>

        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 4 }}>PO Attainment{selectedCourse ? ` — ${selectedCourse.code}` : ""}</h3>
          <p style={{ fontSize: 11, color: "var(--slate)", marginBottom: 12 }}>Weighted average of contributing COs' levels, scored 0–3.</p>
          {!coData || coData.poRows.length === 0 ? (
            <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No PLO-mapped CLOs with marks yet for this course.</p>
          ) : (
            <SimpleBarChart bars={coData.poRows.map((r) => ({ label: r.label, value: r.level }))} maxValue={3} />
          )}
        </div>

        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 4 }}>Session-Wise Analytics</h3>
          <p style={{ fontSize: 11, color: "var(--slate)", marginBottom: 12 }}>Average attainment level across the whole program, by past semester.</p>
          {sessionTrend.length === 0 ? (
            <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No historical data yet — this fills in once a course has been re-offered at least once.</p>
          ) : (
            <SimpleBarChart bars={sessionTrend} maxValue={3} />
          )}
        </div>

        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 4 }}>Subject-Wise Analytics</h3>
          <p style={{ fontSize: 11, color: "var(--slate)", marginBottom: 12 }}>Every currently-offered course's overall attainment level, side by side.</p>
          {subjectRows.length === 0 ? (
            <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No offered courses with marked CLOs yet.</p>
          ) : (
            <SimpleBarChart bars={subjectRows} maxValue={3} />
          )}
        </div>
      </div>
    </Shell>
  );
}
