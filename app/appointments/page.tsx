import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { staffOf } from "../../lib/registers";
import AppointmentBooking from "../../components/AppointmentBooking";
import { localDay, mondayOf } from "../../lib/calendarCore";
import { CAL_HINT, calendarView, myRequests, type Appt } from "../../lib/teacherCalendar";

export const dynamic = "force-dynamic";

// Book a colleague: their free slots (and, where they allow, what their busy times are), then ask with a reason.
export default async function Appointments({ searchParams }: { searchParams: { t?: string; week?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = await chairmanIdFor(user as never).catch(() => "");
  const people = chairmanId ? (await staffOf(chairmanId)).filter((s) => s.id !== user.id).map((s) => ({ id: s.id, name: s.name, as: roleLabel(s.role) })) : [];
  const chosen = people.find((p) => p.id === searchParams.t) || null;
  const monday = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(searchParams.week || "") ? searchParams.week! : localDay(Date.now()));
  let missing = false, mine: Appt[] = [], view = null as null | { items: Awaited<ReturnType<typeof calendarView>>["items"]; free: { start: number; end: number }[]; open: boolean };
  try {
    mine = await myRequests(user.id);
    if (chosen) { const v = await calendarView(chosen.id, monday, 7, false); view = { items: v.items, free: v.free, open: v.settings.open }; }
  } catch { missing = true; }
  const names = await prisma.user.findMany({ where: { id: { in: mine.map((a) => a.teacherId).concat(["none"]) } }, select: { id: true, name: true } });

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Book an appointment</h1>
      <p className="small-note" style={{ marginBottom: 10 }}>See a colleague&apos;s free times and ask for one, with a reason. They accept or decline; you both get a notification and a calendar invite. <Link href="/my-calendar">My own calendar →</Link></p>
      {missing && <div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{CAL_HINT}</p></div>}
      <AppointmentBooking base="/appointments" api="/api/calendar" people={people} chosen={chosen} monday={monday} view={view} mine={mine} nameOf={Object.fromEntries(names.map((n) => [n.id, n.name]))} />
    </Shell>
  );
}
