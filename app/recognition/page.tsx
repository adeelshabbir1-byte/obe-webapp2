import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { appraiseesFor } from "../../lib/appraisal";
import { rdb2, teacherSemester, goalsFor, currentSemester, BADGES, METRICS, RECOGNITION_MANAGERS, type BadgeRow } from "../../lib/recognition";
import { GoalBar, GoalForm, RecogniseForm, RemoveButton, AwardSemester } from "../../components/RecognitionControls";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function RecognitionPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (![...RECOGNITION_MANAGERS, "DEAN"].includes(user.role)) redirect("/my-obe");
  const canEdit = RECOGNITION_MANAGERS.includes(user.role);
  const { chairmanId, people } = await appraiseesFor(user);
  const sem = await currentSemester(chairmanId);
  const goals = await goalsFor(chairmanId, user.role === "HEAD_OF_DEPARTMENT" ? user.departmentId || null : null);
  let badges: BadgeRow[] = [], missing = false;
  try { badges = sem ? ((await rdb2.recognitionBadge.findMany({ where: { chairmanId, term: sem.label, userId: { in: people.map((p) => p.id) } }, orderBy: { createdAt: "asc" } })) as BadgeRow[]) : []; } catch { missing = true; }
  const rows: { p: (typeof people)[number]; t: Awaited<ReturnType<typeof teacherSemester>> }[] = [];
  for (let i = 0; i < people.length; i += 8) {
    const part = await Promise.all(people.slice(i, i + 8).map((p) => teacherSemester(p.id, chairmanId).catch(() => null)));
    part.forEach((t, k) => { if (t) rows.push({ p: people[i + k], t }); });
  }
  const teaching = rows.filter((r) => r.t.checks.length > 0).sort((a, b) => (b.t.pct ?? 0) - (a.t.pct ?? 0) || a.p.name.localeCompare(b.p.name));
  const avg = teaching.length ? Math.round(teaching.reduce((n, r) => n + (r.t.pct ?? 0), 0) / teaching.length) : null;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>OBE Recognition{sem ? ` — ${sem.label}` : ""}</h1>
        {canEdit && sem && !missing && <span style={{ marginLeft: "auto" }} className="no-print"><AwardSemester term={sem.label} /></span>}
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        How complete each teacher&apos;s courses are on the OBE essentials, the badges they are on track for, and the department goals.
        This is recognition, not a ranking: badges reward good practice and are never taken away. At the end of the semester press
        &quot;Give badges&quot;, then read out the recognition list below in the faculty meeting.
      </p>
      {missing && <div className="err">The recognition tables are not in the database yet — run prisma/migration_recognition.sql in Supabase.</div>}

      <div className="stat-grid">
        <div className="stat"><div style={{ fontSize: 26, fontWeight: 700 }}>{avg !== null ? `${avg}%` : "—"}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>Average OBE completion ({teaching.length} teachers with courses)</div></div>
        <div className="stat"><div style={{ fontSize: 26, fontWeight: 700 }}>{teaching.filter((r) => r.t.pct === 100).length}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>Teachers with every course complete</div></div>
        <div className="stat"><div style={{ fontSize: 26, fontWeight: 700 }}>{badges.length}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>Badges given this semester</div></div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Department goals</h3>
        {goals.length === 0 && <p style={{ color: "var(--slate)" }}>No goal yet.</p>}
        {goals.map(({ g, p }) => <div key={g.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><div style={{ flex: 1 }}><GoalBar title={`${g.title} — ${METRICS[g.metric]}`} done={p.done} total={p.total} pct={p.pct} target={g.targetPct} due={new Date(g.dueDate).toISOString()} /></div>{canEdit && <span className="no-print"><RemoveButton url={`/api/recognition/goals?id=${g.id}`} /></span>}</div>)}
        {canEdit && !missing && <div className="no-print" style={{ marginTop: 10 }}><GoalForm /></div>}
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Teachers</h3>
        <table style={{ fontSize: 12.5 }}>
          <thead><tr><th>Teacher</th><th style={{ textAlign: "center" }}>Courses</th><th style={{ textAlign: "center" }}>OBE complete</th><th>Still to do</th>{Object.keys(BADGES).map((k) => <th key={k} style={{ textAlign: "center" }} title={BADGES[k].rule}>{BADGES[k].icon}</th>)}</tr></thead>
          <tbody>
            {teaching.length === 0 && <tr><td colSpan={8} style={{ color: "var(--slate)" }}>No teacher has a course this semester yet.</td></tr>}
            {teaching.map(({ p, t }) => {
              const todo = new Map<string, number>();
              for (const c of t.checks) for (const s of c.steps) if (s.done === false) todo.set(s.label, (todo.get(s.label) || 0) + 1);
              return (
                <tr key={p.id}>
                  <td><Link href={`/appraisals/${p.id}`}><b>{p.name}</b></Link>{p.department && <div style={{ fontSize: 11, color: "var(--slate)" }}>{p.department}</div>}</td>
                  <td style={{ textAlign: "center" }}>{t.checks.length}</td>
                  <td style={{ textAlign: "center", fontWeight: 700, color: t.pct === 100 ? "var(--sage)" : (t.pct ?? 0) < 50 ? "var(--rust)" : undefined }}>{t.pct ?? "—"}%</td>
                  <td style={{ fontSize: 11.5 }}>{Array.from(todo.entries()).map(([l, n]) => `${l} (${n})`).join("; ") || <span style={{ color: "var(--sage)" }}>nothing</span>}</td>
                  {t.earned.map((e) => <td key={e.key} style={{ textAlign: "center" }} title={e.why}>{badges.some((b) => b.userId === p.id && b.badgeKey === e.key) ? "✓ given" : e.met ? <span style={{ color: "var(--sage)" }}>on track</span> : <span style={{ color: "var(--slate-mute)" }}>—</span>}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && !missing && <div className="card no-print"><h3 style={{ marginTop: 0 }}>Recognise someone</h3><p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>For work the system can&apos;t see — a workshop, committee work, a grant, mentoring.</p><RecogniseForm people={people.map((p) => ({ id: p.id, name: p.name }))} /></div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Recognition list{sem ? ` — ${sem.label}` : ""}</h3>
        {badges.length === 0 ? <p style={{ color: "var(--slate)", margin: 0 }}>No badges given yet this semester.</p> : (
          <table style={{ fontSize: 13 }}><tbody>{people.filter((p) => badges.some((b) => b.userId === p.id)).map((p) => (
            <tr key={p.id}><td style={{ width: 220 }}><b>{p.name}</b></td><td>{badges.filter((b) => b.userId === p.id).map((b) => (
              <span key={b.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, marginRight: 10 }} title={b.reason || ""}>{BADGES[b.badgeKey]?.icon || "🌟"} {b.title}{b.badgeKey === "CUSTOM" && b.reason ? <span style={{ color: "var(--slate)", fontSize: 11.5 }}> ({b.reason})</span> : null}{canEdit && <span className="no-print"><RemoveButton url={`/api/recognition/badges?id=${b.id}`} label="×" /></span>}</span>
            ))}</td></tr>
          ))}</tbody></table>
        )}
        <p className="no-print" style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 0 }}>Print this page for the faculty meeting.</p>
      </div>
    </Shell>
  );
}
