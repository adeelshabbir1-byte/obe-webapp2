import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import HowCalculated from "../../components/HowCalculated";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { whoIs, staffOf } from "../../lib/registers";
import { cdb, COUNSEL_HINT, KINDS, MODES, STATUS, counsels, readableNotes, report, type Booking, type Slot } from "../../lib/counselling";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
const when = (d: Date | string | null) => (d ? new Date(d).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const kindOpts = Object.entries(KINDS) as [string, string][];
const modeOpts = Object.entries(MODES) as [string, string][];

// Counselling: the counsellor's or advisor's slots, bookings, call-ins and confidential visit notes; for the Institute
// Head and Student Affairs, who the student counsellors are and the counts-only report.
export default async function CounsellingPage({ searchParams }: { searchParams: { year?: string; callIn?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const w = await whoIs(user as never);
  if (!w) redirect("/dashboard");
  const iCounsel = await counsels(user.id, w.chairmanId).catch(() => false);
  const admin = w.head || w.affairs || w.qec;
  if (!iCounsel && !admin) redirect("/dashboard");
  const year = Number(searchParams.year) || new Date().getFullYear();

  let missing = false;
  let slots: Slot[] = [], bookings: Booking[] = [], profiles: { userId: string; isCounsellor: boolean; byRequest: boolean }[] = [];
  try {
    profiles = await cdb.counsellorProfile.findMany({ where: { chairmanId: w.chairmanId } });
    if (iCounsel) {
      slots = await cdb.counsellingSlot.findMany({ where: { counsellorId: user.id, startsAt: { gte: new Date(Date.now() - 864e5) } }, orderBy: { startsAt: "asc" }, take: 200 });
      bookings = await cdb.counsellingBooking.findMany({ where: { counsellorId: user.id, OR: [{ status: { in: ["REQUESTED", "CALLED_IN", "BOOKED"] } }, { doneAt: { gte: new Date(Date.now() - 90 * 864e5) } }] }, orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }], take: 300 });
    }
  } catch { missing = true; }
  const me = profiles.find((p) => p.userId === user.id);
  const advisees = await prisma.student.findMany({ where: { batch: { advisorId: user.id } }, select: { id: true, name: true, rollNumber: true }, orderBy: { rollNumber: "asc" } });
  const studentIds = Array.from(new Set(bookings.map((b) => b.studentId)));
  const students = new Map((await prisma.student.findMany({ where: { id: { in: studentIds.concat(["none"]) } }, select: { id: true, name: true, rollNumber: true, batch: { select: { degreeProgram: true } } } })).map((s) => [s.id, s]));
  const notes = await readableNotes(user.id, bookings.map((b) => b.id));
  // Academic notes other counsellors wrote about this person's advisees.
  const adviseeBookings = advisees.length ? ((await cdb.counsellingBooking.findMany({ where: { studentId: { in: advisees.map((a) => a.id) }, counsellorId: { not: user.id }, status: "DONE" }, orderBy: { doneAt: "desc" }, take: 50 }).catch(() => [])) as Booking[]) : [];
  const adviseeNotes = await readableNotes(user.id, adviseeBookings.map((b) => b.id));
  const booked = new Set(bookings.filter((b) => ["BOOKED", "DONE"].includes(b.status)).map((b) => b.slotId));
  const upcoming = bookings.filter((b) => b.status === "BOOKED");
  const waiting = bookings.filter((b) => ["REQUESTED", "CALLED_IN"].includes(b.status));
  const past = bookings.filter((b) => ["DONE", "NO_SHOW"].includes(b.status)).reverse();
  const staff = admin ? await staffOf(w.chairmanId) : [];
  const rep = admin ? await report(w.chairmanId, year) : null;
  const sName = (id: string) => { const s = students.get(id); return s ? `${s.name} (${s.rollNumber})` : "Student"; };

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Counselling</h1>
      <p className="small-note" style={{ marginBottom: 10 }}>Students book a time with their batch advisor or a student counsellor. Visit notes are confidential: only the counsellor who wrote them can read them (and the student&apos;s batch advisor, for academic notes). Reports show counts only.</p>
      {missing && <div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{COUNSEL_HINT}</p></div>}

      {iCounsel && !missing && (
        <>
          <h2 style={{ fontSize: 17, margin: "12px 0 6px" }}>Coming up ({upcoming.length})</h2>
          <div className="card" style={{ overflowX: "auto" }}>
            {upcoming.length === 0 ? <p className="small-note" style={{ margin: 0 }}>No bookings yet.</p> : (
              <table className="table" style={{ fontSize: 13 }}>
                <thead><tr><th>When</th><th>Student</th><th>About</th><th>Record the visit</th></tr></thead>
                <tbody>{upcoming.map((b) => (
                  <tr key={b.id}>
                    <td style={{ whiteSpace: "nowrap" }}><b>{when(b.startsAt)}</b><div className="small-note" style={{ margin: 0 }}>{MODES[b.mode]}</div></td>
                    <td>{sName(b.studentId)}<div className="small-note" style={{ margin: 0 }}>{students.get(b.studentId)?.batch.degreeProgram}</div></td>
                    <td>{KINDS[b.kind]}{b.source !== "SELF" ? " · called in" : ""}{b.reason && <div className="small-note" style={{ margin: 0 }}>{b.reason}</div>}</td>
                    <td>
                      <ActionForm url="/api/counselling" fixed={{ action: "complete", bookingId: b.id, held: true }} collapsed openLabel="Held — record notes…" submit="Save the visit" initial={{ kind: b.kind }} done="Recorded."
                        fields={[{ name: "kind", label: "Type", type: "select", options: kindOpts }, { name: "notes", label: "Confidential notes (only you can read these)", type: "textarea" }, { name: "followUp", label: "Follow-up date (optional)", type: "date" }]} />
                      <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                        <ActionButton url="/api/counselling" body={{ action: "complete", bookingId: b.id, held: false, kind: b.kind, notes: "" }} label="Did not come" className="btn btn-secondary btn-sm" confirmText="Mark as did not come?" />
                        <ActionButton url="/api/counselling" body={{ action: "cancel", bookingId: b.id }} label="Cancel" className="btn btn-secondary btn-sm" askNote="Tell the student why (optional)" />
                      </div>
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>

          {waiting.length > 0 && (
            <>
              <h2 style={{ fontSize: 17, margin: "16px 0 6px" }}>Waiting for a time ({waiting.length})</h2>
              <div className="card" style={{ overflowX: "auto" }}>
                <table className="table" style={{ fontSize: 13 }}>
                  <thead><tr><th>Student</th><th>Status</th><th>About</th><th>Set a time</th></tr></thead>
                  <tbody>{waiting.map((b) => (
                    <tr key={b.id}>
                      <td>{sName(b.studentId)}</td>
                      <td>{STATUS[b.status]}<div className="small-note" style={{ margin: 0 }}>since {when(b.createdAt)}</div></td>
                      <td>{KINDS[b.kind]}{b.reason && <div className="small-note" style={{ margin: 0 }}>{b.reason}</div>}</td>
                      <td>
                        <ActionForm url="/api/counselling" fixed={{ action: "schedule", bookingId: b.id }} collapsed openLabel="Set a time…" submit="Send the time" initial={{ mode: b.mode }}
                          fields={[{ name: "startsAt", label: "Date and time", type: "datetime-local" }, { name: "mode", label: "How", type: "select", options: modeOpts.filter(([k]) => k !== "EITHER") }, { name: "place", label: "Room or meeting link", type: "text" }]} />
                        <div style={{ marginTop: 4 }}><ActionButton url="/api/counselling" body={{ action: "cancel", bookingId: b.id }} label="Withdraw" className="btn btn-secondary btn-sm" askNote="Tell the student why (optional)" /></div>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}

          <h2 style={{ fontSize: 17, margin: "16px 0 6px" }}>Call a student in</h2>
          <div className="card">
            <p className="small-note" style={{ marginTop: 0 }}>The student is told to pick one of your times. Use it for students on the Early Warning list or held at registration.</p>
            <ActionForm url="/api/counselling" fixed={{ action: "callIn", source: searchParams.callIn ? "EARLY_WARNING" : "CALL_IN" }} submit="Call in" initial={{ studentId: searchParams.callIn || "", kind: "ACADEMIC" }} done="The student has been told."
              fields={[...(advisees.length ? [{ name: "studentId", label: "Advisee", type: "select" as const, options: advisees.map((a) => [a.id, `${a.rollNumber} · ${a.name}`] as [string, string]) }] : []), ...(me?.isCounsellor ? [{ name: "rollNumber", label: advisees.length ? "…or roll number" : "Roll number", type: "text" as const }] : []), { name: "kind", label: "About", type: "select" as const, options: kindOpts }, { name: "reason", label: "Message to the student", type: "text" as const }]} />
          </div>

          <h2 style={{ fontSize: 17, margin: "16px 0 6px" }}>My times</h2>
          <div className="card">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
              <ActionForm url="/api/counselling" fixed={{ action: "publish" }} collapsed openLabel="Publish weekly times…" submit="Publish" initial={{ time: "11:00", minutes: 30, count: 2, weeks: 4, mode: "IN_PERSON" }} done="Published."
                fields={[{ name: "firstDate", label: "First day (repeats on that weekday)", type: "date" }, { name: "time", label: "Start time", type: "time" }, { name: "minutes", label: "Minutes each", type: "number" }, { name: "count", label: "Times in a row", type: "number" }, { name: "weeks", label: "For how many weeks", type: "number" }, { name: "mode", label: "How", type: "select", options: modeOpts }, { name: "place", label: "Room or meeting link", type: "text" }]} />
              <ActionButton url="/api/counselling" body={{ action: "byRequest", on: !me?.byRequest }} label={me?.byRequest ? "Stop taking requests" : "Also take requests (students ask for a time)"} className="btn btn-secondary btn-sm" />
            </div>
            {slots.length === 0 ? <p className="small-note" style={{ margin: 0 }}>No times published.</p> : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{slots.map((s) => (
                <span key={s.id} style={{ display: "inline-flex", gap: 4, alignItems: "center", border: "1px solid #e2d6d4", borderRadius: 8, padding: "3px 8px", fontSize: 12.5, background: booked.has(s.id) ? "#E7F4EC" : "#fff" }}>
                  {when(s.startsAt)} · {MODES[s.mode]}{booked.has(s.id) ? " · booked" : ""}
                  {!booked.has(s.id) && <ActionButton url="/api/counselling" body={{ action: "deleteSlot", id: s.id }} label="×" className="btn btn-secondary btn-sm" />}
                </span>
              ))}</div>
            )}
          </div>

          <h2 style={{ fontSize: 17, margin: "16px 0 6px" }}>Recent visits</h2>
          <div className="card" style={{ overflowX: "auto" }}>
            {past.length === 0 ? <p className="small-note" style={{ margin: 0 }}>None in the last 90 days.</p> : (
              <table className="table" style={{ fontSize: 13 }}>
                <thead><tr><th>When</th><th>Student</th><th>Type</th><th>Notes (confidential)</th><th>Follow-up</th></tr></thead>
                <tbody>{past.map((b) => (
                  <tr key={b.id}><td style={{ whiteSpace: "nowrap" }}>{when(b.startsAt || b.doneAt)}</td><td>{sName(b.studentId)}</td><td>{b.status === "NO_SHOW" ? <span style={{ color: "#B3261E" }}>did not come</span> : KINDS[b.kind]}</td>
                    <td style={{ fontSize: 12.5, whiteSpace: "pre-wrap" }}>{notes.filter((n) => n.bookingId === b.id).map((n) => n.notes).join("\n\n") || "—"}</td><td>{b.followUpDate ? new Date(b.followUpDate).toLocaleDateString("en-GB") : "—"}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
          {adviseeNotes.length > 0 && (
            <>
              <h2 style={{ fontSize: 17, margin: "16px 0 6px" }}>Academic notes about your advisees</h2>
              <div className="card">{adviseeNotes.map((n) => { const b = adviseeBookings.find((x) => x.id === n.bookingId)!; return <div key={n.id} className="hp-msg"><small>{students.get(b.studentId)?.name || advisees.find((a) => a.id === b.studentId)?.name || "Advisee"} · {when(b.doneAt)}</small>{n.notes}</div>; })}</div>
            </>
          )}
        </>
      )}

      {admin && !missing && (
        <>
          <h2 style={{ fontSize: 17, margin: "18px 0 6px" }}>Student counsellors</h2>
          <div className="card">
            <p className="small-note" style={{ marginTop: 0 }}>Batch advisors counsel their own advisees. Student counsellors can be booked by every student of the institute.</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {profiles.filter((p) => p.isCounsellor).map((p) => <span key={p.userId} style={{ display: "inline-flex", gap: 4, alignItems: "center", background: "#F1E8E6", borderRadius: 6, padding: "2px 8px", fontSize: 13 }}>{staff.find((s) => s.id === p.userId)?.name || "—"}{(w.head || w.affairs) && <ActionButton url="/api/counselling" body={{ action: "designate", userId: p.userId, on: false }} label="×" className="btn btn-secondary btn-sm" confirmText="No longer a student counsellor?" />}</span>)}
              {!profiles.some((p) => p.isCounsellor) && <span className="small-note" style={{ margin: 0 }}>None designated yet.</span>}
            </div>
            {(w.head || w.affairs) && <ActionForm url="/api/counselling" fixed={{ action: "designate", on: true }} collapsed openLabel="Designate a student counsellor…" submit="Designate" fields={[{ name: "userId", label: "Member of staff", type: "select", options: staff.filter((s) => !profiles.some((p) => p.userId === s.id && p.isCounsellor)).map((s) => [s.id, s.name] as [string, string]) }]} />}
          </div>
          {rep && (
            <>
              <h2 style={{ fontSize: 17, margin: "18px 0 6px" }}>Report {rep.year} (counts only)</h2>
              <div className="card" style={{ overflowX: "auto" }}>
                <form method="get" className="no-print" style={{ marginBottom: 8, display: "flex", gap: 6, alignItems: "center" }}><label style={{ fontSize: 13 }}>Year <input name="year" type="number" defaultValue={rep.year} className="input" style={{ width: 90 }} /></label><button className="btn btn-secondary btn-sm">Show</button></form>
                <p style={{ margin: "0 0 8px", fontSize: 14 }}><b>{rep.held}</b> sessions held with <b>{rep.students}</b> students · {Object.entries(rep.byKind).map(([k, n]) => `${KINDS[k]} ${n}`).join(" · ")} · {rep.calledIn} after a call-in · {rep.noShows} did not come.</p>
                <table className="table" style={{ fontSize: 13 }}>
                  <thead><tr><th>Month</th>{kindOpts.map(([k, l]) => <th key={k}>{l}</th>)}<th>All</th></tr></thead>
                  <tbody>{rep.months.map((m) => <tr key={m.month}><td>{m.month}</td>{kindOpts.map(([k]) => <td key={k}>{m[k] || 0}</td>)}<td><b>{kindOpts.reduce((t, [k]) => t + (m[k] || 0), 0)}</b></td></tr>)}</tbody>
                </table>
                <HowCalculated shows="What feeds the council tables.">
                  <p style={{ margin: 0 }}>Sessions marked held are counted per program, month and type and written into each program&apos;s evidence (Counselling) — that is what the NCEAC criterion 4 checks and the NBEAC Form 3 counselling table read. No names or notes ever leave this page.</p>
                </HowCalculated>
              </div>
            </>
          )}
        </>
      )}
    </Shell>
  );
}
