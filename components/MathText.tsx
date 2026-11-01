"use client";
import katex from "katex";
import "katex/dist/katex.min.css";
import { useEffect, useRef, useState } from "react";
import { mathSegments } from "../lib/qbankCore";

// Text with LaTeX equations ($…$, $$…$$), rendered by KaTeX (chemistry with \ce{…}) — the same in the bank, the
// paper preview and online quizzes. Code between ``` fences is shown as a code block.
let mhchem: Promise<unknown> | null = null;
export default function MathText({ text, block }: { text: string; block?: boolean }) {
  const [, setReady] = useState(0);
  useEffect(() => { if (/\\ce\{/.test(text)) { mhchem ||= import("katex/contrib/mhchem" as string); mhchem.then(() => setReady((x) => x + 1)).catch(() => null); } }, [text]);
  const parts = String(text || "").split(/```(?:\w+)?\n?([\s\S]*?)```/);
  return (
    <span style={{ whiteSpace: "pre-wrap", display: block ? "block" : undefined }} data-math-text>
      {parts.map((p, i) => i % 2 ? <pre key={i} className="code-block" style={{ background: "var(--paper-2, #f6f1f2)", padding: 8, borderRadius: 6, overflowX: "auto", fontSize: 12.5 }}><code>{p}</code></pre> :
        mathSegments(p).map((s, j) => s.math
          ? <span key={`${i}-${j}`} data-latex={s.text} dangerouslySetInnerHTML={{ __html: (() => { try { return katex.renderToString(s.text, { displayMode: s.display, throwOnError: false, output: "html" }); } catch { return s.text; } })() }} />
          : <span key={`${i}-${j}`}>{s.text}</span>))}
    </span>
  );
}

/** The visual equation editor (MathLive) with a "type LaTeX" option; Insert puts $…$ into the field it belongs to. */
export function EquationButton({ onInsert }: { onInsert: (latex: string) => void }) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(false);
  const [tex, setTex] = useState("");
  const ref = useRef<HTMLElement & { value: string }>(null);
  useEffect(() => { if (open && !raw) import("mathlive").catch(() => setRaw(true)); }, [open, raw]);
  useEffect(() => { const el = ref.current; if (!el) return; const f = () => setTex(el.value); el.addEventListener("input", f); return () => el.removeEventListener("input", f); }, [open, raw]);
  if (!open) return <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(true)} data-eq-open>∑ Equation</button>;
  return (
    <div className="card" style={{ padding: 10, marginTop: 6 }} data-eq-editor>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {raw ? <input value={tex} onChange={(e) => setTex(e.target.value)} placeholder="\frac{a}{b}, \sqrt{x}, \int_0^1 x^2 dx, \ce{H2O}" style={{ minWidth: 320 }} data-eq-latex />
          : (() => { const MF = "math-field" as unknown as React.ElementType; return <MF ref={ref} style={{ minWidth: 320, fontSize: 18, border: "1px solid var(--line, #ddd)", borderRadius: 6, padding: 4 }} />; })()}
        <label style={{ fontSize: 12 }}><input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} /> Type LaTeX</label>
        <button type="button" className="btn btn-sm" disabled={!tex.trim()} onClick={() => { onInsert(`$${tex.trim()}$`); setTex(""); setOpen(false); }} data-eq-insert>Insert</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {tex && <div style={{ marginTop: 6 }}><MathText text={`$${tex}$`} /></div>}
    </div>
  );
}
