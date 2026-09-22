import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import TimetableManager from "../../../components/TimetableManager";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/assign-subject-experts", label: "Assign Subject Experts" },
  { href: "/coordinator/semester", label: "Current Semester" },
  { href: "/coordinator/timetable", label: "Timetable" },
  { href: "/omc/reports", label: "OMC Reports" },
];

export default async function TimetablePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const [rooms, batches, faculty, latestRun] = await Promise.all([
    prisma.room.findMany({ where: { chairmanId: user.managedById || "" }, orderBy: { name: "asc" } }),
    prisma.batch.findMany({ where: { coordinatorId: user.id }, include: { scheduleConfig: true } }),
    prisma.user.findMany({ where: { managedById: user.id, role: { in: ["SUBJECT_EXPERT", "INSTRUCTOR"] } }, orderBy: { name: "asc" } }),
    prisma.timetableRun.findFirst({ where: { chairmanId: user.managedById || "" }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Timetable</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Set up rooms, per-batch scheduling windows, and faculty availability, then generate a conflict-checked
        timetable across your whole institution.
      </p>
      <TimetableManager
        rooms={rooms.map((r) => ({ id: r.id, name: r.name, type: r.type, capacity: r.capacity }))}
        batches={batches.map((b) => ({
          id: b.id, label: `${b.degreeProgram} — ${b.batchName}`,
          workingDays: b.scheduleConfig ? JSON.parse(b.scheduleConfig.workingDaysJson) : ["Mon", "Tue", "Wed", "Thu", "Fri"],
          dailyStartHour: b.scheduleConfig?.dailyStartHour ?? 8, dailyEndHour: b.scheduleConfig?.dailyEndHour ?? 16,
        }))}
        faculty={faculty.map((f) => ({ id: f.id, name: f.name }))}
        latestRunId={latestRun?.id || null}
      />
    </Shell>
  );
}
