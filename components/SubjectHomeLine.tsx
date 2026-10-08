import { prisma } from "../lib/db";

// "Subject home: Mathematics" - which department owns a course's subject. Shown in every course's details header.
export default async function SubjectHomeLine({ courseId }: { courseId: string }) {
  const c = await prisma.course.findUnique({
    where: { id: courseId },
    select: { subjectHomeDepartment: { select: { name: true } }, coordinator: { select: { department_: { select: { name: true } } } }, contentSyncMember: { select: { isBase: true } } },
  });
  if (!c) return null;
  const own = !c.subjectHomeDepartment;
  const name = c.subjectHomeDepartment?.name || c.coordinator?.department_?.name || "this program's own department";
  const follows = !!c.contentSyncMember && !c.contentSyncMember.isBase;
  return (
    <div style={{ color: "var(--slate)", fontSize: 12.5, marginTop: 3 }}>
      Subject home: <strong>{name}</strong>{own ? " (own department)" : ""}{follows ? " - taken from its linked base course" : ""}
    </div>
  );
}
