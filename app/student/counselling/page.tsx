import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import StudentShell from "../../../components/StudentShell";
import { cdb, COUNSEL_HINT, KINDS, MODES, STATUS, counsellorsFor, openSlots, type Booking } from "../../../lib/counselling";
import { ActionForm, ActionButton } from "../../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
const when = (d: Date | string | null) => (d ? new Date(d).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const kindOpts = Object.entries(KINDS) as [string, string][];

// Student: book a counselling time with your batch advisor or a student counsellor; see your bookings and call-ins.
// (You never see anyone's notes — they are confidential to the counsellor.)
export default async function StudentCounselling() {
  const st = await getAuthenticatedStudent();
  if (!st) redirect("/student/login");
  if (st.mustChangePassword) redirect("/student/change-password");
  let bookings: Booking[] = [], missing = false;
  try { bookings = await cdb.counsellingBooking.findMany({ where: { studentId: st.id }, orderBy: { createdAt: "desc" }, take: 50 }); } catch { missing = true; }
  const counsellors = missing ? [] : await counsellorsFor(st.id);
  const slots = missing ? [] : await openSlots(counsellors.map((c) => c.id));
  const nameOf = new Map(counsellors.map((c) => [c.id, c.name]));
  const calledIn = bookings.filter((b) => b.status === "CALLED_IN");
  const upcoming = bookings.filter((b) => ["BOOKED", "REQUESTED"].includes(b.status));
  const past = bookings.filter((b) => ["DONE", "NO_SHOW", "CANCELLED"].includes(b.status));

  return (
    <StudentShell studentName={st.name}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Counselling</h1>
        <p className="small-note" style={{ marginBottom: 10 }}>Talk to your batch advisor or a student counsellor about your studies, your career, or anything personal. What you say stays with the counsellor — nobody else can read their notes.</p>
        {missing && <div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{COUNSEL_HINT}</p></div>}
        {calledIn.map((b) => (
          <div key={b.id} className="card" style={{ background: "#FFF1D6", borderColor: "#E0B54A" }}>
            <b>{nameOf.get(b.counsellorId) || "Your advisor"} would like to see you</b>{b.reason ? ` — ${b.reason}` : ""}. Please pick one of their times below.
          </div>
        ))}

        <h2 style={{ fontSize: 17, margin: "12px 0 6px" }}>My bookings</h2>
        <div className="card">
          {upcoming.length === 0 && <p className="small-note" style={{ margin: 0 }}>Nothing booked.</p>}
          {upcoming.map((b) => (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", padding: "6px 0", borderBottom: "1px solid #eee" }}>
              <span><b>{b.status === "BOOKED" ? when(b.startsAt) : STATUS[b.status]}</b> · {nameOf.get(b.counsellorId) || "Counsellor"} · {KINDS[b.kind]} · {MODES[b.mode]}</span>
              <ActionButton url="/api/student/counselling" body={{ action: "cancel", bookingId: b.id }} label="Cancel" className="btn btn-secondary btn-sm" confirmText="Cancel this booking?" />
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: 17, margin: "16px 0 6px" }}>Book a time</h2>
        {counsellors.length === 0 && !missing && <div className="card"><p className="small-note" style={{ margin: 0 }}>Your batch has no advisor yet and the institute has not named a student counsellor.</p></div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 10 }}>
          {counsellors.map((c) => {
            const mine = slots.filter((s) => s.counsellorId === c.id);
            return (
              <div key={c.id} className="card" style={{ margin: 0 }}>
                <div style={{ fontWeight: 700 }}>{c.name}</div>
                <div className="small-note" style={{ margin: "0 0 8px" }}>{c.as}</div>
                {mine.length > 0 ? (
                  <ActionForm url="/api/student/counselling" fixed={{ action: "book" }} submit="Book" done="Booked — you will get a reminder the day before." initial={{ slotId: mine[0].id, kind: "ACADEMIC", mode: "IN_PERSON" }}
                    fields={[{ name: "slotId", label: "Time", type: "select", options: mine.slice(0, 40).map((s) => [s.id, `${when(s.startsAt)} · ${MODES[s.mode]}${s.place && s.mode !== "ONLINE" ? ` · ${s.place}` : ""}`] as [string, string]) }, { name: "kind", label: "About", type: "select", options: kindOpts }, ...(mine.some((s) => s.mode === "EITHER") ? [{ name: "mode", label: "If either is possible", type: "select" as const, options: [["IN_PERSON", "In person"], ["ONLINE", "Online"]] as [string, string][] }] : []), { name: "reason", label: "A few words (optional)", type: "text" }]} />
                ) : <p className="small-note" style={{ margin: "0 0 6px" }}>No free times in the next four weeks.</p>}
                {(c.byRequest || mine.length === 0) && (
                  <div style={{ marginTop: 6 }}>
                    <ActionForm url="/api/student/counselling" fixed={{ action: "request", counsellorId: c.id }} collapsed openLabel="Ask for another time…" submit="Send" done="Sent — they will reply with a time." initial={{ kind: "ACADEMIC", mode: "IN_PERSON" }}
                      fields={[{ name: "kind", label: "About", type: "select", options: kindOpts }, { name: "mode", label: "How", type: "select", options: [["IN_PERSON", "In person"], ["ONLINE", "Online"]] }, { name: "reason", label: "When suits you, and a few words", type: "text" }]} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {past.length > 0 && (
          <>
            <h2 style={{ fontSize: 17, margin: "16px 0 6px" }}>Earlier</h2>
            <div className="card">{past.map((b) => <div key={b.id} style={{ fontSize: 13.5, padding: "4px 0" }}>{when(b.startsAt || b.createdAt)} · {nameOf.get(b.counsellorId) || "Counsellor"} · {KINDS[b.kind]} · <i>{STATUS[b.status]}</i>{b.followUpDate ? ` · follow-up around ${new Date(b.followUpDate).toLocaleDateString("en-GB")}` : ""}</div>)}</div>
          </>
        )}
      </div>
    </StudentShell>
  );
}
