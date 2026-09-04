import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import CourseSubNav from "../../../../../components/CourseSubNav";
import ClosManager from "../../../../../components/ClosManager";
import CourseDescriptionFieldsForm from "../../../../../components/CourseDescriptionFieldsForm";
import LoadHecContentButton from "../../../../../components/LoadHecContentButton";

const NAV = [{ href: "/subjectexpert/courses", label: "My Assigned Courses" }];

export default async function ClosPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");

  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    include: { clos: { where: { source: "SE" }, orderBy: { code: "asc" } }, benchmarkSource: { include: { batch: true } } },
  });
  if (!course || course.subjectExpertId !== user.id) notFound();

  // PLOs are restricted to only what OMC has assigned to THIS course via
  // the PLO–Course matrix — not the full list of the program's PLOs.
  const mappings = await prisma.coursePloMapping.findMany({
    where: { courseId: course.id },
    include: { plo: true },
    orderBy: { plo: { number: "asc" } },
  });
  const plos = mappings.map((m) => m.plo);

  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={NAV}>
      <CourseSubNav courseId={course.id} active="clos" code={course.code} title={course.title} status={course.templateStatus} />
      {course.benchmarkSource && (
        <div className="card" style={{ borderColor: "var(--brass)" }}>
          <p style={{ fontSize: 12.5, color: "var(--brass-dark)" }}>
            This template was pre-filled from the {course.benchmarkSource.batch ? `${course.benchmarkSource.batch.degreeProgram} — ${course.benchmarkSource.batch.batchName}` : "previous"} offering of this course.
            Review it and make any changes needed for this batch, rather than starting from scratch.
          </p>
        </div>
      )}
      {course.masterCourseId && course.clos.length === 0 && <LoadHecContentButton courseId={course.id} />}
      <ClosManager
        courseId={course.id}
        initialClos={course.clos.map((c) => ({ id: c.id, code: c.code, statement: c.statement, bloomLevel: c.bloomLevel, mappedPloId: c.mappedPloId, ploContributionPct: c.ploContributionPct }))}
        plos={plos.map((p) => ({ id: p.id, number: p.number, title: p.title, status: p.status }))}
      />
      <CourseDescriptionFieldsForm
        courseId={course.id}
        initial={{
          textbook: course.textbook || "", referenceMaterial: course.referenceMaterial || "",
          catalogDescription: course.catalogDescription || "", programmingAssignmentsNote: course.programmingAssignmentsNote || "",
          labInstructorName: course.labInstructorName || "",
        }}
      />
    </Shell>
  );
}
