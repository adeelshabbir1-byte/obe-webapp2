"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Step } from "../lib/roleGuides";

const KEY = (role: string) => `obehub-guide-${role}`;
export function readDone(role: string): string[] { try { return JSON.parse(localStorage.getItem(KEY(role)) || "[]"); } catch { return []; } }
export function writeDone(role: string, keys: string[]) { try { localStorage.setItem(KEY(role), JSON.stringify(keys)); } catch { /* ignore */ } }

/** "What to do next": the first unticked step of the role's first-week checklist, at the top of each page. */
export default function NextStepTip({ role, steps }: { role: string; steps: Step[] }) {
  const [done, setDone] = useState<string[] | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => { setDone(readDone(role)); try { setHidden(sessionStorage.getItem("obehub-tip-hidden") === "1"); } catch { /* ignore */ } }, [role]);
  if (!done || hidden) return null;
  const next = steps.find((s) => !done.includes(s.key));
  if (!next) return null;
  return (
    <div className="no-print" style={{ background: "#E8F1FB", border: "1px solid #9CC0E8", borderRadius: 10, padding: "8px 12px", marginBottom: 12, fontSize: 13.5, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <span>👣 <b>Next step ({done.length + 1} of {steps.length}):</b> <Link href={next.href}>{next.title}</Link> — {next.how}</span>
      <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
        <button className="btn btn-sm" type="button" onClick={() => { const d = [...done, next.key]; writeDone(role, d); setDone(d); }}>Done</button>
        <Link className="btn btn-secondary btn-sm" href="/guide">All steps</Link>
        <button className="btn btn-secondary btn-sm" type="button" onClick={() => { setHidden(true); try { sessionStorage.setItem("obehub-tip-hidden", "1"); } catch { /* ignore */ } }}>Hide</button>
      </span>
    </div>
  );
}
