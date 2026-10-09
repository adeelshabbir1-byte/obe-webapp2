import { STATE_COLOUR, STATE_TEXT, colour, pct, rate, word, type State } from "../lib/readiness";
import type { computeReadiness } from "../lib/readiness";

function Donut({ value, size = 150 }: { value: number | null; size?: number }) {
  const r = size / 2 - 12, c = 2 * Math.PI * r, v = value ?? 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Overall readiness ${value === null ? "no data" : value + " percent"}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E6E2DA" strokeWidth={14} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colour(value)} strokeWidth={14} strokeLinecap="round"
        strokeDasharray={`${(c * v) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="48%" textAnchor="middle" style={{ fontSize: size * 0.24, fontWeight: 700, fontFamily: "Georgia, serif", fill: "var(--ink, #222)" }}>{value === null ? "—" : `${value}%`}</text>
      <text x="50%" y="64%" textAnchor="middle" style={{ fontSize: 11, fill: "#6B7177" }}>{word(value)}</text>
    </svg>
  );
}

function Bar({ value }: { value: number | null }) {
  return (
    <div style={{ background: "#ECE8E0", borderRadius: 6, height: 10, width: "100%", overflow: "hidden" }}>
      <div style={{ width: `${value ?? 0}%`, height: "100%", background: colour(value), borderRadius: 6 }} />
    </div>
  );
}

export default function ReadinessReport({ data, sarHref }: { data: Awaited<ReturnType<typeof computeReadiness>>; sarHref?: string }) {
  const { batches, batchId, courses, plos, scored, overall, priorities, areas, areaScore, grid, COLS } = data;
  return (
    <>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Accreditation Status</h1>
      {sarHref && <p style={{ margin: "0 0 8px" }}><a className="btn" href={sarHref}>Self-Assessment Report (print / PDF)</a></p>}
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        How ready your program is for an outcome-based accreditation review such as NCEAC, counted live from your own records.
        The ten criteria below follow the NCEAC program-evaluation structure as listed in the document you shared (please check the numbering against the official NCEAC manual). Each criterion gets the usual quality rating: E Exceptional (90%+), G Good (75%+), C Concern (60%+), W Weakness (40%+), D Deficient (below 40%), X not measured by this system.
      </p>
      <form method="get" style={{ marginBottom: 14, display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ fontSize: 13 }}>Show{" "}
          <select name="batchId" defaultValue={batchId} style={{ padding: "5px 8px" }}>
            <option value="">All batches</option>
            {batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}
          </select>
        </label>
        <button className="btn" type="submit">Update</button>
      </form>

      <div className="card" style={{ display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
        <Donut value={overall} />
        <div style={{ flex: 1, minWidth: 260 }}>
          <h3 style={{ marginTop: 0 }}>Overall readiness</h3>
          <p style={{ fontSize: 13, color: "var(--slate)", marginTop: 0 }}>
            {courses.length} course(s) and {plos.length} PLO(s) in view. The overall figure is the average of the areas that already have data.
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {scored.map(({ a, s }) => {
              const r = rate(s);
              return (
                <div key={a.no} style={{ display: "grid", gridTemplateColumns: "34px 270px 1fr 70px", gap: 10, alignItems: "center", fontSize: 13 }}>
                  <span title={r.name} style={{ background: r.colour, color: "#fff", fontWeight: 700, borderRadius: 6, textAlign: "center", padding: "3px 0" }}>{r.code}</span>
                  <span>{a.no}. {a.title}</span><Bar value={s} />
                  <b style={{ color: r.colour, textAlign: "right" }}>{s === null ? "—" : `${s}%`}</b>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {priorities.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Fix these first</h3>
          <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>The weakest items, lowest first.</p>
          {priorities.map((c, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "26px 1fr 70px 120px", gap: 10, alignItems: "center", padding: "7px 0", borderTop: i ? "1px solid #eee" : undefined, fontSize: 13 }}>
              <b style={{ color: colour(c.p) }}>{i + 1}</b>
              <span><b>{c.label}</b> <span style={{ color: "var(--slate)" }}>· {c.area}. {c.hint}</span></span>
              <b style={{ color: colour(c.p), textAlign: "right" }}>{c.p}%</b>
              <a href={c.href} className="btn" style={{ textAlign: "center", fontSize: 12 }}>Open</a>
            </div>
          ))}
        </div>
      )}

      {areas.map((a) => {
        const sc = areaScore(a), r = rate(sc);
        return (
          <div className="card" key={a.no}>
            <h3 style={{ marginTop: 0, display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ background: r.colour, color: "#fff", borderRadius: 6, padding: "2px 10px", fontSize: 14 }} title={r.name}>{r.code}</span>
              Criterion {a.no}: {a.title}
              <span style={{ marginLeft: "auto", fontSize: 13, color: r.colour }}>{sc === null ? "Not measured here" : `${sc}% · ${r.name}`}</span>
            </h3>
            {a.checks.map((c, i) => {
              const p = pct(c);
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "minmax(200px, 320px) 1fr 110px 80px", gap: 12, alignItems: "center", padding: "7px 0", borderTop: i ? "1px solid #eee" : undefined, fontSize: 13 }}>
                  <span>{c.label}</span><Bar value={p} />
                  <span style={{ color: "var(--slate)", textAlign: "right" }}>{c.total === 0 ? "nothing yet" : `${c.done} of ${c.total}`}</span>
                  <b style={{ color: colour(p), textAlign: "right" }}>{p === null ? "—" : `${p}%`}</b>
                </div>
              );
            })}
            {a.manual.length > 0 && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "#F4F1EA", fontSize: 12.5, color: "var(--slate)" }}>
                <b>Prepare separately (this system does not hold it):</b>
                <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>{a.manual.map((m) => <li key={m}>{m}</li>)}</ul>
              </div>
            )}
          </div>
        );
      })}

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Course by course</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>
          {(Object.keys(STATE_COLOUR) as State[]).map((k) => (
            <span key={k} style={{ marginRight: 14 }}><i style={{ display: "inline-block", width: 11, height: 11, borderRadius: 3, background: STATE_COLOUR[k], marginRight: 5, verticalAlign: -1 }} />{STATE_TEXT[k]}</span>
          ))}
        </p>
        {courses.length === 0 ? <p style={{ color: "var(--slate)" }}>No courses yet.</p> : (
          <table>
            <thead><tr><th>Course</th>{COLS.map((c) => <th key={c.key} style={{ fontSize: 11, textAlign: "center", minWidth: 70 }}>{c.label}</th>)}</tr></thead>
            <tbody>
              {grid.map(({ c, st }) => (
                <tr key={c.id}>
                  <td style={{ whiteSpace: "nowrap" }}><b>{c.code}</b> <span style={{ color: "var(--slate)", fontSize: 12 }}>{c.title}</span></td>
                  {COLS.map((col) => { const state: State = st[col.key]; return (
                    <td key={col.key} style={{ textAlign: "center" }} title={`${col.label}: ${STATE_TEXT[state]}`}>
                      <i style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", background: STATE_COLOUR[state] }} />
                    </td>
                  ); })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p style={{ fontSize: 12, color: "var(--slate)" }}>
        This page measures the records this system holds. NCEAC also asks for things kept outside it (faculty contracts, budget, BOG/BOS minutes, lab and library inventory), so a full score here is not a guarantee of accreditation.
        The detailed evidence reports are in <a href="/coordinator/report-bundles">Report Bundles</a> (NCEAC Accreditation Package).
      </p>
    </>
  );
}
