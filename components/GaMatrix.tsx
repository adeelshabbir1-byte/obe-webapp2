import Link from "next/link";
import { gaMatrix } from "../lib/gaMatrix";
import { STATUS_LABEL, PASS } from "../lib/gaMatrixCore";

// The student's GA matrix (Adeel prompt §20.7): courses × GAs, coloured cells, footer per GA, and a GA detail panel
// (open by clicking a GA heading: ?ga=N on the same tab link).
const C = { ok: ["#E3F2E6", "#1B6B3A"], bad: ["#FBE9E7", "#B3261E"], prog: ["#FBF3E4", "#7A520C"], plan: ["#F1F1F1", "#666"] } as const;
export default async function GaMatrix({ studentId, base, ga, tabParam = "tab", tabValue = "obe" }: { studentId: string; base: string; ga?: number | null; tabParam?: string; tabValue?: string }) {
  const m = await gaMatrix(studentId);
  if (!m) return null;
  if (!m.gas.length) return <div className="card"><p>No GAs are set for this student&apos;s batch yet.</p></div>;
  const sep = base.includes("?") ? "&" : "?";
  const f = new Map(m.footers.map((x) => [x.ga, x]));
  const detail = ga ? m.gas.find((g) => g.n === ga) : null;
  const line = ga ? m.lines.find((l) => l.number === ga) : null;
  const ruleText = m.rule.kind === "avg" ? `credit-weighted average ≥ ${PASS}% across all courses of the GA` : `attained (≥ ${PASS}%) in at least ${m.rule.n} courses`;
  return (
    <div>
      <div className="card" style={{ overflowX: "auto" }}>
        <p className="small-note" style={{ marginTop: 0 }}>GA rule for this program: {ruleText}. Click a GA to see its details.</p>
        <table className="table" style={{ fontSize: 12, minWidth: 640 }}>
          <thead><tr><th style={{ textAlign: "left" }}>Course</th><th>Sem.</th><th>Status</th>{m.gas.map((g) => <th key={g.n} title={g.title}><Link href={`${base}${sep}${tabParam}=${tabValue}&ga=${g.n}`} scroll={false}>GA-{g.n}</Link></th>)}</tr></thead>
          <tbody>
            {m.rows.map((r) => (
              <tr key={r.code}>
                <td><b>{r.code}</b> {r.title}</td><td style={{ textAlign: "center" }}>{r.semester ?? "—"}</td>
                <td style={{ fontSize: 11 }}>{r.status === "FAILED" ? <span style={{ color: "#B3261E" }}>Failed</span> : r.status === "IN_PROGRESS" ? "In progress" : r.status === "PLANNED" ? "To take" : "Passed"}</td>
                {m.gas.map((g) => {
                  const v = r.cells[g.n];
                  if (!v) return <td key={g.n} />;
                  if (v === "planned") return <td key={g.n} style={{ background: C.plan[0], color: C.plan[1], textAlign: "center" }} title="Maps to this GA; not taken yet">⚪</td>;
                  if (v === "progress") return <td key={g.n} style={{ background: C.prog[0], color: C.prog[1], textAlign: "center" }} title="In progress this semester">🟠*</td>;
                  const ok = v.pct >= PASS;
                  return <td key={g.n} style={{ background: (ok ? C.ok : C.bad)[0], color: (ok ? C.ok : C.bad)[1], textAlign: "center", fontWeight: 600 }}>{ok ? "🟢" : "🔴"} {Math.round(v.pct)}%</td>;
                })}
              </tr>
            ))}
          </tbody>
          <tfoot style={{ fontSize: 11.5 }}>
            {([["Courses mapped", (x) => x.mapped], ["Attained so far", (x) => `${x.attained} of ${x.taken}`], ["Average so far", (x) => (x.avg === null ? "—" : `${x.avg}%`)], ["Remaining chances", (x) => x.remaining], ["Slack", (x) => x.slack], ["Status", (x) => STATUS_LABEL[x.status]]] as [string, (x: import("../lib/gaMatrixCore").Footer) => React.ReactNode][]).map(([label, fn]) => (
              <tr key={label} style={{ background: "#FAFAF8" }}><td colSpan={3}><b>{label}</b></td>{m.gas.map((g) => <td key={g.n} style={{ textAlign: "center" }}>{f.get(g.n) ? fn(f.get(g.n)!) : "—"}</td>)}</tr>
            ))}
          </tfoot>
        </table>
      </div>
      {detail && (
        <div className="card" style={{ marginTop: 10 }}>
          <h3 style={{ marginTop: 0, fontSize: 15 }}>GA-{detail.n}: {detail.title}</h3>
          <p style={{ fontSize: 13 }}><b>Required:</b> {ruleText}. <b>Where he stands:</b> {f.get(detail.n)?.avg ?? "—"}{f.get(detail.n)?.avg != null ? "%" : ""} average, attained in {f.get(detail.n)?.attained} of {f.get(detail.n)?.taken} courses taken. <b>Status:</b> {STATUS_LABEL[f.get(detail.n)!.status]}</p>
          <h4 style={{ fontSize: 13.5 }}>Done</h4>
          {line && line.courses.length ? <ul style={{ fontSize: 13, paddingLeft: 18 }}>{line.courses.map((c, i) => <li key={i}>{c.code} {c.title} — {c.term}: {Math.round(c.pct)}% {c.pct >= PASS ? "✓" : "✗"}</li>)}</ul> : <p className="small-note">No course has assessed it yet.</p>}
          <h4 style={{ fontSize: 13.5 }}>What&apos;s left</h4>
          {(() => { const left = m.rows.filter((r) => r.cells[detail.n] === "planned" || r.cells[detail.n] === "progress"); return left.length ? <p style={{ fontSize: 13 }}>{left.map((r) => r.code).join(", ")} — {f.get(detail.n)?.slack}</p> : <p className="small-note">No planned course assesses it.</p>; })()}
          {(f.get(detail.n)?.status === "AT_RISK" || f.get(detail.n)?.status === "CANNOT") && <p style={{ fontSize: 13, background: "#FFF8E1", padding: 8, borderRadius: 6 }}><b>Advice:</b> work through the remediation material of the weak courses, look for electives that also assess GA-{detail.n}, and talk it over with the advisor.</p>}
          <Link href={`${base}${sep}${tabParam}=${tabValue}`} scroll={false} className="small-note">Close</Link>
        </div>
      )}
    </div>
  );
}
