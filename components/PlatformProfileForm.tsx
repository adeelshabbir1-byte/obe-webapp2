"use client";
import { useState } from "react";

type V = { name: string; email: string; organization: string; designation: string; phone: string; photo: string | null };
// Resize a chosen photo in the browser to a small JPEG (about 240 px), so it stays light.
async function shrink(file: File): Promise<string> {
  const img = await createImageBitmap(file); const k = Math.min(1, 240 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", 0.85);
}
export default function PlatformProfileForm({ initial }: { initial: V }) {
  const [v, setV] = useState(initial); const [m, setM] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="card" data-platform-profile>
      <h3 style={{ marginTop: 0 }}>Details</h3>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
        <div style={{ width: 72, height: 72, borderRadius: 36, background: v.photo ? `center / cover no-repeat url(${v.photo})` : "#E3E8EF", display: "grid", placeItems: "center", fontWeight: 700, color: "#5b6470" }}>{v.photo ? null : v.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}</div>
        <div><input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setV({ ...v, photo: await shrink(f) }); }} />{v.photo && <button type="button" className="btn-link" onClick={() => setV({ ...v, photo: null })}>Remove photo</button>}</div>
      </div>
      {([["name", "Full name"], ["designation", "Designation"], ["organization", "Organisation"], ["phone", "Phone"]] as [keyof V, string][]).map(([k, l]) => <label key={k} style={{ display: "block", fontSize: 13, marginBottom: 6 }}>{l}<br /><input value={String(v[k] || "")} onChange={(e) => setV({ ...v, [k]: e.target.value })} style={{ width: "100%" }} /></label>)}
      <p className="small-note">Email (sign-in): {v.email}</p>
      <button type="button" className="btn" onClick={async () => { const r = await fetch("/api/platform/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) }); const d = await r.json().catch(() => ({})); setM(r.ok ? { ok: true, text: "Saved ✓" } : { ok: false, text: d.error || "Not saved." }); }}>Save</button>
      {m && <span className={m.ok ? "ok" : "err"} style={{ marginLeft: 8 }}>{m.text}</span>}
    </div>
  );
}
