"use client";

import { useRef, useState } from "react";
import TemplateLink from "./TemplateLink";

type Result = { file: string; ok: boolean; text: string };

// "Import complete curriculum": one or more workbooks, each becoming a new master curriculum (PLOs, courses, CLOs, lecture topics).
export default function CurriculumWorkbookImport({ official }: { official: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  async function run(files: FileList) {
    const out: Result[] = [];
    for (const f of Array.from(files)) {
      setBusy(`Importing ${f.name}…`);
      const fd = new FormData(); fd.append("file", f);
      try {
        const r = await fetch("/api/curriculum-workbook/import", { method: "POST", body: fd });
        const d = await r.json().catch(() => ({}));
        out.push(r.ok
          ? { file: f.name, ok: true, text: `${d.title}: ${d.plos} GAs, ${d.courses} courses, ${d.clos} CLOs, ${d.topics} lecture topics${d.warnings?.length ? ` (notes: ${d.warnings.join("; ")})` : ""}` }
          : { file: f.name, ok: false, text: d.error || "import failed" });
      } catch { out.push({ file: f.name, ok: false, text: "import failed" }); }
      setResults([...out]);
    }
    setBusy("");
    if (input.current) input.current.value = "";
    if (out.some((x) => x.ok)) setTimeout(() => window.location.reload(), 1500);
  }
  return (
    <div className="card" style={{ marginBottom: 16, borderColor: "var(--brass)" }}>
      <h3 style={{ fontSize: 14, marginTop: 0 }}>Import a complete curriculum from Excel</h3>
      <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: -4 }}>
        Each workbook becomes a new {official ? "official curriculum (assign it to institutes afterwards)" : "curriculum of your institute"} with its GAs, courses, CLOs mapped to GAs and the lecture-by-lecture topics.
        Sheets: Curriculum, GAs, Courses, CLOs and GA mapping, Lecture topics (the layout the full-curriculum download produces). You can pick several files at once.
      </p>
      <button className="btn btn-brass" disabled={!!busy} onClick={() => input.current?.click()}>{busy || "Choose workbook(s)…"}</button>
      <TemplateLink name="curriculum-workbook" />
      <input ref={input} type="file" accept=".xlsx" multiple style={{ display: "none" }} onChange={(e) => { if (e.target.files?.length) run(e.target.files); }} />
      {results.length > 0 && (
        <ul style={{ fontSize: 12.5, marginTop: 10 }}>
          {results.map((r) => <li key={r.file} style={{ color: r.ok ? "var(--sage)" : "#b3261e" }}><b>{r.file}</b> — {r.text}</li>)}
        </ul>
      )}
    </div>
  );
}
