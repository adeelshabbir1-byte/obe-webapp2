import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { resources, bookingsOn, BOOKING_HINT } from "../../lib/facilityBooking";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Facility Booking" };

export default async function FacilityBookingPage({ searchParams }: { searchParams: { from?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = await chairmanIdFor(user);
  const from = searchParams.from && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.from) ? new Date(`${searchParams.from}T00:00:00Z`) : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const [res, list] = await Promise.all([resources(chairmanId), bookingsOn(chairmanId, from, 14)]);
  const label = new Map(res);
  const ids = Array.from(new Set((list || []).map((b) => b.bookedById)));
  const names = new Map((ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const admin = ["CHAIRMAN", "FACILITIES_MANAGER", "HEAD_OF_DEPARTMENT", "STUDENT_AFFAIRS"].includes(user.role);
  const days = Array.from(new Set((list || []).map((b) => iso(b.date))));

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Facility Booking</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>
        Book a hall, seminar room, a classroom when it is free, the masjid / prayer area, sports ground or a common area. A booking that clashes with
        another booking or with a class in that room is refused; holidays and exam periods are shown as a note. The places come from the room list and the
        facilities record (<Link href="/facilities">Facilities</Link>), which is also what the council infrastructure forms use.
      </p>
      {list === null && <div className="err">{BOOKING_HINT}</div>}
      {list !== null && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Book</h3>
          <ActionForm url="/api/facility-booking" fixed={{ action: "book" }} submit="Book" initial={{ date: iso(from), startTime: "10:00", endTime: "12:00" }} fields={[
            { name: "resource", label: "Place", type: "select", options: res },
            { name: "date", label: "Date", type: "date" }, { name: "startTime", label: "From", width: 70, placeholder: "10:00" }, { name: "endTime", label: "To", width: 70, placeholder: "12:00" },
            { name: "purpose", label: "Purpose", width: 280 },
          ]} />
        </div>
      )}
      {list !== null && (
        <div className="card" style={{ overflowX: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <h3 style={{ margin: 0 }}>Next 14 days from {iso(from)}</h3>
            <span className="small-note"><Link href={`/facility-booking?from=${iso(new Date(from.getTime() - 14 * 864e5))}`}>← earlier</Link> · <Link href={`/facility-booking?from=${iso(new Date(from.getTime() + 14 * 864e5))}`}>later →</Link></span>
          </div>
          {list.length === 0 ? <p className="small-note">No bookings.</p> : days.map((d) => (
            <div key={d} style={{ marginTop: 8 }}>
              <b style={{ fontSize: 13 }}>{new Date(`${d}T00:00:00Z`).toDateString()}</b>
              <table style={{ fontSize: 12.5, marginTop: 4 }}><tbody>{list.filter((b) => iso(b.date) === d).map((b) => (
                <tr key={b.id}><td style={{ whiteSpace: "nowrap", width: 110 }}>{b.startTime}–{b.endTime}</td><td>{label.get(b.resource) || b.resource.replace(/^area:/, "")}</td><td>{b.purpose}</td><td className="small-note">{names.get(b.bookedById) || ""}</td>
                  <td>{(b.bookedById === user.id || admin) && <ActionButton url="/api/facility-booking" body={{ action: "cancel", id: b.id }} label="Cancel" className="btn btn-ghost btn-sm" confirmText="Cancel this booking?" />}</td></tr>
              ))}</tbody></table>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
