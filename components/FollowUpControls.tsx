"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function patch(id: string, body: unknown) {
  const res = await fetch(`/api/follow-ups/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return res.ok ? null : (data.error as string) || "Could not save.";
}

/** The teacher's record of what was done: action taken and status. */
export function FollowUpActionForm({ id, status, actionTaken }: { id: string; status: string; actionTaken: string | null }) {
  const router = useRouter();
  const [text, setText] = useState(actionTaken || "");
  const [st, setSt] = useState(status === "OPEN" ? "IN_PROGRESS" : status);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function save() {
    setBusy(true); setMsg("");
    const err = await patch(id, { status: st, actionTaken: text });
    setBusy(false);
    if (err) { setMsg(err); return; }
    setMsg("Saved."); router.refresh();
  }
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="What was done — e.g. tutorial on 14 Oct, 32 students attended, short quiz average 68%" maxLength={2000} />
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select value={st} onChange={(e) => setSt(e.target.value)} aria-label="Status">
          <option value="IN_PROGRESS">In progress</option>
          <option value="DONE">Done</option>
          <option value="DISMISSED">Not needed (say why)</option>
          <option value="OPEN">Open</option>
        </select>
        <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
        {msg && <span className="small-note" style={{ color: msg === "Saved." ? "var(--sage)" : "var(--rust)" }}>{msg}</span>}
      </div>
    </div>
  );
}

/** OMC / Program Lead: choose the teacher who runs the tutorial or extra class. */
export function FollowUpAssign({ id, assignedToId, people }: { id: string; assignedToId: string | null; people: { id: string; name: string; department: string | null }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function change(v: string) {
    setBusy(true); setErr("");
    const e = await patch(id, { assignedToId: v || null });
    setBusy(false);
    if (e) { setErr(e); return; }
    router.refresh();
  }
  return (
    <div>
      <select defaultValue={assignedToId || ""} disabled={busy} onChange={(e) => change(e.target.value)} aria-label="Assign a teacher" style={{ maxWidth: 220 }}>
        <option value="">— the course&apos;s own teacher —</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.department ? ` (${p.department})` : ""}</option>)}
      </select>
      {err && <div className="small-note" style={{ color: "var(--rust)" }}>{err}</div>}
    </div>
  );
}
