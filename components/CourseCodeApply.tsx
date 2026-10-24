"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Row = { courseId: string; code: string; title: string; semester: number | null; home: string; type: string; proposed: string | null; why: string };

/** Old code → proposed code for each course; tick the ones to change (all changes ticked by default), edit any code. */
export default function CourseCodeApply({ batchId, rows }: { batchId: string; rows: Row[] }) {
  const router = useRouter();
  const changes = rows.filter((r) => r.proposed && r.proposed !== r.code);
  const [pick, setPick] = useState<Set<string>>(new Set(changes.map((r) => r.courseId)));
  const [codes, setCodes] = useState<Record<string, string>>(Object.fromEntries(rows.map((r) => [r.courseId, r.proposed || r.code])));
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  async function apply() {
    setBusy(true); setMsg("");
    const r = await fetch("/api/course-codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "apply", batchId, picks: rows.filter((x) => pick.has(x.courseId)).map((x) => ({ courseId: x.courseId, code: codes[x.courseId] })) }) });
    const d = await r.json().catch(() => ({})); setBusy(false); setMsg(r.ok ? d.message : d.error || "Failed."); if (r.ok) router.refresh();
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
        <button className="btn btn-sm" disabled={busy || !pick.size} onClick={apply}>{busy ? "Changing…" : `Change ${pick.size} code(s)`}</button>
        <span className="small-note">{changes.length} course(s) would get a new code; {rows.filter((r) => !r.proposed).length} have none yet (see why).</span>
        {msg && <b style={{ fontSize: 13 }}>{msg}</b>}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 12.5 }}>
          <thead><tr><th></th><th>Sem</th><th>Course</th><th>Home department</th><th>Now</th><th>New code</th><th>Why</th></tr></thead>
          <tbody>{rows.map((r) => { const ch = !!r.proposed && r.proposed !== r.code; return (
            <tr key={r.courseId} style={{ background: ch ? "#FFF8E1" : undefined }}>
              <td>{r.proposed && <input type="checkbox" checked={pick.has(r.courseId)} onChange={(e) => { const s = new Set(pick); if (e.target.checked) s.add(r.courseId); else s.delete(r.courseId); setPick(s); }} aria-label={`Change ${r.code}`} />}</td>
              <td>{r.semester ?? "—"}</td><td>{r.title}<div className="small-note">{r.type}</div></td><td>{r.home}</td>
              <td style={{ fontFamily: "ui-monospace, Consolas, monospace" }}>{r.code}</td>
              <td>{r.proposed ? <input value={codes[r.courseId]} onChange={(e) => setCodes({ ...codes, [r.courseId]: e.target.value.toUpperCase() })} style={{ width: 110, fontFamily: "ui-monospace, Consolas, monospace", fontWeight: ch ? 700 : 400 }} aria-label={`New code for ${r.title}`} /> : "—"}</td>
              <td className="small-note">{r.why}</td>
            </tr>); })}</tbody>
        </table>
      </div>
    </div>
  );
}
