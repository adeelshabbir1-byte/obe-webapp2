import { teacherHistory, termFeedback, matchingSessions, type Term } from "../lib/feedbackAnalysis";
import FeedbackBars, { scoreColour } from "./FeedbackBars";
import FdpInviteButton from "./FdpInviteButton";

/** One teacher's student feedback: this term question by question, every earlier course side by side, lifetime averages,
 * consistently low questions with the FDP workshop that helps, and the trend. Students are never named. */
export default async function FeedbackTeacherView({ chairmanId, teacherId, term, staff }: { chairmanId: string; teacherId: string; term: Term | null; staff: boolean }) {
  const h = await teacherHistory(chairmanId, teacherId);
  const tf = term ? await termFeedback(chairmanId, term) : null;
  const now = tf ? tf.sections.filter((s) => s.teacherId === teacherId) : [];
  const min = tf ? tf.settings.minResponses : 5;
  const flagSessions = await Promise.all(h.flags.map(async (f) => ({ f, sessions: await matchingSessions(chairmanId, f.fdpTopic) })));
  const cols = h.rows;
  const maxT = Math.max(1, ...h.trend.map((t) => t.total || 0));
  return (
    <div>
      <div className="card" style={{ display: "flex", gap: 22, flexWrap: "wrap", alignItems: "center" }}>
        <div><div className="small-note">Lifetime total</div><b style={{ fontSize: 24, color: scoreColour(h.life.total, 100) }}>{h.life.total ?? "—"}</b><span className="small-note"> / 100 · {h.life.n} answers · {cols.length} course offering{cols.length === 1 ? "" : "s"}</span></div>
        {h.trend.length > 0 && (
          <div>
            <div className="small-note">Total by term</div>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 54 }}>
              {h.trend.map((t) => (
                <div key={t.term} style={{ textAlign: "center", fontSize: 10.5 }} title={`${t.term}: ${t.total ?? "—"}`}>
                  <div style={{ width: 26, height: `${Math.max(3, ((t.total || 0) / maxT) * 40)}px`, background: scoreColour(t.total, 100), borderRadius: 3, margin: "0 auto" }} />
                  <div>{t.total ?? "—"}</div><div className="small-note" style={{ fontSize: 9.5 }}>{t.term.replace(/(Fall|Spring|Summer) (\d{2})(\d{2})/, "$1 $3")}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {h.flags.length > 0 && (
        <div className="card" style={{ borderLeft: "4px solid #C62828" }}>
          <b>Consistently low</b> <span className="small-note">— below this teacher&apos;s own average and the department&apos;s, in two or more courses</span>
          {flagSessions.map(({ f, sessions }) => (
            <div key={f.key} style={{ marginTop: 8, fontSize: 13 }}>
              <b style={{ color: "#C62828" }}>{f.text} — {f.avg} over {f.courses} courses</b>
              <span className="small-note"> (own average {f.own}{f.dept !== null ? `, department ${f.dept}` : ""})</span>
              {f.fdpTopic && <div className="small-note">Workshop that helps: <b>{f.fdpTopic}</b>{sessions.length ? <> — coming up: {sessions.map((s) => <span key={s.id}>{s.title} ({s.date}) {staff && <FdpInviteButton sessionId={s.id} userId={teacherId} questionKey={f.key} scoreBefore={f.avg} />} </span>)}</> : " — no session planned yet (plan one under Faculty Development)."}</div>}
            </div>
          ))}
        </div>
      )}

      {term && (
        <div className="card">
          <h3 style={{ margin: "0 0 6px" }}>{term.name} {term.year}</h3>
          {now.length === 0 && <p className="small-note" style={{ margin: 0 }}>No feedback for this term yet.</p>}
          {now.map((s) => (
            <div key={s.courseId} style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 8 }}>
              <b>{s.code} {s.title}</b> <span className="small-note">{s.batch}</span>
              {s.shown ? (
                <>
                  {s.adjusted !== null && <div style={{ fontSize: 13, margin: "4px 0" }}>Score {s.raw}/5 from a batch averaging {s.norm}/5 → <b style={{ color: (s.delta || 0) >= 0 ? "#1E7B45" : "#C62828" }}>{(s.delta || 0) >= 0 ? "+" : ""}{s.delta}</b>; adjusted score <b>{s.adjusted}</b>/5</div>}
                  <FeedbackBars b={s.teacherB} />
                  {s.comments.length > 0 && <details style={{ fontSize: 12.5, marginTop: 4 }}><summary style={{ cursor: "pointer" }}>Comments ({s.comments.length})</summary><ul>{s.comments.map((c, i) => <li key={i}>{c}</li>)}</ul></details>}
                </>
              ) : <p className="small-note">Fewer than {min} students have answered ({s.teacherB.n}) — results are shown from {min} answers so nobody can be identified.</p>}
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ margin: "0 0 6px" }}>Across batches</h3>
        {cols.length === 0 ? <p className="small-note" style={{ margin: 0 }}>No rated courses yet.</p> : (
          <table style={{ fontSize: 12 }}>
            <thead><tr><th>Question</th>{cols.map((c, i) => <th key={i} style={{ textAlign: "center" }}>{c.code}<div className="small-note">{c.term}<br />{c.batch.replace(/^.* — /, "")}</div></th>)}<th style={{ textAlign: "center" }}>Lifetime</th>{h.dept && <th style={{ textAlign: "center" }}>Department</th>}</tr></thead>
            <tbody>
              {h.life.lines.map((l) => (
                <tr key={l.key}><td>{l.text}</td>{cols.map((c, i) => <td key={i} style={{ textAlign: "center", color: scoreColour(c.perQ[l.key] ?? null) }}>{c.perQ[l.key] ?? "—"}</td>)}<td style={{ textAlign: "center", fontWeight: 700, color: scoreColour(l.avg) }}>{l.avg ?? "—"}</td>{h.dept && <td style={{ textAlign: "center" }} className="small-note">{h.dept.lines.find((x) => x.key === l.key)?.avg ?? "—"}</td>}</tr>
              ))}
              <tr><td><b>Total / 100</b></td>{cols.map((c, i) => <td key={i} style={{ textAlign: "center", fontWeight: 700 }}>{c.total ?? "—"}</td>)}<td style={{ textAlign: "center", fontWeight: 700 }}>{h.life.total ?? "—"}</td>{h.dept && <td style={{ textAlign: "center" }}>{h.dept.total ?? "—"}</td>}</tr>
              <tr><td><b>Adjusted score / 5</b></td>{cols.map((c, i) => <td key={i} style={{ textAlign: "center" }}>{c.adjusted ?? "—"}{c.delta !== null && <div className="small-note">{c.delta >= 0 ? "+" : ""}{c.delta}</div>}</td>)}<td /> {h.dept && <td />}</tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
