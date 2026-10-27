"use client";

import { useEffect, useState } from "react";
import TopicProposalsPanel from "./TopicProposalsPanel";

// For the Program Lead and the OMC (on Prerequisite Topics): topic links and plan proposals waiting on them, course
// prerequisite suggestions (Program Lead), the hardest topics of the program, sections compared (never shown to
// students; small sections hidden) and the one-time back-fill of topic results.

const API = "/api/faculty/topic-workspace";
type Sug = { kind: string; key: string; hash: string; confidence: string; reason: string; data: Record<string, unknown> };

export default function TopicPlanOversight({ role, courseIds }: { role: string; courseIds: string[] }) {
  const [prog, setProg] = useState<{ hardest: { code: string; topic: string; avg: number; below: number; students: number; offerings: number; trend: number | null }[]; sections: { code: string; term: string | null; topic: string; sections: { section: string; students: number; avgPct: number | null }[]; gap: number }[]; minStudents: number; minSection: number } | null>(null);
  const [sugs, setSugs] = useState<Sug[] | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { fetch(`${API}/performance?program=1`).then((r) => r.json()).then((d) => d.hardest && setProg(d)).catch(() => null); }, []);
  useEffect(() => {
    if (role !== "PROGRAM_COORDINATOR" || !courseIds.length) return;
    fetch(`${API}/suggestions?ai=0&courseIds=${courseIds.slice(0, 40).join(",")}`).then((r) => r.json()).then((d) => setSugs((d.suggestions || []).filter((s: Sug) => s.kind === "COURSE_PREREQ"))).catch(() => setSugs([]));
  }, [role, courseIds]);
  const decide = async (s: Sug, decision: "ACCEPTED" | "REJECTED") => {
    const reason = decision === "REJECTED" ? window.prompt("Why not? (remembered)") || "" : "";
    if (decision === "REJECTED" && reason.trim().length < 3) return;
    const r = await fetch(`${API}/suggestions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...s, decision, reason }) });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? (decision === "ACCEPTED" ? "Set on the program's courses." : "Rejected; it won't be suggested again.") : d.error || "Failed.");
    if (r.ok) setSugs((x) => (x || []).filter((y) => y.key !== s.key));
  };
  const backfill = async () => {
    setMsg("Back-filling past offerings… this can take a minute.");
    const r = await fetch(`${API}/performance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ backfill: true }) });
    const d = await r.json().catch(() => ({}));
    setMsg(r.ok ? `Back-fill done: ${d.offerings} offering(s), ${d.rows} topic row(s).` : d.error || "Failed.");
  };
  return (
    <div className="card no-print" style={{ marginTop: 14 }}>
      <h3 style={{ fontSize: 16, marginTop: 0 }}>Topic planning — what needs you</h3>
      {msg && <p className="small-note" role="status">{msg}</p>}
      <TopicProposalsPanel />
      {role === "PROGRAM_COORDINATOR" && <div style={{ marginTop: 14 }}>
        <h4 style={{ fontSize: 14 }}>Course prerequisite suggestions</h4>
        {!sugs ? <p className="small-note">Looking…</p> : !sugs.length ? <p className="small-note">Nothing to suggest.</p> : sugs.map((s) => { const d = s.data as Record<string, string>; return (
          <div key={s.key} style={{ borderTop: "1px solid var(--line)", padding: "6px 0", fontSize: 13 }}>
            <span className="badge badge-neutral">{s.confidence}</span> <b>{d.reverse ? `Check ${d.fromCode} → ${d.toCode}` : `${d.fromCode} before ${d.toCode}`}</b>
            <div className="small-note">{s.reason}</div>
            <button className="btn btn-sm" onClick={() => decide(s, "ACCEPTED")}>{d.reverse ? "Remove this prerequisite" : "Set as prerequisite"}</button> <button className="btn btn-secondary btn-sm" onClick={() => decide(s, "REJECTED")}>Reject</button>
          </div>); })}
      </div>}
      {prog && <div style={{ marginTop: 14 }}>
        <h4 style={{ fontSize: 14 }}>Hardest topics in the program <span className="small-note">(at least {prog.minStudents} students)</span></h4>
        {!prog.hardest.length ? <p className="small-note">No topic results yet. They are stored when a course result is approved. <button className="btn btn-secondary btn-sm" onClick={backfill}>Back-fill past offerings</button></p> :
          <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th>Topic</th><th>Average</th><th>Below pass</th><th>Students</th><th>Offerings</th><th>Trend</th></tr></thead>
            <tbody>{prog.hardest.map((h, i) => <tr key={i}><td>{h.code}</td><td>{h.topic}</td><td style={{ color: h.avg < 50 ? "#B3261E" : h.avg < 65 ? "#8A3D0D" : "#1E6B34", fontWeight: 600 }}>{h.avg}%</td><td>{h.below}%</td><td>{h.students}</td><td>{h.offerings}</td><td>{h.trend == null ? "—" : `${h.trend > 0 ? "+" : ""}${h.trend}`}</td></tr>)}</tbody></table>}
        <h4 style={{ fontSize: 14, marginTop: 12 }}>Sections compared <span className="small-note">(Program Lead and OMC only; sections under {prog.minSection} students hidden)</span></h4>
        {!prog.sections.length ? <p className="small-note">No topic taught in two or more sections with enough students yet.</p> :
          <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th>Term</th><th>Topic</th><th>Sections (average)</th><th>Gap</th></tr></thead>
            <tbody>{prog.sections.map((s, i) => <tr key={i}><td>{s.code}</td><td>{s.term || "—"}</td><td>{s.topic}</td><td>{s.sections.map((x) => `${x.section}: ${x.avgPct}% (${x.students})`).join(" · ")}</td><td>{s.gap} pts</td></tr>)}</tbody></table>}
        {prog.hardest.length > 0 && <p className="small-note"><button className="btn btn-secondary btn-sm" onClick={backfill}>Back-fill past offerings again</button></p>}
      </div>}
    </div>
  );
}
