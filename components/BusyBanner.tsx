"use client";

import { useEffect, useState } from "react";
import { subscribeBusy, type BusyTask } from "../lib/busy";

/** Floating progress notice for slow actions (see lib/busy.ts). Mounted once
 * in Shell so every page gets it. After a few seconds it reassures the user
 * that a long job is normal and tells them to keep the page open. */
export default function BusyBanner() {
  const [tasks, setTasks] = useState<BusyTask[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => subscribeBusy(setTasks), []);
  useEffect(() => {
    if (tasks.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [tasks.length]);

  if (tasks.length === 0) return null;
  const task = tasks[tasks.length - 1];
  const secs = Math.max(0, Math.floor((now - task.startedAt) / 1000));

  return (
    <div role="status" aria-live="polite" style={{
      position: "fixed", right: 16, bottom: 16, zIndex: 1000, maxWidth: 360, background: "var(--card, #fff)",
      border: "1px solid var(--line, #ccc)", borderLeft: "4px solid var(--brass, #b8860b)", padding: "10px 14px",
      boxShadow: "0 4px 14px rgba(0,0,0,0.18)", fontSize: 12.5,
    }}>
      <style>{`@keyframes busyspin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 16, height: 16, border: "2px solid var(--line, #ccc)", borderTopColor: "var(--brass, #b8860b)", borderRadius: "50%", display: "inline-block", animation: "busyspin 0.8s linear infinite", flexShrink: 0 }} />
        <b>{task.message}</b>
        <span style={{ marginLeft: "auto", color: "var(--slate, #666)" }}>{secs}s</span>
      </div>
      {tasks.length > 1 && <div style={{ color: "var(--slate, #666)", marginTop: 4 }}>+ {tasks.length - 1} more running</div>}
      {secs >= 6 && <div style={{ color: "var(--slate, #666)", marginTop: 6 }}>Still working — big jobs can take up to a minute. Please keep this page open.</div>}
    </div>
  );
}
