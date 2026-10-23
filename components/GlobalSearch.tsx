"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

type Hit = { title: string; sub: string; href: string };
type Group = { type: string; label: string; items: Hit[] };

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim();
const CSS = ".gs{position:relative}.gs-box{display:flex;align-items:center;gap:6px;border:1px solid var(--line,#e2d6d4);background:#fff;border-radius:10px;padding:5px 9px;width:260px}.gs-box input{border:0;outline:0;flex:1;min-width:0;font-size:14px;background:transparent}.gs-box kbd{font-size:11px;border:1px solid #ddd;border-radius:4px;padding:0 5px;color:#777}.gs-panel{position:absolute;right:0;top:calc(100% + 6px);width:min(440px,92vw);max-height:70vh;overflow:auto;background:#fff;border:1px solid #e2d6d4;border-radius:12px;box-shadow:0 18px 40px -18px rgba(60,20,25,.35);z-index:80;padding:6px}.gs-h{font-size:11px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;color:#7A1F2B;padding:8px 10px 4px}.gs-i{display:block;padding:7px 10px;border-radius:8px;color:#221;text-decoration:none}.gs-i[data-on=true],.gs-i:hover{background:#F6ECEA}.gs-t{font-size:14px;font-weight:600}.gs-s{font-size:12px;color:#6b5a58}.gs-e{padding:10px;font-size:13px;color:#555}.gs-open{display:none}@media (max-width:820px){.gs-box{display:none}.gs-open{display:inline-flex}.gs[data-m=true] .gs-box{display:flex;position:fixed;left:12px;right:12px;top:10px;width:auto;z-index:81;padding:9px 11px}.gs[data-m=true] .gs-panel{position:fixed;left:12px;right:12px;top:58px;width:auto}}";

// One search box in the top bar ("/" or Ctrl+K from anywhere): pages of the menu as you type, then students, staff,
// courses, batches, meetings, policies, SAR records, evidence and help — only what the person may see.
export default function GlobalSearch({ pages, student }: { pages: { href: string; label: string }[]; student?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [suggest, setSuggest] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [hit, setHit] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  // "/" or Ctrl+K focuses the box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) { e.preventDefault(); setMobile(true); setOpen(true); setTimeout(() => { input.current?.focus(); input.current?.select(); }, 0); }
    };
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) { setOpen(false); setMobile(false); } };
    document.addEventListener("keydown", onKey); document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, []);

  // Results as you type (a short pause first), and the recent searches when the box is empty.
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/search${term ? `?q=${encodeURIComponent(term)}` : ""}`, { signal: ctl.signal });
        const d = await r.json();
        if (term) { setGroups(d.groups || []); setSuggest(d.suggestions || []); } else setRecent(d.recent || []);
      } catch { /* aborted */ }
      setBusy(false);
    }, term ? 220 : 0);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q, open]);
  useEffect(() => setHit(0), [q]);

  const pageHits: Hit[] = useMemo(() => {
    const n = norm(q); if (n.length < 2) return [];
    const words = n.split(" ");
    return pages.filter((p) => { const l = norm(p.label); return words.every((w) => l.includes(w)); }).slice(0, 5).map((p) => ({ title: p.label, sub: "Page", href: p.href }));
  }, [q, pages]);
  const all: Group[] = q.trim().length >= 2 ? [...(pageHits.length ? [{ type: "page", label: "Pages", items: pageHits }] : []), ...groups] : [];
  const flat = all.flatMap((g) => g.items);

  function go(h: Hit) {
    fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q }) }).catch(() => {});
    setOpen(false); setMobile(false); setQ("");
    if (h.href.startsWith("/api/")) window.location.href = h.href; else router.push(h.href);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); setMobile(false); input.current?.blur(); return; }
    if (!flat.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHit((h) => (h + 1) % flat.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHit((h) => (h - 1 + flat.length) % flat.length); }
    else if (e.key === "Enter") { e.preventDefault(); go(flat[Math.min(hit, flat.length - 1)]); }
  }

  let idx = -1;
  return (
    <div className="gs" ref={wrap} data-m={mobile ? "true" : "false"}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <button type="button" className="tb-icon-btn gs-open" aria-label="Search" onClick={() => { setMobile(true); setOpen(true); setTimeout(() => input.current?.focus(), 0); }}><Search size={18} /></button>
      <div className="gs-box">
        <Search size={15} aria-hidden="true" />
        <input ref={input} type="search" value={q} placeholder={student ? "Search my courses and help…" : "Search students, courses, pages…"} aria-label="Search everything" autoComplete="off" spellCheck={false}
          onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onKeyDown={onKeyDown} />
        {q ? <button type="button" aria-label="Clear" onClick={() => { setQ(""); input.current?.focus(); }} style={{ border: 0, background: "none", padding: 0, cursor: "pointer", display: "inline-flex" }}><X size={14} /></button> : <kbd title="Press / or Ctrl+K from anywhere">/</kbd>}
      </div>
      {open && (
        <div className="gs-panel" role="listbox" aria-label="Search results">
          {!q.trim() && (recent.length ? <><div className="gs-h">Recent searches</div>{recent.map((r) => <a key={r} href="#" className="gs-i" onClick={(e) => { e.preventDefault(); setQ(r); }}><span className="gs-t">{r}</span></a>)}</> : <div className="gs-e">Type a name, roll number, course code or page. Press / from anywhere to come back here.</div>)}
          {q.trim().length === 1 && <div className="gs-e">Keep typing…</div>}
          {all.map((g) => (
            <div key={g.type}>
              <div className="gs-h">{g.label}</div>
              {g.items.map((h) => { idx++; const me = idx; return (
                <a key={`${g.type}-${h.href}-${h.title}`} href={h.href} className="gs-i" role="option" aria-selected={me === hit} data-on={me === hit ? "true" : "false"} onMouseEnter={() => setHit(me)} onClick={(e) => { e.preventDefault(); go(h); }}>
                  <div className="gs-t">{h.title}</div><div className="gs-s">{h.sub}</div>
                </a>
              ); })}
            </div>
          ))}
          {q.trim().length >= 2 && !busy && !all.length && (
            <div className="gs-e">Nothing found for “{q.trim()}”.{suggest.length ? <> Did you mean: {suggest.map((s, i) => <span key={s}>{i ? ", " : " "}<a href="#" onClick={(e) => { e.preventDefault(); setQ(s); }}>{s}</a></span>)}?</> : " Check the spelling or try fewer words."}</div>
          )}
          {busy && q.trim().length >= 2 && !all.length && <div className="gs-e">Searching…</div>}
        </div>
      )}
    </div>
  );
}
