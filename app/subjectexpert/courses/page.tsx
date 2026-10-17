import { redirect } from "next/navigation";
import SortableTable from "../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import TrainingBanner from "../../../components/TrainingBanner";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import Link from "next/link";
import { seProgressFor } from "../../../lib/seProgress";
import { currentTermIndexFor, isPastTerm, courseTermIndex, termLabel } from "../../../lib/courseTerm";
import ProgressBar from "../../../components/ProgressBar";
import HandBackCourse from "../../../components/HandBackCourse";


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
  const own = allAssigned.filter((c) => !c.contentSyncMember || c.contentSyncMember.isBase);
  // Courses of terms that are already over (already taught) leave the working list; they stay on record below.
  // A sync group's base course stands for every copy that follows it: it only counts as "already taught" when every
  // copy of it assigned to you is too (otherwise the later batches' work, and the Decline button, would disappear).
  const curIdx = new Map<string, number | null>();
  for (const id of Array.from(new Set(allAssigned.map((c) => c.coordinatorId)))) curIdx.set(id, await currentTermIndexFor(id));
  const past = (c: (typeof allAssigned)[number]) => isPastTerm(c, curIdx.get(c.coordinatorId) ?? null);
  const pastCourses = own.filter((c) => {
    if (!past(c)) return false;
    const gid = c.contentSyncMember?.groupId;
    return !gid || allAssigned.filter((x) => x.contentSyncMember?.groupId === gid).every(past);
  });
  const courses = own.filter((c) => !pastCourses.includes(c));
  const courseIds = courses.map((c) => c.id);

  const progressByCourse = await seProgressFor(courses);

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
                  <td><ProgressBar steps={steps} showPending /></td>
                  <td>{statusLabel(c.templateStatus)}</td>
                  <td style={{ whiteSpace: "nowrap" }}><Link href={`/subjectexpert/courses/${c.id}/clos`} className="act act-primary">Open</Link>{(c.templateStatus === "draft" || c.templateStatus === "changes-requested" || c.templateStatus === "reopened") && <HandBackCourse courseId={c.id} code={c.code} />}</td>
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
      <TrainingBanner user={user} />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Build the gold-standard template for each course: CLOs, the 30-lecture schedule, and assessment weights.
        Courses that just copy their content from a linked base course elsewhere aren't listed here — there's
        nothing to edit on them. If a course is outside your specialisation, press Decline next to it and give a reason: it goes back
        to whoever assigned it. Once you have submitted a plan to the OMC, ask the person who assigned it instead.
      </p>

      <h2 style={{ fontSize: 15, marginBottom: 8 }}>Pending ({pending.length})</h2>
      {renderTable(pending)}

      <h2 style={{ fontSize: 15, margin: "24px 0 8px" }}>Submitted to OMC ({submitted.length})</h2>
      {renderTable(submitted)}

      {pastCourses.length > 0 && (
        <details className="card" style={{ marginTop: 24 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>Already taught — past terms ({pastCourses.length})</summary>
          <p style={{ fontSize: 12.5, color: "var(--slate)" }}>These offerings are over, so they are no longer on your list of work. Your plans for them stay on record.</p>
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Code</th><th>Title</th><th>Batch</th><th>Term</th><th>Plan</th><th></th></tr></thead>
            <tbody>{pastCourses.map((c) => { const t = courseTermIndex(c); return (
              <tr key={c.id}><td>{c.code}</td><td>{c.title}</td><td>{c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—"}</td><td>{t !== null ? termLabel(t) : "—"}</td><td>{statusLabel(c.templateStatus)}</td><td><Link href={`/subjectexpert/courses/${c.id}/clos`} className="act">View</Link></td></tr>
            ); })}</tbody>
          </table>
        </details>
      )}
    </Shell>
  );
}
