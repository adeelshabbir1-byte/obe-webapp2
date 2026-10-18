"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const VISITS = ["Zero Visit", "Accreditation Visit", "Confirmatory Visit", "Change of Scope Visit"];

/** Upload an AAS workbook (whole or one section) back into OBEHUB; and the AAS settings. */
export default function AasUpload({ program, batch, staff, focalId, canSettings, instituteType, visitType, compact }: { program: string; batch: string; staff: { id: string; name: string }[]; focalId: string; canSettings: boolean; instituteType: string; visitType: string; compact?: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const fd = new FormData(e.currentTarget); fd.set("program", program); fd.set("batch", batch);
    const r = await fetch("/api/accreditation/aas", { method: "POST", body: fd });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? { ok: true, t: `Saved ${d.saved} row(s)${d.created ? `, ${d.created} new student(s) added to the batch` : ""}.${d.skipped?.length ? ` Skipped: ${d.skipped.join("; ")}` : ""}` } : { ok: false, t: d.error || "Upload failed" });
    if (r.ok) { (e.target as HTMLFormElement).reset(); router.refresh(); }
  }
  async function setting(body: Record<string, string>) {
    const r = await fetch("/api/accreditation/aas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "settings", ...body }) });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? { ok: true, t: "Saved." } : { ok: false, t: d.error || "Could not save" }); if (r.ok) router.refresh();
  }
  if (compact) return (
    <form onSubmit={upload} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      <input name="file" type="file" accept=".xlsx" required style={{ width: 170, fontSize: 11.5 }} />
      <button className="btn btn-secondary btn-sm" disabled={busy}>{busy ? "…" : "⬆ Upload"}</button>
      {msg && <span style={{ fontSize: 11.5, color: msg.ok ? "#2E7D4F" : "#B3261E" }}>{msg.t}</span>}
    </form>
  );
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
      <form onSubmit={upload} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12 }}>Filled-in AAS workbook (any or all sheets)<br /><input name="file" type="file" accept=".xlsx" required /></label>
        <button className="btn btn-brass btn-sm" disabled={busy}>{busy ? "Reading…" : "Upload and save"}</button>
      </form>
      {canSettings && <>
        <label style={{ fontSize: 12 }}>AAS focal person (My Profile)<br /><select defaultValue={focalId} onChange={(e) => setting({ userId: e.target.value })} style={{ padding: "5px 7px" }}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>The institute is a<br /><select defaultValue={instituteType} onChange={(e) => setting({ instituteType: e.target.value })} style={{ padding: "5px 7px" }}><option value="CAMPUS">University campus</option><option value="AFFILIATED">Affiliated institute</option></select></label>
        <label style={{ fontSize: 12 }}>Visit type<br /><select defaultValue={visitType} onChange={(e) => setting({ visitType: e.target.value })} style={{ padding: "5px 7px" }}>{VISITS.map((v) => <option key={v}>{v}</option>)}</select></label>
      </>}
      {msg && <span style={{ fontSize: 12.5, color: msg.ok ? "#2E7D4F" : "#B3261E" }}>{msg.t}</span>}
    </div>
  );
}
