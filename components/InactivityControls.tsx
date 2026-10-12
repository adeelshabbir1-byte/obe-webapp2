"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function InactivityPolicyForm({ workingDays, ownSet, instituteDays, offDays, exemptIds, people, isHead }: { workingDays: number; ownSet: boolean; instituteDays: number; offDays: number[]; exemptIds: string[]; people: { id: string; name: string; role: string }[]; isHead: boolean }) {
  const router = useRouter();
  const [days, setDays] = useState(String(workingDays));
  const [off, setOff] = useState<number[]>(offDays);
  const [exempt, setExempt] = useState<string[]>(exemptIds);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/inactivity", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workingDays: Number(days), exemptIds: exempt, ...(isHead ? { offDays: off } : {}) }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: d.error || "Could not save." });
    if (r.ok) router.refresh();
  }
  return (
    <div>
      {msg && <div className={msg.ok ? "" : "err"} style={msg.ok ? { background: "#E8F3EC", color: "#1F5E36", padding: "6px 10px", fontSize: 13, marginBottom: 8 } : undefined}>{msg.text}</div>}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="field" style={{ maxWidth: 260 }}>
          <label>Tell me when someone hasn&apos;t signed in for</label>
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="0">Never (alerts off)</option>
            {[1, 2, 3, 4, 5, 7, 10, 15].map((n) => <option key={n} value={n}>{n} working day{n > 1 ? "s" : ""}</option>)}
          </select>
          {!isHead && !ownSet && <small style={{ color: "var(--slate)" }}>Now using the institute default ({instituteDays}).</small>}
        </div>
        {isHead && (
          <div className="field">
            <label>Weekly days off (not counted, for the whole institute)</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {WD.map((w, i) => (
                <label key={w} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 13, fontWeight: 400 }}>
                  <input type="checkbox" checked={off.includes(i)} onChange={(e) => setOff(e.target.checked ? [...off, i] : off.filter((x) => x !== i))} />{w}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
      {people.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontSize: 13 }}>Leave people out of the watch ({exempt.length}) — e.g. a visiting Subject Expert from industry who only works now and then</summary>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 4, marginTop: 8, maxHeight: 260, overflowY: "auto" }}>
            {people.map((p) => (
              <label key={p.id} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, fontWeight: 400 }}>
                <input type="checkbox" checked={exempt.includes(p.id)} onChange={(e) => setExempt(e.target.checked ? [...exempt, p.id] : exempt.filter((x) => x !== p.id))} />
                {p.name} <span style={{ color: "var(--slate)" }}>({p.role})</span>
              </label>
            ))}
          </div>
        </details>
      )}
      <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
    </div>
  );
}

export function CheckNow() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  async function run() {
    setBusy(true); setText("");
    const r = await fetch("/api/inactivity", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setText(r.ok ? (d.sent ? `${d.sent} alert(s) sent.` : "No new alerts — everyone over the limit was already reported.") : d.error || "Could not check.");
    router.refresh();
  }
  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button className="btn btn-secondary" disabled={busy} onClick={run}>{busy ? "Checking…" : "Check now"}</button>
      {text && <span style={{ fontSize: 12.5, color: "var(--slate)" }}>{text}</span>}
    </span>
  );
}
