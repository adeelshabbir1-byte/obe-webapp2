import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { coordinatorIdsFor } from "../../../lib/reportScope";
import { prisma } from "../../../lib/db";
import { computeCloPloPassRates } from "../../../lib/resultMate";
import { OMC_ACTION_NAV } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import SimpleBarChart from "../../../components/SimpleBarChart";

export default async function SectionComparisonPage({ searchParams }: { searchParams: { courseA?: string; courseB?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "OMC") redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const courses = await prisma.course.findMany({
    where: { coordinatorId: { in: coordinatorIds }, isOffered: true, instructorId: { not: null } },
    include: { batch: true, instructor: true },
    orderBy: [{ code: "asc" }],
  });

  const byCode = new Map<string, typeof courses>();
  for (const c of courses) byCode.set(c.code, [...(byCode.get(c.code) || []), c]);
  const codesWithMultipleSections = Array.from(byCode.entries()).filter(([, list]) => list.length > 1);

  const courseA = searchParams.courseA ? courses.find((c) => c.id === searchParams.courseA) : null;
  const courseB = searchParams.courseB ? courses.find((c) => c.id === searchParams.courseB) : null;
  const statsA = courseA ? await computeCloPloPassRates(courseA.id) : null;
  const statsB = courseB ? await computeCloPloPassRates(courseB.id) : null;

  function label(c: typeof courses[number]) {
    return `${c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—"} · ${c.instructor?.name || "Unassigned"}`;
  }

  return (
    <Shell roleLabel="OMC Member" userName={user.name} navLinks={OMC_ACTION_NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Section Comparison</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Compare two sections of the same course offered this semester — same course code, different batch and/or instructor.
      </p>

      {codesWithMultipleSections.length === 0 ? (
        <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No course currently has more than one offered section this semester.</p></div>
      ) : (
        <div className="card">
          <form method="GET" style={{ display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Section A</label>
              <select name="courseA" defaultValue={searchParams.courseA || ""} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5, minWidth: 260 }}>
                <option value="">— Select —</option>
                {codesWithMultipleSections.map(([code, list]) => (
                  <optgroup key={code} label={code}>
                    {list.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Section B</label>
              <select name="courseB" defaultValue={searchParams.courseB || ""} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5, minWidth: 260 }}>
                <option value="">— Select —</option>
                {codesWithMultipleSections.map(([code, list]) => (
                  <optgroup key={code} label={code}>
                    {list.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-brass">Compare</button>
          </form>
        </div>
      )}

      {courseA && courseB && courseA.code !== courseB.code && (
        <div className="card"><p style={{ color: "var(--rust)", fontSize: 12.5 }}>These aren't the same course — pick two sections sharing the same course code.</p></div>
      )}

      {statsA && statsB && courseA!.code === courseB!.code && (
        <>
          <div className="card" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div>
              <h3 style={{ fontSize: 14, marginBottom: 4 }}>{courseA!.code} — {label(courseA!)}</h3>
              <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>{statsA.studentCount} students</p>
              <SimpleBarChart bars={statsA.histogram.map((b) => ({ label: b.label, value: b.count }))} />
            </div>
            <div>
              <h3 style={{ fontSize: 14, marginBottom: 4 }}>{courseB!.code} — {label(courseB!)}</h3>
              <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>{statsB.studentCount} students</p>
              <SimpleBarChart bars={statsB.histogram.map((b) => ({ label: b.label, value: b.count, color: "#7C3AED" }))} />
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>Students Who Passed Each CLO</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <SimpleBarChart bars={statsA.cloStats.map((c) => ({ label: c.code, value: c.passCount }))} unit={` / ${statsA.studentCount}`} />
              <SimpleBarChart bars={statsB.cloStats.map((c) => ({ label: c.code, value: c.passCount, color: "#7C3AED" }))} unit={` / ${statsB.studentCount}`} />
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 12 }}>Students Who Passed Each PLO</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <SimpleBarChart bars={statsA.ploStats.map((p) => ({ label: p.label, value: p.passCount }))} unit={` / ${statsA.studentCount}`} />
              <SimpleBarChart bars={statsB.ploStats.map((p) => ({ label: p.label, value: p.passCount, color: "#7C3AED" }))} unit={` / ${statsB.studentCount}`} />
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}
