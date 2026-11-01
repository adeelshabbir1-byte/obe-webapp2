"use client";

import { useEffect, useState } from "react";

/**
 * Registers the service worker (installable app, push), offers "Install app" when the browser allows it, and
 * "Turn on notifications" once VAPID keys are set (Adeel prompt §4). Also replays marks saved while offline.
 */
export default function PwaRegister() {
  const [install, setInstall] = useState<(Event & { prompt: () => void }) | null>(null);
  const [canPush, setCanPush] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const onPrompt = (e: Event) => { e.preventDefault(); setInstall(e as never); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    let asked = false; try { asked = localStorage.getItem("push-asked") === "1"; } catch { /* ignore */ }
    if (!asked && "PushManager" in window && Notification.permission === "default") fetch("/api/push").then((r) => r.json()).then((d) => setCanPush(!!d.key)).catch(() => null);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  async function turnOn() {
    try {
      localStorage.setItem("push-asked", "1");
      const { key } = await fetch("/api/push").then((r) => r.json());
      if (!key || (await Notification.requestPermission()) !== "granted") { setCanPush(false); return; }
      const reg = await navigator.serviceWorker.ready;
      const pad = "=".repeat((4 - (key.length % 4)) % 4), raw = atob((key + pad).replace(/-/g, "+").replace(/_/g, "/"));
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) });
      await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
      setMsg("Notifications on ✓"); setCanPush(false);
    } catch { setMsg("Couldn't turn on notifications in this browser."); setCanPush(false); }
  }
  if (!install && !canPush && !msg) return null;
  return (
    <div className="no-print" style={{ position: "fixed", bottom: 14, right: 14, zIndex: 900, display: "flex", gap: 8, background: "#fff", border: "1px solid #ddd", borderRadius: 10, padding: "6px 10px", boxShadow: "0 2px 10px rgba(0,0,0,.12)", fontSize: 13 }}>
      {install && <button type="button" className="btn btn-sm" onClick={() => { install.prompt(); setInstall(null); }}>Install app</button>}
      {canPush && <button type="button" className="btn btn-sm" onClick={turnOn}>Turn on notifications</button>}
      {msg && <span>{msg}</span>}
      <button type="button" className="btn-link" onClick={() => { setInstall(null); setCanPush(false); setMsg(""); try { localStorage.setItem("push-asked", "1"); } catch { /* ignore */ } }} aria-label="Close">×</button>
    </div>
  );
}
