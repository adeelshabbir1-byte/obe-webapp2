"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

type Item = { id: string; kind: string; title: string; body: string | null; href: string | null; readAt: string | null; createdAt: string };

function ago(s: string) {
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); return d < 30 ? `${d} d ago` : new Date(s).toLocaleDateString("en-GB");
}

/** The bell in the top bar: unread count, and a dropdown of the latest notifications. Checks again every minute. */
export default function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const router = useRouter();
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<Item[] | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  async function load() {
    try { const r = await fetch("/api/notifications", { cache: "no-store" }); if (!r.ok) return; const d = await r.json(); setUnread(d.unread); setItems(d.items); } catch { /* offline */ }
  }
  useEffect(() => {
    const t = setInterval(load, 60000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function read(id?: string) {
    const r = await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id ? { id } : { all: true }) }).catch(() => null);
    const d = r && r.ok ? await r.json() : null;
    if (d) setUnread(d.unread);
    setItems((xs) => (xs || []).map((x) => (!id || x.id === id ? { ...x, readAt: x.readAt || new Date().toISOString() } : x)));
  }
  async function openItem(it: Item) {
    if (!it.readAt) await read(it.id);
    setOpen(false);
    if (it.href) router.push(it.href);
  }

  return (
    <div className="nb" ref={box}>
      <button type="button" className="tb-icon-btn nb-btn" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} title="Notifications" onClick={() => { setOpen((o) => !o); if (!open) load(); }}>
        <Bell size={17} />
        {unread > 0 && <span className="nb-count">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="nb-panel" role="dialog" aria-label="Notifications">
          <div className="nb-head"><b>Notifications</b>{unread > 0 && <button type="button" onClick={() => read()}>Mark all read</button>}</div>
          <div className="nb-list">
            {items === null && <p className="nb-empty">Loading…</p>}
            {items && items.length === 0 && <p className="nb-empty">Nothing yet. You&apos;ll see approvals, assignments, returned work and deadlines here.</p>}
            {items?.map((it) => (
              <button type="button" key={it.id} className={`nb-item ${it.readAt ? "" : "unread"}`} onClick={() => openItem(it)}>
                <span className="nb-dot" aria-hidden="true" />
                <span className="nb-text"><b>{it.title}</b>{it.body && <span className="nb-body">{it.body}</span>}<span className="nb-time">{ago(it.createdAt)}</span></span>
              </button>
            ))}
          </div>
          <a className="nb-all" href="/notifications">See all notifications</a>
        </div>
      )}
    </div>
  );
}
