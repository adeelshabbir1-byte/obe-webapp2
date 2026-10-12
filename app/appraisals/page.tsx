import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { adb, appraiseesFor, computeScorecard, APPRAISAL_VIEW_ROLES, OVERALL, type AppraisalRow, type Scorecard } from "../../lib/appraisal";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function AppraisalsPage({ searchParams }: { searchParams: { year?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const year = parseInt(searchParams.year || "", 10) || new Date().getFullYear();
  if (!APPRAISAL_VIEW_ROLES.includes(user.role)) redirect(`/appraisals/${user.id}?year=${year}`);
  const { people } = await appraiseesFor(user);
  let rows: AppraisalRow[] = [], missing = false;
  try { rows = (await adb.facultyAppraisal.findMany({ where: { userId: { in: people.map((p) => p.id) }, year } })) as AppraisalRow[]; } catch { missing = true; }
  const aOf = new Map(rows.map((r) => [r.userId, r]));
  const cards = new Map<string, Scorecard>();
  for (let i = 0; i < people.length; i += 8) {
    const part = await Promise.all(people.slice(i, i + 8).map((p) => computeScorecard(p.id, year).catch(() => null)));
    part.forEach((c, k) => { if (c) cards.set(people[i + k].id, c); });
  }
  const st = (r?: AppraisalRow) => (!r ? ["Not started", "badge-neutral"] : r.status === "FINAL" ? ["Final", "badge-ok"] : r.status === "SHARED" ? ["Shared", "badge-warn"] : ["Draft", "badge-neutral"]);
  const done = rows.filter((r) => r.status === "FINAL").length;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Faculty Appraisal {year}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12 }}>
        One scorecard per teacher, built from what the system records for the year — teaching load, lectures delivered, results, deadlines met,
        courses designed, rubrics, publications and exam duties. Open a teacher to see the full picture (including Planned vs Taught and CLO
        attainment), add your ratings and remarks, share it with them, and sign it off.
      </p>
      {missing && <div className="err">The appraisal table is not in the database yet — run prisma/migration_appraisals.sql in Supabase.</div>}
      <form style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <label style={{ fontSize: 12.5 }}>Year</label>
        <select name="year" defaultValue={year}>{[0, 1, 2, 3].map((d) => <option key={d} value={new Date().getFullYear() - d}>{new Date().getFullYear() - d}</option>)}</select>
        <button className="btn" type="submit">Show</button>
        <span style={{ fontSize: 12.5, color: "var(--slate)", marginLeft: 8 }}>{done} of {people.length} appraisals final</span>
      </form>
      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 12.5 }}>
          <thead><tr><th>Teacher</th><th style={{ textAlign: "center" }}>Courses / CH</th><th style={{ textAlign: "center" }}>Students</th><th style={{ textAlign: "center" }}>Lectures delivered</th><th style={{ textAlign: "center" }}>Deadlines on time</th><th style={{ textAlign: "center" }}>Results approved</th><th style={{ textAlign: "center" }}>Plans built</th><th style={{ textAlign: "center" }}>Publications</th><th>Appraisal</th></tr></thead>
          <tbody>
            {people.length === 0 && <tr><td colSpan={9} style={{ color: "var(--slate)" }}>No teaching staff in your area.</td></tr>}
            {people.map((p) => {
              const c = cards.get(p.id); const a = aOf.get(p.id); const [t, cls] = st(a);
              const del = c && c.delivery.planned ? Math.round((100 * c.delivery.delivered) / c.delivery.planned) : null;
              const red = (n: number | null, lo: number) => (n !== null && n < lo ? { color: "var(--rust)", fontWeight: 700 } : undefined);
              return (
                <tr key={p.id}>
                  <td><Link href={`/appraisals/${p.id}?year=${year}`}><b>{p.name}</b></Link>{p.department && <div style={{ fontSize: 11, color: "var(--slate)" }}>{p.department}</div>}</td>
                  <td style={{ textAlign: "center" }}>{c ? `${c.load.courses.length} / ${c.load.creditHours}` : "—"}</td>
                  <td style={{ textAlign: "center" }}>{c?.load.students ?? "—"}</td>
                  <td style={{ textAlign: "center", ...red(del, 80) }}>{del !== null ? `${del}%` : "—"}</td>
                  <td style={{ textAlign: "center", ...red(c?.deadlines.rate ?? null, 70) }}>{c?.deadlines.rate !== null && c?.deadlines.rate !== undefined ? `${c.deadlines.rate}%` : "—"}</td>
                  <td style={{ textAlign: "center" }}>{c && c.load.courses.length ? `${c.results.approved} / ${c.load.courses.length}` : "—"}</td>
                  <td style={{ textAlign: "center" }}>{c && c.design.courses ? `${c.design.approved} / ${c.design.courses}` : "—"}</td>
                  <td style={{ textAlign: "center" }}>{c?.development.publications ?? 0}</td>
                  <td><span className={`badge ${cls}`}>{t}</span>{a?.overall && <div style={{ fontSize: 11 }}>{OVERALL[a.overall]}</div>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
