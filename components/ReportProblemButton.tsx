"use client";
import { useState } from "react";

// "Report a problem" (pilot): a small button in the bottom corner of every page. It takes a screenshot of the page
// (html2canvas); if that fails the person can paste or upload an image. They add a note and the kind.
export default function ReportProblemButton() {
  const [open, setOpen] = useState(false);
  const [shot, setShot] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [note, setNote] = useState("");
  const [kind, setKind] = useState("BUG");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function start() {
    setMsg(null); setNote(""); setKind("BUG"); setShot(null); setCapturing(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(document.body, { logging: false, useCORS: true, scale: Math.min(1, 1600 / Math.max(1, window.innerWidth)), windowWidth: document.documentElement.clientWidth, height: Math.min(document.body.scrollHeight, 4000), ignoreElements: (el) => (el as HTMLElement).dataset?.reportProblem === "1" });
      setShot(canvas.toDataURL("image/jpeg", 0.7));
    } catch { setShot(null); }
    setCapturing(false); setOpen(true);
  }
  const fromFile = (f: File | null | undefined) => { if (!f || !f.type.startsWith("image/")) return; const r = new FileReader(); r.onload = () => setShot(String(r.result)); r.readAsDataURL(f); };
  async function send() {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/problem-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note, kind, url: window.location.pathname + window.location.search, browser: navigator.userAgent, screenshot: shot }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg({ ok: false, text: j.error || `HTTP ${r.status}` }); return; }
    setMsg({ ok: true, text: "Thank you — sent. You'll hear back in the bell." });
    setTimeout(() => setOpen(false), 1400);
  }
  return (
    <div data-report-problem="1" className="no-print">
      <button type="button" onClick={start} disabled={capturing} data-report-button style={{ position: "fixed", right: 14, bottom: 14, zIndex: 60, background: "#7A1F2B", color: "#fff", border: "none", borderRadius: 18, padding: "7px 12px", fontSize: 12.5, boxShadow: "0 2px 8px rgba(0,0,0,.25)", cursor: "pointer" }}>{capturing ? "Capturing…" : "⚑ Report a problem"}</button>
      {open && (
        <div role="dialog" aria-label="Report a problem" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onPaste={(e) => fromFile(Array.from(e.clipboardData.files)[0])}>
          <div className="card" style={{ width: "min(560px, 100%)", maxHeight: "90vh", overflow: "auto", margin: 0 }}>
            <h3 style={{ marginTop: 0, fontSize: 16 }}>Report a problem</h3>
            <div style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap" }} role="radiogroup" aria-label="Kind">
              {[["BUG", "Bug"], ["CONFUSING", "Confusing"], ["MISSING", "Missing feature"]].map(([k, l]) => <label key={k} style={{ fontSize: 13 }}><input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} /> {l}</label>)}
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="What happened, or what did you expect?" style={{ width: "100%" }} aria-label="Note" data-report-note />
            <div style={{ margin: "8px 0", fontSize: 12.5 }}>
              {shot ? <><img src={shot} alt="Screenshot of the page" style={{ maxWidth: "100%", maxHeight: 220, border: "1px solid #DDD", borderRadius: 6 }} /><div><button type="button" className="tw-linkbtn" onClick={() => setShot(null)}>Remove the screenshot</button></div></>
                : <span>No screenshot. Paste one here (Ctrl+V) or <label style={{ textDecoration: "underline", cursor: "pointer" }}>upload an image<input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => fromFile(e.target.files?.[0])} /></label>.</span>}
            </div>
            <p className="small-note" style={{ margin: "0 0 8px" }}>Sent with it: this page&apos;s address, your name and role, your browser and the time.</p>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-sm" disabled={busy || note.trim().length < 3} onClick={send} data-report-send>{busy ? "Sending…" : "Send"}</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            </div>
            {msg && <div className={msg.ok ? "small-note" : "err"} style={{ marginTop: 6 }}>{msg.text}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
