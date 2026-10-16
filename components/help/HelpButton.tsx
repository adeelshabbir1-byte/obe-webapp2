"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, X } from "lucide-react";
import { ArticleBody, AskForm, ResultItem, helpHome, requestsHome, type ArticleCard, type Audience } from "./HelpParts";

/**
 * The "?" in the top bar: a help panel that knows which page you are on. Before you type it suggests the guides for
 * this page; as you type it searches the manual and FAQ (and, when the institute has AI set up, lets the AI pick the
 * best of those results). Anything it can't answer becomes a help request to the right people.
 * Press "?" anywhere (outside a text box) to open it, Esc to close.
 */
export default function HelpButton({ audience = "staff" }: { audience?: Audience }) {
  const path = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [suggestions, setSuggestions] = useState<ArticleCard[]>([]);
  const [results, setResults] = useState<ArticleCard[]>([]);
  const [searched, setSearched] = useState("");
  const [aiOrder, setAiOrder] = useState<string[] | null>(null);
  const [article, setArticle] = useState<ArticleCard | null>(null);
  const [asking, setAsking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const seq = useRef(0);
  // The top bar uses backdrop-filter, which would trap a fixed panel inside it; the panel is rendered on <body> instead.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const close = useCallback(() => { setOpen(false); setTimeout(() => opener.current?.focus(), 0); }, []);

  // Keyboard: "?" opens (unless typing somewhere), Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "?" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setOpen(true); }
      else if (e.key === "Escape" && open) close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  // Suggestions for the page, whenever the panel opens or the page changes.
  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch(`/api/help/search?path=${encodeURIComponent(path)}&audience=${audience}`).then((r) => r.json()).then((d) => { if (live) setSuggestions(d.suggestions || []); }).catch(() => null);
    setTimeout(() => input.current?.focus(), 30);
    return () => { live = false; };
  }, [open, path, audience]);

  // Search as you type (debounced). An older answer arriving late never replaces a newer one.
  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults([]); setSearched(""); setAiOrder(null); return; }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      const d = await fetch(`/api/help/search?q=${encodeURIComponent(term)}&path=${encodeURIComponent(path)}&audience=${audience}`).then((r) => r.json()).catch(() => ({ results: [] }));
      if (mine !== seq.current) return;
      setResults(d.results || []); setSearched(term); setAiOrder(null);
      if (d.aiAvailable) {
        const ai = await fetch("/api/help/rerank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: term, path, audience }) }).then((r) => r.json()).catch(() => ({ keys: null }));
        if (mine === seq.current && Array.isArray(ai.keys)) setAiOrder(ai.keys);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, path, audience]);

  const ordered = aiOrder && aiOrder.length
    ? [...aiOrder.map((k) => results.find((r) => r.key === k)).filter((x): x is ArticleCard => !!x), ...results.filter((r) => !aiOrder.includes(r.key))]
    : results;

  async function openRelated(key: string) {
    const d = await fetch(`/api/help/search?key=${encodeURIComponent(key)}&audience=${audience}`).then((r) => r.json()).catch(() => null);
    if (d?.article) setArticle(d.article);
  }

  return (
    <>
      <button ref={opener} type="button" className="tb-icon-btn hp-launch" onClick={() => setOpen(true)} aria-label="Help" title="Help (press ?)" aria-haspopup="dialog" aria-expanded={open}>
        <CircleHelp size={18} />
      </button>
      {open && mounted && createPortal(
        <>
          <div className="hp-overlay" onClick={close} aria-hidden="true" />
          <div className="hp-panel" role="dialog" aria-modal="true" aria-label="Help">
            <div className="hp-head">
              <h2>Help</h2>
              <nav>
                <Link href={helpHome(audience)} onClick={close}>Help center</Link>
                <Link href={requestsHome(audience)} onClick={close}>My requests</Link>
              </nav>
              <button type="button" className="tb-icon-btn" onClick={close} aria-label="Close help"><X size={17} /></button>
            </div>
            <div className="hp-search">
              <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setArticle(null); setAsking(false); }} placeholder="Ask a question — e.g. “who can reset a password?”" aria-label="Search help" />
            </div>
            <div className="hp-body">
              {article ? (
                <>
                  <button type="button" className="hp-back" onClick={() => setArticle(null)}>← Back</button>
                  <ArticleBody a={article} audience={audience} onNavigate={close} onRelated={openRelated} />
                  <AskForm audience={audience} query={q || article.title} category={article.category} path={path} />
                </>
              ) : q.trim() ? (
                <>
                  <div className="hp-section" aria-live="polite">{searched !== q.trim() ? "Searching…" : ordered.length ? `${ordered.length} answer${ordered.length > 1 ? "s" : ""}${aiOrder && aiOrder.length ? " · best match first" : ""}` : "No answer found"}</div>
                  {ordered.map((a, i) => <ResultItem key={a.key} a={a} onOpen={setArticle} best={!!aiOrder?.length && i === 0} />)}
                  {searched === q.trim() && (!ordered.length || (aiOrder && aiOrder.length === 0)) && (
                    <p style={{ fontSize: 12.5, color: "var(--slate)" }}>{ordered.length ? "These may not answer it exactly." : "Try other words, or ask the people who can help."}</p>
                  )}
                  {searched === q.trim() && (asking || !ordered.length
                    ? <AskForm audience={audience} query={q} category={ordered[0]?.category} path={path} />
                    : <button type="button" className="btn btn-sm btn-secondary" style={{ marginTop: 10 }} onClick={() => setAsking(true)}>None of these — ask for help</button>)}
                </>
              ) : (
                <>
                  {suggestions.length > 0 && <div className="hp-section">Suggested for this page</div>}
                  {suggestions.map((a) => <ResultItem key={a.key} a={a} onOpen={setArticle} />)}
                  <div className="hp-section">More</div>
                  <Link href={helpHome(audience)} className="hp-item" onClick={close}><b>Browse every guide and FAQ</b><span>By topic: account, people and roles, courses and OBE, registration, exams, FYP…</span></Link>
                  {audience === "staff" && <Link href="/help/permissions" className="hp-item" onClick={close}><b>Who can do what</b><span>Every permission in the system, with the page where it is done.</span></Link>}
                  {asking ? <AskForm audience={audience} path={path} /> : <button type="button" className="btn btn-sm btn-secondary" style={{ marginTop: 10 }} onClick={() => setAsking(true)}>Ask for help</button>}
                </>
              )}
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
