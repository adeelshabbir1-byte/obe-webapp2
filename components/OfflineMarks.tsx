"use client";

import { useEffect, useState } from "react";

// Offline marks entry (Adeel prompt §4): a mark saved while the connection is down is kept on this device and sent
// when back online ("3 marks waiting to sync"). A mark changed meanwhile on the server is shown for the teacher to
// choose (keep mine / keep theirs) — never overwritten silently. Blank stays blank, 0 stays 0 (the body is sent as typed).
type Q = { url: string; body: string; at: string; conflict?: string };
const KEY = "obehub-offline-marks";
const read = (): Q[] => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const write = (q: Q[]) => { try { localStorage.setItem(KEY, JSON.stringify(q)); } catch { /* full */ } };
// Marks and lecture attendance (3 Nov 2026) are kept offline the same way.
const isMarks = (url: string, method?: string) => (method || "GET").toUpperCase() === "PUT" && (/\/api\/instructor\/courses\/[^/]+\/marks(\?|$)/.test(url) || /\/api\/instructor\/courses\/[^/]+\/attendance\/[^/?]+$/.test(url));
const isAttendance = (url: string) => /\/attendance\//.test(url);

export default function OfflineMarks() {
  const [q, setQ] = useState<Q[]>([]);
  useEffect(() => {
    setQ(read());
    const w = window as unknown as { __offlinePatched?: boolean };
    if (!w.__offlinePatched) {
      w.__offlinePatched = true;
      const orig = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        try { return await orig(input, init); }
        catch (e) {
          if (!isMarks(url, init?.method) || typeof init?.body !== "string") throw e;
          const list = read(); list.push({ url, body: init.body, at: new Date().toISOString() }); write(list); setQ(list);
          return new Response(JSON.stringify({ queued: true, mark: null }), { status: 202, headers: { "Content-Type": "application/json" } });
        }
      };
      (window as unknown as { __origFetch: typeof fetch }).__origFetch = orig;
    }
    const sync = async () => {
      const list = read(); if (!list.length || !navigator.onLine) return;
      const orig = (window as unknown as { __origFetch: typeof fetch }).__origFetch || fetch;
      const left: Q[] = [];
      for (const item of list) {
        if (item.conflict) { left.push(item); continue; }
        try {
          const r = await orig(item.url, { method: "PUT", headers: { "Content-Type": "application/json", "x-offline-at": item.at }, body: item.body });
          if (r.status === 409) { const d = await r.json().catch(() => ({})); left.push({ ...item, conflict: d.error || "Changed meanwhile." }); }
          else if (!r.ok) left.push({ ...item, conflict: (await r.json().catch(() => ({}))).error || "Not saved." });
        } catch { left.push(item); }
      }
      write(left); setQ(left);
    };
    window.addEventListener("online", sync);
    const t = setInterval(sync, 30000);
    sync();
    return () => { window.removeEventListener("online", sync); clearInterval(t); };
  }, []);
  if (!q.length) return null;
  const conflicts = q.filter((x) => x.conflict);
  const resolve = async (i: number, keepMine: boolean) => {
    const list = read(); const item = list[i];
    if (keepMine) await fetch(item.url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: item.body }).catch(() => null);
    list.splice(i, 1); write(list); setQ(list);
  };
  return (
    <div role="status" className="no-print" style={{ background: "#FFF8E1", border: "1px solid #E0B54A", borderRadius: 8, padding: "6px 10px", margin: "0 0 10px", fontSize: 13 }}>
      <b>{q.length - conflicts.length} change{q.length - conflicts.length === 1 ? "" : "s"} waiting to sync{q.some((x) => isAttendance(x.url)) ? ` (${q.filter((x) => isAttendance(x.url)).length} attendance)` : ""}</b>{!navigator.onLine ? " — you are offline; they are kept on this device." : ""}
      {conflicts.map((c) => { const i = q.indexOf(c); let who = ""; try { const b = JSON.parse(c.body); who = `${b.studentId?.slice(-5)} · score ${b.score === null || b.score === "" ? "absent" : b.score}`; } catch { /* */ } return <div key={i}>⚠ {who}: {c.conflict} <button type="button" className="btn-link" onClick={() => resolve(i, true)}>Keep mine</button> · <button type="button" className="btn-link" onClick={() => resolve(i, false)}>Keep theirs</button></div>; })}
    </div>
  );
}
