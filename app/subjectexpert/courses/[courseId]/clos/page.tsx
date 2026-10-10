import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import CourseSubNav from "../../../../../components/CourseSubNav";
import ClosManager from "../../../../../components/ClosManager";
import CourseDescriptionFieldsForm from "../../../../../components/CourseDescriptionFieldsForm";
import LoadHecContentButton from "../../../../../components/LoadHecContentButton";
import ImportContentFromCourseButton from "../../../../../components/ImportContentFromCourseButton";
import CloExcelButtons from "../../../../../components/CloExcelButtons";
import { navForRole } from "../../../../../components/reportNav";


export default async function ClosPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");

  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    include: {
      clos: { where: { source: "SE" }, orderBy: { orderIndex: "asc" } },
      benchmarkSource: { include: { batch: true } },
      contentSyncMember: { include: { group: { include: { members: { where: { isBase: true }, include: { course: true } } } } } },
    },
  });
  if (!course || course.subjectExpertId !== user.id) notFound();

  // A non-base follower in a Content Sync group inherits its CLOs (and
  // everything else) from its group's base course — it's read-only here
  // on purpose, since editing it directly would just get silently
  // overwritten the next time the base's content syncs out. Only the
  // base (or a standalone course not in any group) is actually editable.
  const isFollower = !!course.contentSyncMember && !course.contentSyncMember.isBase;
  const baseCourse = course.contentSyncMember?.group.members[0]?.course || null;

  // PLOs are restricted to only what OMC has assigned to THIS course via
  // the PLO–Course matrix — not the full list of the program's PLOs.
  const mappings = await prisma.coursePloMapping.findMany({
    where: { courseId: course.id },
    include: { plo: true },
    orderBy: { plo: { number: "asc" } },
  });
  const plos = mappings.map((m) => m.plo);

  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={navForRole(user.role)}>
      <CourseSubNav courseId={course.id} active="clos" code={course.code} title={course.title} status={course.templateStatus} />
      {course.benchmarkSource && (
        <div className="card" style={{ borderColor: "var(--brass)" }}>
          <p style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>
            This template was pre-filled from the {course.benchmarkSource.batch ? `${course.benchmarkSource.batch.degreeProgram} — ${course.benchmarkSource.batch.batchName}` : "previous"} offering of this course.
            Review it and make any changes needed for this batch, rather than starting from scratch.
          </p>
        </div>
      )}
      {isFollower && (
        <div className="card" style={{ borderColor: "var(--brass)" }}>
          <p style={{ fontSize: 12.5, color: "var(--slate)" }}>
            This course's CLOs are inherited from its base course{baseCourse ? ` — ${baseCourse.code} (${baseCourse.title})` : ""} and
            can't be edited here. Any changes need to be made on the base course itself; they'll sync out to
            this one automatically.
          </p>
        </div>
      )}
      {!isFollower && course.masterCourseId && <LoadHecContentButton courseId={course.id} hasExistingClos={course.clos.length > 0} />}
      {!isFollower && <ImportContentFromCourseButton courseId={course.id} />}
      <CloExcelButtons courseId={course.id} canImport={!isFollower} />
      <ClosManager
        courseId={course.id}
        initialClos={course.clos.map((c) => ({ id: c.id, code: c.code, statement: c.statement, bloomLevel: c.bloomLevel, mappedPloId: c.mappedPloId, ploMappingSource: c.ploMappingSource, ploContributionPct: c.ploContributionPct, targetPct: c.targetPct }))}
        plos={plos.map((p) => ({ id: p.id, number: p.number, title: p.title, status: p.status }))}
        readOnly={isFollower}
      />
      {!isFollower && (
        <CourseDescriptionFieldsForm
          courseId={course.id}
          initial={{
            textbook: course.textbook || "", referenceMaterial: course.referenceMaterial || "",
            catalogDescription: course.catalogDescription || "", programmingAssignmentsNote: course.programmingAssignmentsNote || "",
            labInstructorName: course.labInstructorName || "",
          }}
        />
      )}
    </Shell>
  );
}
