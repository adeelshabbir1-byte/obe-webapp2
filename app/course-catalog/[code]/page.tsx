import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import { ActionButton } from "../../../components/fyp/FypClient";
import { AiOverlapCheck, CatalogEditor, CatalogImport } from "../../../components/CatalogClient";
import { FIELDS, isGeneric } from "../../../lib/catalogCore";
import { GA_SETS } from "../../../lib/catalogSeed";
import { CATALOG_HINT, canEditCatalog, history, importTargets, importsOf, loadCatalog, overlaps, stopList } from "../../../lib/courseCatalog";

export const dynamic = "force-dynamic";
const IMP: Record<string, [string, string]> = { CORE: ["Core", "#8B1E3F"], IMPORTANT: ["Important", "#3B5BA5"], OPTIONAL: ["Optional", "#777"] };
const STR: Record<string, string> = { STRONG: "Strong", MILD: "Mild", WEAK: "Weak" };
const chip = (text: string, colour: string) => <span style={{ fontSize: 11, fontWeight: 600, color: colour, border: `1px solid ${colour}`, borderRadius: 10, padding: "0 6px", whiteSpace: "nowrap" }}>{text}</span>;

// One catalog course: CLOs mapped to graduate attributes, the 32-lecture plan, prerequisites (course and topic),
// books, overlaps, history; import into my course; edit (Super Admin / curriculum team).
export default async function CatalogCourse({ params }: { params: { code: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  let all: Awaited<ReturnType<typeof loadCatalog>> = [];
  try { all = await loadCatalog(); } catch { return <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{CATALOG_HINT}</p></div></Shell>; }
  const e = all.find((x) => x.code === decodeURIComponent(params.code).toUpperCase());
  if (!e) notFound();
  const [editor, targets, hist, ov, stops] = await Promise.all([canEditCatalog(user).catch(() => false), importTargets(user), history(e.id), overlaps(), stopList()]);
  const mine = ov.filter((o) => o.a.code === e.code || o.b.code === e.code);
  const imports = await importsOf(targets.map((t) => t.id));
  const ga = GA_SETS[e.gaSet];
  const byCode = new Map(all.map((x) => [x.code, x]));
  const dependents = all.filter((x) => x.prereqs.some((p) => p.code === e.code));
  const lect = (code: string, n: number) => byCode.get(code)?.lectures.find((l) => l.n === n)?.topic || "";

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <p className="small-note" style={{ margin: "0 0 4px" }}><Link href="/course-catalog">← Course Catalog</Link></p>
      <h1 style={{ fontSize: 22, margin: "0 0 2px" }}>{e.code} — {e.title}</h1>
      <p className="small-note" style={{ margin: "0 0 8px" }}>{FIELDS[e.field].label} · {e.discipline} · {e.creditHours} credit hours ({e.theoryCh} theory, {e.labCh} lab) · version {e.version} · <b>{e.source}</b>{e.instituteCodes.length ? ` · also: ${e.instituteCodes.map((c) => `${c.code} (${c.of})`).join(", ")}` : ""}</p>
      <div className="card">
        <b>Best semester: {e.semester ? `S${e.semester}` : "—"}</b> <span className="small-note">— {e.semesterReason || "—"}</span>
        {e.sourceNote && <p className="small-note" style={{ margin: "4px 0 0" }}>{e.sourceNote}</p>}
        {editor && <div style={{ marginTop: 8 }}><CatalogEditor entry={e} gaCount={ga.items.length} codes={all.filter((x) => x.code !== e.code).map((x) => ({ code: x.code, title: x.title }))} /></div>}
      </div>

      {targets.length > 0 && (
        <div className="card">
          <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>Import into my course</h2>
          <CatalogImport catalogId={e.id} targets={targets.map((t) => ({ id: t.id, label: `${t.code} ${t.title}${t.batch ? ` — ${t.batch.degreeProgram} ${t.batch.batchName}` : ""}` }))} />
          {imports.filter((i) => i.catalogCode === e.code).slice(0, 5).map((i, k) => <p key={k} className="small-note" style={{ margin: "4px 0 0" }}>Imported into {targets.find((t) => t.id === i.courseId)?.code}: from catalog {i.catalogCode} v{i.version}, {new Date(i.at).toLocaleDateString("en-GB")}</p>)}
        </div>
      )}

      <h2 style={{ fontSize: 17, margin: "14px 0 6px" }}>CLOs and graduate attributes</h2>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", fontSize: 13 }}>
          <thead><tr><th>CLO</th><th>Statement</th><th>Bloom</th><th>Graduate attribute</th><th>Source</th></tr></thead>
          <tbody>{e.clos.map((c) => <tr key={c.n}><td>CLO-{c.n}</td><td>{c.statement}</td><td>{c.bloom}</td><td>{c.gas.map((g) => `${e.gaSet}-${g} ${ga.items.find((i) => i.n === g)?.title || ""}`).join("; ")}</td><td className="small-note">{c.source}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="small-note">{ga.label}. CLO wording is the source&apos;s; the mapping to graduate attributes is an OBEHUB suggestion.</p>

      <h2 style={{ fontSize: 17, margin: "14px 0 6px" }}>32-lecture plan</h2>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", fontSize: 13 }}>
          <thead><tr><th>L</th><th>Topic</th><th>Sub-topic</th><th>CLO</th><th>Importance</th><th>Book</th><th></th></tr></thead>
          <tbody>{e.lectures.map((l) => (
            <tr key={l.n} style={{ color: isGeneric(l.topic, stops) ? "#777" : undefined }}>
              <td>{l.n}</td><td>{l.topic}</td><td className="small-note">{l.sub}</td><td>{l.clo ? `CLO-${l.clo}` : "—"}</td>
              <td>{chip(IMP[l.importance][0], IMP[l.importance][1])}</td><td className="small-note">{l.chapter || "—"}</td>
              <td>{l.pr && <span title={`Builds on ${l.pr.slice(4)}: ${lect(l.pr.slice(4).split(" ")[0], Number(l.pr.split(" L")[1]))}`}>{chip("PR", "#8A6D3B")}</span>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="small-note">PR = builds on a topic of a prerequisite course (hover to see which). Book chapters are indicative positions in the text book — confirm them with the book&apos;s contents (Topic Workspace → Map readings).</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))", gap: 10, marginTop: 10 }}>
        <div className="card" style={{ margin: 0 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>Prerequisites</h2>
          {e.prereqs.length === 0 && <p className="small-note" style={{ margin: 0 }}>None.</p>}
          {e.prereqs.map((p, i) => <p key={i} style={{ margin: "3px 0", fontSize: 13 }}>{p.code ? <Link href={`/course-catalog/${p.code}`}>{p.code}</Link> : null} {p.title} {chip(STR[p.strength], p.strength === "STRONG" ? "#8B1E3F" : p.strength === "MILD" ? "#3B5BA5" : "#777")} <span className="small-note">{p.reason}</span></p>)}
          {e.topicLinks.filter((t) => !t.within).length > 0 && (
            <details style={{ marginTop: 6 }}><summary style={{ cursor: "pointer", fontSize: 13 }}>Topic → topic ({e.topicLinks.filter((t) => !t.within).length})</summary>
              {e.topicLinks.filter((t) => !t.within).map((t, i) => <p key={i} className="small-note" style={{ margin: "2px 0" }}>L{t.lecture} {e.lectures[t.lecture - 1]?.topic} ← {t.fromCode} L{t.fromLecture} {lect(t.fromCode, t.fromLecture)} · {STR[t.strength]}</p>)}
            </details>
          )}
          {e.topicLinks.filter((t) => t.within).length > 0 && (
            <details style={{ marginTop: 4 }}><summary style={{ cursor: "pointer", fontSize: 13 }}>Within this course ({e.topicLinks.filter((t) => t.within).length})</summary>
              {e.topicLinks.filter((t) => t.within).map((t, i) => <p key={i} className="small-note" style={{ margin: "2px 0" }}>L{t.lecture} {e.lectures[t.lecture - 1]?.topic} ← L{t.fromLecture} {e.lectures[t.fromLecture - 1]?.topic} · {STR[t.strength]}</p>)}
            </details>
          )}
          {dependents.length > 0 && <p className="small-note" style={{ marginTop: 6 }}>Needed for: {dependents.map((d) => d.code).join(", ")}</p>}
        </div>
        <div className="card" style={{ margin: 0 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>Books</h2>
          {e.books.length === 0 && <p className="small-note" style={{ margin: 0 }}>None listed.</p>}
          {e.books.map((b, i) => <p key={i} style={{ margin: "3px 0", fontSize: 13 }}>{b.kind === "TEXT" ? <b>Text: </b> : <span className="small-note">Reference: </span>}{b.title}</p>)}
        </div>
      </div>

      <h2 style={{ fontSize: 17, margin: "14px 0 6px" }}>Overlaps with other courses ({mine.length})</h2>
      <div className="card">
        {mine.length === 0 && <p className="small-note" style={{ margin: 0 }}>None found by wording.</p>}
        {mine.slice(0, 40).map((o, i) => { const other = o.a.code === e.code ? o.b : o.a, me = o.a.code === e.code ? o.a : o.b; return <p key={i} style={{ margin: "3px 0", fontSize: 13 }}><b style={{ color: o.kind === "DUPLICATION" ? "#B3261E" : "#2F7A4D" }}>{o.kind === "DUPLICATION" ? "Duplication" : "Progression"}</b> {o.confidence}% · L{me.lecture} {me.topic} ↔ <Link href={`/course-catalog/${other.code}`}>{other.code}</Link> L{other.lecture} {other.topic} <span className="small-note">— {o.reason}</span></p>; })}
        <AiOverlapCheck code={e.code} />
      </div>

      <h2 style={{ fontSize: 17, margin: "14px 0 6px" }}>History</h2>
      <div className="card">
        {hist.map((h) => (
          <div key={h.version} style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", padding: "3px 0", borderBottom: "1px solid #eee", fontSize: 13 }}>
            <span>v{h.version} · {new Date(h.at).toLocaleDateString("en-GB")} · {h.by}{h.note ? ` — ${h.note}` : ""}</span>
            {editor && h.version !== e.version && <ActionButton url="/api/course-catalog" body={{ action: "restore", id: e.id, version: h.version }} label="Restore" className="btn btn-secondary btn-sm" confirmText={`Restore version ${h.version}? It is saved as a new version.`} />}
          </div>
        ))}
      </div>
    </Shell>
  );
}
