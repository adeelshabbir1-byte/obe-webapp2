import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser, getSignedInUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { rdb2, teacherSemester, goalsFor, BADGES, type BadgeRow } from "../../lib/recognition";
import { GoalBar } from "../../components/RecognitionControls";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const LINK: Record<string, string> = { clos: "clos", assess: "instruments", marks: "marks", result: "marks", cqi: "marks", file: "marks" };

export default async function MyObePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const me = (await getSignedInUser()) || user;
  const chairmanId = await chairmanIdFor(user);
  const [t, dept] = await Promise.all([teacherSemester(me.id, chairmanId), prisma.user.findUnique({ where: { id: me.id }, select: { departmentId: true } })]);
  const goals = await goalsFor(chairmanId, dept?.departmentId || null);
  let badges: BadgeRow[] = [], missing = false;
  try { badges = (await rdb2.recognitionBadge.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" } })) as BadgeRow[]; } catch { missing = true; }

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>My OBE Progress{t.sem ? ` — ${t.sem.label}` : ""}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        Where each of your courses stands on the OBE essentials, and the recognition you&apos;ve earned. Only you and your Chairman see this —
        it is not a ranking. Badges are given at the end of the semester for good practice; nothing here takes anything away.
      </p>
      {missing && <div className="err">The recognition tables are not in the database yet — run prisma/migration_recognition.sql in Supabase.</div>}
      {!t.sem && <div className="err">The current term is not set yet (Program Leads set it).</div>}

      <div className="stat-grid">
        <div className="stat"><div style={{ fontSize: 26, fontWeight: 700, color: t.pct !== null && t.pct === 100 ? "var(--sage)" : undefined }}>{t.pct !== null ? `${t.pct}%` : "—"}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>OBE essentials complete across {t.checks.length} course(s)</div></div>
        <div className="stat"><div style={{ fontSize: 26, fontWeight: 700 }}>{t.deadlines.judged ? `${t.deadlines.onTime}/${t.deadlines.judged}` : "—"}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>Deadlines met on time this semester ({t.deadlines.upcoming} coming)</div></div>
        <div className="stat"><div style={{ fontSize: 26, fontWeight: 700 }}>{t.earned.filter((e) => e.met).length} / 4</div><div style={{ fontSize: 12, color: "var(--slate)" }}>Semester badges on track</div></div>
      </div>

      {goals.length > 0 && <div className="card"><h3 style={{ marginTop: 0 }}>Department goals</h3>{goals.map(({ g, p }) => <GoalBar key={g.id} title={g.title} done={p.done} total={p.total} pct={p.pct} target={g.targetPct} due={new Date(g.dueDate).toISOString()} />)}</div>}

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>My courses this semester</h3>
        {t.checks.length === 0 ? <p style={{ color: "var(--slate)", margin: 0 }}>No course assigned to you this semester.</p> : (
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Course</th>{t.checks[0].steps.map((s) => <th key={s.key} style={{ textAlign: "center" }}>{s.label}</th>)}<th style={{ textAlign: "center" }}>Complete</th></tr></thead>
            <tbody>{t.checks.map((c) => (
              <tr key={c.id}>
                <td><b>{c.code}</b> {c.title}<div style={{ fontSize: 11, color: "var(--slate)" }}>{c.batch}</div></td>
                {c.steps.map((s) => (
                  <td key={s.key} style={{ textAlign: "center" }} title={s.note || ""}>
                    {s.done === null ? <span style={{ color: "var(--slate-mute)" }}>n/a</span> : s.done ? <span style={{ color: "var(--sage)", fontWeight: 700 }}>✓</span> : <Link href={`/instructor/courses/${c.id}/${LINK[s.key]}`} style={{ color: "var(--rust)", fontWeight: 700 }}>to do</Link>}
                    {s.note && s.done === false && <div style={{ fontSize: 10.5, color: "var(--slate)" }}>{s.note}</div>}
                  </td>
                ))}
                <td style={{ textAlign: "center", fontWeight: 700 }}>{c.pct}%</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 0 }}>Course files are marked as kept by your Program Lead. CQI is checked once a course&apos;s result is approved: any CLO below its target needs an action recorded under CQI.</p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Semester badges</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
          {t.earned.map((e) => (
            <div key={e.key} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", background: e.met ? "#F0FAF3" : "#FAF7F6", opacity: e.met ? 1 : 0.85 }}>
              <div style={{ fontSize: 15 }}><span style={{ fontSize: 20, marginRight: 6, filter: e.met ? "none" : "grayscale(1)" }}>{BADGES[e.key].icon}</span><b>{BADGES[e.key].title}</b></div>
              <div style={{ fontSize: 12, color: e.met ? "var(--sage)" : "var(--slate)", marginTop: 4 }}>{e.met ? "On track" : "Not yet"} — {e.why}</div>
              <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 4 }}>{BADGES[e.key].rule}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>My recognition</h3>
        {badges.length === 0 ? <p style={{ color: "var(--slate)", margin: 0 }}>None yet.</p> : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{badges.map((b) => (
            <span key={b.id} title={b.reason || ""} style={{ border: "1px solid var(--line)", borderRadius: 999, padding: "6px 12px", fontSize: 12.5, background: "#FFF" }}>
              {BADGES[b.badgeKey]?.icon || "🌟"} <b>{b.title}</b> <span style={{ color: "var(--slate)" }}>· {b.term}</span>
            </span>
          ))}</div>
        )}
      </div>
    </Shell>
  );
}
