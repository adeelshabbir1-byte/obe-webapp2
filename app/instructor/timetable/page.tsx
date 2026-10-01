import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor, roleLabel } from "../../../lib/reportScope";
import { navForRole } from "../../../components/reportNav";
import { getTimetableEntries, timeRangeLabel } from "../../../lib/timetableView";
import Shell from "../../../components/Shell";
import TimetableView from "../../../components/TimetableView";

export default async function InstructorTimetablePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!["INSTRUCTOR", "SUBJECT_EXPERT"].includes(user.role)) redirect("/dashboard");

  const chairmanId = await chairmanIdFor(user);
  const allEntries = chairmanId ? await getTimetableEntries(chairmanId) : [];
  const entries = allEntries
    .filter((e) => e.instructorId === user.id)
    .map((e) => ({ ...e, timeLabel: timeRangeLabel(e.startHour, e.endHour) }));

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My Timetable</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Your own teaching schedule — every section assigned to you, across any batch.
      </p>
      <TimetableView entries={entries} />
    </Shell>
  );
}
