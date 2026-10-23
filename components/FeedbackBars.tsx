import type { Breakdown } from "../lib/feedbackAnalysis";

// One questionnaire's results: per question, how many students gave each rating as a coloured bar, the average, and the
// total out of 100 with its calculation.
const STAR = ["#C62828", "#E8710A", "#B8A100", "#5E9E3A", "#1E7B45"]; // 1★ … 5★
export const scoreColour = (v: number | null, outOf = 5) => (v === null ? "#5E5457" : v / outOf < 0.6 ? "#C62828" : v / outOf < 0.7 ? "#B26A00" : "#1E7B45");

export default function FeedbackBars({ b, showCalc = true, compare }: { b: Breakdown; showCalc?: boolean; compare?: Record<string, number | null> }) {
  if (!b.n) return <p className="small-note" style={{ margin: 0 }}>No answers yet.</p>;
  const groups = Array.from(new Set(b.lines.map((l) => l.group)));
  return (
    <div>
      <table style={{ fontSize: 12.5, width: "100%" }}>
        <thead><tr><th>Question</th><th style={{ width: "38%" }}>Answers (5★ → 1★)</th><th style={{ textAlign: "right" }}>Average</th>{compare && <th style={{ textAlign: "right" }}>Before</th>}<th style={{ textAlign: "right" }}>Weight</th></tr></thead>
        <tbody>
          {groups.map((g) => [
            <tr key={`g-${g}`}><td colSpan={compare ? 5 : 4} style={{ fontWeight: 700, color: "#7E2435", paddingTop: 8 }}>{g}</td></tr>,
            ...b.lines.filter((l) => l.group === g).map((l) => (
              <tr key={l.key}>
                <td>{l.text}</td>
                <td>
                  {l.n > 0 ? (
                    <>
                      <div style={{ display: "flex", height: 14, borderRadius: 4, overflow: "hidden", background: "#EEE" }} aria-hidden="true">
                        {[4, 3, 2, 1, 0].map((i) => l.counts[i] > 0 && <div key={i} style={{ width: `${(100 * l.counts[i]) / l.n}%`, background: STAR[i] }} title={`${i + 1}★: ${l.counts[i]}`} />)}
                      </div>
                      <div className="small-note">{l.n} answered — {[5, 4, 3, 2, 1].map((s) => `${s}★ ${l.counts[s - 1]}`).join(", ")}</div>
                    </>
                  ) : <span className="small-note">no answers</span>}
                </td>
                <td style={{ textAlign: "right", fontWeight: 700, color: scoreColour(l.avg) }}>{l.avg ?? "—"}</td>
                {compare && <td style={{ textAlign: "right" }} className="small-note">{compare[l.key] ?? "—"}</td>}
                <td style={{ textAlign: "right" }} className="small-note">{l.weight}</td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
      <div style={{ marginTop: 6, fontSize: 13 }}>
        Total: <b style={{ fontSize: 16, color: scoreColour(b.total, 100) }}>{b.total ?? "—"}</b> / 100 <span className="small-note">({b.n} student{b.n === 1 ? "" : "s"})</span>
      </div>
      {showCalc && b.total !== null && (
        <details style={{ fontSize: 12 }}>
          <summary style={{ cursor: "pointer", color: "#1F4E8C" }}>How the total is worked out</summary>
          <p style={{ margin: "4px 0" }}>Each question&apos;s average out of 5 is multiplied by its weight; the sum is divided by the total weight and turned into a mark out of 100:</p>
          <p style={{ margin: 0, fontFamily: "Consolas, monospace" }}>
            ({b.lines.filter((l) => l.avg !== null && l.weight > 0).map((l) => `${l.avg}/5×${l.weight}`).join(" + ")}) ÷ {b.lines.filter((l) => l.avg !== null && l.weight > 0).reduce((a, l) => a + l.weight, 0)} × 100 = {b.total}
          </p>
        </details>
      )}
    </div>
  );
}
