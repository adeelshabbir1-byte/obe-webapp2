"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Status = { exists: boolean; flagged: boolean; notDemo: boolean; steps: string[]; missing: string[]; demoCourse: { id: string; code: string; title: string; result: string; instructor: { name: string; username: string } | null } | null; loginsOn: boolean; readyAt: string | null; resetAt: string | null; state: { overall?: number | null; open?: string[]; demoCourse?: string | null } };
const KEY = "obehub.demoReady.next";

async function call(body: Record<string, unknown>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch("/api/admin/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
    if (r.ok) return j;
    if (attempt === 2 || r.status < 500) throw new Error(j.error || `HTTP ${r.status}`);
  }
}

/** "Make demo ready": builds the whole demo institute step by step (each step one call), with progress; "Reset demo"
 *  puts the one demo course back to waiting for its final-exam marks. */
export default function DemoReadyRunner({ status }: { status: Status }) {
  const router = useRouter();
  const total = status.steps.length;
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState(-1);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [resume, setResume] = useState<number | null>(null);
  useEffect(() => { try { const n = Number(localStorage.getItem(KEY)); if (n > 0 && n < total) setResume(n); } catch { /* no storage */ } }, [total]);
  const save = (n: number | null) => { try { if (n === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(n)); } catch { /* no storage */ } };

  async function run(from: number) {
    if (from === 0 && !confirm(`Make demo ready: the demo institute is deleted and built again (${total} steps, about 10–30 minutes). Keep this page open. Continue?`)) return;
    if (status.missing.length && !confirm(`${status.missing.length} migration(s) are not run yet (${status.missing.slice(0, 5).join(", ")}${status.missing.length > 5 ? " …" : ""}). Parts of the demo that need them will be empty. Run them first, or continue anyway?`)) return;
    setBusy(true); setErr(""); setResume(null);
    try {
      for (let i = from; i < total; i++) {
        setAt(i); setMsg(`${status.steps[i]} (${i + 1}/${total})`);
        for (let pass = 0; pass < 80; pass++) {
          const r = await call({ step: "ready", index: i });
          if (r.info) setLog((l) => [`${i + 1}. ${status.steps[i]} — ${r.info}`, ...l].slice(0, 8));
          if (!r.again) break;
          setMsg(`${status.steps[i]} — pass ${pass + 2} (${i + 1}/${total})`);
        }
        save(i + 1);
      }
      save(null); setAt(total); setMsg("The demo is ready.");
      router.refresh();
    } catch (e) {
      setErr(`${e instanceof Error ? e.message : e}`);
      setResume(Math.max(0, at));
    }
    setBusy(false);
  }
  async function reset() {
    if (!confirm("Reset demo: the demo course's final-exam marks, its result and its publication are removed, so the live demo can start again. Continue?")) return;
    setBusy(true); setErr("");
    try { const r = await call({ step: "reset" }); setMsg(`Reset: ${r.removed} final-exam marks removed. The demo course is waiting for its final marks again.`); router.refresh(); }
    catch (e) { setErr(String(e instanceof Error ? e.message : e)); }
    setBusy(false);
  }
  async function logins(on: boolean) {
    setBusy(true); setErr("");
    try { await call({ step: "logins", on }); router.refresh(); } catch (e) { setErr(String(e instanceof Error ? e.message : e)); }
    setBusy(false);
  }
  const pct = at < 0 ? 0 : Math.round((Math.min(at, total) / total) * 100);
  return (
    <div className="card" style={{ marginBottom: 16, borderLeft: "4px solid var(--brass)" }}>
      <h2 style={{ fontSize: 17, marginTop: 0 }}>Make demo ready</h2>
      <p style={{ fontSize: 13, color: "var(--slate)", marginTop: 0 }}>
        One run builds the whole demo institute: Computing (BS CS, BS AI) and Management Sciences (BBA), the organisation chart, 4 batches per program
        (S1, S3, S5, S7) of 120 students, approved plans, BOS-approved course codes, the semester finished — with <b>one course left without its
        final-exam marks</b> for the live demo. Only an institute flagged as a demo is ever touched.
      </p>
      {status.notDemo && <div className="err" style={{ marginBottom: 8 }}>An institute with the demo head&apos;s login exists but is not flagged as a demo. Nothing will be changed.</div>}
      {status.missing.length > 0 && (
        <div style={{ background: "#FBF3E4", color: "#7A520C", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 10 }}>
          <b>Run these migrations first</b> ({status.missing.length}): {status.missing.join(", ")}
        </div>
      )}
      {status.demoCourse && (
        <div style={{ fontSize: 13, marginBottom: 10 }}>
          Demo course: <b>{status.demoCourse.code} {status.demoCourse.title}</b> ({status.demoCourse.instructor?.name || "—"}) · result: <b>{status.demoCourse.result}</b>
          {status.readyAt && <> · ready since {new Date(status.readyAt).toLocaleString()}</>}
          {typeof status.state.overall === "number" && <> · readiness {status.state.overall}%</>}
          {status.resetAt && <> · last reset {new Date(status.resetAt).toLocaleString()}</>}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn" disabled={busy || status.notDemo} onClick={() => run(0)} data-make-demo-ready>Make demo ready</button>
        {resume !== null && !busy && <button className="btn btn-brass" disabled={status.notDemo} onClick={() => run(resume)}>Continue from step {resume + 1}</button>}
        <button className="btn btn-brass" disabled={busy || !status.demoCourse} onClick={reset} data-reset-demo>Reset demo</button>
        {status.flagged && <button className="btn btn-brass" disabled={busy} onClick={() => logins(!status.loginsOn)}>{status.loginsOn ? "Switch demo logins off" : "Switch demo logins on"}</button>}
        {status.flagged && status.loginsOn && <a href="/demo" target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>Open the demo logins and script →</a>}
      </div>
      {(busy || msg) && (
        <div style={{ marginTop: 12 }}>
          <div style={{ height: 8, background: "#E6E9EF", borderRadius: 4 }}><div style={{ width: `${pct}%`, height: 8, background: "var(--accent, #2F6FB0)", borderRadius: 4, transition: "width .3s" }} /></div>
          <div style={{ fontSize: 13, marginTop: 4 }}>{msg}</div>
          {log.length > 0 && <ul style={{ fontSize: 12, color: "var(--slate)", margin: "6px 0 0 18px" }}>{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
        </div>
      )}
      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
      {!!status.state.open?.length && !busy && (
        <details style={{ marginTop: 10, fontSize: 13 }}>
          <summary>Readiness checks still open ({status.state.open.length})</summary>
          <ul style={{ margin: "4px 0 0 18px" }}>{status.state.open.map((o) => <li key={o}>{o}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
