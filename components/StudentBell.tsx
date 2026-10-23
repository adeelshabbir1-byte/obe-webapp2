"use client";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";

type N = { id: string; title: string; body: string | null; href: string | null; readAt: string | null; createdAt: string };
const when = (d: string) => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// The bell in the student portal: notices from the institute (counselling bookings, call-ins, reminders …).
export default function StudentBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<N[]>([]);
  const [unread, setUnread] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const load = () => fetch("/api/student/notices").then((r) => r.json()).then((d) => { setItems(d.items || []); setUnread(d.unread || 0); }).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 120_000); const off = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); }; document.addEventListener("mousedown", off); return () => { clearInterval(t); document.removeEventListener("mousedown", off); }; }, []);
  async function toggle() { const next = !open; setOpen(next); if (next && unread) { await fetch("/api/student/notices", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {}); setUnread(0); } }
  return (
    <div ref={box} style={{ position: "relative" }}>
      <button type="button" className="tb-icon-btn" aria-label={unread ? `${unread} new notices` : "Notices"} onClick={toggle} style={{ position: "relative" }}>
        <Bell size={18} />{unread > 0 && <span style={{ position: "absolute", top: -3, right: -3, background: "#B3261E", color: "#fff", borderRadius: 9, fontSize: 10, fontWeight: 700, padding: "0 5px", lineHeight: "16px" }}>{unread}</span>}
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", width: "min(340px, 90vw)", maxHeight: 420, overflow: "auto", background: "#fff", border: "1px solid #e2d6d4", borderRadius: 12, boxShadow: "0 18px 40px -18px rgba(60,20,25,.35)", zIndex: 80, padding: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#7A1F2B", padding: "6px 8px" }}>Notices</div>
          {items.length === 0 && <div style={{ padding: 10, fontSize: 13, color: "#666" }}>Nothing yet.</div>}
          {items.map((n) => (
            <a key={n.id} href={n.href || "#"} style={{ display: "block", padding: "8px 10px", borderRadius: 8, textDecoration: "none", color: "#221", background: n.readAt ? undefined : "#FBF3F1" }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{n.title}</div>
              {n.body && <div style={{ fontSize: 12.5, color: "#555" }}>{n.body}</div>}
              <div style={{ fontSize: 11, color: "#888" }}>{when(n.createdAt)}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
