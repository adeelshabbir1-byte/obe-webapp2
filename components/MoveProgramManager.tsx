"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MoveData } from "../lib/programMove";

export default function MoveProgramManager({ data }: { data: MoveData }) {
  const router = useRouter();
  const [pick, setPick] = useState<Record<string, string>>(() => Object.fromEntries(data.groups.map((g) => [`${g.sourceId}|${g.program}`, g.suggestedLeadId || ""])));
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  async function move(sourceId: string, program: string, sourceName: string) {
    const key = `${sourceId}|${program}`;
    const targetId = pick[key];
    const lead = data.leads.find((l) => l.id === targetId);
    if (!lead) { setMsg("Choose a Program Lead first."); return; }
    if (!window.confirm(`Move all ${program} batches, courses and students from ${sourceName} to ${lead.name}?`)) return;
    setBusy(key); setMsg("");
    const res = await fetch("/api/move-program", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId, program, targetId }) });
    const j = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) { setMsg(j.error || "Could not move"); return; }
    setMsg(`Moved ${j.batches} batches, ${j.courses} courses and ${j.students} students to ${lead.name}.`);
    router.refresh();
  }

  if (data.groups.length === 0) return <div className="card"><p style={{ fontSize: 13 }}>No batches have been created yet.</p></div>;
  return (
    <div>
      {msg && <div className="card" style={{ marginBottom: 12, fontSize: 13 }}>{msg}</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Program</th><th>Now with</th><th>Batches</th><th>Courses</th><th>Students</th><th>Move to Program Lead</th><th></th></tr></thead>
          <tbody>
            {data.groups.map((g) => {
              const key = `${g.sourceId}|${g.program}`;
              return (
                <tr key={key}>
                  <td><strong>{g.program}</strong></td>
                  <td style={{ fontSize: 12.5 }}>{g.sourceName}{g.alreadyRight && <span style={{ color: "var(--sage, green)" }}> · already with its lead</span>}</td>
                  <td>{g.batches}</td><td>{g.courses}</td><td>{g.students}</td>
                  <td>
                    <select value={pick[key] || ""} onChange={(e) => setPick((p) => ({ ...p, [key]: e.target.value }))}>
                      <option value="">Choose a Program Lead</option>
                      {data.leads.map((l) => <option key={l.id} value={l.id}>{l.name}{l.program ? ` (${l.program})` : ""}{l.departmentName ? ` · ${l.departmentName}` : ""}</option>)}
                    </select>
                  </td>
                  <td><button className="btn btn-brass" disabled={!!busy || !pick[key] || pick[key] === g.sourceId} onClick={() => move(g.sourceId, g.program, g.sourceName)}>{busy === key ? "Moving..." : "Move"}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
