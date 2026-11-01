"use client";

import { useState } from "react";
import type { Tpl } from "../../../lib/msgTemplates";

export default function TemplatesForm({ kinds, initial, urDefaults }: { kinds: [string, string][]; initial: Tpl; urDefaults: Record<string, string> }) {
  const [t, setT] = useState<Tpl>(initial); const [m, setM] = useState("");
  const set = (k: string, l: "en" | "ur", v: string) => setT({ ...t, kinds: { ...t.kinds, [k]: { ...t.kinds[k], [l]: v } } });
  return <div className="card"><h3 style={{ marginTop: 0 }}>Message templates (English / اردو)</h3>
    <p className="small-note">Use {"{title}"} and {"{body}"}. Empty English = the alert as it is; empty Urdu = the built-in Urdu text where there is one.</p>
    <label>Send in <select value={t.lang} onChange={(e) => setT({ ...t, lang: e.target.value as Tpl["lang"] })}><option value="en">English</option><option value="ur">Urdu</option><option value="both">Both</option></select></label>
    <table style={{ marginTop: 8 }}><tbody>{kinds.map(([k, label]) => <tr key={k}><td style={{ fontSize: 12.5, width: 180 }}>{label}</td><td><input value={t.kinds[k]?.en || ""} onChange={(e) => set(k, "en", e.target.value)} placeholder="English" style={{ width: "100%" }} /></td><td><input dir="rtl" value={t.kinds[k]?.ur || ""} onChange={(e) => set(k, "ur", e.target.value)} placeholder={urDefaults[k] || "اردو"} style={{ width: "100%" }} /></td></tr>)}</tbody></table>
    <button type="button" className="btn btn-sm" onClick={async () => { const r = await fetch("/api/chairman/messaging/templates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(t) }).then((x) => x.json()).catch(() => ({ error: "Could not save." })); setM(r.error || "Saved ✓"); }}>Save templates</button> <span className="small-note">{m}</span>
  </div>;
}
