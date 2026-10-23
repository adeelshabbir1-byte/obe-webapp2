import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { reviewBatchWhere } from "../../lib/reviewScope";
import { evalSummary, teacherRatings } from "../../lib/evaluations";
import { feedbackTerms, termFeedback, termKey, termOf, workshopEffects } from "../../lib/feedbackAnalysis";
import { QEC_INCHARGE } from "../../lib/duties";
import { canEditQuestionnaires } from "../../lib/questionnaires";
import FeedbackBars, { scoreColour } from "../../components/FeedbackBars";
import FeedbackTeacherView from "../../components/FeedbackTeacherView";
import HowCalculated from "../../components/HowCalculated";

export const dynamic = "force-dynamic";

const TABS: [string, string][] = [["overview", "Overview"], ["questions", "Question by question"], ["teachers", "Teachers"], ["batches", "Strict / generous batches"], ["workshops", "Feedback → workshops"]];
// The ranking, the batch-strictness table and the workshops are for the Institute Head, Deans, Chairmen and the QEC In-charge.
const SEE_ALL = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"];

// Course and teacher evaluations by students: per course, per question, per teacher across batches, how strict each batch
// rates, and the workshops that follow from them.
export default async function EvaluationsPage({ searchParams }: { searchParams: { batch?: string; tab?: string; term?: string; teacher?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const isQec = (user.extraRoles || []).includes(QEC_INCHARGE);
  const chairmanId = await chairmanIdFor(user);
  const where = isQec && !(await reviewBatchWhere(user)) ? { coordinator: { managedById: chairmanId } } : await reviewBatchWhere(user);
  if (!where || !chairmanId) redirect("/dashboard");
  const seeAll = SEE_ALL.includes(user.role) || isQec;
  const tab = TABS.some(([k]) => k === searchParams.tab) && (seeAll || ["overview", "questions"].includes(searchParams.tab || "")) ? searchParams.tab! : searchParams.teacher && seeAll ? "teacher" : "overview";
  const terms = await feedbackTerms(chairmanId);
  const term = termOf(searchParams.term) || terms[0] || null;
  const canEdit = await canEditQuestionnaires(user, chairmanId);
  const q = (o: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ term: term ? termKey(term) : undefined, batch: searchParams.batch, ...o }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course &amp; Teacher Evaluations</h1>
          <p className="small-note" style={{ margin: 0 }}>Students rate each course and its teacher at the end of the course (Course Surveys in their portal). Students are never named.</p>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {canEdit && <Link href="/evaluations/questionnaires" className="btn btn-brass btn-sm">Questionnaires &amp; window</Link>}
          {seeAll && term && <a href={`/api/evaluations/export?term=${termKey(term)}`} className="btn btn-secondary btn-sm">QEC proforma (Word)</a>}
        </div>
      </div>
      <HowCalculated shows="Students' 1–5 answers to the institute's feedback questionnaires, analysed per course, per question and per teacher.">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li><b>Per question</b>: how many students gave each rating, and the average. <b>Total out of 100</b> = Σ(question average ÷ 5 × weight) ÷ Σ weights × 100 — the weights are set by the QEC In-charge.</li>
          <li>When sections of a course are shared, each student&apos;s answer goes to the teacher who marked most of that student&apos;s attendance. A teacher&apos;s results are shown only from the minimum number of answers (5 unless the QEC In-charge set another), so nobody can be identified.</li>
          <li><b>Strict / generous batches</b>: a batch&apos;s norm is its average across all the teachers it rated in the term. A teacher&apos;s <b>adjusted score</b> = the institute&apos;s average + (their score − the norm of the batch that rated them), so a 3.9 from a batch averaging 3.3 counts as +0.6. The adjusted score is used in the Faculty Performance Report and the course allocation suggestions.</li>
          <li><b>Consistently low</b>: a question below the teacher&apos;s own average (by 0.25+) and the department&apos;s (by 0.15+) in two or more courses. Each question can name an FDP workshop topic; matching sessions are suggested and the question&apos;s score before and after is tracked.</li>
        </ul>
      </HowCalculated>
      <form className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input type="hidden" name="tab" value={tab === "teacher" ? "teachers" : tab} />
        <select name="term" defaultValue={term ? termKey(term) : ""} aria-label="Term">{terms.length === 0 && <option value="">No feedback yet</option>}{terms.map((t) => <option key={termKey(t)} value={termKey(t)}>{t.name} {t.year}</option>)}</select>
        {(tab === "overview" || tab === "questions") && <BatchSelect where={where} sel={searchParams.batch} />}
        <button className="btn btn-secondary btn-sm">Show</button>
      </form>
      <div role="tablist" className="tabs" style={{ marginBottom: 10, flexWrap: "wrap" }}>
        {TABS.filter(([k]) => seeAll || k === "overview" || k === "questions").map(([k, l]) => <Link key={k} role="tab" className="tab" aria-selected={tab === k} href={q({ tab: k })}>{l}</Link>)}
      </div>
      {tab === "overview" && <Overview where={where} batch={searchParams.batch} />}
      {tab === "questions" && term && <Questions chairmanId={chairmanId} term={term} where={where} batch={searchParams.batch} />}
      {tab === "teachers" && term && <Teachers chairmanId={chairmanId} term={term} q={q} />}
      {tab === "batches" && term && <Batches chairmanId={chairmanId} term={term} />}
      {tab === "workshops" && <Workshops chairmanId={chairmanId} />}
      {tab === "teacher" && searchParams.teacher && <FeedbackTeacherView chairmanId={chairmanId} teacherId={searchParams.teacher} term={term} staff />}
      {!term && tab !== "overview" && tab !== "workshops" && <div className="card small-note">No feedback has been given yet.</div>}
    </Shell>
  );
}

async function BatchSelect({ where, sel }: { where: Record<string, unknown>; sel?: string }) {
  const batches = await prisma.batch.findMany({ where, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] });
  return <select name="batch" defaultValue={sel || ""} aria-label="Batch"><option value="">All batches</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select>;
}

async function Overview({ where, batch }: { where: Record<string, unknown>; batch?: string }) {
  const batches = await prisma.batch.findMany({ where, select: { id: true } });
  const sel = batches.find((b) => b.id === batch);
  const courses = await prisma.course.findMany({ where: { batch: sel ? { id: sel.id } : where }, select: { id: true, code: true, title: true, instructor: { select: { name: true } }, batch: { select: { batchName: true } }, _count: { select: { studentEnrollments: true } } }, orderBy: { code: "asc" } });
  const ev = await evalSummary(courses.map((c) => c.id));
  const split = await teacherRatings(courses.map((c) => c.id));
  const names = new Map((await prisma.user.findMany({ where: { id: { in: Array.from(split.values()).flat().map((x) => x.teacherId).filter((x) => x !== "?").concat(["none"]) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const col = (v: number | null) => (v === null ? undefined : v < 3 ? "#B3261E" : v < 3.5 ? "#A35A00" : "#1F5E36");
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <p className="small-note" style={{ marginTop: 0 }}>Averages out of 5; red below 3, amber below 3.5.</p>
      <table><thead><tr><th>Course</th><th>Teacher</th><th>Response rate</th><th>Course</th><th>Teacher</th><th>Comments</th></tr></thead>
        <tbody>{courses.map((c) => { const e = ev.get(c.id)!; const n = Math.max(e.COURSE.n, e.TEACHER.n); return (
          <tr key={c.id}><td>{c.code} <span className="small-note">{c.title} · {c.batch?.batchName}</span></td><td>{(split.get(c.id) || []).length > 1 ? <div style={{ fontSize: 12 }}>{split.get(c.id)!.map((x) => <div key={x.teacherId}>{x.teacherId === "?" ? "Section not known" : names.get(x.teacherId) || "—"}: <b style={{ color: col(x.overall) }}>{x.overall ?? "—"}</b> <span className="small-note">({x.n})</span></div>)}</div> : c.instructor?.name || names.get(split.get(c.id)?.[0]?.teacherId || "") || "—"}</td><td>{c._count.studentEnrollments ? `${Math.round((100 * n) / c._count.studentEnrollments)}%` : "—"}</td>
            <td style={{ color: col(e.COURSE.overall), fontWeight: 700 }}>{e.COURSE.overall ?? "—"}</td><td style={{ color: col(e.TEACHER.overall), fontWeight: 700 }}>{e.TEACHER.overall ?? "—"}</td><td style={{ fontSize: 12, maxWidth: 320 }}>{[...e.COURSE.comments, ...e.TEACHER.comments].slice(0, 3).join(" | ")}</td></tr>); })}</tbody></table>
    </div>
  );
}

async function Questions({ chairmanId, term, where, batch }: { chairmanId: string; term: { name: string; year: number }; where: Record<string, unknown>; batch?: string }) {
  const allowed = (await prisma.batch.findMany({ where, select: { id: true } })).map((b) => b.id);
  const tf = await termFeedback(chairmanId, term);
  const secs = tf.sections.filter((s) => s.batchId && allowed.includes(s.batchId) && (!batch || s.batchId === batch));
  return (
    <div>
      {secs.length === 0 && <div className="card small-note">No sections with feedback in {term.name} {term.year}.</div>}
      {secs.map((s) => (
        <details key={`${s.courseId}-${s.teacherId}`} className="card">
          <summary style={{ cursor: "pointer" }}><b>{s.code} {s.title}</b> <span className="small-note">{s.batch} · {s.teacher} · {s.teacherB.n} answers</span> <b style={{ color: scoreColour(s.teacherB.total, 100), marginLeft: 6 }}>{s.shown ? `${s.teacherB.total ?? "—"}/100` : "too few answers"}</b></summary>
          {s.shown ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 14, marginTop: 8 }}>
              <div><h4 style={{ margin: "0 0 4px" }}>Teacher evaluation</h4><FeedbackBars b={s.teacherB} />{s.adjusted !== null && <p style={{ fontSize: 12.5 }}>Score {s.raw}/5 from a batch averaging {s.norm}/5 → {(s.delta || 0) >= 0 ? "+" : ""}{s.delta}; adjusted {s.adjusted}/5.</p>}</div>
              <div><h4 style={{ margin: "0 0 4px" }}>Course evaluation</h4><FeedbackBars b={s.courseB} /></div>
            </div>
          ) : <p className="small-note">Fewer than {tf.settings.minResponses} students have answered; results stay hidden until then.</p>}
          {s.shown && s.comments.length > 0 && <details style={{ fontSize: 12.5 }}><summary style={{ cursor: "pointer" }}>Comments ({s.comments.length})</summary><ul>{s.comments.map((c, i) => <li key={i}>{c}</li>)}</ul></details>}
        </details>
      ))}
    </div>
  );
}

async function Teachers({ chairmanId, term, q }: { chairmanId: string; term: { name: string; year: number }; q: (o: Record<string, string | undefined>) => string }) {
  const tf = await termFeedback(chairmanId, term);
  const byRaw = [...tf.ranking].sort((a, b) => (b.raw ?? 0) - (a.raw ?? 0)).map((r) => r.teacherId);
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <p className="small-note" style={{ marginTop: 0 }}>Ranked on the adjusted score (fairer when batches rate differently). Institute average this term: <b>{tf.institute.score ?? "—"}</b>/5 from {tf.institute.n} answers.</p>
      <table style={{ fontSize: 13 }}><thead><tr><th>#</th><th>Teacher</th><th>Sections</th><th>Answers</th><th style={{ textAlign: "right" }}>Total /100</th><th style={{ textAlign: "right" }}>Raw /5</th><th style={{ textAlign: "right" }}>Rank on raw</th><th style={{ textAlign: "right" }}>Adjusted /5</th><th /></tr></thead>
        <tbody>{tf.ranking.map((r, i) => (
          <tr key={r.teacherId}><td>{i + 1}</td><td><b>{r.teacher}</b></td><td>{r.sections}</td><td>{r.n}</td>
            <td style={{ textAlign: "right", color: scoreColour(r.total, 100), fontWeight: 700 }}>{r.shown ? r.total ?? "—" : "—"}</td><td style={{ textAlign: "right" }}>{r.shown ? r.raw ?? "—" : "—"}</td><td style={{ textAlign: "right" }} className="small-note">{byRaw.indexOf(r.teacherId) + 1}</td>
            <td style={{ textAlign: "right", fontWeight: 700, color: scoreColour(r.adjusted) }}>{r.shown ? r.adjusted ?? "—" : "too few answers"}</td>
            <td><Link href={q({ teacher: r.teacherId, tab: undefined })}>Details</Link></td></tr>
        ))}</tbody></table>
    </div>
  );
}

async function Batches({ chairmanId, term }: { chairmanId: string; term: { name: string; year: number } }) {
  const tf = await termFeedback(chairmanId, term);
  const qs = tf.questions.TEACHER.filter((x) => !x.retired);
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <p className="small-note" style={{ marginTop: 0 }}>Each batch&apos;s average across every teacher it rated in {term.name} {term.year}, against the institute&apos;s ({tf.institute.score ?? "—"}/5). A generous batch rates above the institute; a strict one below — teachers rated by them are compared with that batch&apos;s norm.</p>
      <table style={{ fontSize: 12.5 }}>
        <thead><tr><th>Batch</th><th>Answers</th><th>Teachers rated</th><th style={{ textAlign: "right" }}>Norm /5</th><th style={{ textAlign: "right" }}>vs institute</th><th>Reads as</th>{qs.map((x) => <th key={x.key} style={{ textAlign: "center", fontSize: 10.5, maxWidth: 70 }} title={x.text}>{x.text.split(" ").slice(0, 3).join(" ")}…</th>)}</tr></thead>
        <tbody>
          {tf.batches.map((b) => (
            <tr key={b.batchId}><td><b>{b.label}</b></td><td>{b.n}</td><td>{b.teachers}</td><td style={{ textAlign: "right", fontWeight: 700 }}>{b.score ?? "—"}</td>
              <td style={{ textAlign: "right", fontWeight: 700, color: (b.vs || 0) > 0.15 ? "#1E7B45" : (b.vs || 0) < -0.15 ? "#C62828" : "#5E5457" }}>{b.vs === null ? "—" : `${b.vs >= 0 ? "+" : ""}${b.vs}`}</td>
              <td>{b.vs === null ? "—" : b.vs > 0.15 ? "Generous" : b.vs < -0.15 ? "Strict" : "About average"}</td>
              {qs.map((x) => <td key={x.key} style={{ textAlign: "center", color: scoreColour(b.perQ[x.key] ?? null) }}>{b.perQ[x.key] ?? "—"}</td>)}</tr>
          ))}
          <tr><td><b>Institute</b></td><td>{tf.institute.n}</td><td /><td style={{ textAlign: "right", fontWeight: 700 }}>{tf.institute.score ?? "—"}</td><td /><td />{qs.map((x) => <td key={x.key} style={{ textAlign: "center" }}>{tf.institute.breakdown.lines.find((l) => l.key === x.key)?.avg ?? "—"}</td>)}</tr>
        </tbody>
      </table>
    </div>
  );
}

async function Workshops({ chairmanId }: { chairmanId: string }) {
  const rows = await workshopEffects(chairmanId).catch(() => []);
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <p className="small-note" style={{ marginTop: 0 }}>Teachers invited to an FDP session because a feedback question scored low (invite them from a teacher&apos;s Details), whether they attended, and that question&apos;s average before and after. Attended hours count towards the FDP target.</p>
      {rows.length === 0 ? <p className="small-note">No invitations yet.</p> : (
        <table style={{ fontSize: 13 }}><thead><tr><th>Teacher</th><th>Question</th><th>Session</th><th>Attended</th><th style={{ textAlign: "right" }}>Before</th><th style={{ textAlign: "right" }}>After</th><th style={{ textAlign: "right" }}>Change</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i}><td>{r.teacher}</td><td>{r.question}</td><td>{r.session} <span className="small-note">{r.date} · {r.hours} h</span></td><td>{r.attended ? "✓ yes" : "not yet"}</td>
              <td style={{ textAlign: "right" }}>{r.before ?? "—"}</td><td style={{ textAlign: "right" }}>{r.after ?? "—"}</td>
              <td style={{ textAlign: "right", fontWeight: 700, color: r.before !== null && r.after !== null ? (r.after >= r.before ? "#1E7B45" : "#C62828") : undefined }}>{r.before !== null && r.after !== null ? `${r.after - r.before >= 0 ? "+" : ""}${Math.round((r.after - r.before) * 100) / 100}` : "—"}</td></tr>
          ))}</tbody></table>
      )}
    </div>
  );
}
