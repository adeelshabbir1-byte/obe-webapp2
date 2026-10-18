import type { TeachingAnalysis, TopicRow, TopicSide, OutcomeRow } from "../lib/teachingAnalysis";

// Server-rendered "Planned vs Taught" report: SE plan vs what the Instructor did, topic by topic, with the
// lecture-time vs assessment-weight check and the CLO / PLO totals on both sides.

const r1 = (n: number) => Math.round(n * 10) / 10;
const STATUS: Record<TopicRow["status"], { label: string; cls: string; tip: string }> = {
  covered: { label: "Covered", cls: "badge-ok", tip: "Taught with at least the planned number of lectures" },
  partial: { label: "Fewer lectures", cls: "badge-warn", tip: "Taught, but with fewer lectures than planned" },
  pending: { label: "Not taught yet", cls: "badge-warn", tip: "Still in the Instructor's plan, no lecture logged on it" },
  missed: { label: "Missed", cls: "badge-no", tip: "In the SE's plan but not in the Instructor's" },
  extra: { label: "Extra topic", cls: "badge-info", tip: "Taught by the Instructor but not in the SE's plan" },
};
const LEVEL: Record<string, string> = { bad: "badge-no", warn: "badge-warn", good: "badge-ok", info: "badge-neutral" };
const LEVEL_TXT: Record<string, string> = { bad: "Problem", warn: "Check", good: "Good", info: "Note" };

function Shares({ s }: { s: TopicSide | null }) {
  if (!s) return <span style={{ color: "var(--slate-mute)" }}>—</span>;
  const l = s.lectureShare * 100, a = s.assessShare * 100, max = Math.max(l, a, 1);
  const w = (v: number) => `${Math.max(2, (v / Math.max(max, 20)) * 100)}%`;
  return (
    <div style={{ minWidth: 120, fontSize: 10.5, lineHeight: 1.25 }} title={`${r1(l)}% of lectures vs ${r1(a)}% of assessed marks`}>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 30, color: "var(--slate)" }}>Lec</span><span style={{ height: 6, width: w(l), background: "#8A8F99", borderRadius: 3 }} /><span>{r1(l)}%</span></div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 30, color: "var(--slate)" }}>Marks</span><span style={{ height: 6, width: a ? w(a) : 2, background: "var(--brass)", borderRadius: 3 }} /><span>{r1(a)}%</span></div>
    </div>
  );
}

function Lect({ s }: { s: TopicSide | null }) {
  if (!s) return <span style={{ color: "var(--slate-mute)" }}>0</span>;
  return (
    <span>
      <b>{s.lectures}</b>
      {s.planned !== s.lectures && <span style={{ color: "var(--slate-mute)" }}> / {s.planned}</span>}
      {s.weeks.length > 0 && <div style={{ fontSize: 10.5, color: "var(--slate)" }}>{s.weeks.length} wk{s.weeks.length === 1 ? "" : "s"}</div>}
    </span>
  );
}

function Assess({ s }: { s: TopicSide | null }) {
  if (!s) return <span style={{ color: "var(--slate-mute)" }}>—</span>;
  if (!s.items.length) return <span style={{ color: "var(--rust)", fontWeight: 600 }}>None</span>;
  return (
    <div style={{ fontSize: 11 }}>
      <b>{r1(s.marks)}%</b> <span style={{ color: "var(--slate)" }}>· {s.items.length} item{s.items.length === 1 ? "" : "s"}</span>
      <div style={{ color: "var(--slate)", maxWidth: 210 }}>{s.items.map((i) => `${i.label} (${r1(i.marks)})`).join(", ")}</div>
    </div>
  );
}

function OutcomeTable({ title, rows, showIns }: { title: string; rows: OutcomeRow[]; showIns: boolean }) {
  if (!rows.length) return null;
  const totSe = rows.reduce((s, r) => s + r.seMarks, 0) || 1, totIns = rows.reduce((s, r) => s + r.insMarks, 0) || 1;
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <h3 style={{ fontSize: 14, marginBottom: 8 }}>{title}</h3>
      <table>
        <thead>
          <tr>
            <th>Outcome</th>
            <th style={{ textAlign: "center" }}>SE lectures</th><th style={{ textAlign: "center" }}>SE marks</th>
            {showIns && <><th style={{ textAlign: "center" }}>Instructor lectures</th><th style={{ textAlign: "center" }}>Instructor marks</th><th style={{ textAlign: "center" }}>Change</th></>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const d = r.insMarks - r.seMarks;
            const lost = r.seMarks > 0 && r.insMarks === 0;
            return (
              <tr key={r.code}>
                <td><b>{r.code}</b> <span style={{ fontSize: 11, color: "var(--slate)" }}>{r.label.length > 90 ? r.label.slice(0, 90) + "…" : r.label}</span></td>
                <td style={{ textAlign: "center" }}>{r.seLectures}</td>
                <td style={{ textAlign: "center" }}>{r1(r.seMarks)}% <span style={{ fontSize: 10.5, color: "var(--slate)" }}>({r.seItems} items · {Math.round((100 * r.seMarks) / totSe)}% of assessed)</span></td>
                {showIns && (
                  <>
                    <td style={{ textAlign: "center" }}>{r.insLectures}</td>
                    <td style={{ textAlign: "center", color: lost ? "var(--rust)" : undefined, fontWeight: lost ? 700 : undefined }}>{r1(r.insMarks)}% <span style={{ fontSize: 10.5, color: "var(--slate)", fontWeight: 400 }}>({r.insItems} items · {Math.round((100 * r.insMarks) / totIns)}% of assessed)</span></td>
                    <td style={{ textAlign: "center" }}>{Math.abs(d) < 0.05 ? "—" : <span className={`badge ${Math.abs(d) >= 10 || lost ? "badge-no" : Math.abs(d) >= 5 ? "badge-warn" : "badge-neutral"}`}>{d > 0 ? "+" : ""}{r1(d)}</span>}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function TeachingAnalysisReport({ a, heading = "Planned vs Taught — topic, lecture and assessment analysis" }: { a: TeachingAnalysis; heading?: string }) {
  const showIns = a.hasInstructorData;
  const seTopics = a.topics.filter((t) => t.se).length;
  const taught = a.topics.filter((t) => t.se && (t.status === "covered" || t.status === "partial")).length;
  const flagged = a.topics.filter((t) => (showIns ? t.insFlags : t.seFlags).length).length;
  const insLabel = a.basis === "delivered" ? "Instructor (taught)" : "Instructor (plan)";

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 17, marginBottom: 4 }}>{heading}</h2>
      <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 14 }}>
        Every topic of the Subject Expert&apos;s plan next to what {a.instructorName || "the Instructor"} did: lectures given, weeks spent,
        which quizzes, assignments and exam questions test it, and how many marks they carry. An item&apos;s marks are split evenly over the
        lectures it is linked to. A topic is flagged when its share of lectures and its share of marks disagree by more than half —
        for example 3 weeks of teaching tested by one small quiz.
      </p>

      <div className="stat-grid">
        <div className="stat"><div style={{ fontSize: 24, fontWeight: 700 }}>{seTopics}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>Topics in the SE plan · {a.se.teachingLectures} lectures</div></div>
        {showIns && <div className={`stat ${taught < seTopics * 0.9 ? "stat-warn" : ""}`}><div style={{ fontSize: 24, fontWeight: 700 }}>{taught} / {seTopics}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>Planned topics {a.basis === "delivered" ? "taught" : "in Instructor plan"} · {a.ins.teachingLectures} lectures{a.basis === "delivered" ? ` logged of ${a.ins.totalLectures}` : ""}</div></div>}
        <div className="stat"><div style={{ fontSize: 24, fontWeight: 700 }}>{showIns ? a.ins.alignment ?? "—" : a.se.alignment ?? "—"}<span style={{ fontSize: 13, color: "var(--slate)" }}>/100</span></div><div style={{ fontSize: 12, color: "var(--slate)" }}>Teaching–assessment balance{showIns ? ` (SE plan: ${a.se.alignment ?? "—"})` : ""}</div></div>
        <div className={`stat ${flagged ? "stat-warn" : ""}`}><div style={{ fontSize: 24, fontWeight: 700 }}>{flagged}</div><div style={{ fontSize: 12, color: "var(--slate)" }}>Topics where time and marks don&apos;t match</div></div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Analysis</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {a.findings.map((f, i) => (
            <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12.5 }}>
              <span className={`badge ${LEVEL[f.level]}`} style={{ minWidth: 62, justifyContent: "center" }}>{LEVEL_TXT[f.level]}</span>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Topic by topic</h3>
        <table style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th>Topic</th>
              <th style={{ textAlign: "center" }}>SE lectures</th>
              {showIns && <><th style={{ textAlign: "center" }}>{insLabel} lectures</th><th style={{ textAlign: "center" }}>Status</th></>}
              <th>SE assessment</th>
              {showIns && <th>Instructor assessment</th>}
              <th>{showIns ? "Instructor" : "SE"}: lectures vs marks</th>
              <th>Check</th>
            </tr>
          </thead>
          <tbody>
            {a.topics.length === 0 && <tr><td colSpan={8} style={{ color: "var(--slate)" }}>No lecture topics yet.</td></tr>}
            {a.topics.map((t) => {
              const flags = showIns ? t.insFlags : t.seFlags;
              const st = STATUS[t.status];
              return (
                <tr key={t.key + (t.se ? "s" : "i")} style={flags.length ? { background: "#FFF8EC" } : undefined}>
                  <td style={{ maxWidth: 260 }}>
                    <b>{t.topic}</b>
                    {t.ins && t.se && t.ins.topic.toLowerCase() !== t.se.topic.toLowerCase() && <div style={{ fontSize: 10.5, color: "var(--slate)" }}>Instructor: {t.ins.topic}</div>}
                    {(t.se?.clos.length || t.ins?.clos.length) ? <div style={{ fontSize: 10.5, color: "var(--slate)" }}>{Array.from(new Set([...(t.se?.clos || []), ...(t.ins?.clos || [])])).join(", ")}</div> : null}
                  </td>
                  <td style={{ textAlign: "center" }}><Lect s={t.se} /></td>
                  {showIns && (
                    <>
                      <td style={{ textAlign: "center" }}>
                        <Lect s={t.ins} />
                        {t.se && t.ins && t.lectureDiff !== 0 && t.ins.lectures > 0 && <div style={{ fontSize: 10.5, color: Math.abs(t.lectureDiff) >= 2 ? "var(--rust)" : "var(--slate)" }}>{t.lectureDiff > 0 ? "+" : ""}{t.lectureDiff} vs plan</div>}
                      </td>
                      <td style={{ textAlign: "center" }}><span className={`badge ${st.cls}`} title={st.tip}>{st.label}</span></td>
                    </>
                  )}
                  <td><Assess s={t.se} /></td>
                  {showIns && <td><Assess s={t.ins} /></td>}
                  <td><Shares s={showIns ? t.ins : t.se} /></td>
                  <td style={{ fontSize: 11, maxWidth: 300 }}>
                    {flags.length ? flags.map((f, i) => <div key={i} style={{ color: f.kind === "over" ? "#95650F" : "var(--rust)" }}>{f.text}</div>) : <span style={{ color: "var(--sage)" }}>OK</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <OutcomeTable title="GAs — lectures and marks reaching each GA" rows={a.plos} showIns={showIns} />
      <OutcomeTable title="CLOs — lectures and marks per CLO" rows={a.clos} showIns={showIns} />

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Assessment items</h3>
        <table>
          <thead><tr><th>Type</th><th style={{ textAlign: "center" }}>SE items</th><th style={{ textAlign: "center" }}>SE marks</th>{showIns && <><th style={{ textAlign: "center" }}>Instructor items</th><th style={{ textAlign: "center" }}>Instructor marks</th></>}</tr></thead>
          <tbody>
            {Array.from(new Set([...a.se.byType.map((b) => b.type), ...a.ins.byType.map((b) => b.type)])).map((type) => {
              const s = a.se.byType.find((b) => b.type === type), i = a.ins.byType.find((b) => b.type === type);
              return (
                <tr key={type}>
                  <td>{type}</td>
                  <td style={{ textAlign: "center" }}>{s?.count || 0}</td><td style={{ textAlign: "center" }}>{r1(s?.marks || 0)}%</td>
                  {showIns && <><td style={{ textAlign: "center" }}>{i?.count || 0}</td><td style={{ textAlign: "center" }}>{r1(i?.marks || 0)}%</td></>}
                </tr>
              );
            })}
          </tbody>
        </table>
        {(a.se.unlinkedMarks > 0 || a.ins.unlinkedMarks > 0) && (
          <p style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 8 }}>
            Not linked to any lecture (can&apos;t be traced to a topic): SE {r1(a.se.unlinkedMarks)}%{showIns ? `, Instructor ${r1(a.ins.unlinkedMarks)}%` : ""}.
          </p>
        )}
      </div>
    </section>
  );
}
