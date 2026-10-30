import Link from "next/link";
import CalendarWeek from "./CalendarWeek";
import { ActionForm, ActionButton } from "./fyp/FypClient";
import { addDays, whenText, type Item } from "../lib/calendarCore";
import type { Appt } from "../lib/teacherCalendar";

// Booking an appointment (shared by staff and students): pick a person, see their week as they allow it, ask for a
// free slot with a reason, and follow your own requests.

const STATUS: Record<string, string> = { PENDING: "Waiting for reply", ACCEPTED: "Accepted", DECLINED: "Declined", CANCELLED: "Cancelled" };
type Person = { id: string; name: string; as?: string };

export default function AppointmentBooking({ base, api, people, chosen, monday, view, mine, nameOf }: {
  base: string; api: string; people: Person[]; chosen: Person | null; monday: string;
  view: { items: Item[]; free: { start: number; end: number }[]; open: boolean } | null; mine: Appt[]; nameOf: Record<string, string>;
}) {
  const q = (week: string) => `${base}?t=${chosen?.id || ""}&week=${week}`;
  return (
    <>
      <form method="get" action={base} className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Whom do you want to meet?
          <select name="t" defaultValue={chosen?.id || ""} style={{ minWidth: 260 }}>
            <option value="">— choose —</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.as ? ` — ${p.as}` : ""}</option>)}
          </select>
        </label>
        <button className="btn btn-brass btn-sm" type="submit">Show free times</button>
      </form>

      {chosen && view && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "12px 0 6px" }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>{chosen.name} — week of {monday.slice(8)}/{monday.slice(5, 7)}</h2>
            <span style={{ display: "flex", gap: 6 }}>
              <Link className="btn btn-secondary btn-sm" href={q(addDays(monday, -7))}>← Previous</Link>
              <Link className="btn btn-secondary btn-sm" href={q(addDays(monday, 7))}>Next →</Link>
            </span>
          </div>
          <CalendarWeek monday={monday} items={view.items} free={view.free} />
          <div className="card" style={{ marginTop: 8 }}>
            {!view.open ? <p className="small-note" style={{ margin: 0 }}>{chosen.name} is not taking appointments at the moment.</p>
              : view.free.length === 0 ? <p className="small-note" style={{ margin: 0 }}>No free slots this week — try the next week.</p>
              : <ActionForm url={api} fixed={{ action: "request", teacherId: chosen.id }} submit="Ask for this time" done="Sent — you will be told when they reply." initial={{ startsAt: new Date(view.free[0].start).toISOString() }}
                  fields={[{ name: "startsAt", label: "Free time", type: "select", options: view.free.map((f) => [new Date(f.start).toISOString(), whenText(f.start)] as [string, string]), width: 220 }, { name: "reason", label: "What is it about?", type: "text", placeholder: "e.g. Discuss my midterm result", width: 320 }]} />}
          </div>
        </>
      )}

      <h2 style={{ fontSize: 17, margin: "16px 0 6px" }}>My requests</h2>
      <div className="card">
        {mine.length === 0 && <p className="small-note" style={{ margin: 0 }}>None yet.</p>}
        {mine.map((a) => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid #eee" }}>
            <span><b>{whenText(new Date(a.startsAt).getTime())}</b> · {nameOf[a.teacherId] || "Teacher"} · {STATUS[a.status] || a.status}<br /><span className="small-note">{a.reason}{a.note ? ` · Reply: ${a.note}` : ""}</span></span>
            <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {a.status === "ACCEPTED" && <a className="btn btn-secondary btn-sm" href={`/api/appointments/${a.id}/ics`}>Add to calendar (.ics)</a>}
              {["PENDING", "ACCEPTED"].includes(a.status) && new Date(a.startsAt).getTime() > Date.now() && <ActionButton url={api} body={{ action: "cancel", id: a.id }} label="Cancel" className="btn btn-secondary btn-sm" confirmText="Cancel this appointment?" />}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
