type Sys = { findings: { level: string; text: string }[]; perClo: { code: string; bloom: string; marks: number; pct: number; taught: boolean }[]; bloom: { low: number; mid: number; high: number }; total: number; plos: string[]; at?: string };
type Ai = { questions: { q: number; clo: string; level: string; agrees: boolean; comment: string; suggestion?: string }[]; summary: string; at?: string };
const col: Record<string, string> = { ok: "#1F5E36", warn: "#A35A00", fail: "#B3261E" };

/** The system's and the AI's checks of an exam paper, as the teacher and the Program Lead see them. */
export default function VettingReport({ systemJson, aiJson, items }: { systemJson: string | null; aiJson: string | null; items: { no: number; clo: string; level: string; marks: number; text: string }[] }) {
  const s = systemJson ? (JSON.parse(systemJson) as Sys) : null;
  const a = aiJson ? (JSON.parse(aiJson) as Ai) : null;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {s && <div className="card"><h3 style={{ marginTop: 0 }}>System check</h3>
        <ul style={{ margin: "0 0 8px", paddingLeft: 18 }}>{s.findings.map((f, i) => <li key={i} style={{ color: col[f.level] }}>{f.text}</li>)}</ul>
        <div style={{ fontSize: 13 }}>Total {s.total} marks · Bloom spread: C1–C2 {s.bloom.low}% · C3–C4 {s.bloom.mid}% · C5–C6 {s.bloom.high}% · GAs reached: {s.plos.join(", ") || "—"}</div>
        <table style={{ marginTop: 6 }}><thead><tr><th>CLO</th><th>CLO level</th><th>Taught in this part</th><th>Marks</th><th>Share</th></tr></thead>
          <tbody>{s.perClo.map((p) => <tr key={p.code}><td>{p.code}</td><td>{p.bloom}</td><td>{p.taught ? "Yes" : "—"}</td><td>{p.marks}</td><td>{p.pct}%</td></tr>)}</tbody></table></div>}
      {a && <div className="card"><h3 style={{ marginTop: 0 }}>AI check <span className="small-note">an independent reading of each question; advisory only</span></h3>
        <p style={{ fontSize: 13.5 }}>{a.summary}</p>
        <table><thead><tr><th>Q</th><th>Claimed</th><th>AI reads it as</th><th>Comment</th></tr></thead>
          <tbody>{a.questions.map((q) => { const it = items.find((i) => i.no === q.q); return (
            <tr key={q.q}><td>Q{q.q}</td><td>{it ? `${it.clo} ${it.level}` : "—"}</td><td style={{ color: q.agrees ? "#1F5E36" : "#B3261E", fontWeight: 700 }}>{q.clo} {q.level}</td><td style={{ fontSize: 12.5 }}>{q.comment}{q.suggestion ? <div className="small-note">Suggestion: {q.suggestion}</div> : null}</td></tr>); })}</tbody></table></div>}
    </div>
  );
}
