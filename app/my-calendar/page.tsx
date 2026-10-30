import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import CalendarWeek from "../../components/CalendarWeek";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";
import { DAY_NAMES, addDays, hm, localDay, mondayOf, whenText } from "../../lib/calendarCore";
import { linkProviders, linksOf, providerLabel } from "../../lib/calendarLink";
import { CAL_HINT, blocksOf, calendarView, teacherAppointments, type Appt, type Block } from "../../lib/teacherCalendar";

export const dynamic = "force-dynamic";
const LINK_MSG: Record<string, string> = { ok: "Calendar linked — its busy times now block appointment slots.", failed: "The calendar could not be linked. Try again.", expired: "The sign-in took too long. Try again.", cancelled: "Linking was cancelled.", off: "Calendar linking is not set up on this server." };
const STATUS: Record<string, string> = { PENDING: "Waiting for you", ACCEPTED: "Accepted", DECLINED: "Declined", CANCELLED: "Cancelled" };
const privacyOpts: [string, string][] = [["BUSY", "Others see “Busy” only"], ["DETAILS", "Others see the details"]];
const dayOpts = DAY_NAMES.map((d, i) => [String(i), d] as [string, string]);

// My calendar: the week from the timetable, counselling hours, my own blocks and appointments; requests to answer;
// appointment settings (slot length, daily limit, hours) and privacy; optional Google / Outlook link (busy only).
export default async function MyCalendar({ searchParams }: { searchParams: { week?: string; link?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const monday = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(searchParams.week || "") ? searchParams.week! : localDay(Date.now()));
  let missing = false;
  let view: Awaited<ReturnType<typeof calendarView>> | null = null, blocks: Block[] = [], appts: Appt[] = [];
  try { [view, blocks, appts] = await Promise.all([calendarView(user.id, monday, 7, true), blocksOf(user.id), teacherAppointments(user.id)]); } catch { missing = true; }
  const providers = linkProviders();
  const links = providers.length ? await linksOf(user.id) : [];
  const pending = appts.filter((a) => a.status === "PENDING");
  const upcoming = appts.filter((a) => a.status === "ACCEPTED" && new Date(a.endsAt).getTime() > Date.now());
  const s = view?.settings;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My calendar &amp; appointments</h1>
      <p className="small-note" style={{ marginBottom: 10 }}>Your week from the timetable and counselling hours, plus your own blocks. Students and colleagues see only your free slots and — where you allow it — what a busy time is. They ask for an appointment with a reason; you accept or decline. <Link href="/appointments">Book a colleague →</Link></p>
      {missing && <div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{CAL_HINT}</p></div>}
      {searchParams.link && LINK_MSG[searchParams.link] && <div className="card" style={{ background: searchParams.link === "ok" ? "#EAF5EE" : "#FFF1D6" }}>{LINK_MSG[searchParams.link]}</div>}

      {pending.length > 0 && (
        <>
          <h2 style={{ fontSize: 17, margin: "12px 0 6px" }}>Requests to answer ({pending.length})</h2>
          <div className="card">
            {pending.map((a) => (
              <div key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid #eee" }}>
                <span><b>{whenText(new Date(a.startsAt).getTime())}</b> ({Math.round((new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60000)} min) ·{a.requesterName} <span className="small-note">({a.requesterKind === "STUDENT" ? "student" : "colleague"})</span><br /><span className="small-note">{a.reason}</span></span>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <ActionButton url="/api/calendar" body={{ action: "respond", id: a.id, accept: true }} label="Accept" askNote="A note for them (optional) — e.g. the room" />
                  <ActionButton url="/api/calendar" body={{ action: "respond", id: a.id, accept: false }} label="Decline" className="btn btn-secondary btn-sm" askNote="Why, or a better time (optional)" />
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "14px 0 6px" }}>
        <h2 style={{ fontSize: 17, margin: 0 }}>Week of {monday.slice(8)}/{monday.slice(5, 7)}/{monday.slice(0, 4)}</h2>
        <span style={{ display: "flex", gap: 6 }}>
          <Link className="btn btn-secondary btn-sm" href={`/my-calendar?week=${addDays(monday, -7)}`}>← Previous</Link>
          <Link className="btn btn-secondary btn-sm" href="/my-calendar">This week</Link>
          <Link className="btn btn-secondary btn-sm" href={`/my-calendar?week=${addDays(monday, 7)}`}>Next →</Link>
        </span>
      </div>
      {view && <CalendarWeek monday={monday} items={view.items} free={view.free} />}
      <p className="small-note">Grey “Free” times are what others can ask for{s && !s.open ? " — appointments are switched off" : ""}.</p>

      <h2 style={{ fontSize: 17, margin: "14px 0 6px" }}>Upcoming appointments</h2>
      <div className="card">
        {upcoming.length === 0 && <p className="small-note" style={{ margin: 0 }}>None.</p>}
        {upcoming.map((a) => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid #eee" }}>
            <span><b>{whenText(new Date(a.startsAt).getTime())}</b> · {a.requesterName} — {a.reason}{a.note ? <span className="small-note"> · {a.note}</span> : null}</span>
            <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <a className="btn btn-secondary btn-sm" href={`/api/appointments/${a.id}/ics`}>Add to calendar (.ics)</a>
              <ActionButton url="/api/calendar" body={{ action: "cancel", id: a.id }} label="Cancel" className="btn btn-secondary btn-sm" confirmText="Cancel this appointment? They will be told." />
            </span>
          </div>
        ))}
        {appts.filter((a) => ["DECLINED", "CANCELLED"].includes(a.status)).slice(-5).map((a) => <div key={a.id} className="small-note" style={{ padding: "3px 0" }}>{whenText(new Date(a.startsAt).getTime())} · {a.requesterName} · {STATUS[a.status]}</div>)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 10, marginTop: 14 }}>
        <div className="card" style={{ margin: 0 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>My blocks</h2>
          <p className="small-note" style={{ margin: "0 0 6px" }}>Times you are not available (meetings, research, travel). Each block says whether others see what it is or just “Busy”.</p>
          {blocks.map((b) => (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", borderBottom: "1px solid #eee", fontSize: 13 }}>
              <span>{b.date ? b.date : `Every ${DAY_NAMES[b.dayOfWeek ?? 0]}`} {hm(b.startMin)}–{hm(b.endMin)} · {b.label || "—"} <span className="small-note">({b.privacy === "BUSY" ? "Busy only" : "details shown"})</span></span>
              <ActionButton url="/api/calendar" body={{ action: "deleteBlock", id: b.id }} label="Remove" className="btn btn-secondary btn-sm" />
            </div>
          ))}
          <ActionForm url="/api/calendar" fixed={{ action: "addBlock" }} submit="Add block" collapsed openLabel="+ Add a block" initial={{ repeat: "WEEKLY", dayOfWeek: "1", start: "11:00", end: "12:00", privacy: "BUSY", date: localDay(Date.now()) }}
            fields={[{ name: "repeat", label: "Repeats", type: "select", options: [["WEEKLY", "Every week"], ["ONCE", "One date"]], width: 120 }, { name: "dayOfWeek", label: "Weekday (weekly)", type: "select", options: dayOpts, width: 100 }, { name: "date", label: "Date (one date)", type: "date", width: 150 }, { name: "start", label: "From", type: "time", width: 110 }, { name: "end", label: "To", type: "time", width: 110 }, { name: "label", label: "What it is", type: "text", placeholder: "e.g. Department meeting" }, { name: "privacy", label: "Others see", type: "select", options: privacyOpts, width: 190 }]} />
        </div>

        <div className="card" style={{ margin: 0 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 4px" }}>Appointment settings</h2>
          {s && (
            <>
              <p className="small-note" style={{ margin: "0 0 6px" }}>{s.open ? "Open" : "Closed"} · {s.slotMinutes}-minute slots · at most {s.maxPerDay} a day · {hm(s.startMin)}–{hm(s.endMin)} on {s.days.map((d) => DAY_NAMES[d]).join(", ") || "no days"} · classes: {s.classPrivacy === "DETAILS" ? "details shown" : "Busy only"} · counselling: {s.counsellingPrivacy === "DETAILS" ? "details shown" : "Busy only"}</p>
              <ActionForm url="/api/calendar" fixed={{ action: "settings" }} submit="Save settings" collapsed openLabel="Change settings"
                initial={{ open: s.open, slotMinutes: String(s.slotMinutes), maxPerDay: s.maxPerDay, start: hm(s.startMin), end: hm(s.endMin), classPrivacy: s.classPrivacy, counsellingPrivacy: s.counsellingPrivacy, ...Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((i) => [`d${i}`, s.days.includes(i)])) }}
                fields={[{ name: "open", label: "Take appointments", type: "checkbox" }, { name: "slotMinutes", label: "Slot length", type: "select", options: [10, 15, 20, 30, 45, 60, 90].map((m) => [String(m), `${m} min`] as [string, string]), width: 100 }, { name: "maxPerDay", label: "Most per day", type: "number", width: 90 }, { name: "start", label: "From", type: "time", width: 110 }, { name: "end", label: "To", type: "time", width: 110 },
                  ...[1, 2, 3, 4, 5, 6, 0].map((i) => ({ name: `d${i}`, label: DAY_NAMES[i], type: "checkbox" as const })),
                  { name: "classPrivacy", label: "Classes: others see", type: "select", options: privacyOpts, width: 190 }, { name: "counsellingPrivacy", label: "Counselling: others see", type: "select", options: privacyOpts, width: 190 }]} />
            </>
          )}
          <h3 style={{ fontSize: 14, margin: "12px 0 4px" }}>Google / Outlook calendar</h3>
          {providers.length === 0 ? <p className="small-note" style={{ margin: 0 }}>Not set up on this server (the administrator adds the Google / Microsoft sign-in keys). Your blocks above work without it.</p> : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {providers.map((p) => links.some((l) => l.provider === p)
                ? <span key={p} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>✓ {providerLabel(p)} linked <ActionButton url="/api/calendar" body={{ action: "unlink", provider: p }} label="Unlink" className="btn btn-secondary btn-sm" /></span>
                : <a key={p} className="btn btn-secondary btn-sm" href={`/api/calendar/oauth/${p.toLowerCase()}`}>Link {providerLabel(p)}</a>)}
              <span className="small-note">Read-only: only busy times are read, never event titles.</span>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
