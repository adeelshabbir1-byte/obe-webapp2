"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { readGradebook, type LmsSheet } from "../lib/lmsImport";

type Inst = { id: string; label: string; type: string; maxScore: number };

/** Upload a Moodle / Google Classroom / Canvas gradebook CSV and map its columns to this course's assessments. */
export default function LmsImport({ courseId, instruments }: { courseId: string; instruments: Inst[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<LmsSheet | null>(null);
  const [map, setMap] = useState<Record<number, { instrumentId: string; outOf: string }>>({});
  const [overwrite, setOverwrite] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  function guess(title: string) {
    const t = title.toLowerCase().replace(/[^a-z0-9]/g, "");
    return instruments.find((i) => i.label.toLowerCase().replace(/[^a-z0-9]/g, "") === t) || instruments.find((i) => t.includes(i.label.toLowerCase().replace(/[^a-z0-9]/g, "")));
  }
  async function onFile(f: File | undefined) {
    setMsg(""); setSheet(null); if (!f) return;
    const res = readGradebook(await f.text());
    if ("error" in res) { setMsg(res.error); return; }
    setSheet(res);
    const m: Record<number, { instrumentId: string; outOf: string }> = {};
    for (const g of res.gradeCols) { const i = guess(g.title); m[g.col] = { instrumentId: i?.id || "", outOf: String(g.points ?? i?.maxScore ?? "") }; }
    setMap(m);
  }
  async function submit() {
    if (!sheet) return;
    const chosen = sheet.gradeCols.filter((g) => map[g.col]?.instrumentId);
    if (!chosen.length) { setMsg("Choose an assessment for at least one column."); return; }
    setBusy(true); setMsg("");
    const r = await fetch(`/api/instructor/courses/${courseId}/lms-import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      source: sheet.source, overwrite,
      map: chosen.map((g) => ({ col: String(g.col), instrumentId: map[g.col].instrumentId, outOf: Number(map[g.col].outOf) || 0 })),
      rows: sheet.rows.map((r) => ({ key: r.key, name: r.name, scores: Object.fromEntries(chosen.map((g) => [String(g.col), r.cells[g.col] ?? ""])) })),
    }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Import failed."); return; }
    setMsg(`Imported ${d.written} marks${d.skipped ? `, kept ${d.skipped} existing` : ""}.${d.unmatchedCount ? ` ${d.unmatchedCount} rows did not match a student: ${d.unmatched.join(", ")}` : ""}`);
    router.refresh();
  }
  if (!open) return <button className="btn btn-secondary btn-sm" type="button" onClick={() => setOpen(true)}>Import from Moodle / Google Classroom</button>;
  return (
    <div className="card" style={{ borderLeft: "4px solid #2D63B5" }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}><b>Import grades from an LMS</b><button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Close</button></div>
      <p className="small-note">Moodle: Grades → Export → Plain text file. Google Classroom: Grades → Download as CSV. Canvas: Grades → Export. Students are matched by roll number (ID number / username), then by name. Each score is rescaled to the assessment&apos;s own marks, so CLO and PLO attainment update automatically.</p>
      <input type="file" accept=".csv,.txt,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
      {sheet && (
        <>
          <p className="small-note">{sheet.source} file · {sheet.rows.length} students · {sheet.gradeCols.length} grade columns</p>
          <table><thead><tr><th>LMS column</th><th>Goes to assessment</th><th>LMS marks out of</th></tr></thead>
            <tbody>{sheet.gradeCols.map((g) => (
              <tr key={g.col}><td>{g.title}</td>
                <td><select value={map[g.col]?.instrumentId || ""} onChange={(e) => { const i = instruments.find((x) => x.id === e.target.value); setMap({ ...map, [g.col]: { instrumentId: e.target.value, outOf: map[g.col]?.outOf || String(i?.maxScore ?? "") } }); }}>
                  <option value="">— skip —</option>{instruments.map((i) => <option key={i.id} value={i.id}>{i.label} ({i.type}, /{i.maxScore})</option>)}</select></td>
                <td><input type="number" style={{ width: 80 }} value={map[g.col]?.outOf || ""} onChange={(e) => setMap({ ...map, [g.col]: { ...(map[g.col] || { instrumentId: "" }), outOf: e.target.value } })} /></td></tr>))}</tbody></table>
          <label style={{ fontSize: 13, display: "block", margin: "6px 0" }}><input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> Replace marks already entered</label>
          <button className="btn btn-sm" type="button" disabled={busy} onClick={submit}>{busy ? "Importing…" : "Import marks"}</button>
        </>
      )}
      {msg && <p style={{ fontSize: 13, marginTop: 6 }}>{msg}</p>}
    </div>
  );
}
