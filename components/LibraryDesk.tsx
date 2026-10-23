"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Loan = { id: string; title: string; issuedAt: string; dueAt: string; returnedAt: string | null; renewals: number; fineNow: number; finePaid: number; fineWaived: boolean; outcome: string | null };
type MemberData = { member: { type: string; name: string; ref: string }; books: number; fines: number; loans: Loan[] };
const day = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

async function post(body: Record<string, unknown>) {
  const r = await fetch("/api/library", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  return r.ok ? { ok: true, msg: d.message || "Done." } : { ok: false, msg: d.error || "Could not save." };
}

// The circulation desk: scan (or type) the member and the book's accession number. A USB barcode scanner types into
// the box and presses Enter; on a phone the camera can read the code where the browser supports it.
export default function LibraryDesk() {
  const router = useRouter();
  const [mode, setMode] = useState<"issue" | "return">("issue");
  const [member, setMember] = useState("");
  const [acc, setAcc] = useState("");
  const [damaged, setDamaged] = useState(false);
  const [data, setData] = useState<MemberData | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(false);
  const accRef = useRef<HTMLInputElement>(null), memRef = useRef<HTMLInputElement>(null), video = useRef<HTMLVideoElement>(null);
  const canScan = typeof window !== "undefined" && "BarcodeDetector" in window;

  async function lookup(q = member) {
    if (!q.trim()) return;
    const r = await fetch(`/api/library?member=${encodeURIComponent(q.trim())}`);
    const d = await r.json().catch(() => ({}));
    if (r.ok) { setData(d); setMsg(null); setTimeout(() => accRef.current?.focus(), 0); } else { setData(null); setMsg({ ok: false, t: d.error || "Not found." }); }
  }
  async function go() {
    if (!acc.trim()) return;
    if (mode === "issue" && !data) { setMsg({ ok: false, t: "Scan the member's card (roll number or username) first." }); memRef.current?.focus(); return; }
    setBusy(true);
    const r = await post(mode === "issue" ? { action: "issue", accessionNo: acc, member: data!.member.ref } : { action: "return", accessionNo: acc, damaged });
    setBusy(false); setMsg({ ok: r.ok, t: r.msg }); setAcc(""); setDamaged(false); accRef.current?.focus();
    if (r.ok) { if (data) lookup(data.member.ref); router.refresh(); }
  }
  async function loanAction(body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    const r = await post(body); setMsg({ ok: r.ok, t: r.msg }); if (data) lookup(data.member.ref);
  }

  // Camera scanning (BarcodeDetector): fills the box that has focus — the book, or the member when none is loaded.
  useEffect(() => {
    if (!camera) return;
    let stop = false, stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (video.current) { video.current.srcObject = stream; await video.current.play(); }
        const det = new (window as unknown as { BarcodeDetector: new (o: object) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector({ formats: ["qr_code", "code_128", "code_39", "ean_13"] });
        while (!stop) {
          const codes = video.current ? await det.detect(video.current).catch(() => []) : [];
          if (codes[0]?.rawValue) { const v = codes[0].rawValue.trim(); if (!data && mode === "issue") { setMember(v); lookup(v); } else setAcc(v); setCamera(false); break; }
          await new Promise((r) => setTimeout(r, 300));
        }
      } catch { setMsg({ ok: false, t: "The camera could not be opened. Use a scanner or type the number." }); setCamera(false); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [camera]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="card">
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button type="button" className={`btn btn-sm ${mode === "issue" ? "btn-brass" : "btn-secondary"}`} onClick={() => { setMode("issue"); setTimeout(() => (data ? accRef : memRef).current?.focus(), 0); }}>Issue</button>
        <button type="button" className={`btn btn-sm ${mode === "return" ? "btn-brass" : "btn-secondary"}`} onClick={() => { setMode("return"); setTimeout(() => accRef.current?.focus(), 0); }}>Return</button>
        {canScan && <button type="button" className="btn btn-sm btn-secondary" onClick={() => setCamera(!camera)}>{camera ? "Stop camera" : "Scan with camera"}</button>}
      </div>
      {camera && <video ref={video} muted playsInline style={{ width: "100%", maxWidth: 360, borderRadius: 8, marginBottom: 8 }} />}
      {mode === "issue" && (
        <form onSubmit={(e) => { e.preventDefault(); lookup(); }} style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          <input ref={memRef} className="input" autoFocus value={member} onChange={(e) => setMember(e.target.value)} placeholder="Member: roll number, username or email" style={{ flex: "1 1 240px" }} aria-label="Member" />
          <button type="submit" className="btn btn-secondary btn-sm">Find member</button>
        </form>
      )}
      <form onSubmit={(e) => { e.preventDefault(); go(); }} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input ref={accRef} className="input" value={acc} onChange={(e) => setAcc(e.target.value)} placeholder="Book: accession number (scan the barcode)" style={{ flex: "1 1 240px", fontSize: 16 }} aria-label="Accession number" autoFocus={mode === "return"} />
        {mode === "return" && <label style={{ fontSize: 13, display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={damaged} onChange={(e) => setDamaged(e.target.checked)} /> damaged</label>}
        <button type="submit" className="btn btn-brass btn-sm" disabled={busy || !acc.trim()}>{mode === "issue" ? "Issue" : "Return"}</button>
      </form>
      {msg && <p role="status" style={{ margin: "8px 0 0", fontWeight: 700, color: msg.ok ? "#1E6B3A" : "#B3261E" }}>{msg.t}</p>}
      {data && (
        <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 10 }}>
          <div style={{ fontSize: 15 }}><b>{data.member.name}</b> · {data.member.ref} · {data.member.type === "STUDENT" ? "student" : "staff"} — <b>{data.books}</b> book(s) out{data.fines ? <>, <b style={{ color: "#B3261E" }}>Rs {data.fines.toLocaleString("en-PK")} fines due</b></> : ""}</div>
          {data.loans.length > 0 && (
            <table className="table" style={{ fontSize: 13, marginTop: 6 }}>
              <thead><tr><th>Book</th><th>Due</th><th>Fine</th><th></th></tr></thead>
              <tbody>{data.loans.map((l) => {
                const late = !l.returnedAt && new Date(l.dueAt) < new Date(); const owed = Math.max(0, l.fineNow - l.finePaid);
                return (
                  <tr key={l.id}>
                    <td>{l.title}<div className="small-note" style={{ margin: 0 }}>{l.returnedAt ? `${l.outcome === "LOST" ? "lost" : "returned"} ${day(l.returnedAt)}` : `issued ${day(l.issuedAt)}${l.renewals ? ` · renewed ${l.renewals}×` : ""}`}</div></td>
                    <td style={{ color: late ? "#B3261E" : undefined, fontWeight: late ? 700 : 400 }}>{l.returnedAt ? "—" : day(l.dueAt)}</td>
                    <td>{owed ? `Rs ${owed.toLocaleString("en-PK")}` : "—"}</td>
                    <td style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {!l.returnedAt && !late && <button type="button" className="btn btn-secondary btn-sm" onClick={() => loanAction({ action: "renew", loanId: l.id })}>Renew</button>}
                      {!l.returnedAt && <button type="button" className="btn btn-secondary btn-sm" onClick={() => loanAction({ action: "lost", loanId: l.id }, "Mark this book lost? Its price is added to the fine.")}>Lost</button>}
                      {owed > 0 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { const a = prompt(`Amount paid (Rs), up to ${owed}`, String(owed)); if (a) loanAction({ action: "pay", loanId: l.id, amount: Number(a) }); }}>Fine paid</button>}
                      {owed > 0 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => { const n = prompt("Why is the fine waived?"); if (n) loanAction({ action: "pay", loanId: l.id, waive: true, note: n }); }}>Waive</button>}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
          <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => { setData(null); setMember(""); setTimeout(() => memRef.current?.focus(), 0); }}>Next member</button>
        </div>
      )}
    </div>
  );
}
