import { notFound } from "next/navigation";
import { prisma } from "../../../lib/db";
import ElectiveChoiceForm from "../../../components/ElectiveChoiceForm";
import { getAuthenticatedStudent } from "../../../lib/studentSession";

export default async function ElectiveChoicePage({ params }: { params: { groupId: string } }) {
  const group = await prisma.electiveSlotGroup.findUnique({
    where: { id: params.groupId },
    include: {
      batch: { select: { degreeProgram: true, batchName: true } },
      options: { include: { course: { select: { code: true, title: true, catalogDescription: true } }, choices: { select: { id: true } } } },
    },
  });
  if (!group) notFound();
  const student = await getAuthenticatedStudent();

  const options = group.options.map((o) => ({
    id: o.id, courseCode: o.course.code, courseTitle: o.course.title, description: o.course.catalogDescription,
    capacity: o.capacity, seatsTaken: o.choices.length, full: o.capacity !== null && o.choices.length >= o.capacity,
  }));

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F4EA", padding: 20 }}>
      <div style={{ background: "#fff", padding: "36px 40px", maxWidth: 560, width: "100%", border: "1px solid #E4DFCE" }}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>{group.label}</h1>
        <p style={{ fontSize: 12.5, color: "#5B6B7C", marginBottom: 20 }}>
          {group.batch.degreeProgram} — {group.batch.batchName} · Semester {group.semesterNumber}
        </p>
        {group.finalized ? (
          <p style={{ fontSize: 14, color: "#5B6B7C" }}>Registration for this elective has closed and choices have been finalized. Contact your Program Coordinator if you have questions.</p>
        ) : !student ? (
          <div>
            <p style={{ fontSize: 14, color: "#5B6B7C", marginBottom: 14 }}>Please sign in with your student login to choose your elective. Your roll number is your username.</p>
            <a href="/student/login" style={{ display: "inline-block", padding: "10px 24px", background: "#B08D57", color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>Sign in</a>
            <p style={{ fontSize: 12, color: "#5B6B7C", marginTop: 14 }}>After signing in, open this same link again.</p>
          </div>
        ) : student.batchId !== group.batchId ? (
          <p style={{ fontSize: 14, color: "#5B6B7C" }}>This elective is not for your batch.</p>
        ) : (
          <ElectiveChoiceForm groupId={group.id} initialOptions={options} registrationOpen={group.registrationOpen} />
        )}
      </div>
    </div>
  );
}
