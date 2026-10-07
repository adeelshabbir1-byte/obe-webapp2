import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import { timetableScopeFor } from "../../../lib/timetableScope";
import { latestRunFor } from "../../../lib/timetableView";
import TimetableManager from "../../../components/TimetableManager";

export default async function TimetablePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const scope = await timetableScopeFor(user);
  const [rooms, batches, faculty, latestRun] = await Promise.all([
    prisma.room.findMany({ where: scope.roomWhere, orderBy: { name: "asc" } }),
    prisma.batch.findMany({ where: { coordinatorId: { in: scope.coordinatorIds } }, include: { scheduleConfig: true } }),
    prisma.user.findMany({ where: { managedById: { in: scope.coordinatorIds }, role: { in: ["SUBJECT_EXPERT", "INSTRUCTOR"] } }, orderBy: { name: "asc" } }),
    latestRunFor(user.managedById || "", scope.key),
  ]);

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Timetable</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Set up rooms, per-batch scheduling windows, and faculty availability, then generate a conflict-checked
        timetable. Currently planning: <b>{scope.label}</b>{scope.mode === "SHARED" ? " (shared with the other departments that use the common timetable)" : " (this department only, with its own rooms)"}.
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
