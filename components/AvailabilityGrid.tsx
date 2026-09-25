"use client";

import { useState } from "react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 12 }, (_, i) => 8 + i); // 8:00 - 19:00

export default function AvailabilityGrid({ facultyId, existingUnavailable }: {
  facultyId?: string; existingUnavailable: { dayOfWeek: string; startHour: number; endHour: number }[];
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [available, setAvailable] = useState<Record<string, Record<number, boolean>>>(() => {
    const grid: Record<string, Record<number, boolean>> = {};
    for (const d of DAYS) {
      grid[d] = {};
      for (const h of HOURS) {
        const blocked = existingUnavailable.some((u) => u.dayOfWeek === d && h < u.endHour && h + 1 > u.startHour);
        grid[d][h] = !blocked;
      }
    }
    return grid;
  });

  function toggle(day: string, hour: number) {
    setAvailable((prev) => ({ ...prev, [day]: { ...prev[day], [hour]: !prev[day][hour] } }));
    setSaved(false);
  }

  function toggleDay(day: string, checked: boolean) {
    setAvailable((prev) => ({ ...prev, [day]: Object.fromEntries(HOURS.map((h) => [h, checked])) }));
    setSaved(false);
  }

  async function save() {
    setSaving(true); setError(""); setSaved(false);
    const slots: { dayOfWeek: string; startHour: number; endHour: number }[] = [];
    for (const d of DAYS) for (const h of HOURS) if (!available[d][h]) slots.push({ dayOfWeek: d, startHour: h, endHour: h + 1 });
    try {
      const res = await fetch("/api/shared/availability-grid", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ facultyId, slots }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setSaving(false); return; }
      setSaved(true); setSaving(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setSaving(false); }
  }

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      {error && <div className="err">{error}</div>}
      <p style={{ fontSize: 12, color: "var(--slate)", marginBottom: 12 }}>
        Every slot is checked (available) by default. Uncheck the ones that don't work.
      </p>
      <table>
        <thead>
          <tr>
            <th>Time</th>
            {DAYS.map((d) => (
              <th key={d} style={{ textAlign: "center" }}>
                {d}<br />
                <button type="button" onClick={() => toggleDay(d, true)} className="act act-primary">all</button>
                {" / "}
                <button type="button" onClick={() => toggleDay(d, false)} className="act act-danger">none</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {HOURS.map((h) => (
            <tr key={h}>
              <td style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>{h}:00–{h + 1}:00</td>
              {DAYS.map((d) => (
                <td key={d} style={{ textAlign: "center", background: available[d][h] ? undefined : "#FFE8ED" }}>
                  <input type="checkbox" checked={available[d][h]} onChange={() => toggle(d, h)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 14 }}>
        {saved && <span style={{ color: "var(--sage)", fontSize: 12, marginRight: 10 }}>Saved.</span>}
        <button onClick={save} disabled={saving} className="btn btn-brass">{saving ? "Saving…" : "Save Availability"}</button>
      </div>
    </div>
  );
}
