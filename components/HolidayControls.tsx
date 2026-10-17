"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Institute Head: load Pakistan's public holidays for a year and set the weekly days off.
export default function HolidayControls({ weekend }: { weekend: number[] }) {
  const router = useRouter();
  const [w, setW] = useState<number[]>(weekend);
  const [msg, setMsg] = useState("");
  const post = async (body: Record<string, unknown>) => { const r = await fetch("/api/academic-calendar/holidays", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); setMsg(r.ok ? (d.added != null ? `${d.added} holidays added.` : "Saved.") : d.error || "Could not save."); if (r.ok) router.refresh(); };
  const y = new Date().getFullYear();
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 12.5 }}>
      {[y, y + 1].map((yr) => <button key={yr} className="act" onClick={() => post({ year: yr })}>Load Pakistan holidays {yr}</button>)}
      <span>Days off each week: {DAYS.map((d, i) => <label key={d} style={{ marginRight: 6 }}><input type="checkbox" checked={w.includes(i)} onChange={(e) => setW(e.target.checked ? [...w, i] : w.filter((x) => x !== i))} />{d}</label>)}</span>
      <button className="act" onClick={() => post({ weekend: w.join(",") })}>Save days off</button>
      {msg && <span>{msg}</span>}
    </div>
  );
}
