"use client";
import { useEffect, useState } from "react";

// Shown when a page crashes: the error is reported to the Super User automatically; the person can add a note and retry.
export default function ErrorReport({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [sent, setSent] = useState<"" | "auto" | "note">("");
  const [note, setNote] = useState("");
  const send = (withNote: boolean) =>
    fetch("/api/error-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: window.location.href, message: error.message, digest: error.digest, stack: error.stack, note: withNote ? note : "" }) })
      .then((r) => r.ok && setSent(withNote ? "note" : "auto")).catch(() => null);
  useEffect(() => { send(false); /* once per crash */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={{ maxWidth: 560, margin: "60px auto", padding: 24, background: "#fff", border: "1px solid #E6DADC", borderRadius: 12, fontFamily: "inherit" }}>
      <h2 style={{ marginTop: 0, fontSize: 20 }}>Something went wrong on this page</h2>
      <p style={{ fontSize: 14, color: "#5E5457" }}>{sent ? "The problem has been reported to the system administrator automatically." : "Reporting the problem…"} You can try again, or go back.</p>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <button className="btn" onClick={() => reset()}>Try again</button>
        <button className="btn btn-secondary" onClick={() => history.back()}>Go back</button>
        <a className="btn btn-secondary" href="/dashboard">Home</a>
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional: what were you doing when this happened?" rows={3} style={{ width: "100%", marginTop: 8 }} />
      <button className="btn btn-secondary" style={{ marginTop: 6 }} disabled={!note.trim() || sent === "note"} onClick={() => send(true)}>{sent === "note" ? "Note sent — thank you" : "Send note"}</button>
      <p style={{ fontSize: 11.5, color: "#8A7F82", marginTop: 12 }}>Error code: {error.digest || error.message.slice(0, 80)}</p>
    </div>
  );
}
