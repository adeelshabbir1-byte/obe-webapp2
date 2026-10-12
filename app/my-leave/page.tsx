import { redirect } from "next/navigation";
import { getAuthenticatedUser, getSignedInUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { sdb, substituteOptions, type ShortLeaveRow, type SubRow } from "../../lib/shortLeave";
import { getTimetableEntries } from "../../lib/timetableView";
import { LeaveRequestForm, WithdrawLeave, CoverClass, SubstituteAnswer } from "../../components/ShortLeaveControls";

export const dynamic = "force-dynamic";
const day = (d: Date) => new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const STATUS: Record<string, [string, string]> = { PENDING: ["Waiting for approval", "badge-warn"], APPROVED: ["Approved", "badge-ok"], REJECTED: ["Not approved", "badge-no"], CANCELLED: ["Withdrawn", "badge-neutral"] };

export default async function MyLeavePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const me = (await getSignedInUser()) || user;
  const chairmanId = await chairmanIdFor(user);
  let leaves: ShortLeaveRow[] = [], classes: SubRow[] = [], duties: SubRow[] = [], missing = false;
  try {
    leaves = (await sdb.shortLeave.findMany({ where: { userId: me.id }, orderBy: { fromDate: "desc" }, take: 30 })) as ShortLeaveRow[];
    classes = leaves.length ? ((await sdb.substituteClass.findMany({ where: { leaveId: { in: leaves.map((l) => l.id) } }, orderBy: { date: "asc" } })) as SubRow[]) : [];
    duties = (await sdb.substituteClass.findMany({ where: { substituteId: me.id, status: { in: ["ASSIGNED", "ACCEPTED", "DONE"] } }, orderBy: { date: "asc" }, take: 60 })) as SubRow[];
  } catch { missing = true; }
  const ids = Array.from(new Set([...classes.map((c) => c.substituteId), ...duties.map((d) => d.originalId)].filter((x): x is string => !!x)));
  const names = new Map((ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  const entries = chairmanId ? await getTimetableEntries(chairmanId) : [];
  const eOf = new Map(entries.map((e) => [e.id, e]));
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const opts = new Map<string, Awaited<ReturnType<typeof substituteOptions>>>();
  for (const c of classes.filter((x) => new Date(x.date) >= today && ["NEEDED", "DECLINED"].includes(x.status)).slice(0, 20)) {
    const e = eOf.get(c.entryId);
    if (e && chairmanId) opts.set(c.id, await substituteOptions(chairmanId, new Date(c.date), e));
  }

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Short Leave</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        Ask for a few days off. Your classes in those days are listed from the timetable; you can suggest a colleague who is free,
        or a make-up date, and your Chairman approves and arranges the rest. Classes you take for others are listed here too.
      </p>
      {missing && <div className="err">The short leave tables are not in the database yet — run prisma/migration_short_leave.sql in Supabase.</div>}
      {!missing && <div className="card"><h3 style={{ marginTop: 0 }}>Ask for leave</h3><LeaveRequestForm /></div>}

      {duties.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Classes you are asked to take</h3>
          <table style={{ fontSize: 12.5 }}><thead><tr><th>When</th><th>Class</th><th>Room</th><th>For</th><th></th></tr></thead>
            <tbody>{duties.map((d) => <tr key={d.id}><td style={{ whiteSpace: "nowrap" }}>{day(d.date)}<div style={{ fontSize: 11, color: "var(--slate)" }}>{d.timeLabel}</div></td><td><b>{d.courseCode}</b> {d.courseTitle} · {d.sectionLabel}</td><td>{d.roomName}</td><td>{names.get(d.originalId) || "—"}</td><td><SubstituteAnswer id={d.id} status={d.status} past={new Date(d.date) <= new Date()} /></td></tr>)}</tbody>
          </table>
        </div>
      )}

      {leaves.map((l) => {
        const cs = classes.filter((c) => c.leaveId === l.id);
        const [t, cls] = STATUS[l.status] || [l.status, "badge-neutral"];
        return (
          <div key={l.id} className="card" style={{ overflowX: "auto" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <b>{day(l.fromDate)}{l.toDate.getTime() !== l.fromDate.getTime() ? ` – ${day(l.toDate)}` : ""}</b>
              <span className={`badge ${cls}`}>{t}</span>
              <span style={{ fontSize: 12.5, color: "var(--slate)" }}>{l.reason}{l.decisionNote ? ` · ${l.decisionNote}` : ""}</span>
              {["PENDING", "APPROVED"].includes(l.status) && new Date(l.toDate) >= today && <span style={{ marginLeft: "auto" }}><WithdrawLeave id={l.id} /></span>}
            </div>
            {cs.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 0 }}>No classes in these days.</p> : (
              <table style={{ fontSize: 12.5, marginTop: 8 }}><thead><tr><th>When</th><th>Class</th><th>Room</th><th>Cover</th></tr></thead>
                <tbody>{cs.map((c) => (
                  <tr key={c.id}><td style={{ whiteSpace: "nowrap" }}>{day(c.date)}<div style={{ fontSize: 11, color: "var(--slate)" }}>{c.timeLabel}</div></td><td><b>{c.courseCode}</b> {c.courseTitle} · {c.sectionLabel}</td><td>{c.roomName}</td>
                    <td>{["REJECTED", "CANCELLED"].includes(l.status) ? "—" : <CoverClass id={c.id} status={c.status} plan={c.plan} substituteName={c.substituteId ? names.get(c.substituteId) || null : null} options={opts.get(c.id) || []} makeupDate={c.makeupDate ? new Date(c.makeupDate).toISOString().slice(0, 10) : null} />}{c.topic && <div style={{ fontSize: 11, color: "var(--slate)" }}>Covered: {c.topic}</div>}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        );
      })}
    </Shell>
  );
}
