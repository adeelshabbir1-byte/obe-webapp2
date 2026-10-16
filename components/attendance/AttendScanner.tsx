"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

type Preview = {
  ok?: boolean; error?: string; claim?: string; phase?: "PRESENT" | "LATE" | "CLOSED"; requireLogin?: boolean; needsLocation?: boolean; sameNetwork?: boolean;
  course?: { code: string; title: string; instructor: string };
  student?: { name: string; rollNumber: string; enrolled: boolean; already: string | null } | null;
};
type Result = { ok: boolean; message: string; status?: string };

/** The token inside a scanned code: either our /attend?t=… link or the bare token. */
function tokenFrom(text: string): string | null {
  try { const u = new URL(text); const t = u.searchParams.get("t"); if (t && u.pathname.replace(/\/+$/, "") === "/attend") return t; } catch { /* not a link */ }
  return /^[a-z0-9]{10,40}\.[A-Za-z0-9_-]{40,80}$/.test(text.trim()) ? text.trim() : null;
}

/** Scan the classroom code and check in. A signed-in student is checked in straight away. */
export default function AttendScanner({ initialToken }: { initialToken: string | null }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [scanning, setScanning] = useState(false);
  const [camErr, setCamErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [roll, setRoll] = useState("");
  const [pw, setPw] = useState("");
  const [useOther, setUseOther] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const autoSent = useRef(false);

  const stopCamera = useCallback(() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; setScanning(false); }, []);
  useEffect(() => () => stopCamera(), [stopCamera]);

  const where = () => new Promise<{ lat?: number; lng?: number; accuracy?: number }>((resolve) => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), () => resolve({}), { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
  });

  const submit = useCallback(async (p: Preview, creds?: { rollNumber: string; password?: string }) => {
    if (!p.claim) return;
    setBusy(true);
    const loc = p.needsLocation ? await where() : {};
    const r = await fetch("/api/attendance/checkin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ claim: p.claim, ...(creds || {}), ...loc }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r) { setResult({ ok: false, message: "No connection. Check your internet and scan again." }); return; }
    if (r.ok) { setResult({ ok: true, message: d.message, status: d.status }); return; }
    // A wrong password or roll number keeps the form open to try again; anything else ends this scan.
    if (r.status === 401 || (r.status === 404 && creds)) { setResult(null); setPreview({ ...p, error: d.error }); return; }
    setResult({ ok: false, message: d.error || "Couldn't check you in." });
  }, []);

  const open = useCallback(async (token: string) => {
    setResult(null); setPreview(null); setUseOther(false); autoSent.current = false;
    const r = await fetch(`/api/attendance/checkin?t=${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => null);
    const d: Preview = r ? await r.json().catch(() => ({})) : { error: "No connection. Check your internet and scan again." };
    if (!r || !r.ok) { setResult({ ok: false, message: d.error || "That code didn't work. Scan the screen again." }); return; }
    setPreview(d);
    // Signed in and enrolled: check in at once (the scan already proves they're looking at the screen).
    if (d.student?.enrolled && !d.student.already && !autoSent.current) { autoSent.current = true; submit(d); }
  }, [submit]);

  useEffect(() => {
    if (!initialToken) return;
    try { window.history.replaceState(null, "", "/attend"); } catch { /* ignore */ }
    open(initialToken);
  }, [initialToken, open]);

  async function startCamera() {
    setCamErr(""); setResult(null); setPreview(null);
    if (!navigator.mediaDevices?.getUserMedia) { setCamErr("This browser can't use the camera here. Open your phone's camera app and point it at the code instead."); return; }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      setScanning(true);
      requestAnimationFrame(() => { if (video.current && stream.current) { video.current.srcObject = stream.current; video.current.play().catch(() => null); } });
    } catch {
      setCamErr("The camera wasn't allowed. Allow it in the browser, or open your phone's camera app and point it at the code.");
    }
  }
  useEffect(() => {
    if (!scanning) return;
    let raf = 0, last = 0, done = false;
    const look = (t: number) => {
      if (done) return;
      raf = requestAnimationFrame(look);
      if (t - last < 140) return;
      last = t;
      const v = video.current, c = canvas.current;
      if (!v || !c || v.readyState < 2 || !v.videoWidth) return;
      const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * w);
      c.width = w; c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, w, h);
      const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
      const token = code ? tokenFrom(code.data) : null;
      if (token) { done = true; stopCamera(); open(token); }
    };
    raf = requestAnimationFrame(look);
    return () => { done = true; cancelAnimationFrame(raf); };
  }, [scanning, open, stopCamera]);

  const box: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 14, padding: 16, background: "var(--card)" };
  const needForm = preview?.ok && (!preview.student || !preview.student.enrolled || useOther) && !result;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {result && (
        <div role="status" style={{ ...box, borderColor: result.ok ? "var(--sage)" : "var(--rust)", background: result.ok ? "#F1F8F3" : "#FDF3F2", textAlign: "center" }}>
          <div style={{ fontSize: 40, lineHeight: 1 }} aria-hidden="true">{result.ok ? "✓" : "!"}</div>
          <p style={{ fontSize: 15, fontWeight: 700, margin: "8px 0" }}>{result.message}</p>
          {result.ok ? <Link href="/student/attendance" style={{ fontSize: 13 }}>See my attendance →</Link> : <button type="button" className="btn btn-brass btn-sm" onClick={startCamera}>Scan again</button>}
        </div>
      )}

      {preview?.ok && preview.course && !result && (
        <div style={box}>
          <div className="small-note">Checking in to</div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{preview.course.code} — {preview.course.title}</div>
          <div className="small-note">{preview.course.instructor}{preview.phase === "LATE" ? " · you'll be marked late" : ""}</div>
          {preview.student?.enrolled && !useOther && (
            <div style={{ marginTop: 10, fontSize: 13.5 }}>
              {preview.student.already ? <>You&apos;re already marked {preview.student.already === "LEAVE" ? "excused" : preview.student.already.toLowerCase()}.</> : busy ? "Checking you in…" : <button type="button" className="btn btn-brass" onClick={() => submit(preview)}>Check in as {preview.student.name}</button>}
              <div><button type="button" className="hp-back" style={{ marginTop: 8 }} onClick={() => setUseOther(true)}>Not {preview.student.name}? Use your own roll number</button></div>
            </div>
          )}
          {preview.student && !preview.student.enrolled && <p style={{ fontSize: 13, color: "var(--rust)", margin: "10px 0 0" }}>{preview.student.name} isn&apos;t enrolled in this course. If this isn&apos;t your phone, check in with your own roll number below.</p>}
          {preview.error && <div className="err" style={{ marginTop: 10 }}>{preview.error}</div>}
          {needForm && (
            <form onSubmit={(e) => { e.preventDefault(); submit(preview, { rollNumber: roll.trim(), password: preview.requireLogin ? pw : undefined }); }} style={{ display: "grid", gap: 8, marginTop: 12 }}>
              <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>Roll number<input value={roll} onChange={(e) => setRoll(e.target.value)} autoComplete="username" required autoCapitalize="characters" style={{ padding: "9px 10px", fontSize: 15 }} /></label>
              {preview.requireLogin && <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>Student portal password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required style={{ padding: "9px 10px", fontSize: 15 }} /></label>}
              <button type="submit" className="btn btn-brass" disabled={busy || !roll.trim() || (preview.requireLogin && !pw)}>{busy ? "Checking in…" : "Check in"}</button>
              <span className="small-note">You have two minutes from your scan.{preview.needsLocation ? " Your location is checked against the classroom." : ""}{preview.sameNetwork ? " Use the classroom Wi-Fi." : ""}</span>
            </form>
          )}
        </div>
      )}

      {!preview?.ok && !result?.ok && (
        <div style={box}>
          {scanning ? (
            <div style={{ display: "grid", gap: 10 }}>
              <video ref={video} playsInline muted style={{ width: "100%", borderRadius: 10, background: "#000", aspectRatio: "3 / 4", objectFit: "cover" }} />
              <canvas ref={canvas} style={{ display: "none" }} />
              <p className="small-note" style={{ margin: 0, textAlign: "center" }}>Point the camera at the code on the screen.</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={stopCamera}>Stop</button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10, textAlign: "center" }}>
              <p style={{ fontSize: 14, margin: 0 }}>Scan the attendance code your instructor is showing.</p>
              <button type="button" className="btn btn-brass" onClick={startCamera}>Open the scanner</button>
              <p className="small-note" style={{ margin: 0 }}>Or open your phone&apos;s camera app and point it at the code — it opens this page by itself.</p>
              {camErr && <div className="err" role="alert">{camErr}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
