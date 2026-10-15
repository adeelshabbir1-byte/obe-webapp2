import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { prisma } from "../../../lib/db";
import StudentShell from "../../../components/StudentShell";
import { ActionButton, ActionForm } from "../../../components/fyp/FypClient";
import { EVENT_CATEGORIES, sessionNow } from "../../../lib/studentActivities";
import { AWARD_KINDS, EVENT_STATUS, officesOf, pointsFor } from "../../../lib/engagement";

export const dynamic = "force-dynamic";
export const metadata = { title: "Societies & Activities" };
const day = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const API = "/api/student/activities";

// The student's societies and offices, events coming up, event proposals (for office bearers) and their
// co-curricular engagement record.
export default async function StudentActivitiesPortal() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  if (student.mustChangePassword) redirect("/student/change-password");
  const batch = await prisma.batch.findUnique({ where: { id: student.batchId }, select: { coordinator: { select: { managedById: true } } } });
  const chairmanId = batch?.coordinator.managedById || "none";
  let missing = false;
  const load = async () => {
    const memberships = await prisma.societyMember.findMany({ where: { studentId: student.id }, orderBy: { term: "desc" } });
    const offices = await officesOf(student.id);
    const societies = await prisma.studentSociety.findMany({ where: { chairmanId, isActive: true }, orderBy: { name: "asc" } });
    const now = new Date(Date.now() - 86400000);
    const upcoming = await prisma.societyEvent.findMany({ where: { chairmanId, status: "APPROVED", eventDate: { gte: now } }, orderBy: { eventDate: "asc" }, take: 30 });
    const proposals = await prisma.societyEvent.findMany({ where: { proposedByStudentId: student.id }, orderBy: { createdAt: "desc" } });
    const rooms = new Map((await prisma.room.findMany({ where: { id: { in: [...upcoming, ...proposals].map((e) => e.roomId).filter((x): x is string => !!x).concat(["none"]) } }, select: { id: true, name: true } })).map((r) => [r.id, r.name]));
    const points = await pointsFor(student.id);
    return { memberships, offices, societies, upcoming, proposals, rooms, points };
  };
  const d = await load().catch(() => { missing = true; return null; });
  const nameOf = new Map((d?.societies || []).map((s) => [s.id, s.name]));
  const mySocieties = (d?.offices || []).map((o) => ({ id: o.societyId, name: nameOf.get(o.societyId) || "Society", position: o.position })).filter((s) => nameOf.has(s.id));

  return (
    <StudentShell studentName={student.name}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Societies &amp; Activities</h1>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 16 }}>Your clubs and societies, events coming up, and the engagement points you earn by attending, taking part, organising and holding an office.</p>
        {missing && <div className="card"><p style={{ margin: 0, color: "var(--slate)" }}>Society activities are not available yet.</p></div>}
        {d && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10, marginBottom: 14 }}>
              {[["Engagement points", d.points.total], ["Activities recorded", d.points.rows.length], ["Society offices held", d.memberships.filter((m) => m.position !== "Member").length]].map(([l, v]) => (
                <div key={String(l)} className="stat stat-neutral" style={{ padding: "12px 14px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>{l}</div></div>
              ))}
            </div>

            {mySocieties.length > 0 && (
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Propose an event</h3>
                <p className="small-note" style={{ marginTop: 0 }}>As {mySocieties.map((s) => `${s.position} of ${s.name}`).join(", ")} ({sessionNow()}), you can propose events. Student Affairs approves them and books the room, equipment and budget.</p>
                <ActionForm url={API} fixed={{ action: "propose" }} submit="Send proposal" collapsed openLabel="New event proposal" done="Sent for approval."
                  initial={{ societyId: mySocieties[0].id, category: "Workshop" }}
                  fields={[
                    { name: "societyId", label: "Society", type: "select", options: mySocieties.map((s) => [s.id, s.name]), width: 220 },
                    { name: "title", label: "Title", width: 300 }, { name: "category", label: "Kind", type: "select", options: EVENT_CATEGORIES.map((c) => [c, c]), width: 170 },
                    { name: "eventDate", label: "Date", type: "date" }, { name: "startTime", label: "Starts (HH:MM)", width: 100, placeholder: "14:00" }, { name: "endTime", label: "Ends (HH:MM)", width: 100, placeholder: "16:00" },
                    { name: "participants", label: "Expected participants", type: "number", width: 120 }, { name: "venue", label: "Preferred venue", width: 180 },
                    { name: "equipment", label: "Equipment needed (projector, mics, laptops…)", width: 320 }, { name: "budgetRequested", label: "Budget requested (PKR)", type: "number", width: 150 },
                    { name: "guests", label: "Guests / speakers", width: 260 }, { name: "description", label: "What happens, who it is for, and why", type: "textarea" },
                  ]} />
              </div>
            )}

            {d.proposals.length > 0 && (
              <div className="card">
                <h3 style={{ marginTop: 0 }}>Your proposals</h3>
                <table>
                  <thead><tr><th>Event</th><th>When</th><th>Status</th><th /></tr></thead>
                  <tbody>{d.proposals.map((e) => (
                    <tr key={e.id}>
                      <td><b>{e.title}</b><div className="small-note">{nameOf.get(e.societyId)} · {e.category}</div></td>
                      <td>{day(e.eventDate)}{e.startTime ? <div className="small-note">{e.startTime}{e.endTime ? `–${e.endTime}` : ""}</div> : null}</td>
                      <td><span className={`badge ${EVENT_STATUS[e.status]?.[1] || "badge-neutral"}`}>{EVENT_STATUS[e.status]?.[0] || e.status}</span>
                        {e.status === "APPROVED" && <div className="small-note">{e.roomId ? `Room: ${d.rooms.get(e.roomId)}` : ""}{e.budget ? ` · budget PKR ${Math.round(e.budget).toLocaleString("en-US")}` : ""}</div>}
                        {e.decisionNote && <div className="small-note">{e.decisionNote}</div>}</td>
                      <td>{e.status === "PROPOSED" && <ActionButton url={API} body={{ action: "cancel", eventId: e.id }} label="Withdraw" className="act act-danger" confirmText="Withdraw this proposal?" />}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Coming up</h3>
              {d.upcoming.length === 0 ? <p className="small-note">No approved events in the coming weeks.</p> : (
                <table>
                  <thead><tr><th>Event</th><th>When</th><th>Where</th></tr></thead>
                  <tbody>{d.upcoming.map((e) => <tr key={e.id}><td><b>{e.title}</b><div className="small-note">{nameOf.get(e.societyId)} · {e.category}</div></td><td>{day(e.eventDate)}{e.startTime ? <div className="small-note">{e.startTime}{e.endTime ? `–${e.endTime}` : ""}</div> : null}</td><td>{e.roomId ? d.rooms.get(e.roomId) : e.venue || "—"}</td></tr>)}</tbody>
                </table>
              )}
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Your co-curricular record</h3>
              {d.memberships.length > 0 && <p style={{ fontSize: 13, margin: "0 0 8px" }}>Offices and memberships: {d.memberships.map((m) => `${m.position}, ${nameOf.get(m.societyId) || "society"} (${m.term})`).join("; ")}.</p>}
              {d.points.rows.length === 0 ? <p className="small-note">No activities recorded yet. Attending and taking part in society events earns points.</p> : (
                <table>
                  <thead><tr><th>Activity</th><th>Society</th><th>Session</th><th>Points</th></tr></thead>
                  <tbody>{d.points.rows.map((r) => <tr key={r.id}><td>{r.kind === "LEADERSHIP" ? `Office: ${r.note}` : `${AWARD_KINDS[r.kind]?.label || r.kind}: ${r.note || ""}`}</td><td>{r.society}</td><td>{r.term}</td><td><b>{r.points}</b></td></tr>)}</tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </StudentShell>
  );
}
