"use client";
import { useEffect, useRef, useState } from "react";
import { STATUS, TONE } from "../lib/glossary";

/** A status badge whose meaning shows on hover (desktop) or tap (phone). `status` is a key of STATUS; `label` overrides the text. */
export function StatusBadge({ status, label, meaning }: { status: string; label?: string; meaning?: string }) {
  const s = STATUS[status] || { label: label || status, meaning: meaning || "", tone: "info" as const };
  return <Meaning text={label || s.label} meaning={meaning || s.meaning} tone={s.tone} />;
}

/** Any short text with a pop-up explanation. `tone` gives it badge colours; without it, it is underlined text. */
export default function Meaning({ text, meaning, tone }: { text: string; meaning: string; tone?: "ok" | "wait" | "bad" | "info" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);
  const c = tone ? TONE[tone] : null;
  return (
    <span ref={ref} className="meaning" style={{ position: "relative", display: "inline-block" }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} aria-expanded={open} aria-label={`${text}: what this means`}
        style={c ? { background: c.bg, color: c.fg, border: 0, borderRadius: 10, padding: "1px 9px", fontSize: 11.5, fontWeight: 700, cursor: "help", whiteSpace: "nowrap" }
          : { background: "none", border: 0, padding: 0, font: "inherit", color: "inherit", borderBottom: "1px dotted currentColor", cursor: "help" }}>
        {text}
      </button>
      {open && meaning && (
        <span role="tooltip" style={{ position: "absolute", zIndex: 60, top: "calc(100% + 6px)", left: 0, width: "min(280px, 80vw)", background: "#241A1D", color: "#fff", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, fontWeight: 400, lineHeight: 1.45, boxShadow: "0 6px 20px rgba(0,0,0,.25)", textAlign: "left", whiteSpace: "normal" }}>
          <b style={{ display: "block", marginBottom: 2 }}>{text}</b>{meaning} <a href="/help/glossary" style={{ color: "#F2C6CE" }}>Glossary</a>
        </span>
      )}
    </span>
  );
}
