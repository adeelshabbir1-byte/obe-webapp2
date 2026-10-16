"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArticleBody, AskForm, ResultItem, type ArticleCard, type Audience } from "./HelpParts";

type Cat = { key: string; label: string; blurb: string };

/** The Help page: search, browse by topic, read an article, or ask for help. */
export default function HelpCenter({ audience, articles, categories, initialKey }: { audience: Audience; articles: ArticleCard[]; categories: Cat[]; initialKey?: string }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");
  const [results, setResults] = useState<ArticleCard[] | null>(null);
  const [aiOrder, setAiOrder] = useState<string[] | null>(null);
  const [open, setOpen] = useState<ArticleCard | null>(() => articles.find((a) => a.key === initialKey) || null);
  const seq = useRef(0);
  const reader = useRef<HTMLDivElement>(null);
  const cats = useMemo(() => categories.map((c) => ({ ...c, n: articles.filter((a) => a.category === c.key).length })).filter((c) => c.n > 0), [categories, articles]);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setResults(null); setAiOrder(null); return; }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const d = await fetch(`/api/help/search?q=${encodeURIComponent(term)}&audience=${audience}`).then((r) => r.json()).catch(() => ({ results: [] }));
      if (mine !== seq.current) return;
      setResults(d.results || []); setAiOrder(null);
      if (d.aiAvailable) {
        const ai = await fetch("/api/help/rerank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: term, audience }) }).then((r) => r.json()).catch(() => ({ keys: null }));
        if (mine === seq.current && Array.isArray(ai.keys)) setAiOrder(ai.keys);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, audience]);

  const list = results
    ? (aiOrder && aiOrder.length ? [...aiOrder.map((k) => results.find((r) => r.key === k)).filter((x): x is ArticleCard => !!x), ...results.filter((r) => !aiOrder.includes(r.key))] : results)
    : articles.filter((a) => !cat || a.category === cat);

  function show(a: ArticleCard) {
    setOpen(a);
    try { window.history.replaceState(null, "", `?a=${a.key}`); } catch { /* ignore */ }
    setTimeout(() => reader.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }
  function showKey(key: string) { const a = articles.find((x) => x.key === key); if (a) show(a); }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card" style={{ margin: 0 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask a question — e.g. “why is my registration blocked?”" aria-label="Search help"
          style={{ width: "100%", padding: "11px 14px", fontSize: 15, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)" }} />
        {!results && (
          <div className="hp-cats" style={{ marginTop: 12 }}>
            {cats.map((c) => (
              <button key={c.key} type="button" className="hp-cat" aria-pressed={cat === c.key} onClick={() => setCat(cat === c.key ? "" : c.key)}>
                <b>{c.label} <span className="hp-tag">{c.n}</span></b><span>{c.blurb}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", alignItems: "start" }}>
        <div className="card" style={{ margin: 0 }}>
          <div className="hp-section" style={{ marginTop: 0 }} aria-live="polite">
            {results ? (list.length ? `${list.length} answer${list.length > 1 ? "s" : ""}${aiOrder?.length ? " · best match first" : ""}` : "No answer found — try other words, or ask for help") : cat ? cats.find((c) => c.key === cat)?.label : "All guides and questions"}
          </div>
          {list.map((a, i) => <ResultItem key={a.key} a={a} onOpen={show} best={!!results && !!aiOrder?.length && i === 0} />)}
        </div>
        <div ref={reader} className="card" style={{ margin: 0, scrollMarginTop: 80 }}>
          {open ? <ArticleBody a={open} audience={audience} onRelated={showKey} /> : <p className="small-note" style={{ margin: 0 }}>Pick a question on the left to read the answer.</p>}
          <AskForm audience={audience} query={q || open?.title} category={open?.category || results?.[0]?.category} />
        </div>
      </div>
    </div>
  );
}
