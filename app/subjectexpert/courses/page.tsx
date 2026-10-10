import { redirect } from "next/navigation";
import SortableTable from "../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import Link from "next/link";
import { buildSeProgress, ProgressStep } from "../../../lib/courseProgress";
import ProgressBar from "../../../components/ProgressBar";


function statusLabel(status: string) {
  const map: Record<string, string> = {
    draft: "Draft", submitted: "Submitted", approved: "Approved", "changes-requested": "Changes Requested", reopened: "Reopened for changes",
  };
  return map[status] || status;
}

export default async function SubjectExpertCoursesPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");
  if (user.isPlatformExpert) redirect("/master-design");

  const allAssigned = await prisma.course.findMany({
    where: { subjectExpertId: user.id },
    orderBy: [{ batch: { startYear: "desc" } }, { batch: { startTerm: "asc" } }, { code: "asc" }],
    include: {
      batch: true,
      contentSyncMember: { include: { group: { include: { members: { where: { isBase: true }, include: { course: { include: { batch: true } } } } } } } },
    },
  });

  // Follower ("Inherited") courses copy their content automatically from
  // their base course and are read-only for the SE — there is nothing to
  // do on them, so they no longer clutter this list at all. Only base or
  // standalone (non-synced) courses are actual work items.
  const courses = allAssigned.filter((c) => !c.contentSyncMember || c.contentSyncMember.isBase);
  const courseIds = courses.map((c) => c.id);

  const [clos, lectureRows, instruments, links, paperItems] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId: { in: courseIds }, source: "SE" } }),
    prisma.lectureRow.findMany({ where: { courseId: { in: courseIds }, source: "SE" } }),
    prisma.assessmentInstrument.findMany({ where: { courseId: { in: courseIds }, source: "SE" } }),
    prisma.lectureRowInstrument.findMany({ where: { instrument: { courseId: { in: courseIds }, source: "SE" } }, select: { instrumentId: true } }),
    prisma.paperDistributionItem.findMany({ where: { courseId: { in: courseIds }, source: "SE" }, select: { courseId: true, examType: true } }),
  ]);

  const linkedInstrumentIds = new Set(links.map((l) => l.instrumentId));

  const progressByCourse = new Map<string, ProgressStep[]>();
  for (const c of courses) {
    const cClos = clos.filter((x) => x.courseId === c.id);
    const cLectures = lectureRows.filter((x) => x.courseId === c.id);
    const cInstruments = instruments.filter((x) => x.courseId === c.id);
    const instrumentsWithNoLink = cInstruments.filter((i) => !linkedInstrumentIds.has(i.id)).length;
    const cPaperItems = paperItems.filter((x) => x.courseId === c.id);
    progressByCourse.set(c.id, buildSeProgress({
      cloCount: cClos.length,
      lectureCount: cLectures.length,
      lectureMappedCount: cLectures.filter((r) => !!r.cloId).length,
      instrumentCount: cInstruments.length,
      instrumentsWithNoLink,
      midtermPaperCount: cPaperItems.filter((p) => p.examType === "Midterm").length,
      finalPaperCount: cPaperItems.filter((p) => p.examType === "Final").length,
      templateStatus: c.templateStatus,
    }));
  }

  const pending = courses.filter((c) => c.templateStatus === "draft" || c.templateStatus === "changes-requested" || c.templateStatus === "reopened");
  const submitted = courses.filter((c) => c.templateStatus === "submitted" || c.templateStatus === "approved");

  function renderTable(list: typeof courses) {
    return (
      <div className="card">
        <SortableTable>
          <thead><tr><th>Code</th><th>Title</th><th>Batch / Semester</th><th>Progress</th><th>Template Status</th><th></th></tr></thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={6} style={{ color: "var(--slate)" }}>None here.</td></tr>
            )}
            {list.map((c) => {
              const batchLabel = c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—";
              const steps = progressByCourse.get(c.id) || [];
              return (
                <tr key={c.id}>
                  <td>{c.code}</td>
                  <td>{c.title}</td>
                  <td style={{ fontSize: 12.5 }}>{batchLabel}</td>
                  <td><ProgressBar steps={steps} /></td>
                  <td>{statusLabel(c.templateStatus)}</td>
                  <td><Link href={`/subjectexpert/courses/${c.id}/clos`} className="act act-primary">Open</Link></td>
                </tr>
              );
            })}
          </tbody>
        </SortableTable>
      </div>
    );
  }

  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My Assigned Courses</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Build the gold-standard template for each course: CLOs, the 30-lecture schedule, and assessment weights.
        Courses that just copy their content from a linked base course elsewhere aren't listed here — there's
        nothing to edit on them.
      </p>

      <h2 style={{ fontSize: 15, marginBottom: 8 }}>Pending ({pending.length})</h2>
      {renderTable(pending)}

      <h2 style={{ fontSize: 15, margin: "24px 0 8px" }}>Submitted to OMC ({submitted.length})</h2>
      {renderTable(submitted)}
    </Shell>
  );
}
