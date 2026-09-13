import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { roleLabel } from "../../../lib/reportScope";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import MyAvailabilityManager from "../../../components/MyAvailabilityManager";

export default async function MyAvailabilityPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!["SUBJECT_EXPERT", "INSTRUCTOR"].includes(user.role)) redirect("/dashboard");

  const records = await prisma.facultyUnavailability.findMany({ where: { facultyId: user.id }, orderBy: [{ dayOfWeek: "asc" }, { startHour: "asc" }] });

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My Availability</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Mark times you're unavailable to teach — this feeds directly into the Coordinator's timetable generator.
      </p>
      <MyAvailabilityManager initialRecords={records.map((r) => ({ id: r.id, dayOfWeek: r.dayOfWeek, startHour: r.startHour, endHour: r.endHour, note: r.note }))} />
    </Shell>
  );
}
