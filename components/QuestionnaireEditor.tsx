"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Q = { key: string; text: string; group: string; weight: number; order: number; version: number; retired: boolean; fdpTopic: string | null };
type Props = { kind: "COURSE" | "TEACHER"; title: string; questions: Q[]; versions: Record<string, { version: number; text: string; at: string }[]> };

const post = async (body: unknown) => {
  const r = await fetch("/api/evaluations/questionnaires", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, error: d.error as string | undefined };
};

/** Add, reword, regroup, reweight, reorder and retire the questions of one questionnaire. */
export default function QuestionnaireEditor({ kind, title, questions, versions }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(questions);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [add, setAdd] = useState({ text: "", group: "General", weight: 1, fdpTopic: "" });
  const active = rows.filter((r) => !r.retired);
  const W = active.reduce((a, r) => a + (Number(r.weight) || 0), 0);

  async function save(q: Q) {
    setBusy(true); setMsg("");
    const r = await post({ action: "save", kind, question: q });
    setBusy(false);
    if (!r.ok) setMsg(r.error || "Could not save."); else { setMsg("Saved."); router.refresh(); }
  }
  async function move(i: number, d: number) {
    const list = [...active]; const j = i + d; if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setRows([...list, ...rows.filter((r) => r.retired)]);
    setBusy(true); const r = await post({ action: "reorder", kind, keys: list.map((x) => x.key) }); setBusy(false);
    if (!r.ok) setMsg(r.error || "Could not reorder."); else router.refresh();
  }
  const set = (key: string, patch: Partial<Q>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <h2 style={{ fontSize: 17, margin: "0 0 4px" }}>{title}</h2>
      <p className="small-note" style={{ marginTop: 0 }}>Rewording keeps a question&apos;s identity (its results stay comparable with earlier terms) and records a new version. Weights give each question&apos;s share of the total out of 100 (now {W ? active.map((r) => `${Math.round((100 * r.weight) / W)}%`).join(" · ") : "—"}).</p>
      <table style={{ fontSize: 13, width: "100%" }}>
        <thead><tr><th style={{ width: 40 }} /><th>Question</th><th style={{ width: 120 }}>Group</th><th style={{ width: 70 }}>Weight</th><th style={{ width: 210 }}>FDP topic if it scores low</th><th style={{ width: 150 }} /></tr></thead>
        <tbody>
          {active.map((q, i) => (
            <tr key={q.key}>
              <td><button className="act" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button><button className="act" disabled={busy || i === active.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button></td>
              <td><textarea rows={2} value={q.text} onChange={(e) => set(q.key, { text: e.target.value })} style={{ width: "100%" }} aria-label="Question text" />
                <div className="small-note">v{q.version}{(versions[q.key] || []).length > 1 && <> · earlier: {(versions[q.key] || []).slice(0, -1).map((v) => `v${v.version} “${v.text}” (${v.at})`).join("; ")}</>}</div></td>
              <td><input value={q.group} onChange={(e) => set(q.key, { group: e.target.value })} style={{ width: "100%" }} aria-label="Group" /></td>
              <td><input type="number" min={0} max={100} step={0.5} value={q.weight} onChange={(e) => set(q.key, { weight: Number(e.target.value) })} style={{ width: 64 }} aria-label="Weight" /></td>
              <td><input value={q.fdpTopic || ""} onChange={(e) => set(q.key, { fdpTopic: e.target.value })} placeholder="e.g. Teaching skills workshop" style={{ width: "100%" }} aria-label="FDP topic" /></td>
              <td style={{ whiteSpace: "nowrap" }}><button className="btn btn-sm" disabled={busy} onClick={() => save(q)}>Save</button> <button className="act act-danger" disabled={busy} onClick={() => { if (confirm("Retire this question? Students stop seeing it; its past answers stay in the reports.")) save({ ...q, retired: true }); }}>Retire</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 80px 1.4fr auto", gap: 6, marginTop: 10, alignItems: "end" }}>
        <label style={{ fontSize: 12 }}>New question<input value={add.text} onChange={(e) => setAdd({ ...add, text: e.target.value })} placeholder="The teacher …" style={{ width: "100%" }} /></label>
        <label style={{ fontSize: 12 }}>Group<input value={add.group} onChange={(e) => setAdd({ ...add, group: e.target.value })} style={{ width: "100%" }} /></label>
        <label style={{ fontSize: 12 }}>Weight<input type="number" min={0} step={0.5} value={add.weight} onChange={(e) => setAdd({ ...add, weight: Number(e.target.value) })} style={{ width: "100%" }} /></label>
        <label style={{ fontSize: 12 }}>FDP topic<input value={add.fdpTopic} onChange={(e) => setAdd({ ...add, fdpTopic: e.target.value })} style={{ width: "100%" }} /></label>
        <button className="btn btn-brass btn-sm" disabled={busy || !add.text.trim()} onClick={async () => { await save({ key: "", text: add.text, group: add.group, weight: add.weight, order: active.length, version: 1, retired: false, fdpTopic: add.fdpTopic || null }); setAdd({ text: "", group: add.group, weight: 1, fdpTopic: "" }); }}>Add</button>
      </div>
      {rows.some((r) => r.retired) && (
        <details style={{ marginTop: 10, fontSize: 12.5 }}><summary style={{ cursor: "pointer" }}>Retired questions ({rows.filter((r) => r.retired).length})</summary>
          <ul>{rows.filter((r) => r.retired).map((r) => <li key={r.key}>{r.text} <button className="act" disabled={busy} onClick={() => save({ ...r, retired: false })}>Bring back</button></li>)}</ul>
        </details>
      )}
      {msg && <p style={{ fontSize: 13, margin: "8px 0 0", color: msg === "Saved." ? "#1E7B45" : "#C62828" }}>{msg}</p>}
    </div>
  );
}
