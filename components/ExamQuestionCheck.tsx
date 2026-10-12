/** On a Paper Distribution tab: questions planned in each paper against the OMC's minimum. Server-rendered. */
export default function ExamQuestionCheck({ midterm, final, rules, blocking }: { midterm: number; final: number; rules: { midterm: number; final: number }; blocking: boolean }) {
  if (!rules.midterm && !rules.final) return null;
  const items = [
    { label: "Midterm", have: midterm, need: rules.midterm },
    { label: "Final", have: final, need: rules.final },
  ].filter((i) => i.need > 0);
  const short = items.filter((i) => i.have < i.need);
  return (
    <div className="card" style={{ borderLeft: `4px solid ${short.length ? "#96650F" : "#1D8A4E"}` }}>
      <div className="lp-toolbar" style={{ marginBottom: 8 }}><h3>Questions per paper</h3><span className="lp-meta">OMC minimum</span></div>
      <div className="lp-chips">
        {items.map((i) => (
          <span key={i.label} className={`lp-chip ${i.have >= i.need ? "ok" : "short"}`}>
            <i />{i.label}<small>{i.have} of at least {i.need} question{i.need === 1 ? "" : "s"}{i.have < i.need ? ` · ${i.need - i.have} more needed` : ""}</small>
          </span>
        ))}
      </div>
      {short.length > 0 && <p className="lp-hint" style={{ color: "var(--amber-800)" }}>{blocking ? "The course plan can't be submitted until each paper has enough questions." : "Add questions so each paper meets the OMC's minimum."}</p>}
    </div>
  );
}
