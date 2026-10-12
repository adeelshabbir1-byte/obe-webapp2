import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser, getSignedInUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { adb, appraiseesFor, computeScorecard, APPRAISAL_VIEW_ROLES, REVIEWER_ROLES, OVERALL, RATING_AREAS, type AppraisalRow, type Scorecard } from "../../../lib/appraisal";
import { AppraisalForm, AppraisalReply } from "../../../components/AppraisalForms";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function Stat({ v, l, warn }: { v: string | number; l: string; warn?: boolean }) {
  return <div className={`stat ${warn ? "stat-warn" : ""}`}><div style={{ fontSize: 22, fontWeight: 700 }}>{v}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>{l}</div></div>;
}

export default async function AppraisalPage({ params, searchParams }: { params: { userId: string }; searchParams: { year?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const me = await getSignedInUser();
  const year = parseInt(searchParams.year || "", 10) || new Date().getFullYear();
  const self = params.userId === (me?.id || user.id);
  let reviewer = false;
  if (!self) {
    if (!APPRAISAL_VIEW_ROLES.includes(user.role)) notFound();
    const { people } = await appraiseesFor(user);
    if (!people.some((p) => p.id === params.userId)) notFound();
    reviewer = REVIEWER_ROLES.includes(user.role);
  }
  let a: AppraisalRow | null = null, missing = false;
  try { a = (await adb.facultyAppraisal.findUnique({ where: { userId_year: { userId: params.userId, year } } })) as AppraisalRow | null; } catch { missing = true; }
  const visibleToTeacher = !!a && a.status !== "DRAFT";
  // Shared / final appraisals show the figures as they were when shared; otherwise today's figures.
  const frozen = a?.metricsJson && a.status !== "DRAFT" ? (JSON.parse(a.metricsJson) as Scorecard) : null;
  const c = frozen || (await computeScorecard(params.userId, year, { deep: true }));
  const ratings = (() => { try { return JSON.parse(a?.ratingsJson || "{}") as Record<string, number>; } catch { return {}; } })();
  const reviewerName = a?.reviewerId ? (await prisma.user.findUnique({ where: { id: a.reviewerId }, select: { name: true } }))?.name : null;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      {!self && <p className="no-print" style={{ marginBottom: 6 }}><Link href={`/appraisals?year=${year}`}>← All teachers</Link></p>}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>{c.teacher.name} — Annual Appraisal {year}</h1>
        {a && <span className={`badge ${a.status === "FINAL" ? "badge-ok" : a.status === "SHARED" ? "badge-warn" : "badge-neutral"}`}>{a.status === "FINAL" ? "Final" : a.status === "SHARED" ? "Shared" : "Draft"}</span>}
        <form className="no-print" style={{ marginLeft: "auto", display: "flex", gap: 6 }}><select name="year" defaultValue={year}>{[0, 1, 2, 3].map((d) => <option key={d} value={new Date().getFullYear() - d}>{new Date().getFullYear() - d}</option>)}</select><button className="btn" type="submit">Show</button></form>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 12 }}>{c.teacher.department || ""}{frozen ? " · figures as they stood when the appraisal was shared" : " · live figures for the year"}</p>
      {missing && <div className="err">The appraisal table is not in the database yet — run prisma/migration_appraisals.sql in Supabase.</div>}

      <div className="stat-grid">
        <Stat v={c.systemScore !== null ? `${c.systemScore}/100` : "—"} l="System score (average of the indicators below)" />
        <Stat v={`${c.load.courses.length} · ${c.load.creditHours} CH`} l={`Courses taught this year · ${c.load.students} students`} />
        <Stat v={c.deadlines.rate !== null ? `${c.deadlines.rate}%` : "—"} l={`Deadlines met on time (${c.deadlines.OVERDUE} overdue)`} warn={c.deadlines.rate !== null && c.deadlines.rate < 70} />
        <Stat v={c.development.publications + c.development.grants + c.development.projects} l={`Publications, grants and projects in ${year}`} />
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Indicators</h3>
        <table style={{ fontSize: 13 }}><tbody>{c.indicators.map((i) => (
          <tr key={i.key}><td>{i.label}</td><td style={{ fontWeight: 700, color: i.score === null ? undefined : i.score < 60 ? "var(--rust)" : i.score < 80 ? "#95650F" : "var(--sage)" }}>{i.value}</td>
            <td style={{ width: 200 }}>{i.score !== null && <div style={{ height: 8, background: "#EEE", borderRadius: 4 }}><div style={{ width: `${Math.min(100, i.score)}%`, height: "100%", borderRadius: 4, background: i.score < 60 ? "var(--rust)" : i.score < 80 ? "#B7791F" : "var(--sage)" }} /></div>}</td></tr>
        ))}</tbody></table>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Teaching</h3>
          {c.load.courses.length === 0 ? <p style={{ color: "var(--slate)", fontSize: 13 }}>No course taught in {year} on record.</p> : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{c.load.courses.map((x, i) => <li key={i}><b>{x.code}</b> {x.title} · {x.term} · {x.students} students{c.delivery.flagged.includes(x.code) ? <span className="badge badge-warn" style={{ marginLeft: 6 }}>time vs marks mismatch</span> : null}</li>)}</ul>
          )}
          {c.load.earlier.length > 0 && <p style={{ fontSize: 12, color: "var(--slate)" }}>Earlier in {year}: {c.load.earlier.join("; ")}</p>}
          <p style={{ fontSize: 13, marginBottom: 0 }}>Lectures delivered {c.delivery.delivered} of {c.delivery.planned} · attendance taken for {c.delivery.attendanceSessions} lectures</p>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Results and assessment</h3>
          <p style={{ fontSize: 13, margin: 0 }}>Results approved {c.results.approved}, waiting {c.results.submitted}, returned {c.results.returned}, not submitted {c.results.notSubmitted}</p>
          <p style={{ fontSize: 13 }}>Grade changes asked {c.results.gradeChanges} (approved {c.results.gradeChangesApproved}) · rubrics on {c.results.rubricCoverage ?? "—"}{c.results.rubricCoverage !== null ? "%" : ""} of assignments, projects and labs</p>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Course design (as Subject Expert)</h3>
          <p style={{ fontSize: 13, margin: 0 }}>{c.design.courses ? `${c.design.courses} course plan(s): ${c.design.approved} approved, ${c.design.submitted} with the OMC, ${c.design.draft} in progress` : "No course plans assigned."}</p>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Development and service</h3>
          <p style={{ fontSize: 13, margin: 0 }}>Publications {c.development.publications} · grants {c.development.grants} · projects {c.development.projects} · events / trainings {c.development.events}</p>
          <p style={{ fontSize: 13 }}>Exam invigilation duties {c.service.invigilations} · deadlines: {c.deadlines.ON_TIME} on time, {c.deadlines.LATE_DONE} late, {c.deadlines.OVERDUE} overdue</p>
          {self && <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 0 }}>Publications and projects come from <Link href="/faculty/profile">your profile</Link> — keep it current.</p>}
        </div>
      </div>

      {reviewer && !missing && (
        <AppraisalForm userId={params.userId} year={year} status={a?.status || "DRAFT"} initial={{ ratings, studentFeedback: a?.studentFeedback ?? null, overall: a?.overall || null, strengths: a?.strengths || "", improve: a?.improve || "", goals: a?.goals || "" }} />
      )}
      {!reviewer && (visibleToTeacher || !self) && a && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Reviewer&apos;s appraisal{reviewerName ? ` — ${reviewerName}` : ""}</h3>
          <table style={{ fontSize: 13 }}><tbody>
            {RATING_AREAS.map(([k, l]) => <tr key={k}><td>{l}</td><td><b>{ratings[k] ? `${ratings[k]} / 5` : "—"}</b></td></tr>)}
            <tr><td>Student feedback</td><td><b>{a.studentFeedback ?? "—"}</b></td></tr>
            <tr><td>Overall</td><td><b>{a.overall ? OVERALL[a.overall] : "—"}</b></td></tr>
          </tbody></table>
          {a.strengths && <p style={{ fontSize: 13 }}><b>Strengths:</b> {a.strengths}</p>}
          {a.improve && <p style={{ fontSize: 13 }}><b>Areas to improve:</b> {a.improve}</p>}
          {a.goals && <p style={{ fontSize: 13 }}><b>Goals for next year:</b> {a.goals}</p>}
        </div>
      )}
      {self && !visibleToTeacher && <div className="card"><p style={{ margin: 0, color: "var(--slate)" }}>Your reviewer has not shared your {year} appraisal yet. The figures above are your live record for the year.</p></div>}
      {self && visibleToTeacher && a && <AppraisalReply year={year} comment={a.facultyComment || ""} acknowledged={!!a.acknowledgedAt} />}
      {!self && a?.facultyComment && <div className="card"><h3 style={{ marginTop: 0 }}>Teacher&apos;s reply</h3><p style={{ fontSize: 13, margin: 0 }}>{a.facultyComment}</p>{a.acknowledgedAt && <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 0 }}>Acknowledged {new Date(a.acknowledgedAt).toLocaleDateString("en-GB")}</p>}</div>}
    </Shell>
  );
}
