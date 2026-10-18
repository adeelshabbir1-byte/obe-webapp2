"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Attach evidence to a visit finding: upload a file or give a link; remove one. */
export default function VisitEvidence({ cycleId, id, evidence, edit }: { cycleId: string; id: string; evidence: { name: string; url: string }[]; edit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  async function send(fd: FormData) {
    setBusy(true); setMsg("");
    fd.set("cycleId", cycleId); fd.set("id", id);
    const r = await fetch("/api/accreditation/visit/evidence", { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Could not save"); return; }
    setOpen(false); router.refresh();
  }
  return (
    <div style={{ fontSize: 12.5, marginTop: 4 }}>
      {evidence.length > 0 && <div><i>Evidence:</i> {evidence.map((e, i) => <span key={e.url} style={{ marginRight: 10 }}>Annex {i + 1}: <a href={e.url} target="_blank" rel="noreferrer" style={{ color: "var(--brass-dark)" }}>{e.name}</a>{edit && <button type="button" className="act no-print" disabled={busy} onClick={() => { const fd = new FormData(); fd.set("remove", e.url); send(fd); }} style={{ marginLeft: 4 }}>✕</button>}</span>)}</div>}
      {edit && !open && <button type="button" className="act no-print" onClick={() => setOpen(true)}>+ Attach evidence</button>}
      {edit && open && (
        <form className="no-print" onSubmit={(e) => { e.preventDefault(); send(new FormData(e.currentTarget)); }} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end", marginTop: 4 }}>
          <label>Name<br /><input name="name" placeholder="e.g. BOS minutes 2025" style={{ width: 180 }} /></label>
          <label>File<br /><input name="file" type="file" /></label>
          <label>or link<br /><input name="url" placeholder="https://…" style={{ width: 180 }} /></label>
          <button className="btn btn-brass btn-sm" disabled={busy}>{busy ? "Saving…" : "Attach"}</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
          {msg && <span style={{ color: "#B3261E" }}>{msg}</span>}
        </form>
      )}
    </div>
  );
}
