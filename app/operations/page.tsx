import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "../../lib/db";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { chairmanIdFor, roleLabel } from "../../lib/reportScope";
import { instituteOfUser, lockedModules } from "../../lib/moduleLocks";
import { moduleForPath } from "../../lib/modules";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;
const n = (p: Promise<number> | undefined) => (p ? p.catch(() => null) : Promise.resolve(null));

// Institute operations at a glance (UX review): the desks other people run — library, fees, payroll, facilities, stores,
// student life — as read-only cards for the Institute Head, Dean and HOD. Each card opens the desk to look.
export default async function OperationsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"].includes(user.role)) redirect("/dashboard");
  const cid = await chairmanIdFor(user as never);
  const off = await lockedModules(await instituteOfUser({ id: user.id, role: user.role, managedById: user.managedById ?? null }).catch(() => null)).catch(() => new Set<string>());
  const now = new Date(), in7 = new Date(Date.now() + 7 * 864e5), day0 = new Date(); day0.setHours(0, 0, 0, 0);
  const [onLoan, overdue, copies, unpaid, overdueFees, payroll, bookingsToday, bookings7, faults, societies, stock] = await Promise.all([
    n(db.libraryLoan?.count({ where: { chairmanId: cid, returnedAt: null } })), n(db.libraryLoan?.count({ where: { chairmanId: cid, returnedAt: null, dueAt: { lt: now } } })), n(db.libraryCopy?.count({ where: { chairmanId: cid } })),
    n(db.feeInvoice?.count({ where: { chairmanId: cid, status: { not: "PAID" } } })), n(db.feeInvoice?.count({ where: { chairmanId: cid, status: { not: "PAID" }, dueDate: { lt: now } } })),
    db.payrollRun?.findFirst({ where: { chairmanId: cid }, orderBy: { month: "desc" }, select: { month: true, status: true } }).catch(() => null) ?? null,
    n(db.facilityBooking?.count({ where: { chairmanId: cid, date: { gte: day0, lt: new Date(day0.getTime() + 864e5) } } })), n(db.facilityBooking?.count({ where: { chairmanId: cid, date: { gte: day0, lt: in7 } } })),
    n(db.assetFault?.count({ where: { chairmanId: cid, status: { not: "FIXED" } } })), n(db.studentSociety?.count({ where: { chairmanId: cid } })), n(db.stockItem?.count({ where: { chairmanId: cid } })),
  ]);
  const cards: { title: string; href: string; lines: (string | null)[]; who: string; warn?: boolean }[] = [
    { title: "Library", href: "/library-desk", who: "Run by the Librarian", lines: [copies != null ? `${copies} copies` : null, onLoan != null ? `${onLoan} on loan` : null, overdue ? `${overdue} overdue` : null], warn: !!overdue },
    { title: "Student fees", href: "/fees", who: "Run by the Finance Officer", lines: [unpaid != null ? `${unpaid} invoices unpaid` : null, overdueFees ? `${overdueFees} past due` : null], warn: !!overdueFees },
    { title: "Payroll", href: "/hr", who: "Run by the Finance Officer", lines: [payroll ? `Last run ${payroll.month} — ${String(payroll.status).toLowerCase()}` : "No payroll run yet"] },
    { title: "Accounts", href: "/accounts", who: "Run by the Finance Officer", lines: ["Budgets, ledgers and statements"] },
    { title: "Facilities and bookings", href: "/facilities", who: "Run by the Facilities Manager", lines: [bookingsToday != null ? `${bookingsToday} bookings today` : null, bookings7 != null ? `${bookings7} in the next 7 days` : null] },
    { title: "Equipment and assets", href: "/assets", who: "Lab Engineers, Lab Manager, Facilities", lines: [faults ? `${faults} faults open` : faults === 0 ? "No open faults" : null], warn: !!faults },
    { title: "Store and inventory", href: "/inventory", who: "Store keepers", lines: [stock != null ? `${stock} stock items` : null] },
    { title: "Student life", href: "/student-activities", who: "Run by Student Affairs", lines: [societies != null ? `${societies} societies` : null] },
  ].filter((c) => { const m = moduleForPath(c.href); return !m || !off.has(m.key); });
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Institute operations</h1>
      <p className="small-note">The desks other people run, at a glance. Open a card to look; the work itself stays with the person who runs it.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12, marginTop: 10 }}>
        {cards.map((c) => (
          <Link key={c.href} href={c.href} prefetch={false} className="card" style={{ margin: 0, textDecoration: "none", color: "inherit", borderTop: `3px solid ${c.warn ? "#B3261E" : "#1B5FAA"}` }}>
            <b style={{ fontSize: 15 }}>{c.title}</b>
            {c.lines.filter(Boolean).map((l) => <div key={l} style={{ fontSize: 13, color: /overdue|past due|faults open/.test(l || "") ? "#B3261E" : undefined }}>{l}</div>)}
            <div className="small-note" style={{ marginTop: 6 }}>{c.who} · view →</div>
          </Link>
        ))}
      </div>
    </Shell>
  );
}
