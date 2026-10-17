import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor, roleLabel } from "../../../lib/reportScope";
import { navForRole } from "../../../components/reportNav";
import { getTimetableEntries, timeRangeLabel, DAY_ORDER } from "../../../lib/timetableView";
import ScheduleGrid, { type GridCell } from "../../../components/ScheduleGrid";
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
      {entries.length > 0 && (() => {
        const days = DAY_ORDER.filter((d) => entries.some((e) => e.dayOfWeek === d));
        const times = Array.from(new Map(entries.map((e) => [`${e.startHour}-${e.endHour}`, { key: `${e.startHour}-${e.endHour}`, label: e.timeLabel, s: e.startHour }])).values()).sort((a, b) => a.s - b.s);
        const cells = new Map<string, GridCell[]>();
        for (const e of entries) { const k = `${e.dayOfWeek}|${e.startHour}-${e.endHour}`; cells.set(k, [...(cells.get(k) || []), { title: `${e.courseCode} ${e.sectionLabel || ""}`.trim(), sub: `${e.roomName} · ${e.courseTitle}`, tone: "class" }]); }
        return <div className="card" style={{ marginBottom: 16 }}><ScheduleGrid corner="Day" rows={days.map((d) => ({ key: d, label: d }))} cols={times} cells={cells} /></div>;
      })()}
      <TimetableView entries={entries} />
    </Shell>
  );
}
