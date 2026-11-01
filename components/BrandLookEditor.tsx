"use client";

import { useState } from "react";

// Institute Head: main colour (contrast-checked) and the faint logo watermark (Adeel prompt §18).
export default function BrandLookEditor({ color, watermark }: { color: string | null; watermark: string }) {
  const [c, setC] = useState(color || "#7E2435");
  const [w, setW] = useState(watermark);
  const [msg, setMsg] = useState("");
  async function save(body: unknown) {
    setMsg("");
    const r = await fetch("/api/branding/look", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.json()).catch(() => ({ error: "Could not save." }));
    if (r.error) { setMsg(r.error); if (r.suggestion) setC(r.suggestion); } else location.reload();
  }
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3 style={{ marginTop: 0, fontSize: 15 }}>Look of the app</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", fontSize: 13 }}>
        <label>Main colour <input type="color" value={c} onChange={(e) => setC(e.target.value)} /> <code>{c}</code></label>
        <span style={{ background: c, color: "#fff", padding: "3px 10px", borderRadius: 6 }}>Sample button</span>
        <button type="button" className="btn btn-sm" onClick={() => save({ color: c })}>Save colour</button>
        {color && <button type="button" className="btn-link" onClick={() => save({ color: null })}>Use the default colour</button>}
      </div>
      <div style={{ marginTop: 10, fontSize: 13 }}>
        Logo watermark behind pages (very faint, never over text; hidden on mark sheets, timetables and phones):{" "}
        <select value={w} onChange={(e) => { setW(e.target.value); save({ watermark: e.target.value }); }}>
          <option value="center">Centre</option><option value="corner">Bottom-right</option><option value="off">Off</option>
        </select>
      </div>
      {msg && <div className="err" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
