import { prisma } from "../../../lib/db";
import { loadSession, parse, invigilatorPool, type ExamPaperRow, xdb } from "../../../lib/exams";
import { EXTRA_HINT, allowance, extraOf, logsOf } from "../../../lib/examsExtra";
import { ExamSetupForm, ReplaceDuty } from "../../../components/ExamSetup";

// Queue item 17: set-up and rules, the day of the exam, and the duty allowance — tabs of the exam session page.
export default async function ExamExtraTabs({ tab, sessionId, manager }: { tab: string; sessionId: string; manager: boolean }) {
  const s = await loadSession(sessionId);
  if (!s) return null;
  const e = await extraOf(sessionId);
  const pool = await invigilatorPool(s.chairmanId);
  const name = new Map(pool.map((p) => [p.id, p.name]));
  if (tab === "setup") {
    const rooms = await prisma.room.findMany({ where: { chairmanId: s.chairmanId, type: "LECTURE" }, select: { id: true, name: true, capacity: true }, orderBy: { name: "asc" } });
    return <div>
      {(e.lastBent || []).length > 0 && <div className="card" style={{ borderLeft: "4px solid #B26A00" }}><b>Rules the last date sheet had to bend</b>
        <ul style={{ margin: "4px 0 0 18px", fontSize: 13 }}>{e.lastBent!.map((b, i) => <li key={i}>{b.key}: {b.why}</li>)}</ul></div>}
      {manager ? <ExamSetupForm sessionId={sessionId} extra={e} rooms={rooms} people={pool.map((p) => ({ id: p.id, name: p.name }))} /> : <p className="small-note">The exam branch sets these.</p>}
    </div>;
  }
  if (tab === "day") {
    const logs = await logsOf(sessionId);
    if (logs === null) return <div className="err">{EXTRA_HINT}</div>;
    const papers = (await xdb.examPaper.findMany({ where: { sessionId } })) as ExamPaperRow[];
    const staff = Object.entries(e.slotStaff || {});
    return <div>
      <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Reserves and superintendents</h3>
        {!staff.length ? <p className="small-note">Turn them on under Set-up & rules, then generate again.</p> :
          <table className="table" style={{ fontSize: 12.5 }}><tbody>{staff.map(([k, m]) => <tr key={k}><td>{k}</td><td>{Object.entries(m).map(([r, ids]) => `${r.replace("-", " ")}: ${ids.map((i) => name.get(i)).join(", ") || "—"}`).join(" · ")}</td></tr>)}</tbody></table>}</div>
      {manager && <div className="card"><h3 style={{ marginTop: 0 }}>Emergency replacement</h3><ReplaceDuty sessionId={sessionId} people={pool.map((p) => ({ id: p.id, name: p.name }))} slots={Array.from(new Set(papers.filter((p) => p.date && p.slot !== null).map((p) => `${new Date(p.date!).toISOString().slice(0, 10)}:${p.slot}`))).sort()} /></div>}
      <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Log of the day</h3>
        {!logs.length ? <p className="small-note">Check-ins, chain of custody, unfair-means reports and replacements appear here as invigilators file them from My duties.</p> :
          <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>When</th><th>Slot</th><th>Room</th><th>What</th><th>Who</th><th>Detail</th></tr></thead>
            <tbody>{logs.map((l, i) => { const d = parse<Record<string, unknown>>(l.dataJson, {}); return <tr key={i}><td>{l.at.toISOString().slice(0, 16).replace("T", " ")}</td><td>{l.slotKey}</td><td>{l.roomId}</td><td>{l.kind === "UFM" ? <b style={{ color: "#B3261E" }}>Unfair means</b> : l.kind.toLowerCase()}</td><td>{name.get(l.userId) || l.userId}</td><td>{l.kind === "CHECKIN" ? (d.late ? "late" : "on time") : Object.entries(d).filter(([k]) => k !== "late").map(([k, v]) => `${k}: ${String(v)}`).join("; ")}</td></tr>; })}</tbody></table>}</div>
    </div>;
  }
  const rows = await allowance(sessionId);
  return <div className="card" style={{ overflowX: "auto" }}><div style={{ display: "flex", gap: 10, alignItems: "center" }}><h3 style={{ margin: 0 }}>Duty allowance</h3><span className="small-note">rate {e.rate || 0} per duty attended (set under Set-up & rules)</span><a className="btn btn-sm btn-secondary" href={`/api/exams/${sessionId}/setup?allowance=csv`}>⬇ Excel (CSV) for finance</a></div>
    <table className="table" style={{ fontSize: 12.5, marginTop: 6 }}><thead><tr><th>Name</th><th>Duties</th><th>Checked in</th><th>Late</th><th>Missed</th><th>Amount</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.duties}</td><td>{r.checked}</td><td>{r.late}</td><td>{r.missed}</td><td>{r.amount.toLocaleString()}</td></tr>)}</tbody></table>
    {(e.costShares || []).length > 0 && (() => { const total = rows.reduce((a, r) => a + r.amount, 0) + (e.otherCosts || 0); const pctSum = e.costShares!.reduce((a, x) => a + x.pct, 0) || 1;
      return <div style={{ marginTop: 8, fontSize: 13 }}><b>Split between partners</b> (duties {rows.reduce((a, r) => a + r.amount, 0).toLocaleString()} + other costs {(e.otherCosts || 0).toLocaleString()} = {total.toLocaleString()}): {e.costShares!.map((x) => `${x.name} ${Math.round((total * x.pct) / pctSum).toLocaleString()} (${x.pct}%)`).join(" · ")}</div>; })()}</div>;
}
