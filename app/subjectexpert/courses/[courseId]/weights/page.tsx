import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import CourseSubNav from "../../../../../components/CourseSubNav";
import WeightsForm from "../../../../../components/WeightsForm";

const NAV = [{ href: "/subjectexpert/courses", label: "My Assigned Courses" }, { href: "/omc/reports", label: "Reports" }];

export default async function WeightsPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");

  const course = await prisma.course.findUnique({ where: { id: params.courseId }, include: { coordinator: true } });
  if (!course || course.subjectExpertId !== user.id) notFound();

  const pendingException = await prisma.weightExceptionRequest.findUnique({ where: { courseId_source: { courseId: course.id, source: "SE" } } });
  const policy = await prisma.weightPolicy.findUnique({
    where: { chairmanId_courseType: { chairmanId: course.coordinator.managedById || "", courseType: course.courseType } },
  });

  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={NAV}>
      <CourseSubNav courseId={course.id} active="weights" code={course.code} title={course.title} status={course.templateStatus} />

      {pendingException && pendingException.status === "pending" && (
        <div className="card" style={{ borderColor: "var(--brass)" }}>
          <h3 style={{ fontSize: 14, marginBottom: 8, color: "var(--brass-dark)" }}>Pending OMC Approval</h3>
          <p style={{ fontSize: 12.5, color: "var(--slate)" }}>
            Your proposed weights fall outside the policy range and are waiting on OMC approval.
            The weights shown below are still your last approved/saved values until then.
          </p>
        </div>
      )}
      {pendingException && pendingException.status === "rejected" && (
        <div className="card" style={{ borderColor: "var(--rust)" }}>
          <h3 style={{ fontSize: 14, marginBottom: 8, color: "var(--rust)" }}>Weight Exception Rejected</h3>
          <p style={{ fontSize: 12.5 }}>{pendingException.omcComment || "The OMC did not approve this exception."}</p>
        </div>
      )}

      {course.templateStatus === "changes-requested" && course.omcComment && (
        <div className="card" style={{ borderColor: "var(--rust)" }}>
          <h3 style={{ fontSize: 14, marginBottom: 8, color: "var(--rust)" }}>Changes Requested by OMC</h3>
          <p style={{ fontSize: 12.5 }}>{course.omcComment}</p>
        </div>
      )}

      <WeightsForm
        courseId={course.id}
        current={{
          assignmentPct: course.assignmentPct, quizPct: course.quizPct, projectPct: course.projectPct,
          labPct: course.labPct, midtermPct: course.midtermPct, finalPct: course.finalPct,
        }}
        hasLab={course.hasLab}
        policy={policy ? {
          assignmentMin: policy.assignmentMin, assignmentMax: policy.assignmentMax,
          quizMin: policy.quizMin, quizMax: policy.quizMax,
          projectMin: policy.projectMin, projectMax: policy.projectMax,
          labMin: policy.labMin, labMax: policy.labMax,
          midtermMin: policy.midtermMin, midtermMax: policy.midtermMax,
          finalMin: policy.finalMin, finalMax: policy.finalMax,
        } : null}
      />
    </Shell>
  );
}
