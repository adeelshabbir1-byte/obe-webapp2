"use client";

import { useState } from "react";

// Text size and contrast, per person (Adeel prompt §19.6). The CSS itself is added by AppShell from the saved choice.
export const DISPLAY_CSS = {
  large: "body{font-size:16.5px} .nav-link,.sb-action{font-size:15px} table{font-size:15px} .small-note{font-size:13.5px}",
  contrast: ":root{--text:#000;--slate:#1f1f1f;--bg:#fff} body{color:#000} a{text-decoration:underline} .small-note{color:#222 !important} .card{border-color:#555 !important}",
};
export default function DisplayPrefs({ value }: { value: string }) {
  const [v, setV] = useState(new Set(value.split(",").filter(Boolean)));
  async function toggle(k: "large" | "contrast") {
    const n = new Set(v); if (n.has(k)) n.delete(k); else n.add(k);
    setV(n);
    await fetch("/api/display", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ large: n.has("large"), contrast: n.has("contrast") }) }).catch(() => null);
    location.reload();
  }
  return (
    <div className="sb-action" style={{ gap: 6, display: "flex", alignItems: "center" }}>
      <button type="button" onClick={() => toggle("large")} aria-pressed={v.has("large")} title="Larger text" style={{ background: "none", border: "1px solid currentColor", borderRadius: 5, color: "inherit", cursor: "pointer", fontWeight: v.has("large") ? 800 : 400, padding: "0 6px" }}>A+</button>
      <button type="button" onClick={() => toggle("contrast")} aria-pressed={v.has("contrast")} title="High contrast" style={{ background: "none", border: "1px solid currentColor", borderRadius: 5, color: "inherit", cursor: "pointer", fontWeight: v.has("contrast") ? 800 : 400, padding: "0 6px" }}>◐</button>
      <span style={{ fontSize: 12 }}>Text &amp; contrast</span>
    </div>
  );
}
