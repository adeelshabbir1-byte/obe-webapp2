"use client";
import { useEffect, useMemo, useState } from "react";

// Shown when a page crashes. A short reference code (the server's digest for server errors, else a new code) is shown
// and sent with the automatic report, so it matches the log line and the monitoring entry. Never a raw message, stack
// trace or database error. Try again · Go to my home · Report a problem (adds the person's note to the report).

const newRef = () => { const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)]; return `E-${s}`; };
const homeFor = (path: string) => (path.startsWith("/student") ? "/student/dashboard" : "/dashboard");

export default function ErrorReport({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ref = useMemo(() => (error?.digest ? `E-${error.digest.slice(0, 10)}` : newRef()), [error]);
  const [state, setState] = useState<"sending" | "sent" | "offline" | "noted">("sending");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const support = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";
  const send = async (withNote: boolean) => {
    try {
      const r = await fetch("/api/error-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: window.location.pathname, message: error?.message, digest: error?.digest, ref, stack: error?.stack, note: withNote ? note : "" }) });
      setState(r.ok ? (withNote ? "noted" : "sent") : "offline");
    } catch { setState("offline"); }
  };
  useEffect(() => {
    send(false);
    const w = window as unknown as { __obeSentry?: { withScope: (f: (s: { setTag: (k: string, v: string) => void }) => void) => void; captureException: (e: unknown) => void } };
    w.__obeSentry?.withScope((s) => { s.setTag("ref", ref); w.__obeSentry!.captureException(error); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const mail = `mailto:${support}?subject=${encodeURIComponent(`OBEHUB problem ${ref}`)}&body=${encodeURIComponent(`Reference: ${ref}\nPage: ${typeof window !== "undefined" ? window.location.pathname : ""}\n\nWhat I was doing:\n`)}`;
  return (
    <div role="alert" style={{ maxWidth: 560, margin: "60px auto", padding: 24, background: "#fff", border: "1px solid #E6DADC", borderRadius: 12, fontFamily: "inherit" }}>
      <h2 style={{ marginTop: 0, fontSize: 20 }}>Something went wrong on this page</h2>
      <p style={{ fontSize: 14, color: "#5E5457" }}>
        {state === "sending" ? "Reporting the problem…" : state === "offline" ? "We couldn't report it automatically." : "The problem has been reported to the system administrator."} You can try again or go to your home page.
      </p>
      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        <button className="btn" onClick={() => reset()}>Try again</button>
        <a className="btn btn-secondary" href={typeof window !== "undefined" ? homeFor(window.location.pathname) : "/dashboard"}>Go to my home</a>
        <button className="btn btn-secondary" onClick={() => setOpen((x) => !x)} aria-expanded={open}>Report a problem</button>
      </div>
      {open && (state === "offline" ? (
        <p style={{ fontSize: 13 }}>{support ? <a href={mail}>Email the administrator about it</a> : "Please tell your administrator"} and quote the reference below.</p>
      ) : (
        <div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What were you doing when this happened?" rows={3} style={{ width: "100%", marginTop: 4 }} aria-label="What you were doing" />
          <button className="btn btn-secondary" style={{ marginTop: 6 }} disabled={!note.trim() || state === "noted"} onClick={() => send(true)}>{state === "noted" ? "Sent — thank you" : "Send report"}</button>
        </div>
      ))}
      <p style={{ fontSize: 12.5, color: "#5E5457", marginTop: 14 }}>Reference code: <b style={{ fontFamily: "ui-monospace, monospace", letterSpacing: ".04em" }}>{ref}</b></p>
    </div>
  );
}
