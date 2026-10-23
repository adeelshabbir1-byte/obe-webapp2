"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Step } from "../lib/roleGuides";
import { readDone, writeDone } from "./NextStepTip";

export default function GuideChecklist({ role, steps }: { role: string; steps: Step[] }) {
  const [done, setDone] = useState<string[]>([]);
  useEffect(() => setDone(readDone(role)), [role]);
  const toggle = (k: string) => { const d = done.includes(k) ? done.filter((x) => x !== k) : [...done, k]; writeDone(role, d); setDone(d); };
  return (
    <ol style={{ paddingLeft: 20 }}>
      {steps.map((s) => (
        <li key={s.key} style={{ marginBottom: 10 }}>
          <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <input type="checkbox" checked={done.includes(s.key)} onChange={() => toggle(s.key)} style={{ marginTop: 4 }} />
            <span><b style={{ textDecoration: done.includes(s.key) ? "line-through" : undefined }}>{s.title}</b> — <Link href={s.href}>open</Link><br /><span className="small-note">{s.how}</span>{s.video && <> · <a href={s.video} target="_blank" rel="noopener noreferrer">watch the video</a></>}</span>
          </label>
        </li>
      ))}
    </ol>
  );
}
