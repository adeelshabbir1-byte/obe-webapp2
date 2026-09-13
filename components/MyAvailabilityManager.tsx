"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function formatHour(h: number) {
  const hour = Math.floor(h), min = Math.round((h - hour) * 60);
  return `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
}

export default function MyAvailabilityManager({ initialRecords }: { initialRecords: { id: string; dayOfWeek: string; startHour: number; endHour: number; note: string | null }[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/faculty/my-unavailability", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayOfWeek: fd.get("dayOfWeek"), startHour: fd.get("startHour"), endHour: fd.get("endHour"), note: fd.get("note") }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      (e.target as HTMLFormElement).reset(); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function remove(id: string) {
    setLoading(true);
    await fetch(`/api/faculty/my-unavailability/${id}`, { method: "DELETE" });
    setLoading(false); router.refresh();
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>My Unavailable Times</h3>
        <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 12 }}>These times will be avoided when the timetable is generated.</p>
        <table>
          <thead><tr><th>Day</th><th>Time</th><th>Note</th><th></th></tr></thead>
          <tbody>
            {initialRecords.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>None set yet.</td></tr>}
            {initialRecords.map((r) => (
              <tr key={r.id}>
                <td>{r.dayOfWeek}</td><td>{formatHour(r.startHour)}–{formatHour(r.endHour)}</td><td>{r.note || "—"}</td>
                <td><button onClick={() => remove(r.id)} disabled={loading} style={{ background: "none", border: "none", color: "var(--rust)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={add} style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Day</label>
            <select name="dayOfWeek">{DAYS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
          </div>
          <div className="field" style={{ margin: 0 }}><label>Start Hour</label><input name="startHour" type="number" min={0} max={23} defaultValue={8} style={{ width: 70 }} /></div>
          <div className="field" style={{ margin: 0 }}><label>End Hour</label><input name="endHour" type="number" min={0} max={23} defaultValue={9} style={{ width: 70 }} /></div>
          <div className="field" style={{ margin: 0 }}><label>Note (optional)</label><input name="note" placeholder="e.g. Prior commitment" /></div>
          <button className="btn btn-brass" type="submit" disabled={loading}>Add</button>
        </form>
      </div>
    </>
  );
}
