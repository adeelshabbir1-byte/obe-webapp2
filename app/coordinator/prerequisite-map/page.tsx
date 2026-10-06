import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { courseLegendEntry } from "../../../lib/courseTypeColors";
import { coordinatorIdsFor, roleLabel } from "../../../lib/reportScope";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import InteractiveCourseMap from "../../../components/InteractiveCourseMap";
import ConfirmPrerequisitesButton from "../../../components/ConfirmPrerequisitesButton";
import BatchCoursesQuickEditTable from "../../../components/BatchCoursesQuickEditTable";


export default async function PrerequisiteMapPage({ searchParams }: { searchParams: { degree?: string; batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  // Prerequisite-setting itself is still Program Coordinator-only (see the
  // /prerequisite API route) — everyone else here is viewing, not editing,
  // so they can see how a batch's courses sequence without being able to
  // change it out from under the Coordinator who owns it.
  if (!["PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "OMC", "CHAIRMAN"].includes(user.role)) redirect("/dashboard");
  const canEdit = user.role === "PROGRAM_COORDINATOR";

  const coordinatorIds = await coordinatorIdsFor(user);
  const allBatches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const degrees = Array.from(new Set(allBatches.map((b) => b.degreeProgram)));
  const selectedDegree = searchParams.degree || degrees[0] || "";
  const batchesForDegree = allBatches.filter((b) => b.degreeProgram === selectedDegree);
  // A batchId from the URL only makes sense if it actually belongs to the
  // selected degree — otherwise it's a stale value left over from
  // switching the Degree dropdown without also re-picking a batch (the
  // form submits both fields together, so an out-of-sync batchId from
  // the previous selection was silently winning over the new degree).
  const requestedBatchId = searchParams.batchId && batchesForDegree.some((b) => b.id === searchParams.batchId) ? searchParams.batchId : "";
  const selectedBatchId = requestedBatchId || batchesForDegree[0]?.id || "";

  const courses = selectedBatchId
    ? await prisma.course.findMany({ where: { batchId: selectedBatchId }, include: { masterCourse: { select: { category: true } } }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] })
    : [];

  // Keyed by label (not raw courseType) so an MG-coded "Elective" course
  // gets its own "University Elective" swatch instead of collapsing into
  // the same legend entry as a plain domain elective of the same type.
  const legendEntries = Array.from(
    new Map(courses.map((c) => courseLegendEntry(c.courseType, c.code)).map((entry) => [entry.label, entry])).values()
  );

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Prerequisite Map</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        One row per semester, boxes color-coded by course type. Click two courses to set a prerequisite link.
      </p>

      <div className="card">
        <form method="GET" style={{ display: "flex", gap: 14, alignItems: "flex-end" }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Degree</label>
            <select name="degree" defaultValue={selectedDegree} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              {degrees.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4 }}>Batch</label>
            <select name="batchId" defaultValue={selectedBatchId} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
              {batchesForDegree.map((b) => <option key={b.id} value={b.id}>{b.batchName}</option>)}
            </select>
          </div>
          <button type="submit" className="btn btn-brass">Show Map</button>
        </form>
      </div>

      {(() => {
        const pendingBatches = allBatches.filter((b) => !b.prerequisitesConfirmedAt);
        if (pendingBatches.length === 0) return null;
        return (
          <div className="card" style={{ background: "#FBEED2" }}>
            <h3 style={{ fontSize: 13, marginBottom: 8 }}>Still needs a prerequisite map ({pendingBatches.length})</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {pendingBatches.map((b) => (
                <a
                  key={b.id}
                  href={`/coordinator/prerequisite-map?degree=${encodeURIComponent(b.degreeProgram)}&batchId=${b.id}`}
                  style={{ fontSize: 12, color: "#96650F", textDecoration: "underline", background: b.id === selectedBatchId ? "#F5DDA3" : "transparent", padding: "2px 6px", borderRadius: 3 }}
                >
                  {b.degreeProgram} — {b.batchName}
                </a>
              ))}
            </div>
          </div>
        );
      })()}

      {canEdit && selectedBatchId && (
        <ConfirmPrerequisitesButton
          batchId={selectedBatchId}
          confirmedAt={batchesForDegree.find((b) => b.id === selectedBatchId)?.prerequisitesConfirmedAt?.toISOString() || null}
        />
      )}

      {legendEntries.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {legendEntries.map((entry) => (
              <span key={entry.label} style={{ fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 14, height: 14, background: entry.color, display: "inline-block", borderRadius: 3 }} />
                {entry.label}
              </span>
            ))}
          </div>
        </div>
      )}

      <InteractiveCourseMap
        key={selectedBatchId || "none"}
        mode="prereq"
        readOnly={!canEdit}
        courses={courses.map((c) => ({
          id: c.id, code: c.code, title: c.title, courseType: c.courseType, creditHours: c.creditHours,
          semesterNumber: c.semesterNumber, prerequisiteCourseId: c.prerequisiteCourseId, isOffered: c.isOffered,
          masterCourseId: c.masterCourseId,
          trackName: c.trackName, isNonCredit: c.isNonCredit, contactHours: c.contactHours,
          // Which restricted pool to offer, if any — Elective slots pick
          // from Domain Elective, IDS-III/IV "institution-selected"
          // slots pick from the separate, smaller Domain IDS pool. The
          // two are never interchangeable: an IDS slot must never offer
          // the full elective catalog, so this is checked by course
          // type first, not just by whether a MasterCourse link exists.
          // Every Elective-type course stays clickable to re-pick, even
          // one that's already filled in — a batch inherits whatever the
          // previous batch had chosen by default, and this is how that
          // default gets changed for the new batch without starting the
          // slot over from scratch.
          slotCategory:
            c.courseType === "Elective" ? "Domain Elective"
            : c.courseType === "IDS" && c.masterCourse?.category !== "Domain IDS" && c.masterCourse?.category !== "IDS" ? "Domain IDS"
            : null,
        }))}
      />

      {canEdit && selectedBatchId && (
        <BatchCoursesQuickEditTable
          key={selectedBatchId}
          initialCourses={courses.map((c) => ({ id: c.id, code: c.code, title: c.title, creditHours: c.creditHours, semesterNumber: c.semesterNumber }))}
        />
      )}
    </Shell>
  );
}
