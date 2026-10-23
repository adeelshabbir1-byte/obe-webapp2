import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import PrintButton from "../../components/PrintButton";
import { REPORT_VIEWER_ROLES, reportPeople } from "../../lib/facultyProfile";
import { termReport, ranking, parseTerm, termLabel } from "../../lib/teacherPerformance";
import HowCalculated from "../../components/HowCalculated";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Faculty Performance Report" };

export default async function TeacherPerformancePage({ searchParams }: { searchParams: { user?: string; term?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const t = parseTerm(searchParams.term);
  const viewer = REPORT_VIEWER_ROLES.includes(user.role);
  const people = viewer ? await reportPeople(user) : [];
  const id = searchParams.user && (searchParams.user === user.id || people.some((p) => p.id === searchParams.user)) ? searchParams.user : viewer && !searchParams.user ? null : user.id;
  const termKey = `${t.name}-${t.year}`;
  const prev = t.name === "Fall" ? `Spring-${t.year}` : `Fall-${t.year - 1}`, next = t.name === "Fall" ? `Spring-${t.year + 1}` : `Fall-${t.year}`;
  const q = (term: string) => `/teacher-performance?term=${term}${searchParams.user ? `&user=${searchParams.user}` : ""}`;
  const r = id ? await termReport(id, t) : null;
  const ranked = !id ? await ranking(people, t) : [];
  const n = (x: number | null | undefined, s = "") => (x == null ? "—" : `${x}${s}`);
  const cmp = (a: number | null, b: number | null) => (a == null || b == null ? null : Math.round(a - b));

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <HowCalculated shows="One teacher's term: what they taught, how their students did, what students said, and what they delivered.">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li><b>Class results</b>: mean grade points, pass rate and the share of A and F grades of the teacher's own sections, next to the other sections of the same course this term and the course's past offerings.</li>
          <li><b>CLO attainment</b>: for each course, the share of students who attained each CLO; CLOs below 60% are flagged as weak.</li>
          <li><b>Student feedback</b>: the average of the students' 1–5 answers for this teacher; shown only from 5 answers. When sections of one course are shared, each answer goes to the teacher who marked that student's attendance.</li>
          <li><b>Delivery</b>: lectures with an actual date recorded out of the lectures planned; attendance sessions marked.</li>
          <li>Deadlines met, FYP groups supervised, FDP hours and alumni reached come from those modules; the trend shows the last four terms.</li>
        </ul>
      </HowCalculated>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
        <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>Faculty Performance Report — {termLabel(t)}</h1>
        <span className="small-note no-print"><Link href={q(prev)}>← {prev.replace("-", " ")}</Link> · <Link href={q(next)}>{next.replace("-", " ")} →</Link>
          {viewer && <> · <Link href={`/teacher-performance?term=${termKey}`}>Ranked list</Link></>}{id !== user.id && <> · <Link href={`/teacher-performance?term=${termKey}&user=${user.id}`}>My report</Link></>}</span>
      </div>
      {!r && (
        <div className="card" style={{ overflowX: "auto" }}>
          <p className="small-note" style={{ marginTop: 0 }}>Score = average of student feedback (as %), pass rate and lectures delivered. Open a teacher for the full report. Figures appear once results are submitted and students have answered the evaluation.</p>
          {ranked.length === 0 ? <p className="small-note">Nobody in your area taught in {termLabel(t)}.</p> : (
            <table style={{ fontSize: 12.5 }}>
              <thead><tr><th>#</th><th>Teacher</th><th>Courses</th><th style={{ textAlign: "center" }}>Mean %</th><th style={{ textAlign: "center" }}>Pass %</th><th style={{ textAlign: "center" }}>Feedback</th><th style={{ textAlign: "center" }}>Delivered</th><th style={{ textAlign: "center" }}>Score</th></tr></thead>
              <tbody>{ranked.map((x, i) => <tr key={x.id}><td>{i + 1}</td><td><Link href={`/teacher-performance?term=${termKey}&user=${x.id}`}>{x.name}</Link><div className="small-note">{x.department}</div></td><td className="small-note">{x.courses}</td><td style={{ textAlign: "center" }}>{n(x.mean)}</td><td style={{ textAlign: "center" }}>{n(x.passRate)}</td><td style={{ textAlign: "center" }}>{x.rating != null ? `${x.rating}/5 (${x.answers})` : "—"}</td><td style={{ textAlign: "center" }}>{n(x.delivery, "%")}</td><td style={{ textAlign: "center", fontWeight: 700 }}>{n(x.score)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}
      {r && (
        <>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div><b style={{ fontSize: 16 }}>{r.teacher.name}</b> <span className="small-note">{r.teacher.department}</span><div className="small-note">{r.totals.courses} course(s) · {r.totals.sections} section(s) · {r.totals.students} students · {r.totals.creditHours} credit hours</div></div>
              <span className="no-print" style={{ display: "flex", gap: 6 }}><a className="btn btn-ghost btn-sm" href={`/api/teacher-performance?term=${termKey}&user=${r.teacher.id}`}>Download Word</a><PrintButton /></span>
            </div>
            <div className="stat-grid" style={{ marginTop: 8 }}>
              <div className="stat"><div style={{ fontSize: 22, fontWeight: 700 }}>{r.rating ? `${r.rating.avg}/5` : "—"}</div><div className="small-note">Student feedback{r.rating ? ` (${r.rating.n})` : ""}</div>{r.feedback?.shown && r.feedback.adjusted !== null && <div className="small-note">adjusted for batch strictness: <b>{r.feedback.adjusted}/5</b> · total {r.feedback.total}/100</div>}</div>
              <div className="stat"><div style={{ fontSize: 22, fontWeight: 700 }}>{n(r.cloAvg, "%")}</div><div className="small-note">Students reaching CLOs</div></div>
              <div className="stat"><div style={{ fontSize: 22, fontWeight: 700 }}>{n(r.delivery.pct, "%")}</div><div className="small-note">Lectures delivered</div></div>
              <div className="stat"><div style={{ fontSize: 22, fontWeight: 700 }}>{r.deadlines?.rate != null ? `${r.deadlines.rate}%` : "—"}</div><div className="small-note">Deadlines on time</div></div>
              <div className="stat"><div style={{ fontSize: 22, fontWeight: 700 }}>{r.fdpHours}</div><div className="small-note">FDP hours</div></div>
            </div>
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ marginTop: 0 }}>Courses, results and CLOs</h3>
            {r.courses.length === 0 ? <p className="small-note">No courses in {r.term}.</p> : (
              <table style={{ fontSize: 12.5 }}>
                <thead><tr><th>Course</th><th style={{ textAlign: "center" }}>Students</th><th style={{ textAlign: "center" }}>Mean %</th><th style={{ textAlign: "center" }}>vs other sections</th><th style={{ textAlign: "center" }}>vs past offerings</th><th style={{ textAlign: "center" }}>Pass / A / F %</th><th>Grade spread</th><th>CLOs reached</th><th>CQI</th><th style={{ textAlign: "center" }}>Feedback</th><th style={{ textAlign: "center" }}>Delivered</th></tr></thead>
                <tbody>{r.courses.map((c) => { const d1 = cmp(c.mean, c.otherMean), d2 = cmp(c.mean, c.pastMean); return (
                  <tr key={c.code + c.batch}>
                    <td><b>{c.code}</b> {c.title}<div className="small-note">{c.batch}{c.sections > 1 ? ` · ${c.sections} sections` : ""}</div>{c.flags.length > 0 && <div style={{ fontSize: 11, color: "#B3261E" }}>{c.flags.join("; ")}</div>}</td>
                    <td style={{ textAlign: "center" }}>{c.students}</td><td style={{ textAlign: "center" }}>{n(c.mean)}</td>
                    <td style={{ textAlign: "center" }}>{d1 == null ? "—" : `${d1 > 0 ? "+" : ""}${d1}`}</td><td style={{ textAlign: "center" }}>{d2 == null ? "—" : `${d2 > 0 ? "+" : ""}${d2} (${c.pastTerms})`}</td>
                    <td style={{ textAlign: "center" }}>{n(c.passRate)} / {n(c.aShare)} / {n(c.fShare)}</td>
                    <td className="small-note">{Object.entries(c.dist).map(([g, k]) => `${g}:${k}`).join(" ") || "—"}</td>
                    <td className="small-note">{c.clo.map((x) => <span key={x.code} style={{ color: x.pct < 60 ? "#B3261E" : undefined }}>{x.code} {x.pct}% </span>)}{!c.clo.length && "—"}</td>
                    <td className="small-note">{c.cqi.join("; ") || "—"}</td>
                    <td style={{ textAlign: "center" }}>{c.rating?.avg != null ? `${c.rating.avg} (${c.rating.n})` : "—"}</td>
                    <td style={{ textAlign: "center" }}>{c.planned ? `${c.delivered}/${c.planned}` : "—"}</td>
                  </tr>); })}</tbody>
              </table>
            )}
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Other contributions</h3>
            <ul style={{ fontSize: 13, margin: 0 }}>
              <li>Attendance sessions marked: {r.delivery.attendanceSessions}</li>
              <li>Results: {r.results ? `${r.results.approved} approved, ${r.results.submitted} submitted, ${r.results.notSubmitted} not submitted; rubric coverage ${n(r.results.rubricCoverage, "%")}` : "—"}</li>
              <li>Course design (as Subject Expert): {r.design ? `${r.design.approved} approved of ${r.design.courses}` : "—"}</li>
              <li>FYP: {r.fyp.groups} group(s) supervised{r.fyp.coSupervised ? `, ${r.fyp.coSupervised} co-supervised` : ""}</li>
              <li>Alumni reached: {r.alumni.answered} answered of {r.alumni.sent} requests</li>
              {r.recognition.length > 0 && <li>Recognition: {r.recognition.map((x) => x.title).join("; ")}</li>}
            </ul>
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ marginTop: 0 }}>Trend</h3>
            <table style={{ fontSize: 12.5 }}><thead><tr><th>Term</th><th style={{ textAlign: "center" }}>Courses</th><th style={{ textAlign: "center" }}>Mean %</th><th style={{ textAlign: "center" }}>Pass %</th><th style={{ textAlign: "center" }}>Feedback</th></tr></thead>
              <tbody>{r.trend.map((x) => <tr key={x.term}><td>{x.term}</td><td style={{ textAlign: "center" }}>{x.courses}</td><td style={{ textAlign: "center" }}>{n(x.mean)}</td><td style={{ textAlign: "center" }}>{n(x.passRate)}</td><td style={{ textAlign: "center" }}>{n(x.rating)}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
