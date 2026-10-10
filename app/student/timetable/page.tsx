import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { prisma } from "../../../lib/db";
import { getTimetableEntries, timeRangeLabel } from "../../../lib/timetableView";
import TimetableView from "../../../components/TimetableView";
import StudentShell from "../../../components/StudentShell";

export default async function StudentTimetablePage() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  if (student.mustChangePassword) redirect("/student/change-password");

  const batch = await prisma.batch.findUnique({ where: { id: student.batchId } });
  const coordinator = batch ? await prisma.user.findUnique({ where: { id: batch.coordinatorId } }) : null;
  const chairmanId = coordinator?.managedById || "";

  const allEntries = chairmanId ? await getTimetableEntries(chairmanId) : [];
  const entries = allEntries
    .filter((e) => batch && e.batchIds.includes(batch.id))
    .map((e) => ({ ...e, timeLabel: timeRangeLabel(e.startHour, e.endHour) }));

  return (
    <StudentShell studentName={student.name}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, flexWrap: "wrap", gap: 10 }}>
          <h1 style={{ fontSize: 22 }}>My Timetable</h1>
        </div>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 20 }}>
          Your batch's weekly class schedule — room, time, course, and instructor.
        </p>
        <TimetableView entries={entries} />
      </div>
    </StudentShell>
  );
}
