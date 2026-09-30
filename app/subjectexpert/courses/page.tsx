import { redirect } from "next/navigation";
import SortableTable from "../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import Link from "next/link";


function statusLabel(status: string) {
  const map: Record<string, string> = {
    draft: "Draft", submitted: "Submitted", approved: "Approved", "changes-requested": "Changes Requested",
  };
  return map[status] || status;
}

export default async function SubjectExpertCoursesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");

  const courses = await prisma.course.findMany({
    where: { subjectExpertId: user.id },
    orderBy: [{ batch: { startYear: "desc" } }, { batch: { startTerm: "asc" } }, { code: "asc" }],
    include: {
      batch: true,
      contentSyncMember: { include: { group: { include: { members: { where: { isBase: true }, include: { course: { include: { batch: true } } } } } } } },
    },
  });

  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My Assigned Courses</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Build the gold-standard template for each course: CLOs, the 30-lecture schedule, and assessment weights.
        Rows marked <span style={{ background: "#FFF9C4", padding: "1px 5px" }}>Inherited</span> are read-only — they copy their content
        automatically from their linked base course, which is where the actual editing happens.
      </p>
      <div className="card">
        <SortableTable>
          <thead><tr><th>Code</th><th>Title</th><th>Batch / Semester</th><th>Base or Follower</th><th>Template Status</th><th></th></tr></thead>
          <tbody>
            {courses.length === 0 && (
              <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No courses assigned to you yet.</td></tr>
            )}
            {courses.map((c) => {
              const batchLabel = c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—";
              const isFollower = !!c.contentSyncMember && !c.contentSyncMember.isBase;
              const baseCourse = c.contentSyncMember?.group.members[0]?.course || null;
              return (
                <tr key={c.id}>
                  <td>{c.code}</td>
                  <td>{c.title}</td>
                  <td style={{ fontSize: 12.5 }}>{batchLabel}</td>
                  <td>
                    {isFollower ? (
                      <span style={{ background: "#FFF9C4", padding: "1px 7px", borderRadius: 4, fontSize: 11.5 }}>
                        Inherited{baseCourse?.batch ? ` (from ${baseCourse.batch.degreeProgram} — ${baseCourse.batch.batchName})` : ""}
                      </span>
                    ) : c.contentSyncMember ? (
                      <span style={{ background: "#E8F5E9", padding: "1px 7px", borderRadius: 4, fontSize: 11.5 }}>Base — edit here</span>
                    ) : (
                      <span style={{ color: "var(--slate)", fontSize: 11.5 }}>Standalone</span>
                    )}
                  </td>
                  <td>{statusLabel(c.templateStatus)}</td>
                  <td><Link href={`/subjectexpert/courses/${c.id}/clos`} style={{ color: "var(--brass-dark)", fontSize: 12.5 }}>Open</Link></td>
                </tr>
              );
            })}
          </tbody>
        </SortableTable>
      </div>
    </Shell>
  );
}
