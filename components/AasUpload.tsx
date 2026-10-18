"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Upload the filled-in AAS workbook back into OBEHUB; or choose the AAS focal person. */
export default function AasUpload({ program, batch, staff, focalId, canFocal }: { program: string; batch: string; staff: { id: string; name: string }[]; focalId: string; canFocal: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const fd = new FormData(e.currentTarget); fd.set("program", program); fd.set("batch", batch);
    const r = await fetch("/api/accreditation/aas", { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    setBusy(false); setMsg(r.ok ? { ok: true, t: `Saved ${d.saved} row(s) from the workbook.` } : { ok: false, t: d.error || "Upload failed" });
    if (r.ok) { (e.target as HTMLFormElement).reset(); router.refresh(); }
  }
  async function focal(id: string) {
    const r = await fetch("/api/accreditation/aas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "focal", userId: id }) });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? { ok: true, t: "Focal person saved." } : { ok: false, t: d.error || "Could not save" }); if (r.ok) router.refresh();
  }
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
      <form onSubmit={upload} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12 }}>Filled-in AAS workbook<br /><input name="file" type="file" accept=".xlsx" required /></label>
        <button className="btn btn-brass btn-sm" disabled={busy}>{busy ? "Reading…" : "Upload and save"}</button>
      </form>
      {canFocal && <label style={{ fontSize: 12 }}>AAS focal person (My Profile)<br /><select defaultValue={focalId} onChange={(e) => focal(e.target.value)} style={{ padding: "5px 7px" }}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
      {msg && <span style={{ fontSize: 12.5, color: msg.ok ? "#2E7D4F" : "#B3261E" }}>{msg.t}</span>}
    </div>
  );
}
