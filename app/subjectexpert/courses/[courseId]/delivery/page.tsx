import { redirect, notFound } from "next/navigation";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import CourseSubNav from "../../../../../components/CourseSubNav";
import GuidanceThread from "../../../../../components/GuidanceThread";
import { navForRole } from "../../../../../components/reportNav";

export default async function DeliveryPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "SUBJECT_EXPERT") redirect("/dashboard");

  const course = await prisma.course.findUnique({
    where: { id: params.courseId },
    include: {
      instructor: true,
      lectureRows: { where: { source: "INSTRUCTOR" }, orderBy: { lectureNumber: "asc" } },
      guidanceComments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!course || course.subjectExpertId !== user.id) notFound();

  const delivered = course.lectureRows.filter((r) => r.actualDate !== null).length;
  const total = course.lectureRows.length;

  return (
    <Shell roleLabel="Subject Expert" userName={user.name} navLinks={navForRole(user.role)}>
      <CourseSubNav courseId={course.id} active="delivery" code={course.code} title={course.title} status={course.templateStatus} />

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>How This Course Was Actually Taught</h3>
        {!course.instructor ? (
          <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No Instructor assigned to this course yet.</p>
        ) : (
          <>
            <p style={{ fontSize: 12.5, marginBottom: 4 }}><b>{course.instructor.name}</b> is teaching this course.</p>
            {total > 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--slate)" }}>{delivered} of {total} lectures logged so far.</p>
            ) : (
              <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No lectures logged yet.</p>
            )}
            <a href={`/omc/reports/log-file?courseId=${course.id}`} className="btn" style={{ fontSize: 11.5, marginTop: 8, textDecoration: "none", display: "inline-block" }}>
              View Full Delivery Log
            </a>
          </>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Delivery Feedback</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 14 }}>
          A running conversation between you and {course.instructor?.name || "the Instructor"} (and visible to
          OMC too) about how this course is actually being delivered — pacing, topic coverage, anything
          worth flagging or praising, separate from the CLO/lecture plan itself.
        </p>
        <GuidanceThread
          courseId={course.id}
          apiBase="/api/instructor"
          initialComments={course.guidanceComments.map((g) => ({ id: g.id, body: g.body, authorRole: g.authorRole, createdAt: g.createdAt.toISOString() }))}
        />
      </div>
    </Shell>
  );
}
