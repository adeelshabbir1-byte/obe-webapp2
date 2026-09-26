import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { coordinatorIdsFor } from "../../../lib/reportScope";
import { prisma } from "../../../lib/db";
import { computeCloPloPassRates } from "../../../lib/resultMate";
import { getPassingCriteria } from "../../../lib/passingCriteria";
import { OMC_ACTION_NAV } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import SimpleBarChart from "../../../components/SimpleBarChart";

// A small, fixed palette so each compared section keeps a consistent,
// distinguishable color across every chart on the page.
const SERIES_COLORS = ["#1F89F5", "#6C7AF0", "#14A394", "#F0A020", "#E8577A", "#17B3D9"];

function sectionLabel(c: { batch: { degreeProgram: string; batchName: string } | null; instructor: { name: string } | null; isOffered: boolean }) {
  const batchLabel = c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—";
  return `${batchLabel} · ${c.instructor?.name || "Unassigned"}${c.isOffered ? "" : " (past)"}`;
}

export default async function SectionComparisonPage({ searchParams }: { searchParams: { code?: string; sectionIds?: string | string[] } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);

  // Every course with results worth comparing, across every batch/term
  // (not just this semester's currently-offered ones) — so a past
  // semester's section of the same course is still selectable, which is
  // exactly what comparing "PF last semester vs. this semester" needs.
  const allCourses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, instructorId: { not: null } },
    include: { batch: true, instructor: true },
    orderBy: [{ code: "asc" }, { createdAt: "desc" }],
  });

  const byCode = new Map<string, typeof allCourses>();
  for (const c of allCourses) byCode.set(c.code, [...(byCode.get(c.code) || []), c]);
  const codesWithMultipleSections = Array.from(byCode.entries()).filter(([, list]) => list.length > 1).sort((a, b) => a[0].localeCompare(b[0]));

  const selectedCode = searchParams.code || "";
  const sectionsForCode = selectedCode ? byCode.get(selectedCode) || [] : [];

  const selectedSectionIds = !searchParams.sectionIds ? [] : Array.isArray(searchParams.sectionIds) ? searchParams.sectionIds : [searchParams.sectionIds];
  const selectedSections = sectionsForCode.filter((c) => selectedSectionIds.includes(c.id));

  const criteria = await getPassingCriteria(user.managedById);
  const statsBySection = await Promise.all(
    selectedSections.map(async (c) => ({ course: c, stats: await computeCloPloPassRates(c.id, criteria) }))
  );

  const gridCols = statsBySection.length > 0 ? `repeat(${statsBySection.length}, 1fr)` : "1fr";

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Section Comparison</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Compare two or more sections of the same course — different batches, different instructors, and/or
        different semesters (a course's own history is included, not just what's currently offered), all side
        by side.
      </p>

      {codesWithMultipleSections.length === 0 ? (
        <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No course has more than one section on record yet.</p></div>
      ) : (
        <div className="card">
          <form method="GET" style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: selectedCode ? 16 : 0 }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Course</label>
              <select name="code" defaultValue={selectedCode} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5, minWidth: 220 }}>
                <option value="">— Choose a course —</option>
                {codesWithMultipleSections.map(([code, list]) => <option key={code} value={code}>{code} ({list.length} sections on record)</option>)}
              </select>
            </div>
            <button type="submit" className="btn" style={{ fontSize: 12.5 }}>Load Sections</button>
          </form>

          {selectedCode && sectionsForCode.length > 0 && (
            <form method="GET">
              <input type="hidden" name="code" value={selectedCode} />
              <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>
                Sections to compare (ctrl/cmd-click for more than one — {sectionsForCode.length} on record, including past semesters)
              </label>
              <select name="sectionIds" multiple defaultValue={selectedSectionIds} size={Math.min(8, sectionsForCode.length)} style={{ padding: 6, border: "1px solid var(--line)", fontSize: 12.5, width: "100%", maxWidth: 480 }}>
                {sectionsForCode.map((c) => <option key={c.id} value={c.id}>{sectionLabel(c)}</option>)}
              </select>
              <button type="submit" className="btn btn-brass" style={{ marginTop: 10, fontSize: 12.5 }}>Compare Selected Sections</button>
            </form>
          )}
        </div>
      )}

      {statsBySection.length > 0 && (
        <>
          <div className="card" style={{ display: "grid", gridTemplateColumns: gridCols, gap: 20 }}>
            {statsBySection.map(({ course, stats }, i) => (
              <div key={course.id}>
                <h3 style={{ fontSize: 13.5, marginBottom: 4 }}>{course.code} — {sectionLabel(course)}</h3>
                <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>{stats.studentCount} students</p>
                <SimpleBarChart bars={stats.histogram.map((b) => ({ label: b.label, value: b.count, color: SERIES_COLORS[i % SERIES_COLORS.length] }))} />
              </div>
            ))}
          </div>

          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>Students Who Passed Each CLO</h3>
            <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 20 }}>
              {statsBySection.map(({ course, stats }, i) => (
                <SimpleBarChart key={course.id} bars={stats.cloStats.map((c) => ({ label: c.code, value: c.passCount, color: SERIES_COLORS[i % SERIES_COLORS.length] }))} unit={` / ${stats.studentCount}`} />
              ))}
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>Students Who Passed Each PLO</h3>
            <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 20 }}>
              {statsBySection.map(({ course, stats }, i) => (
                <SimpleBarChart key={course.id} bars={stats.ploStats.map((p) => ({ label: p.label, value: p.passCount, color: SERIES_COLORS[i % SERIES_COLORS.length] }))} unit={` / ${stats.studentCount}`} />
              ))}
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}
