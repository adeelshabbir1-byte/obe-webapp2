"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fypPost } from "./FypClient";

type Task = { id: string; title: string; category: string; ownerId: string | null; ownerText: string | null; startDate: string; endDate: string; status: string };
const STATUS: Record<string, string> = { TODO: "To do", IN_PROGRESS: "In progress", DONE: "Done" };

// Tasks of the FYP year plan (groupId absent) or of one group's project plan: add / edit / status / templates.
export default function FypPlanEditor({ cycleId, groupId, tasks, people, canEdit, canStatusIds, statusUrl, templates }: {
  cycleId: string; groupId?: string; tasks: Task[]; people: { id: string; name: string }[]; canEdit: boolean;
  /** Tasks this viewer may tick even without edit rights (their own); "ALL" for students of the group. */ canStatusIds?: string[] | "ALL"; statusUrl?: string;
  templates?: { action: string; label: string }[];
}) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<Record<string, string>>({ title: "", startDate: today, endDate: today, ownerId: "", ownerText: "", category: "GENERAL" });
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const call = async (body: Record<string, unknown>, url = "/api/fyp/plan") => { const r = await fypPost(url, { cycleId, groupId, ...body }); if (r.ok) { setMsg(""); router.refresh(); return true; } setMsg(r.error || "Could not save."); return false; };
  const who = (t: Task) => people.find((p) => p.id === t.ownerId)?.name || t.ownerText || "—";
  const mayStatus = (t: Task) => canEdit || canStatusIds === "ALL" || (Array.isArray(canStatusIds) && canStatusIds.includes(t.id));
  return (
    <div>
      {msg && <div className="small-note" style={{ color: "var(--rust)" }}>{msg}</div>}
      <table style={{ fontSize: 12.5 }}>
        <thead><tr><th>Task</th><th>Who</th><th>From</th><th>To</th><th>Status</th>{canEdit && <th />}</tr></thead>
        <tbody>{tasks.map((t) => (
          <tr key={t.id}>
            <td>{t.title}{t.category === "OPEN_HOUSE" && <span className="small-note"> · open house</span>}</td><td>{who(t)}</td><td>{t.startDate.slice(0, 10)}</td><td>{t.endDate.slice(0, 10)}</td>
            <td>{mayStatus(t) ? <select value={t.status} onChange={(e) => call({ action: "status", taskId: t.id, status: e.target.value }, statusUrl)}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select> : STATUS[t.status]}
              {t.status !== "DONE" && t.endDate.slice(0, 10) < today && <span style={{ color: "#B3261E", fontSize: 11 }}> late</span>}</td>
            {canEdit && <td style={{ whiteSpace: "nowrap" }}><button className="act" onClick={() => { setEditId(t.id); setForm({ title: t.title, startDate: t.startDate.slice(0, 10), endDate: t.endDate.slice(0, 10), ownerId: t.ownerId || "", ownerText: t.ownerText || "", category: t.category }); }}>Edit</button> <button className="act act-danger" onClick={() => confirm("Delete this task?") && call({ action: "delete", taskId: t.id })}>✕</button></td>}
          </tr>))}</tbody>
      </table>
      {canEdit && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8, fontSize: 12.5 }}>
          <label>Task<br /><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ width: 220 }} /></label>
          <label>From<br /><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
          <label>To<br /><input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
          <label>Who<br /><select value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>or name<br /><input value={form.ownerText} onChange={(e) => setForm({ ...form, ownerText: e.target.value })} placeholder="e.g. Admin office" style={{ width: 120 }} /></label>
          {!groupId && <label>Type<br /><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="GENERAL">General</option><option value="OPEN_HOUSE">Open house</option></select></label>}
          <button className="btn btn-sm" onClick={async () => { if (await call({ action: editId ? "update" : "add", taskId: editId, ...form })) { setEditId(null); setForm({ ...form, title: "" }); } }}>{editId ? "Save task" : "Add task"}</button>
          {editId && <button className="btn btn-secondary btn-sm" onClick={() => setEditId(null)}>Cancel</button>}
          {(templates || []).map((t) => <button key={t.action} className="act" onClick={() => confirm(`${t.label}?`) && call({ action: t.action })}>{t.label}</button>)}
        </div>
      )}
    </div>
  );
}
