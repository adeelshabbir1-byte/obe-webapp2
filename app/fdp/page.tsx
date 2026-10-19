import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import { REPORT_VIEWER_ROLES, reportPeople } from "../../lib/facultyProfile";
import { yearData, hoursBy, target, suggestions, FDP_HINT, FDP_KINDS } from "../../lib/fdp";
import { ActionForm } from "../../components/fyp/FypClient";
import FdpAttendance from "../../components/FdpAttendance";

export const dynamic = "force-dynamic";
export const metadata = { title: "Faculty Development" };

export default async function FdpPage({ searchParams }: { searchParams: { year?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const chairmanId = await chairmanIdFor(user);
  const year = Number(searchParams.year) || new Date().getFullYear();
  const manage = REPORT_VIEWER_ROLES.includes(user.role);
  let d: Awaited<ReturnType<typeof yearData>> | null = null;
  try { d = await yearData(chairmanId, year); } catch { d = null; }
  const t = await target(chairmanId);
  const h = d ? hoursBy(d) : new Map();
  const mine = h.get(user.id) || { internal: 0, external: 0 };
  const people = manage ? await reportPeople(user) : [];
  const sugg = manage && d ? await suggestions(chairmanId, people, year) : [];
  const kinds = Object.entries(FDP_KINDS) as [string, string][];
  const pick = people.map((p) => [p.id, p.name] as [string, string]).sort((a, b) => a[1].localeCompare(b[1]));
  const myAtt = d ? d.att.filter((a) => a.userId === user.id) : [];
  const sOf = new Map((d?.sessions || []).map((s) => [s.id, s]));

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Faculty Development Program — {year}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>
        <Link href={`/fdp?year=${year - 1}`}>← {year - 1}</Link> · <Link href={`/fdp?year=${year + 1}`}>{year + 1} →</Link>
        {manage && <> · <a href={`/api/fdp?year=${year}`}>Download council report (CSV)</a></>}
      </p>
      {!d && <div className="err">{FDP_HINT}</div>}
      {d && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>My development hours</h3>
          <p style={{ fontSize: 14, margin: "0 0 6px" }}><b style={{ color: mine.internal + mine.external >= t ? "#2E7D4F" : "#C58A12" }}>{mine.internal + mine.external}</b> of {t} hours ({mine.internal} here, {mine.external} outside)</p>
          {myAtt.length > 0 && <p className="small-note" style={{ margin: "0 0 6px" }}>Certificates: {myAtt.map((a) => <span key={a.id}><Link href={`/fdp/certificate/${a.id}`}>{sOf.get(a.sessionId)?.title} ({a.certificateNo})</Link> · </span>)}</p>}
          {d.ext.filter((e) => e.userId === user.id).map((e) => <div key={e.id} className="small-note">Outside: {e.title}{e.organizer ? `, ${e.organizer}` : ""} — {e.hours} h ({e.date.toISOString().slice(0, 10)})</div>)}
          <ActionForm url="/api/fdp" fixed={{ action: "external" }} collapsed openLabel="+ Add hours earned outside" submit="Add" fields={[{ name: "title", label: "Training / workshop", width: 240 }, { name: "organizer", label: "Organizer", width: 160 }, { name: "date", label: "Date", type: "date" }, { name: "hours", label: "Hours", type: "number", width: 70 }]} />
        </div>
      )}
      {d && manage && (
        <>
          {sugg.length > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Suggested sessions</h3>
              <ul style={{ fontSize: 13, margin: 0 }}>{sugg.map((s, i) => <li key={i}><b>{s.topic}</b> — <span className="small-note">{s.why}{s.who.length ? ` For: ${s.who.slice(0, 12).join(", ")}${s.who.length > 12 ? "…" : ""}` : ""}</span></li>)}</ul>
            </div>
          )}
          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ marginTop: 0 }}>Sessions</h3>
            {d.sessions.length === 0 && <p className="small-note">No sessions planned for {year} yet.</p>}
            {d.sessions.map((s) => (
              <div key={s.id} style={{ borderTop: "1px solid var(--line, #eee)", padding: "8px 0" }}>
                <b>{s.title}</b> <span className="small-note">{FDP_KINDS[s.kind]} · {s.date.toISOString().slice(0, 10)} · {s.hours} h{s.facilitator ? ` · ${s.facilitator}` : ""}{s.venue ? ` · ${s.venue}` : ""} · {s.status === "HELD" ? "held" : s.status === "CANCELLED" ? "cancelled" : "planned"}</span>
                {s.reason && <div className="small-note">Why: {s.reason}</div>}
                <FdpAttendance sessionId={s.id} people={pick} attended={d!.att.filter((a) => a.sessionId === s.id).map((a) => a.userId)} />
              </div>
            ))}
            <div style={{ marginTop: 8 }}><ActionForm url="/api/fdp" fixed={{ action: "session" }} collapsed openLabel="+ Plan a session" submit="Save" fields={[
              { name: "title", label: "Title", width: 260 }, { name: "kind", label: "Type", type: "select", options: kinds }, { name: "date", label: "Date", type: "date" }, { name: "hours", label: "Hours", type: "number", width: 70 },
              { name: "facilitator", label: "Facilitator", width: 180 }, { name: "venue", label: "Venue", width: 140 }, { name: "reason", label: "Why (e.g. weak CLO, low ratings)", full: true },
            ]} /></div>
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ marginTop: 0 }}>Hours against the target ({t} h a year)</h3>
            <table style={{ fontSize: 12.5 }}>
              <thead><tr><th>Teacher</th><th>Department</th><th style={{ textAlign: "center" }}>Here</th><th style={{ textAlign: "center" }}>Outside</th><th style={{ textAlign: "center" }}>Total</th></tr></thead>
              <tbody>{people.map((p) => { const x = h.get(p.id) || { internal: 0, external: 0 }; const tot = x.internal + x.external; return <tr key={p.id}><td>{p.name}</td><td className="small-note">{p.department_?.name || "—"}</td><td style={{ textAlign: "center" }}>{x.internal}</td><td style={{ textAlign: "center" }}>{x.external}</td><td style={{ textAlign: "center", fontWeight: 600, color: tot >= t ? "#2E7D4F" : tot >= t / 2 ? "#C58A12" : "#B3261E" }}>{tot}</td></tr>; })}</tbody>
            </table>
            <div style={{ marginTop: 8 }}><ActionForm url="/api/fdp" fixed={{ action: "target" }} collapsed openLabel="Change the yearly target" submit="Save" initial={{ hours: t }} fields={[{ name: "hours", label: "Hours a year", type: "number", width: 80 }]} /></div>
          </div>
        </>
      )}
    </Shell>
  );
}
