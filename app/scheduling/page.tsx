import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { ActionButton, ActionForm } from "../../components/fyp/FypClient";
import SlotFinder from "../../components/SlotFinder";
import { DAYS, hh } from "../../lib/reschedCore";
import { RESCHED_HINT, batchesOf, classSlots, cohortCheck, eventsWithConflicts, requestsOf, revisionFlags } from "../../lib/resched";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Scheduling & rescheduling" };
const STATUS: Record<string, [string, string]> = { PENDING_DEAN: ["With the Chairman / Dean", "#B76E00"], PROVISIONAL: ["Provisional — Program Lead and teacher to confirm", "#1565C0"], APPROVED: ["Approved", "#2F7A4D"], REJECTED: ["Rejected", "#B3261E"], BLOCKED: ["Blocked — visiting teacher unavailable", "#B3261E"] };

// Smart scheduling: free slots, reschedule requests (Chairman / Dean → Program Lead + teacher; visiting teachers must
// confirm; no moves into the week before the midterms or the last week), events planned before the timetable, force
// majeure closures, the cohort check for repeaters, and CQI flags for the next curriculum revision.
export default async function Scheduling({ searchParams }: { searchParams: { tab?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = await chairmanIdFor(user as never).catch(() => "");
  const tab = ["slots", "requests", "events", "closure", "cohort", "cqi"].includes(searchParams.tab || "") ? searchParams.tab! : "slots";
  let missing = false;
  const [batches, slots] = await Promise.all([batchesOf(chairmanId), classSlots(chairmanId)]);
  const reqs = await requestsOf(chairmanId).catch(() => { missing = true; return []; });
  const courses = new Map((await prisma.course.findMany({ where: { id: { in: Array.from(new Set([...reqs.map((r) => r.courseId), ...slots.map((s) => s.courseId)])).concat("none") } }, select: { id: true, code: true, title: true, coordinatorId: true, instructorId: true } })).map((c) => [c.id, c]));
  const dean = ["CHAIRMAN", "DEAN"].includes(user.role);
  const T = (k: string, l: string) => <Link key={k} href={`/scheduling?tab=${k}`} className={`btn btn-sm ${tab === k ? "btn-brass" : "btn-secondary"}`}>{l}</Link>;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Scheduling &amp; rescheduling</h1>
      <p className="small-note" style={{ marginBottom: 8 }}>Find times when batches are free, or the times that move the fewest classes. A class move goes to the Chairman / Dean, then to the Program Lead and the teacher; a visiting teacher must confirm the new time himself or the move is blocked. Nothing may move into the week before the midterms or the last week of the semester.</p>
      {missing && <div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{RESCHED_HINT}</p></div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>{T("slots", "Free slots")}{T("requests", `Reschedules (${reqs.filter((r) => ["PENDING_DEAN", "PROVISIONAL"].includes(r.status)).length})`)}{T("events", "Events")}{T("closure", "Campus closure")}{T("cohort", "Cohort check")}{T("cqi", "CQI flags")}</div>

      {tab === "slots" && (
        <>
          <SlotFinder batches={batches.map((b) => ({ id: b.id, label: `${b.degreeProgram} ${b.batchName}` }))} />
          <div className="card">
            <b>Ask to move a class</b>
            <ActionForm url="/api/scheduling" fixed={{ action: "request" }} submit="Send request" collapsed openLabel="+ Reschedule request" showMessage initial={{ entryId: slots[0]?.entryId }}
              fields={[{ name: "entryId", label: "Class", type: "select", options: slots.slice(0, 400).map((s) => [s.entryId, `${s.code} · ${s.day} ${hh(s.start)}–${hh(s.end)}`] as [string, string]), width: 260 }, { name: "fromDate", label: "Date of the class", type: "date", width: 150 }, { name: "toDate", label: "New date", type: "date", width: 150 }, { name: "toStart", label: "New start", type: "time", width: 110 }, { name: "reason", label: "Reason (e.g. the event)", type: "text", width: 280 }]} />
          </div>
        </>
      )}

      {tab === "requests" && (
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", fontSize: 13 }}>
            <thead><tr><th>Class</th><th>From</th><th>To</th><th>Reason</th><th>Status</th><th></th></tr></thead>
            <tbody>{reqs.map((r) => { const c = courses.get(r.courseId); const mine = (r.status === "PENDING_DEAN" && dean) || (r.status === "PROVISIONAL" && (c?.coordinatorId === user.id || c?.instructorId === user.id)); return (
              <tr key={r.id} data-request={c?.code}>
                <td>{c?.code}{r.visiting ? <span className="small-note"> · visiting teacher</span> : null}{r.forceMajeure ? <span className="small-note"> · force majeure</span> : null}</td>
                <td>{r.fromDate.toISOString().slice(0, 10)} {hh(r.fromStart)}</td><td>{r.toDate.toISOString().slice(0, 10)} {hh(r.toStart)}–{hh(r.toEnd)}</td>
                <td className="small-note">{r.reason}{r.note ? ` · ${r.note}` : ""}</td>
                <td style={{ color: STATUS[r.status]?.[1] }}>{STATUS[r.status]?.[0] || r.status}{r.status === "PROVISIONAL" ? <span className="small-note"> (PL {r.plOk === null ? "…" : r.plOk ? "✓" : "✗"}, teacher {r.facultyOk === null ? "…" : r.facultyOk ? "✓" : "✗"})</span> : null}</td>
                <td>{mine && <span style={{ display: "inline-flex", gap: 6 }}><ActionButton url="/api/scheduling" body={{ action: "decide", id: r.id, ok: true }} label={r.status === "PENDING_DEAN" ? "Approve provisionally" : c?.instructorId === user.id ? "I can come" : "Agree"} showMessage /><ActionButton url="/api/scheduling" body={{ action: "decide", id: r.id, ok: false }} label={c?.instructorId === user.id ? "Not available" : "Decline"} className="btn btn-secondary btn-sm" askNote="Reason" noteRequired showMessage /></span>}</td>
              </tr>); })}{!reqs.length && <tr><td colSpan={6} className="small-note">No requests.</td></tr>}</tbody>
          </table>
        </div>
      )}

      {tab === "events" && await (async () => {
        const { events, conflicts } = await eventsWithConflicts(chairmanId).catch(() => ({ events: [], conflicts: [] }));
        return (
          <div className="card">
            <p className="small-note" style={{ margin: "0 0 6px" }}>Events planned before the timetable is published hold their slot: classes the timetable puts at that time are flagged here so the schedule can be built around them.</p>
            {events.map((e) => <p key={e.id} style={{ margin: "2px 0", fontSize: 13 }}><b>{e.title}</b> · {new Date(e.date).toISOString().slice(0, 10)} ({DAYS[new Date(e.date).getUTCDay()]}) {hh(e.startHour)}–{hh(e.endHour)}{e.beforePublication ? " · slot locked before the timetable" : ""}</p>)}
            {conflicts.map((c, i) => <p key={i} style={{ margin: "2px 0", fontSize: 13, color: "#B3261E" }} data-conflict>⚠ {c.event}: {c.code} has class {c.day} {hh(c.start)}–{hh(c.end)}</p>)}
            <ActionForm url="/api/scheduling" fixed={{ action: "event" }} submit="Add event" collapsed openLabel="+ Plan an event" fields={[{ name: "title", label: "Event", type: "text", width: 220 }, { name: "date", label: "Date", type: "date", width: 150 }, { name: "start", label: "From", type: "time", width: 110 }, { name: "end", label: "To", type: "time", width: 110 }, { name: "batchIds", label: "Batches (blank = all)", type: "select", options: [["", "All batches"], ...batches.map((b) => [b.id, `${b.degreeProgram} ${b.batchName}`] as [string, string])], width: 240 }]} />
          </div>
        );
      })()}

      {tab === "closure" && (
        <div className="card">
          <b>Force majeure: declare a campus closure</b>
          <p className="small-note" style={{ margin: "4px 0" }}>Every class of the day moves to the first make-up slot in the next two weeks that is free for its batch and teacher (outside the blackout weeks). No consent chain; teachers are told.</p>
          {dean ? <ActionForm url="/api/scheduling" fixed={{ action: "closure" }} submit="Declare closure" showMessage fields={[{ name: "date", label: "Closed on", type: "date", width: 150 }, { name: "reason", label: "Reason", type: "text", width: 280 }]} /> : <p className="small-note">The Dean or the Registrar declares a closure.</p>}
        </div>
      )}

      {tab === "cohort" && await (async () => {
        const rows = await cohortCheck(chairmanId).catch(() => []);
        return (
          <div className="card" style={{ overflowX: "auto" }}>
            <p className="small-note" style={{ margin: "0 0 6px" }}>Students stay on their entry batch&apos;s curriculum. A repeater (or out-of-batch student) taking another batch&apos;s course must map to a course of his own curriculum through the Equivalent Course Mapping, so his transcript keeps the right course.</p>
            <table className="table" style={{ width: "100%", fontSize: 13 }}><thead><tr><th>Student</th><th>Taking</th><th>Counts as</th></tr></thead>
              <tbody>{rows.map((r, i) => <tr key={i}><td>{r.roll} {r.name}{r.repeat ? " · repeat" : ""}</td><td>{r.taking}</td><td style={{ color: r.mapsTo ? undefined : "#B3261E" }}>{r.mapsTo ? `${r.mapsTo} (${r.via})` : "No mapping — add it in Course Equivalence"}</td></tr>)}{!rows.length && <tr><td colSpan={3} className="small-note">Every student is in his own batch&apos;s courses.</td></tr>}</tbody></table>
          </div>
        );
      })()}

      {tab === "cqi" && await (async () => {
        const fl = await revisionFlags(chairmanId).catch(() => []);
        return (
          <div className="card">
            <p className="small-note" style={{ margin: "0 0 6px" }}>When a course&apos;s results are approved, any PLO with batch attainment below 50% flags the course for review in the next curriculum revision.</p>
            {fl.map((f) => <p key={f.id} style={{ margin: "2px 0", fontSize: 13 }} data-flag={f.courseCode}>{f.courseCode} {f.courseTitle}: {f.ploLabel} {f.attainment}%{f.termName ? ` (${f.termName} ${f.termYear})` : ""}</p>)}
            {!fl.length && <p className="small-note" style={{ margin: 0 }}>No flags.</p>}
          </div>
        );
      })()}
    </Shell>
  );
}
