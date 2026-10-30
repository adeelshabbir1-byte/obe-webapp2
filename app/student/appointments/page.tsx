import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { prisma } from "../../../lib/db";
import StudentShell from "../../../components/StudentShell";
import AppointmentBooking from "../../../components/AppointmentBooking";
import { localDay, mondayOf } from "../../../lib/calendarCore";
import { CAL_HINT, calendarView, myRequests, teachersForStudent, type Appt } from "../../../lib/teacherCalendar";

export const dynamic = "force-dynamic";

// Student: ask one of your teachers (or your batch advisor) for an appointment in one of their free slots.
export default async function StudentAppointments({ searchParams }: { searchParams: { t?: string; week?: string } }) {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  if (st.mustChangePassword) redirect("/student/change-password");
  const people = await teachersForStudent(st.id).catch(() => []);
  const chosen = people.find((p) => p.id === searchParams.t) || null;
  const monday = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(searchParams.week || "") ? searchParams.week! : localDay(Date.now()));
  let missing = false, mine: Appt[] = [], view = null as null | { items: Awaited<ReturnType<typeof calendarView>>["items"]; free: { start: number; end: number }[]; open: boolean };
  try {
    mine = await myRequests(st.id);
    if (chosen) { const v = await calendarView(chosen.id, monday, 7, false); view = { items: v.items, free: v.free, open: v.settings.open }; }
  } catch { missing = true; }
  const names = await prisma.user.findMany({ where: { id: { in: mine.map((a) => a.teacherId).concat(["none"]) } }, select: { id: true, name: true } });

  return (
    <StudentShell studentName={st.name}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Appointments</h1>
        <p className="small-note" style={{ marginBottom: 10 }}>Ask one of your teachers or your batch advisor for a meeting. Pick a free time and say what it is about; you will be told when they reply.</p>
        {missing && <div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{CAL_HINT}</p></div>}
        {people.length === 0 && <div className="card"><p className="small-note" style={{ margin: 0 }}>You have no teachers this semester yet.</p></div>}
        <AppointmentBooking base="/student/appointments" api="/api/student/appointments" people={people} chosen={chosen} monday={monday} view={view} mine={mine} nameOf={Object.fromEntries(names.map((n) => [n.id, n.name]))} />
      </div>
    </StudentShell>
  );
}
