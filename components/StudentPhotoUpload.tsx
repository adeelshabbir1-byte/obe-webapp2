"use client";

import { useEffect, useState } from "react";

/** Pick a photo; it is cut to a square and shrunk to 256 px in the browser before saving. */
export default function StudentPhotoUpload() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { fetch("/api/student/photo").then((r) => r.json()).then((d) => setPhoto(d.photo || null)).catch(() => null); }, []);
  async function save(p: string | null) {
    const r = await fetch("/api/student/photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photo: p || "" }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(d.error || "Could not save."); return; }
    setPhoto(p); setMsg(p ? "Saved — it shows at the top of every page." : "Removed."); window.dispatchEvent(new Event("student-photo"));
  }
  function pick(f: File) {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height), c = document.createElement("canvas");
      c.width = c.height = 256;
      c.getContext("2d")!.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
      save(c.toDataURL("image/jpeg", 0.82));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  }
  return (
    <div className="card" style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ width: 96, height: 96, borderRadius: "50%", background: photo ? `center / cover no-repeat url(${photo})` : "#E8E2DF", display: "inline-block", border: "3px solid #7A2E3B" }} />
      <div>
        <b>My photo</b>
        <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
          {photo && <button type="button" className="btn btn-ghost btn-sm" onClick={() => save(null)}>Remove</button>}
        </div>
        {msg && <p className="small-note" style={{ margin: "6px 0 0" }}>{msg}</p>}
      </div>
    </div>
  );
}
