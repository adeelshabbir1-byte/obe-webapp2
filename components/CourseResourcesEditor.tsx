"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Tool = { id: string; name: string; category: string; version: string | null };
type Book = { id: string; textbookId: string; kind: string; title: string; authors: string | null; edition: string | null; publisher: string | null; year: number | null };
type Rec = { id: string; title: string; authors: string | null; edition: string | null; publisher: string | null; year: number | null; fromHec: boolean; institutes: number; courses: number };
type Suggestion = { name: string; category: string; uses: number; here: boolean };

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/course-resources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return res.ok ? null : (data.error as string) || "Could not save.";
}
const bookLine = (b: { title: string; authors: string | null; edition: string | null; publisher: string | null; year: number | null }) =>
  [b.authors, b.edition, b.publisher, b.year].filter(Boolean).join(" · ");

/** The tools a course uses and its textbooks, with suggestions from other teachers and the shared HEC textbook pool. */
export default function CourseResourcesEditor({ courseId, tools, books, catalog, categories, suggestions, recommendations, canEdit }: {
  courseId: string; tools: Tool[]; books: Book[]; catalog: { name: string; category: string }[]; categories: Record<string, string>;
  suggestions: Suggestion[]; recommendations: Rec[]; canEdit: boolean;
}) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState({ name: "", category: "SOFTWARE", version: "" });
  const [book, setBook] = useState({ title: "", authors: "", edition: "", publisher: "", year: "", kind: "TEXT" });
  const run = async (body: Record<string, unknown>, after?: () => void) => {
    setBusy(true); setErr("");
    const e = await post({ courseId, ...body });
    setBusy(false);
    if (e) { setErr(e); return; }
    after?.(); router.refresh();
  };
  const have = new Set(tools.map((t) => t.name.toLowerCase()));
  const haveBook = new Set(books.map((b) => b.textbookId));
  const pickFromCatalog = (name: string) => { const c = catalog.find((x) => x.name.toLowerCase() === name.toLowerCase()); setTool((t) => ({ ...t, name, category: c?.category || t.category })); };

  return (
    <div>
      {err && <div className="err">{err}</div>}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Tools, languages and software used in this course</h3>
        {tools.length === 0 ? <p className="small-note">None listed yet.</p> : (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {tools.map((t) => (
              <span key={t.id} className="badge badge-neutral" title={categories[t.category]}>
                {t.name}{t.version ? ` ${t.version}` : ""} <span className="small-note">· {categories[t.category] || t.category}</span>
                {canEdit && <button type="button" disabled={busy} onClick={() => run({ action: "removeTool", id: t.id })} aria-label={`Remove ${t.name}`} style={{ marginLeft: 4, border: 0, background: "none", cursor: "pointer", color: "var(--rust)" }}>✕</button>}
              </span>
            ))}
          </div>
        )}
        {canEdit && (
          <>
            <form onSubmit={(e) => { e.preventDefault(); if (tool.name.trim()) run({ action: "addTool", ...tool }, () => setTool({ name: "", category: tool.category, version: "" })); }} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Tool (pick or type your own)
                <input list="tool-catalog" value={tool.name} onChange={(e) => pickFromCatalog(e.target.value)} placeholder="e.g. Python, VS Code, Wireshark" style={{ width: 240 }} />
                <datalist id="tool-catalog">{catalog.filter((c) => !have.has(c.name.toLowerCase())).map((c) => <option key={c.name} value={c.name}>{categories[c.category]}</option>)}</datalist>
              </label>
              <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Kind
                <select value={tool.category} onChange={(e) => setTool((t) => ({ ...t, category: e.target.value }))}>{Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </label>
              <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Version (optional)<input value={tool.version} onChange={(e) => setTool((t) => ({ ...t, version: e.target.value }))} style={{ width: 100 }} /></label>
              <button type="submit" className="btn btn-brass btn-sm" disabled={busy || !tool.name.trim()}>Add</button>
            </form>
            {suggestions.filter((s) => !have.has(s.name.toLowerCase())).length > 0 && (
              <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <span className="small-note">Used by other teachers of this course:</span>
                {suggestions.filter((s) => !have.has(s.name.toLowerCase())).map((s) => (
                  <button key={s.name} type="button" className="act act-neutral" disabled={busy} onClick={() => run({ action: "addTool", name: s.name, category: s.category })} title={`${s.uses} course(s)${s.here ? ", including your institute" : ""}`}>+ {s.name}</button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Textbooks</h3>
        <p className="small-note" style={{ marginTop: 0 }}>The library orders copies of the textbooks listed here for the semester the course runs.</p>
        {books.length === 0 ? <p className="small-note">No textbook chosen yet.</p> : (
          <table>
            <thead><tr><th>Book</th><th>Use</th><th /></tr></thead>
            <tbody>{books.map((b) => (
              <tr key={b.id}>
                <td><b>{b.title}</b><div className="small-note">{bookLine(b)}</div></td>
                <td>{b.kind === "TEXT" ? "Textbook" : "Reference"}</td>
                <td>{canEdit && <button type="button" className="act act-danger" disabled={busy} onClick={() => run({ action: "removeTextbook", id: b.id })}>Remove</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {recommendations.filter((r) => !haveBook.has(r.id)).length > 0 && (
          <>
            <h4 style={{ marginTop: 18, marginBottom: 4 }}>Recommended for this course</h4>
            <p className="small-note" style={{ marginTop: 0 }}>From the HEC curriculum and the books other universities use for the same course.</p>
            <table>
              <thead><tr><th>Book</th><th>Used by</th><th /></tr></thead>
              <tbody>{recommendations.filter((r) => !haveBook.has(r.id)).map((r) => (
                <tr key={r.id}>
                  <td><b>{r.title}</b>{r.fromHec && <span className="badge badge-ok" style={{ marginLeft: 6 }}>HEC</span>}<div className="small-note">{bookLine(r)}</div></td>
                  <td className="small-note">{r.institutes ? `${r.institutes} institute${r.institutes > 1 ? "s" : ""}` : r.fromHec ? "HEC curriculum" : "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{canEdit && <>
                    <button type="button" className="act act-primary" disabled={busy} onClick={() => run({ action: "addTextbook", textbookId: r.id, kind: "TEXT" })}>Use as textbook</button>{" "}
                    <button type="button" className="act act-neutral" disabled={busy} onClick={() => run({ action: "addTextbook", textbookId: r.id, kind: "REFERENCE" })}>Reference</button>
                  </>}</td>
                </tr>
              ))}</tbody>
            </table>
          </>
        )}
        {canEdit && (
          <form onSubmit={(e) => { e.preventDefault(); run({ action: "addTextbook", ...book }, () => setBook({ title: "", authors: "", edition: "", publisher: "", year: "", kind: book.kind })); }} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10, padding: 10, border: "1px dashed var(--line)", borderRadius: 8 }}>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Another book: title<input value={book.title} onChange={(e) => setBook((x) => ({ ...x, title: e.target.value }))} style={{ width: 260 }} /></label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Authors<input value={book.authors} onChange={(e) => setBook((x) => ({ ...x, authors: e.target.value }))} style={{ width: 200 }} /></label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Edition<input value={book.edition} onChange={(e) => setBook((x) => ({ ...x, edition: e.target.value }))} style={{ width: 90 }} /></label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Publisher<input value={book.publisher} onChange={(e) => setBook((x) => ({ ...x, publisher: e.target.value }))} style={{ width: 140 }} /></label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Year<input type="number" value={book.year} onChange={(e) => setBook((x) => ({ ...x, year: e.target.value }))} style={{ width: 80 }} /></label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Use<select value={book.kind} onChange={(e) => setBook((x) => ({ ...x, kind: e.target.value }))}><option value="TEXT">Textbook</option><option value="REFERENCE">Reference</option></select></label>
            <button type="submit" className="btn btn-brass btn-sm" disabled={busy || book.title.trim().length < 3}>Add book</button>
          </form>
        )}
      </div>
    </div>
  );
}
