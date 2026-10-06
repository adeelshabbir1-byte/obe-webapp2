"use client";

import { useEffect, useState } from "react";

type MyCourse = { id: string; code: string; title: string; creditHours: number; courseType: string; batchLabel: string; plan: string };
type Summary = {
  id: string; code: string; title: string; creditHours: number; courseType: string; summary: string | null; instituteName: string | null; authorOrganization: string | null;
  status: string; version: number; importCount: number; plan: string; reviewComment: string | null; author: { name: string };
};
type Snapshot = {
  clos: { code: string; statement: string; bloomLevel: string; ploNumber: number | null }[];
  instruments: { type: string; label: string; marksPct: number }[];
  lectureRows: { lectureNumber: number; topic: string; cloCode: string | null }[];
  weights: Record<string, number>;
};
type Tab = "search" | "mine" | "approvals";

const STATUS_LABEL: Record<string, string> = { PENDING: "Waiting for approval", PUBLIC: "Public", REJECTED: "Rejected", WITHDRAWN: "Withdrawn" };

export default function PublicCourseLibrary({ role, myCourses }: { role: string; myCourses: MyCourse[] }) {
  const canShare = role === "SUBJECT_EXPERT" || role === "INSTRUCTOR" || role === "PROGRAM_COORDINATOR";
  const [tab, setTab] = useState<Tab>("search");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Summary[]>([]);
  const [mine, setMine] = useState<Summary[]>([]);
  const [pending, setPending] = useState<Summary[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Snapshot | null>(null);
  const [targetId, setTargetId] = useState(myCourses[0]?.id || "");
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});

  async function api(url: string, init?: RequestInit) {
    const res = await fetch(url, init);
    let data: any = {};
    try { data = await res.json(); } catch { /* empty */ }
    return { ok: res.ok, status: res.status, data };
  }

  async function search() {
    setBusy(true); setError("");
    const r = await api(`/api/public-courses?scope=search&q=${encodeURIComponent(q)}`);
    if (r.ok) setResults(r.data.courses); else setError(r.data.error || "Search failed.");
    setBusy(false);
  }
  async function loadMine() { const r = await api("/api/public-courses?scope=mine"); if (r.ok) setMine(r.data.courses); }
  async function loadPending() { if (role !== "PROGRAM_COORDINATOR") return; const r = await api("/api/public-courses?scope=pending"); if (r.ok) setPending(r.data.courses); }
  useEffect(() => { search(); loadMine(); loadPending(); /* eslint-disable-next-line */ }, []);

  async function view(id: string) {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id); setDetail(null); setMessage(""); setError("");
    const r = await api(`/api/public-courses/${id}`);
    if (r.ok) setDetail(r.data.snapshot); else setError(r.data.error || "Couldn't open that course.");
  }

  async function doImport(id: string, confirmReplace = false) {
    setBusy(true); setError(""); setMessage("");
    const r = await api(`/api/public-courses/${id}/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetCourseId: targetId, confirmReplace }) });
    setBusy(false);
    if (r.ok) {
      const d = r.data;
      setMessage(`Imported: ${d.cloCount} CLOs, ${d.lectureRowCount} lecture rows, ${d.instrumentCount} assessments.${d.ploUnmapped > 0 ? ` ${d.ploUnmapped} CLO(s) were mapped to PLOs your batch doesn't have, so they are left unmapped — map them in the CLO editor.` : ""} Open the course to review and edit it.`);
      search();
    } else if (r.data?.needsConfirm) {
      if (confirm(`${r.data.error}\n\nReplace it?`)) await doImport(id, true);
    } else setError(r.data?.error || "Import failed.");
  }

  async function publish(courseId: string) {
    setBusy(true); setError(""); setMessage("");
    const r = await api("/api/public-courses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId }) });
    setBusy(false);
    if (r.ok) { setMessage(r.data.status === "PUBLIC" ? "Published — it is now searchable by other institutes." : "Sent to your coordinator for approval. It becomes public once approved."); loadMine(); }
    else setError(r.data?.error || "Couldn't publish.");
  }
  async function withdraw(id: string) {
    if (!confirm("Remove this course from the public library? Copies already imported elsewhere are not affected.")) return;
    const r = await api(`/api/public-courses/${id}/withdraw`, { method: "POST" });
    if (r.ok) loadMine(); else setError(r.data?.error || "Couldn't withdraw.");
  }
  async function review(id: string, decision: "APPROVE" | "REJECT") {
    setError("");
    const r = await api(`/api/public-courses/${id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, comment: rejectNote[id] || "" }) });
    if (r.ok) { loadPending(); } else setError(r.data?.error || "Couldn't save that decision.");
  }

  const tabBtn = (t: Tab, label: string) => (
    <button type="button" onClick={() => { setTab(t); setError(""); setMessage(""); }} style={{ padding: "7px 16px", fontSize: 13, cursor: "pointer", border: "1px solid var(--line)", background: tab === t ? "var(--ink, #1f2a44)" : "#fff", color: tab === t ? "#fff" : "inherit", fontWeight: tab === t ? 700 : 400 }}>{label}</button>
  );
  const source = (c: Summary) => [c.author.name, c.authorOrganization, c.instituteName].filter(Boolean).join(" · ");

  return (
    <div>
      <div style={{ display: "flex", marginBottom: 14 }}>
        {tabBtn("search", "Search")}
        {canShare && tabBtn("mine", "Share my courses")}
        {role === "PROGRAM_COORDINATOR" && tabBtn("approvals", `Approvals${pending.length ? ` (${pending.length})` : ""}`)}
      </div>
      {error && <div className="err">{error}</div>}
      {message && <div style={{ background: "#E2F4E8", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>{message}</div>}

      {tab === "search" && (
        <div>
          <form onSubmit={(e) => { e.preventDefault(); search(); }} className="card" style={{ display: "flex", gap: 8 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by course name, code, topic, author or institute…" style={{ flex: 1, padding: 8, border: "1px solid var(--line)" }} />
            <button className="btn btn-brass" type="submit" disabled={busy}>Search</button>
          </form>
          {results.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>No public courses found{q ? " for that search" : " yet"}.</p>}
          {results.map((c) => (
            <div key={c.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <strong>{c.code} — {c.title}</strong> <span style={{ fontSize: 12, color: "var(--slate)" }}>· {c.creditHours} cr · {c.courseType}{c.plan === "INSTRUCTOR" ? " · instructor's delivery plan" : ""}</span>
                  <div style={{ fontSize: 12, color: "var(--slate)", marginTop: 2 }}>By {source(c)} · imported {c.importCount} time(s) · version {c.version}</div>
                  {c.summary && <div style={{ fontSize: 12.5, marginTop: 6, maxWidth: 760 }}>{c.summary.length > 280 ? c.summary.slice(0, 280) + "…" : c.summary}</div>}
                </div>
                <div><button className="btn" type="button" onClick={() => view(c.id)}>{openId === c.id ? "Hide" : "View contents"}</button></div>
              </div>
              {openId === c.id && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                  {!detail ? <p style={{ fontSize: 12.5 }}>Loading…</p> : (
                    <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                      <div><strong>{detail.clos.length} CLOs</strong></div>
                      <ul style={{ paddingLeft: 18, marginBottom: 8 }}>{detail.clos.map((x) => <li key={x.code}>{x.code} ({x.bloomLevel}): {x.statement}</li>)}</ul>
                      <div><strong>{detail.lectureRows.length} lecture topics</strong> — {detail.lectureRows.slice(0, 6).map((r) => r.topic).filter(Boolean).join("; ")}{detail.lectureRows.length > 6 ? "…" : ""}</div>
                      <div style={{ marginTop: 6 }}><strong>{detail.instruments.length} assessments</strong> — {detail.instruments.map((i) => `${i.label} ${i.marksPct}%`).join(", ")}</div>
                      {canShare && (
                        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          {myCourses.length === 0 ? <span style={{ color: "var(--slate)" }}>You have no courses of your own to import into yet.</span> : (
                            <>
                              <label>Import into my course:</label>
                              <select value={targetId} onChange={(e) => setTargetId(e.target.value)} style={{ padding: 6, border: "1px solid var(--line)" }}>
                                {myCourses.map((m) => <option key={m.id} value={m.id}>{m.code} — {m.title}{m.batchLabel ? ` (${m.batchLabel})` : ""}</option>)}
                              </select>
                              <button className="btn btn-brass" type="button" disabled={busy || !targetId} onClick={() => doImport(c.id)}>{busy ? "Importing…" : "Import a copy"}</button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "mine" && canShare && (
        <div>
          <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 10 }}>
            Choose one of your courses to share. {role === "PROGRAM_COORDINATOR" ? "As a coordinator your courses become public straight away." : "Your coordinator approves it before it becomes public."} Publishing again after you change the course replaces the shared version.
          </p>
          {myCourses.length === 0 && <p style={{ fontSize: 13 }}>You have no courses yet.</p>}
          {myCourses.map((c) => {
            const shared = mine.find((m: any) => m.sourceCourseId === c.id) as Summary | undefined;
            return (
              <div key={c.id} className="card" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <strong>{c.code} — {c.title}</strong> <span style={{ fontSize: 12, color: "var(--slate)" }}>{c.batchLabel}</span>
                  {shared && <div style={{ fontSize: 12, marginTop: 2 }}>Status: <strong>{STATUS_LABEL[shared.status] || shared.status}</strong> · v{shared.version} · imported {shared.importCount} time(s){shared.status === "REJECTED" && shared.reviewComment ? ` · Reason: ${shared.reviewComment}` : ""}</div>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-brass" type="button" disabled={busy} onClick={() => publish(c.id)}>{shared && shared.status !== "WITHDRAWN" ? "Publish again" : "Make public"}</button>
                  {shared && (shared.status === "PUBLIC" || shared.status === "PENDING") && <button className="btn" type="button" onClick={() => withdraw(shared.id)}>Withdraw</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "approvals" && role === "PROGRAM_COORDINATOR" && (
        <div>
          {pending.length === 0 && <p style={{ fontSize: 13, color: "var(--slate)" }}>Nothing is waiting for your approval.</p>}
          {pending.map((c) => (
            <div key={c.id} className="card">
              <strong>{c.code} — {c.title}</strong> <span style={{ fontSize: 12, color: "var(--slate)" }}>by {c.author.name}{c.authorOrganization ? ` (${c.authorOrganization})` : ""} · v{c.version}</span>
              <div style={{ marginTop: 6 }}><button className="btn" type="button" onClick={() => view(c.id)}>{openId === c.id ? "Hide contents" : "View contents"}</button></div>
              {openId === c.id && detail && (
                <div style={{ fontSize: 12.5, marginTop: 8 }}>{detail.clos.length} CLOs · {detail.lectureRows.length} lecture topics · {detail.instruments.length} assessments
                  <ul style={{ paddingLeft: 18 }}>{detail.clos.map((x) => <li key={x.code}>{x.code}: {x.statement}</li>)}</ul></div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn btn-brass" type="button" onClick={() => review(c.id, "APPROVE")}>Approve — make public</button>
                <input value={rejectNote[c.id] || ""} onChange={(e) => setRejectNote({ ...rejectNote, [c.id]: e.target.value })} placeholder="Reason, if rejecting" style={{ padding: 6, border: "1px solid var(--line)", minWidth: 240 }} />
                <button className="btn" type="button" onClick={() => review(c.id, "REJECT")}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
