import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { staffOf } from "../../lib/hr";
import { canSetWork, instituteWeek } from "../../lib/workCalendar";
import { parseDays } from "../../lib/workDaysCore";
import { prisma } from "../../lib/db";
import WorkingDaysForm from "../../components/WorkingDaysForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Working days" };

// Queue item 22: who works which days. A deadline that falls on a person's off day moves to their next working day;
// fixed dates (exams, results, HEC / council dates) do not move.
export default async function WorkingDaysPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!canSetWork(user as never)) redirect("/home");
  const cid = await chairmanIdFor(user as never);
  const staff = await staffOf(cid);
  const flags = await prisma.userFlag.findMany({ where: { userId: { in: staff.map((s) => s.id) }, key: { in: ["work.days", "work.off"] } }, select: { userId: true, key: true, value: true } }).catch(() => [] as { userId: string; key: string; value: string }[]);
  const f = (id: string, k: string) => flags.find((x) => x.userId === id && x.key === k)?.value || null;
  const off = (v: string | null) => { try { return v ? (JSON.parse(v) as string[]) : []; } catch { return []; } };
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Working days</h1>
      <p className="small-note" style={{ marginTop: 0 }}>Set the working week of people who work different days (e.g. weekend and postgraduate classes). Their deadlines, reminders, due-soon and overdue colours and late counts follow their own days: a deadline on a day they do not work moves to their next working day. Holidays, breaks and approved leave count as off days for everyone. Deadlines marked &quot;Fixed date&quot; never move.</p>
      <WorkingDaysForm week={await instituteWeek(cid)} people={staff.map((s) => ({ id: s.id, name: s.name, role: s.role, days: f(s.id, "work.days") ? parseDays(f(s.id, "work.days")) : null, off: off(f(s.id, "work.off")) }))} />
    </Shell>
  );
}
