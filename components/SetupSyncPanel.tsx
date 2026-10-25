"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ContentSyncManager from "./ContentSyncManager";

// Step 5 of a batch's set-up on the Content Sync page: the batch and the batches before it are loaded in the grid, the
// count of synced courses ("Synced 41 of 48" — content-sync links), and the courses with no earlier course to mark as
// new courses one by one or all at once. Linking a course here gives it the earlier course's semester, Subject Expert
// and plan.
type Open = { id: string; code: string; title: string; suggestion: { id: string; code: string; title: string; batch: string } | null };

export default function SetupSyncPanel({ batchId, preselect, synced, total, isNew, open, back }: { batchId: string; preselect: string[]; synced: number; total: number; isNew: number; open: Open[]; back: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const post = async (url: string, body: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchId, ...body }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: d.message || "Saved." } : { ok: false, text: d.error || "Could not save." });
    router.refresh();
  };
  const noEarlier = open.filter((o) => !o.suggestion), suggested = open.filter((o) => o.suggestion);
  return (
    <>
      <div className="card" style={{ borderLeft: `5px solid ${open.length ? "#C62828" : "#2E7D32"}` }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <b>Synced {synced} of {total}{isNew ? ` · ${isNew} new course${isNew === 1 ? "" : "s"}` : ""}{open.length ? ` · ${open.length} still to decide` : " · every course decided"}</b>
          <Link href={back} className="btn btn-sm" style={{ marginLeft: "auto" }}>Back to the batch set-up →</Link>
        </div>
        <p className="small-note" style={{ margin: "6px 0" }}>Link each course of this batch with the same course taught before (click both in the grid, then <b>S</b>). A linked course takes that course&apos;s semester, home department and Subject Expert, and its plan comes with it. A course with no earlier course is a <b>new course</b>.</p>
        {msg && <p className={msg.ok ? "small-note" : "err"} style={{ color: msg.ok ? "#1E6B34" : undefined }}>{msg.text}</p>}
        {suggested.length > 0 && (
          <details open={suggested.length <= 8} style={{ margin: "6px 0" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Suggested links ({suggested.length})</summary>
            <button type="button" className="btn btn-sm" style={{ margin: "6px 0" }} disabled={busy} onClick={() => post("/api/coordinator/batch-setup", { action: "equaliseAll" })}>Accept every suggestion</button>
            <table style={{ fontSize: 12.5, width: "100%" }}><tbody>{suggested.map((o) => (
              <tr key={o.id}><td><b>{o.code}</b> {o.title}</td><td>= {o.suggestion!.code} {o.suggestion!.title} <span className="small-note">({o.suggestion!.batch})</span></td>
                <td style={{ whiteSpace: "nowrap" }}><button type="button" className="btn btn-sm" disabled={busy} onClick={() => post("/api/coordinator/batch-setup", { action: "equalise", courseId: o.id, prevCourseId: o.suggestion!.id })}>Link</button>{" "}
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => post("/api/coordinator/batch-setup", { action: "new", courseId: o.id })}>New course</button></td></tr>))}</tbody></table>
          </details>
        )}
        {noEarlier.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <b style={{ fontSize: 13 }}>No earlier course found ({noEarlier.length})</b>
            <ul style={{ listStyle: "none", padding: 0, margin: "4px 0", display: "flex", flexWrap: "wrap", gap: 6 }}>{noEarlier.map((o) => (
              <li key={o.id} style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "3px 8px", fontSize: 12.5 }}><b>{o.code}</b> {o.title}{" "}
                <button type="button" className="act" disabled={busy} onClick={() => post("/api/coordinator/batch-setup", { action: "new", courseId: o.id })}>new course</button></li>))}</ul>
          </div>
        )}
        {open.length > 0 && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { if (confirm(`Mark the ${open.length} course(s) not linked yet as new courses?`)) post("/api/coordinator/batch-flow", { action: "newRest" }); }}>Mark the rest as new</button>}
      </div>
      <ContentSyncManager preselect={preselect} onChanged={() => router.refresh()} />
    </>
  );
}
