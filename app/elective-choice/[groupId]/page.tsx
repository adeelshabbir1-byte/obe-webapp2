import { notFound } from "next/navigation";
import { prisma } from "../../../lib/db";
import ElectiveChoiceForm from "../../../components/ElectiveChoiceForm";

export default async function ElectiveChoicePage({ params }: { params: { groupId: string } }) {
  const group = await prisma.electiveSlotGroup.findUnique({
    where: { id: params.groupId },
    include: {
      batch: { select: { degreeProgram: true, batchName: true } },
      options: { include: { course: { select: { code: true, title: true, catalogDescription: true } }, choices: { select: { id: true } } } },
    },
  });
  if (!group) notFound();

  const options = group.options.map((o) => ({
    id: o.id, courseCode: o.course.code, courseTitle: o.course.title, description: o.course.catalogDescription,
    capacity: o.capacity, seatsTaken: o.choices.length, full: o.capacity !== null && o.choices.length >= o.capacity,
  }));

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F7F9FE", padding: 20 }}>
      <div style={{ background: "#fff", padding: "36px 40px", maxWidth: 560, width: "100%", border: "1px solid #E3E8F3" }}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>{group.label}</h1>
        <p style={{ fontSize: 12.5, color: "#46507A", marginBottom: 20 }}>
          {group.batch.degreeProgram} — {group.batch.batchName} · Semester {group.semesterNumber}
        </p>
        {group.finalized ? (
          <p style={{ fontSize: 14, color: "#46507A" }}>Registration for this elective has closed and choices have been finalized. Contact your Program Coordinator if you have questions.</p>
        ) : (
          <ElectiveChoiceForm groupId={group.id} initialOptions={options} registrationOpen={group.registrationOpen} />
        )}
      </div>
    </div>
  );
}
