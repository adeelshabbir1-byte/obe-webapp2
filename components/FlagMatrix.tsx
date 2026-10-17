"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type T = { topic: string; below: number; assessed: number; strong: boolean };
type S = { id: string; name: string; rollNumber: string; pcts: (number | null)[] };

/** Students × topics of one course: tick the students and the weak topics, give a reason, and flag them for remediation. */
export default function FlagMatrix({ courseId, topics, students, passPct }: { courseId: string; topics: T[]; students: S[]; passPct: number }) {
  const router = useRouter();
  const weak = (s: S) => s.pcts.some((p) => p !== null && p < passPct);
  const [sel, setSel] = useState<Set<string>>(new Set(students.filter(weak).map((s) => s.id)));
  const [tsel, setTsel] = useState<Set<number>>(new Set(topics.map((t, i) => (t.below > 0 ? i : -1)).filter((i) => i >= 0)));
  const [reason, setReason] = useState(""); const [msg, setMsg] = useState("");
  const tog = <X,>(s: Set<X>, x: X) => { const n = new Set(s); if (n.has(x)) n.delete(x); else n.add(x); return n; };
  async function send() {
    const r = await fetch("/api/remediation-flags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "flag", courseId, studentIds: Array.from(sel), topics: Array.from(tsel).map((i) => topics[i].topic), reason }) });
    const d = await r.json().catch(() => ({})); setMsg(r.ok ? `Flagged ${d.flagged} student(s).${d.refused ? ` ${d.refused} could not be flagged by you.` : ""} The OMC and the Program Lead are told.` : d.error || "Failed."); if (r.ok) router.refresh();
  }
  return (
    <div>
      <div style={{ overflowX: "auto" }}><table style={{ fontSize: 12.5 }}>
        <thead><tr><th>Student</th>{topics.map((t, i) => <th key={i} style={{ minWidth: 90 }}><label style={{ display: "flex", gap: 4, alignItems: "flex-start" }}><input type="checkbox" checked={tsel.has(i)} onChange={() => setTsel(tog(tsel, i))} /><span>{t.topic}{t.strong ? " ★" : ""}<div className="small-note">{t.below}/{t.assessed} below</div></span></label></th>)}</tr></thead>
        <tbody>{students.map((s) => <tr key={s.id}><td style={{ whiteSpace: "nowrap" }}><label><input type="checkbox" checked={sel.has(s.id)} onChange={() => setSel(tog(sel, s.id))} /> {s.rollNumber} {s.name}</label></td>
          {s.pcts.map((p, i) => <td key={i} style={{ textAlign: "center", color: p === null ? undefined : p < passPct ? "#B3261E" : "#1F5E36", fontWeight: p !== null && p < passPct ? 700 : 400 }}>{p === null ? "—" : `${Math.round(p)}%`}</td>)}</tr>)}</tbody>
      </table></div>
      <p className="small-note">Red = below the {passPct}% pass mark. ★ = a topic a later course depends on strongly. Students and topics below the mark are ticked for you.</p>
      <textarea rows={2} style={{ width: "100%" }} placeholder="Why (e.g. struggling with loops in OOP labs; advisor meeting on 12 Oct)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button type="button" className="btn btn-sm" disabled={!sel.size || !tsel.size} onClick={send}>Flag {sel.size} student(s) on {tsel.size} topic(s)</button> <span style={{ fontSize: 13 }}>{msg}</span>
    </div>
  );
}
