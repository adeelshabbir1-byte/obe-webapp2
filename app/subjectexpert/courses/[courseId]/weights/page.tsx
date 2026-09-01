import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import CourseSubNav from "../../../../../components/CourseSubNav";
import WeightsForm from "../../../../../components/WeightsForm";

const NAV = [{ href: "/subjectexpert/courses", label: "My Assigned Courses" }];

export default async function WeightsPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");

  const course = await prisma.course.findUnique({ where: { id: params.courseId }, include: { coordinator: true } });
  if (!course || course.subjectExpertId !== user.id) notFound();

  const pendingException = await prisma.weightExceptionRequest.findUnique({ where: { courseId: course.id } });
  const policy = await prisma.weightPolicy.findUnique({
    where: { chairmanId_courseType: { chairmanId: course.coordinator.managedById || "", courseType: course.courseType } },
  });

  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={NAV}>
      <CourseSubNav courseId={course.id} active="weights" code={course.code} title={course.title} status={course.templateStatus} />

      {policy && (
        <div className="card">
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>OMC Weight Policy for {course.courseType} courses</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12, color: "var(--slate)" }}>
            <span>Assignment: <b style={{ color: "var(--ink)" }}>{policy.assignmentMin}–{policy.assignmentMax}%</b></span>
            <span>Quiz: <b style={{ color: "var(--ink)" }}>{policy.quizMin}–{policy.quizMax}%</b></span>
            <span>Project: <b style={{ color: "var(--ink)" }}>{policy.projectMin}–{policy.projectMax}%</b></span>
            <span>Lab: <b style={{ color: "var(--ink)" }}>{policy.labMin}–{policy.labMax}%</b></span>
            <span>Midterm: <b style={{ color: "var(--ink)" }}>{policy.midtermMin}–{policy.midtermMax}%</b></span>
            <span>Final: <b style={{ color: "var(--ink)" }}>{policy.finalMin}–{policy.finalMax}%</b></span>
          </div>
        </div>
      )}

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
      />
    </Shell>
  );
}
