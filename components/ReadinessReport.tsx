import { STATE_COLOUR, STATE_TEXT, colour, pct, rate, word, type State } from "../lib/readiness";
import type { computeReadiness } from "../lib/readiness";
import type { Recipient } from "../lib/requests";
import AskForAction from "./AskForAction";

export type AskInfo = { leadId: string; programName: string; recipients: Recipient[] };

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

export default function ReadinessReport({ data, sarHref, ask }: { data: Awaited<ReturnType<typeof computeReadiness>>; sarHref?: string; ask?: AskInfo }) {
  const askMsg = (label: string, done: number, total: number, hint: string) => `Please complete: ${label} for ${ask?.programName || "the program"} (${total === 0 ? "nothing recorded yet" : `${done} of ${total} done`}). ${hint}\n\nPlease reply when it is done, or tell me what is holding it up.`;
  const { batches, batchId, courses, plos, scored, overall, priorities, areas, areaScore, grid, COLS, qualifying, qualifyingManual } = data;
  return (
    <>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Accreditation Status</h1>
      {sarHref && <p style={{ margin: "0 0 8px" }}><a className="btn" href={sarHref}>Self-Assessment Report (print / PDF)</a></p>}
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        How ready your program is for an outcome-based accreditation review such as NCEAC, counted live from your own records.
        The nine criteria below are those of the NCEAC Accreditation Manual (second edition, 2023). Each gets one of NCEAC&apos;s compliance levels: G Good (exceeds), S Satisfactory (compliant), C Concern, W Weakness, D Deficient (not compliant), X not measured here.
        The manual gives these as words, so the score bands used here are indicative: 90%+ G, 75%+ S, 60%+ C, 40%+ W, below 40% D.
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

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Qualifying requirements</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>NCEAC screens every program on these first. Failing any one can stop the assessment (Manual 2.3).</p>
        <div style={{ display: "grid", gap: 6 }}>
          {qualifying.map((c) => {
            const p = pct(c); const ok = p !== null && p >= 100;
            return (
              <div key={c.label} style={{ display: "grid", gridTemplateColumns: "26px 1fr 80px", gap: 10, alignItems: "center", fontSize: 13 }}>
                <span style={{ background: p === null ? "#9AA0A6" : ok ? "#2E7D4F" : "#B3261E", color: "#fff", borderRadius: 6, textAlign: "center", fontWeight: 700 }}>{p === null ? "–" : ok ? "✓" : "✗"}</span>
                <span>{c.label}{!ok && <a href={c.href} style={{ marginLeft: 8, fontSize: 12 }}>{c.hint}</a>}</span>
                <span style={{ textAlign: "right", color: "var(--slate)" }}>{c.total > 0 ? `${c.done} of ${c.total}` : "—"}</span>
              </div>
            );
          })}
          {qualifyingManual.map((m) => <div key={m} style={{ fontSize: 12.5, color: "var(--slate)" }}>To show from paper records: {m}</div>)}
        </div>
      </div>

      {priorities.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Fix these first</h3>
          <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>The weakest items, lowest first.</p>
          {priorities.map((c, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: ask ? "26px 1fr 70px 120px 60px" : "26px 1fr 70px 120px", gap: 10, alignItems: "center", padding: "7px 0", borderTop: i ? "1px solid #eee" : undefined, fontSize: 13 }}>
              <b style={{ color: colour(c.p) }}>{i + 1}</b>
              <span><b>{c.label}</b> <span style={{ color: "var(--slate)" }}>· {c.area}. {c.hint}</span></span>
              <b style={{ color: colour(c.p), textAlign: "right" }}>{c.p}%</b>
              <a href={c.href} className="btn" style={{ textAlign: "center", fontSize: 12 }}>Open</a>
              {ask && <AskForAction leadId={ask.leadId} recipients={ask.recipients} subject={`${c.label} (${ask.programName})`} area={c.area} href={c.href} message={askMsg(c.label, c.done, c.total, c.hint)} />}
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
                <div key={i} style={{ display: "grid", gridTemplateColumns: ask ? "minmax(200px, 320px) 1fr 110px 80px 60px" : "minmax(200px, 320px) 1fr 110px 80px", gap: 12, alignItems: "center", padding: "7px 0", borderTop: i ? "1px solid #eee" : undefined, fontSize: 13 }}>
                  <span>{c.label}</span><Bar value={p} />
                  <span style={{ color: "var(--slate)", textAlign: "right" }}>{c.total === 0 ? "nothing yet" : `${c.done} of ${c.total}`}</span>
                  <b style={{ color: colour(p), textAlign: "right" }}>{p === null ? "—" : `${p}%`}</b>
                  {ask && (p === null || p < 100) ? <AskForAction leadId={ask.leadId} recipients={ask.recipients} subject={`${c.label} (${ask.programName})`} area={`Criterion ${a.no}: ${a.title}`} href={c.href} message={askMsg(c.label, c.done, c.total, c.hint)} /> : ask ? <span /> : null}
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
            <span key={k} style={{ marginRight: 14 }}><i style={{ display: "inline-block", width: 11, height: 11, borderRadius: 6, background: STATE_COLOUR[k], marginRight: 5, verticalAlign: -1 }} />{STATE_TEXT[k]}</span>
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
