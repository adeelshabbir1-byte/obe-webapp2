"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const API = "/api/accreditation/nceac-portal";
type Msg = { ok: boolean; t: string } | null;
const Note = ({ m }: { m: Msg }) => (m ? <span style={{ fontSize: 12.5, color: m.ok ? "#2E7D4F" : "#B3261E", marginLeft: 6 }}>{m.t}</span> : null);

/** Upload a students or faculty file filled in the NCEAC portal's own format (e.g. exported from a campus system). */
export function PortalImport({ kind, program, batch }: { kind: "students" | "faculty"; program: string; batch: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function go(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const formEl = e.currentTarget;
    const fd = new FormData(formEl); fd.set("kind", kind); fd.set("program", program); fd.set("batch", batch);
    const r = await fetch(API, { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? { ok: true, t: `Saved ${d.saved} row(s).${d.skipped?.length ? ` Not saved: ${d.skipped.join("; ")}` : ""}` } : { ok: false, t: d.error || "Could not read the file" });
    if (r.ok) { formEl.reset(); router.refresh(); }
  }
  return (
    <form onSubmit={go} style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input name="file" type="file" accept=".xlsx" required style={{ fontSize: 12, maxWidth: 220 }} aria-label={`Filled ${kind} file`} />
      <button className="btn btn-secondary btn-sm" disabled={busy}>{busy ? "Reading…" : "⬆ Upload filled file"}</button>
      <Note m={msg} />
    </form>
  );
}

/** Notify the program's teachers whose rows the portal would reject. */
export function RemindTeachers({ program, count }: { program: string; count: number }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  if (!count) return null;
  async function go() {
    if (!confirm(`Send a reminder to ${count} teacher(s) to complete their NCEAC details?`)) return;
    setBusy(true);
    const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remind", program }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false); setMsg(r.ok ? { ok: true, t: `Reminder sent to ${d.sent} teacher(s).` } : { ok: false, t: d.error || "Could not send" });
  }
  return <span><button className="btn btn-secondary btn-sm" disabled={busy} onClick={go}>🔔 Remind {count} teacher(s)</button><Note m={msg} /></span>;
}

/** Correct one of the portal's dropdown lists (one value per line), or go back to OBEHUB's list. */
export function ListEditor({ k, label, values, changed, canEdit }: { k: string; label: string; values: string[]; changed: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(values.join("\n"));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  async function save(reset: boolean) {
    setBusy(true); setMsg(null);
    const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list", key: k, values: reset ? null : text.split("\n").map((x) => x.trim()).filter(Boolean) }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) { setOpen(false); router.refresh(); } else setMsg({ ok: false, t: d.error || "Could not save" });
  }
  if (!canEdit) return null;
  if (!open) return <button className="act" onClick={() => setOpen(true)}>Correct this list</button>;
  return (
    <div style={{ marginTop: 6 }}>
      <label style={{ fontSize: 12 }}>{label} — one value per line, spelt exactly as on the portal<br />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={Math.min(12, values.length + 2)} style={{ width: "100%", maxWidth: 360, fontFamily: "inherit" }} />
      </label>
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <button className="btn btn-sm" disabled={busy} onClick={() => save(false)}>Save list</button>
        {changed && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => save(true)}>Back to OBEHUB&apos;s list</button>}
        <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
        <Note m={msg} />
      </div>
    </div>
  );
}
