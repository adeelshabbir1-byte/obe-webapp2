"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type G = { code: string; title: string; sections: { id: string; label: string; masterId: string | null }[] };

/** "Teach as one": pick the main section of a course; the other sections follow its plan. */
export default function SectionLinker({ groups }: { groups: G[] }) {
  const router = useRouter(); const [msg, setMsg] = useState("");
  const [main, setMain] = useState<Record<string, string>>(Object.fromEntries(groups.map((g) => [g.code, g.sections.find((s) => g.sections.some((x) => x.masterId === s.id))?.id || g.sections[0].id])));
  async function link(g: G) {
    const m = main[g.code];
    const r = await fetch("/api/instructor/section-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "link", masterId: m, courseIds: g.sections.filter((s) => s.id !== m).map((s) => s.id) }) });
    const d = await r.json().catch(() => ({})); setMsg(r.ok ? `${g.code}: sections linked and the plan copied.` : d.error || "Failed."); if (r.ok) router.refresh();
  }
  return (
    <div className="card" style={{ borderLeft: "4px solid #1B6CA8" }}>
      <b>Teach as one</b> <span className="small-note">You teach more than one section of these courses. Choose the main section: its CLOs, weights, assessments, lecture plan and paper are used for all of them. Attendance, the lecture log and marks stay per section.</span>
      {groups.map((g) => { const linked = g.sections.some((s) => s.masterId); return (
        <div key={g.code} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8, fontSize: 13.5 }}>
          <b style={{ minWidth: 160 }}>{g.code} {g.title}</b>
          {g.sections.map((s) => <label key={s.id} style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="radio" name={`main-${g.code}`} checked={main[g.code] === s.id} onChange={() => setMain({ ...main, [g.code]: s.id })} />{s.label}{s.masterId ? " (linked)" : g.sections.some((x) => x.masterId === s.id) ? " (main)" : ""}</label>)}
          <button type="button" className="btn btn-sm" onClick={() => link(g)}>{linked ? "Update link" : "Link sections"}</button>
        </div>); })}
      {msg && <p style={{ fontSize: 13, marginBottom: 0 }}>{msg}</p>}
    </div>
  );
}
