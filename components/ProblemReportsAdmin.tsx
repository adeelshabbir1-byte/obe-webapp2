"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Row = { id: string; createdAt: string; status: string; kind: string; role: string; page: string; note: string; reply: string | null; user: string; institute: string; browser: string | null; hasShot: boolean };
type Inst = { id: string; name: string; mode: string; departmentIds: string[]; departments: { id: string; name: string }[] };
const STATUS: [string, string][] = [["NEW", "New"], ["UNDER_REVIEW", "Seen"], ["DONE", "Fixed"], ["DECLINED", "Won't fix"]];
const KIND: Record<string, string> = { BUG: "Bug", CONFUSING: "Confusing", MISSING: "Missing feature" };

async function post(body: unknown) {
  const r = await fetch("/api/admin/problem-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
}

function Answer({ r }: { r: Row }) {
  const router = useRouter();
  const [status, setStatus] = useState(r.status === "PLANNED" ? "UNDER_REVIEW" : r.status);
  const [reply, setReply] = useState(r.reply || "");
  const [err, setErr] = useState("");
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
      <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply (the reporter sees it)" style={{ flex: "1 1 160px" }} aria-label="Reply" />
      <button className="btn btn-sm" onClick={async () => { setErr(""); try { await post({ id: r.id, status, reply }); router.refresh(); } catch (e) { setErr((e as Error).message); } }}>Save</button>
      {err && <span className="err">{err}</span>}
    </div>
  );
}

function Pilot({ insts }: { insts: Inst[] }) {
  const router = useRouter();
  const [id, setId] = useState(insts[0]?.id || "");
  const inst = insts.find((i) => i.id === id);
  const [mode, setMode] = useState(inst?.mode || "ALL");
  const [deps, setDeps] = useState<string[]>(inst?.departmentIds || []);
  const [msg, setMsg] = useState("");
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <b>Pilot switch</b> <span className="small-note">who sees the “Report a problem” button</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
        <select value={id} onChange={(e) => { const n = insts.find((i) => i.id === e.target.value); setId(e.target.value); setMode(n?.mode || "ALL"); setDeps(n?.departmentIds || []); }} aria-label="Institute">{insts.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
        {[["ALL", "Everyone"], ["DEPARTMENTS", "Chosen departments"], ["OFF", "Nobody"]].map(([k, l]) => <label key={k} style={{ fontSize: 13 }}><input type="radio" checked={mode === k} onChange={() => setMode(k)} /> {l}</label>)}
        <button className="btn btn-sm" onClick={async () => { try { await post({ pilot: { chairmanId: id, mode, departmentIds: deps } }); setMsg("Saved."); router.refresh(); } catch (e) { setMsg((e as Error).message); } }}>Save</button>
        {msg && <span className="small-note">{msg}</span>}
      </div>
      {mode === "DEPARTMENTS" && inst && <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>{inst.departments.map((d) => <label key={d.id} style={{ fontSize: 13 }}><input type="checkbox" checked={deps.includes(d.id)} onChange={() => setDeps(deps.includes(d.id) ? deps.filter((x) => x !== d.id) : deps.concat(d.id))} /> {d.name}</label>)}</div>}
    </div>
  );
}

export default function ProblemReportsAdmin({ rows, insts, filters }: { rows: Row[]; insts: Inst[]; filters: Record<string, string> }) {
  const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  return (
    <>
      <Pilot insts={insts} />
      <form className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }} method="get">
        <select name="status" defaultValue={filters.status || ""} aria-label="Status"><option value="">Any status</option>{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select name="kind" defaultValue={filters.kind || ""} aria-label="Type"><option value="">Any type</option>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input name="role" defaultValue={filters.role || ""} placeholder="Role (e.g. INSTRUCTOR)" aria-label="Role" />
        <input name="page" defaultValue={filters.page || ""} placeholder="Page contains…" aria-label="Page" />
        <button className="btn btn-sm" type="submit">Filter</button>
        <a className="btn btn-brass btn-sm" href={`/api/admin/problem-reports?format=xlsx${q ? `&${q}` : ""}`}>Excel</a>
      </form>
      <div className="card" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? <p className="small-note">No reports.</p> : (
          <table style={{ width: "100%", minWidth: 900 }} data-problem-reports>
            <thead><tr><th>When</th><th>Type</th><th>Who</th><th>Page</th><th>Note</th><th>Screenshot</th><th>Status and reply</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontSize: 12 }}>{new Date(r.createdAt).toLocaleString()}</td>
                <td>{KIND[r.kind] || r.kind}</td>
                <td style={{ fontSize: 12.5 }}>{r.user}<div className="small-note">{r.role} · {r.institute}</div></td>
                <td style={{ fontSize: 12.5 }}><a href={r.page} target="_blank" rel="noreferrer">{r.page}</a></td>
                <td style={{ fontSize: 12.5, maxWidth: 320 }}>{r.note}</td>
                <td>{r.hasShot ? <a href={`/api/admin/problem-reports?shot=${r.id}`} target="_blank" rel="noreferrer">View</a> : <span className="small-note">—</span>}</td>
                <td style={{ minWidth: 300 }}><Answer r={r} /></td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
