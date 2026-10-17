"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fypPost } from "./FypClient";

type Task = { id: string; title: string; category: string; ownerId: string | null; ownerText: string | null; startDate: string; endDate: string; status: string; durationDays?: number | null; dependsJson?: string | null; fixedStart?: boolean; slack?: number; critical?: boolean };
const depsOf = (t: Task) => { try { return JSON.parse(t.dependsJson || "[]") as string[]; } catch { return []; } };
const STATUS: Record<string, string> = { TODO: "To do", IN_PROGRESS: "In progress", DONE: "Done" };

// Tasks of the FYP year plan (groupId absent) or of one group's project plan: add / edit / status / templates.
export default function FypPlanEditor({ cycleId, groupId, tasks, people, canEdit, canStatusIds, statusUrl, templates, issues }: {
  cycleId: string; groupId?: string; tasks: Task[]; people: { id: string; name: string }[]; canEdit: boolean;
  /** Tasks this viewer may tick even without edit rights (their own); "ALL" for students of the group. */ canStatusIds?: string[] | "ALL"; statusUrl?: string;
  templates?: { action: string; label: string }[]; issues?: string[];
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<Record<string, string>>({ title: "", startDate: today, endDate: today, ownerId: "", ownerText: "", category: "GENERAL", durationDays: "", fixedStart: "" });
  const [dep, setDep] = useState<string[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const call = async (body: Record<string, unknown>, url = "/api/fyp/plan") => { const r = await fypPost(url, { cycleId, groupId, ...body }); if (r.ok) { setMsg(""); router.refresh(); return true; } setMsg(r.error || "Could not save."); return false; };
  const who = (t: Task) => people.find((p) => p.id === t.ownerId)?.name || t.ownerText || "—";
  const mayStatus = (t: Task) => canEdit || canStatusIds === "ALL" || (Array.isArray(canStatusIds) && canStatusIds.includes(t.id));
  return (
    <div>
      {msg && <div className="small-note" style={{ color: "var(--rust)" }}>{msg}</div>}
      {(issues || []).length > 0 && <div style={{ background: "#FBF3E4", padding: "6px 10px", borderRadius: 8, fontSize: 12.5, marginBottom: 6 }}><b>Clashes and warnings</b>{issues!.map((x, i) => <div key={i}>• {x}</div>)}</div>}
      <table style={{ fontSize: 12.5 }}>
        <thead><tr><th>Task</th><th>Who</th><th>Working days</th><th>After</th><th>From</th><th>To</th><th>Slack</th><th>Status</th>{canEdit && <th />}</tr></thead>
        <tbody>{tasks.map((t) => (
          <tr key={t.id}>
            <td style={{ borderLeft: t.critical ? "3px solid #B3261E" : undefined }}>{t.title}{t.category === "OPEN_HOUSE" && <span className="small-note"> · open house</span>}{t.critical && <span style={{ color: "#B3261E", fontSize: 11 }}> · critical</span>}{t.fixedStart && <span className="small-note"> · fixed start</span>}</td><td>{who(t)}</td>
            <td>{t.durationDays ?? "—"}</td><td className="small-note">{depsOf(t).map((d) => tasks.find((x) => x.id === d)?.title).filter(Boolean).join(", ") || "—"}</td>
            <td>{t.startDate.slice(0, 10)}</td><td>{t.endDate.slice(0, 10)}</td><td>{t.slack ?? "—"}</td>
            <td>{mayStatus(t) ? <select value={t.status} onChange={(e) => call({ action: "status", taskId: t.id, status: e.target.value }, statusUrl)}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select> : STATUS[t.status]}
              {t.status !== "DONE" && t.endDate.slice(0, 10) < today && <span style={{ color: "#B3261E", fontSize: 11 }}> late</span>}</td>
            {canEdit && <td style={{ whiteSpace: "nowrap" }}><button className="act" onClick={() => { setEditId(t.id); setDep(depsOf(t)); setForm({ title: t.title, startDate: t.startDate.slice(0, 10), endDate: t.endDate.slice(0, 10), ownerId: t.ownerId || "", ownerText: t.ownerText || "", category: t.category, durationDays: t.durationDays ? String(t.durationDays) : "", fixedStart: t.fixedStart ? "1" : "" }); }}>Edit</button> <button className="act act-danger" onClick={() => confirm("Delete this task?") && call({ action: "delete", taskId: t.id })}>✕</button></td>}
          </tr>))}</tbody>
      </table>
      {canEdit && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8, fontSize: 12.5 }}>
          <label>Task<br /><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ width: 220 }} /></label>
          <label>From<br /><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
          <label>To (if no duration)<br /><input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
          <label>Working days<br /><input type="number" min={1} value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: e.target.value })} style={{ width: 70 }} /></label>
          <label>After task(s)<br /><select multiple value={dep} onChange={(e) => setDep(Array.from(e.target.selectedOptions).map((o) => o.value))} style={{ minWidth: 160, height: 54 }}>{tasks.filter((t) => t.id !== editId).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
          <label><input type="checkbox" checked={!!form.fixedStart} onChange={(e) => setForm({ ...form, fixedStart: e.target.checked ? "1" : "" })} /> Fixed start</label>
          <label>Who<br /><select value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>or name<br /><input value={form.ownerText} onChange={(e) => setForm({ ...form, ownerText: e.target.value })} placeholder="e.g. Admin office" style={{ width: 120 }} /></label>
          {!groupId && <label>Type<br /><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="GENERAL">General</option><option value="OPEN_HOUSE">Open house</option></select></label>}
          <button className="btn btn-sm" onClick={async () => { if (await call({ action: editId ? "update" : "add", taskId: editId, ...form, fixedStart: !!form.fixedStart, dependsOn: dep })) { setEditId(null); setDep([]); setForm({ ...form, title: "" }); } }}>{editId ? "Save task" : "Add task"}</button>
          {editId && <button className="btn btn-secondary btn-sm" onClick={() => setEditId(null)}>Cancel</button>}
          <button className="act" title="Re-date every task: dependencies, working days, weekends and holidays" onClick={() => call({ action: "reschedule" })}>Reschedule</button>
          {(templates || []).map((t) => <button key={t.action} className="act" onClick={() => confirm(`${t.label}?`) && call({ action: t.action })}>{t.label}</button>)}
        </div>
      )}
    </div>
  );
}
