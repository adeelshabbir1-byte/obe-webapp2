import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { sdb, substituteOptions, canDecideLeave, type ShortLeaveRow, type SubRow } from "../../lib/shortLeave";
import { getTimetableEntries } from "../../lib/timetableView";
import { LeaveDecision, CoverClass } from "../../components/ShortLeaveControls";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const day = (d: Date) => new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function LeaveApprovalsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["CHAIRMAN", "HEAD_OF_DEPARTMENT", "DEAN"].includes(user.role)) redirect("/dashboard");
  const chairmanId = await chairmanIdFor(user);
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  let leaves: ShortLeaveRow[] = [], missing = false;
  try { leaves = (await sdb.shortLeave.findMany({ where: { chairmanId, OR: [{ status: "PENDING" }, { status: "APPROVED", toDate: { gte: new Date(today.getTime() - 7 * 864e5) } }] }, orderBy: { fromDate: "asc" }, take: 200 })) as ShortLeaveRow[]; } catch { missing = true; }
  const mine: ShortLeaveRow[] = [];
  for (const l of leaves) if (user.role === "DEAN" || (await canDecideLeave(user, l))) mine.push(l);
  const classes = mine.length ? ((await sdb.substituteClass.findMany({ where: { leaveId: { in: mine.map((l) => l.id) } }, orderBy: { date: "asc" } })) as SubRow[]) : [];
  const ids = Array.from(new Set([...mine.map((l) => l.userId), ...classes.map((c) => c.substituteId)].filter((x): x is string => !!x)));
  const names = new Map((ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  const entries = chairmanId ? await getTimetableEntries(chairmanId) : [];
  const eOf = new Map(entries.map((e) => [e.id, e]));
  const canAct = user.role !== "DEAN";
  const opts = new Map<string, Awaited<ReturnType<typeof substituteOptions>>>();
  if (canAct) for (const c of classes.filter((x) => new Date(x.date) >= today && ["NEEDED", "DECLINED"].includes(x.status)).slice(0, 40)) {
    const e = eOf.get(c.entryId);
    if (e) opts.set(c.id, await substituteOptions(chairmanId, new Date(c.date), e));
  }
  const uncovered = classes.filter((c) => new Date(c.date) >= today && ["NEEDED", "DECLINED", "ASSIGNED"].includes(c.status) && mine.find((l) => l.id === c.leaveId)?.status !== "REJECTED");
  const todays = classes.filter((c) => new Date(c.date).getTime() === today.getTime() && c.status !== "CANCELLED");

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Leave &amp; Substitutes</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        Teachers&apos; short leave requests and the classes that need cover. For each class, pick a substitute (only teachers free at that
        time and not on leave are offered; ★ = already teaches the course), set a make-up date, or cancel it. The substitute accepts and marks
        the class as taken with the topic covered.
      </p>
      {missing && <div className="err">The short leave tables are not in the database yet — run prisma/migration_short_leave.sql in Supabase.</div>}
      <div className="stat-grid">
        <div className={`stat ${mine.some((l) => l.status === "PENDING") ? "stat-warn" : ""}`}><div style={{ fontSize: 24, fontWeight: 700 }}>{mine.filter((l) => l.status === "PENDING").length}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>Requests waiting</div></div>
        <div className={`stat ${uncovered.length ? "stat-warn" : ""}`}><div style={{ fontSize: 24, fontWeight: 700, color: uncovered.length ? "var(--rust)" : undefined }}>{uncovered.length}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>Coming classes not yet covered</div></div>
        <div className="stat"><div style={{ fontSize: 24, fontWeight: 700 }}>{todays.length}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>Substitute / make-up arrangements today</div></div>
      </div>
      {mine.length === 0 && !missing && <div className="card"><p style={{ margin: 0, color: "var(--slate)" }}>No leave requests right now.</p></div>}
      {mine.map((l) => {
        const cs = classes.filter((c) => c.leaveId === l.id);
        return (
          <div key={l.id} className="card" style={{ overflowX: "auto" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <b>{names.get(l.userId) || "—"}</b>
              <span>{day(l.fromDate)}{l.toDate.getTime() !== l.fromDate.getTime() ? ` – ${day(l.toDate)}` : ""}</span>
              <span className={`badge ${l.status === "APPROVED" ? "badge-ok" : "badge-warn"}`}>{l.status === "APPROVED" ? "Approved" : "Waiting"}</span>
              <span style={{ fontSize: 12.5, color: "var(--slate)" }}>{l.reason}</span>
              {canAct && l.status === "PENDING" && <span style={{ marginLeft: "auto" }}><LeaveDecision id={l.id} /></span>}
            </div>
            {cs.length > 0 && (
              <table style={{ fontSize: 12.5, marginTop: 8 }}><thead><tr><th>When</th><th>Class</th><th>Room</th><th>Cover</th></tr></thead>
                <tbody>{cs.map((c) => (
                  <tr key={c.id}><td style={{ whiteSpace: "nowrap" }}>{day(c.date)}<div style={{ fontSize: 11, color: "var(--slate)" }}>{c.timeLabel}</div></td><td><b>{c.courseCode}</b> {c.courseTitle} · {c.sectionLabel}</td><td>{c.roomName}</td>
                    <td>{canAct ? <CoverClass id={c.id} status={c.status} plan={c.plan} substituteName={c.substituteId ? names.get(c.substituteId) || null : null} options={opts.get(c.id) || []} makeupDate={c.makeupDate ? new Date(c.makeupDate).toISOString().slice(0, 10) : null} /> : c.status}{c.topic && <div style={{ fontSize: 11, color: "var(--slate)" }}>Covered: {c.topic}</div>}</td></tr>
                ))}</tbody>
              </table>
            )}
            {cs.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 0 }}>No classes in these days (or no timetable yet).</p>}
          </div>
        );
      })}
    </Shell>
  );
}
