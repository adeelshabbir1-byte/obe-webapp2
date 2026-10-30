import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { ActionForm } from "../../components/fyp/FypClient";
import { CODE_RULE, DEFAULT_STOP_LIST, FIELDS, FIELD_COLOUR, highlight, searchCatalog, type Field, type SearchField } from "../../lib/catalogCore";
import { GA_SETS } from "../../lib/catalogSeed";
import { CATALOG_HINT, canEditCatalog, loadCatalog, overlaps, stopList } from "../../lib/courseCatalog";

export const dynamic = "force-dynamic";
const FIELD_NAME: Record<SearchField, string> = { code: "Code", title: "Title", topic: "Topic", clo: "CLO", book: "Book" };
const KIND: Record<string, [string, string]> = { DUPLICATION: ["Duplication", "#B3261E"], PROGRESSION: ["Progression", "#2F7A4D"] };

function Marked({ text, q, field }: { text: string; q: string; field: SearchField }) {
  return <>{highlight(text, q).map((p, i) => (p.hit ? <mark key={i} style={{ background: FIELD_COLOUR[field], padding: "0 1px", borderRadius: 2 }}>{p.t}</mark> : <span key={i}>{p.t}</span>))}</>;
}

// The Course Catalog: three catalogs (Computing, Management Sciences, Engineering) — one search box across them,
// overlaps between topics, and the stop-list of generic lectures.
export default async function CourseCatalog({ searchParams }: { searchParams: { q?: string; field?: string; level?: string; semester?: string; prereq?: string; view?: string; kind?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const q = (searchParams.q || "").trim().slice(0, 100);
  const field = (Object.keys(FIELDS) as Field[]).includes(searchParams.field as Field) ? (searchParams.field as Field) : undefined;
  let missing = false;
  let all: Awaited<ReturnType<typeof loadCatalog>> = [];
  try { all = await loadCatalog(); } catch { missing = true; }
  const editor = await canEditCatalog(user).catch(() => false);
  const view = searchParams.view === "overlaps" ? "overlaps" : "courses";
  const hits = view === "courses" ? searchCatalog(all, q, { field, level: Number(searchParams.level) || undefined, semester: Number(searchParams.semester) || undefined, hasPrereq: searchParams.prereq === "yes" ? true : searchParams.prereq === "no" ? false : undefined }) : [];
  const ov = view === "overlaps" && !missing ? (await overlaps()).filter((o) => (!field || o.a.code.startsWith(FIELDS[field].prefix)) && (!searchParams.kind || o.kind === searchParams.kind)) : [];
  const stops = editor && !missing ? await stopList() : [];
  const tab = (v: string, label: string) => <Link href={`/course-catalog?view=${v}${field ? `&field=${field}` : ""}`} className={`btn btn-sm ${view === v ? "btn-brass" : "btn-secondary"}`}>{label}</Link>;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course Catalog</h1>
      <p className="small-note" style={{ marginBottom: 8 }}>Master copies of courses for Computing, Management Sciences and Engineering: CLOs mapped to graduate attributes, a 32-lecture plan, prerequisites, books and the best semester. Council text (HEC / NCEAC) is kept as published; anything OBEHUB wrote is marked <b>OBEHUB reference</b>. {editor ? "You can edit the catalog (each save is a new version)." : "Subject Experts and Program Leads import a course into their own course from its page."}</p>
      {missing && <div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{CATALOG_HINT}</p></div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>{tab("courses", `Courses (${all.length})`)}{tab("overlaps", "Overlaps")}</div>

      <details className="card" style={{ marginBottom: 8 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>How codes and graduate attributes work</summary>
        <p className="small-note" style={{ margin: "6px 0" }}>{CODE_RULE}</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 8 }}>
          {(Object.keys(FIELDS) as Field[]).map((f) => (
            <div key={f} style={{ fontSize: 12 }}>
              <b>{FIELDS[f].prefix} — {FIELDS[f].label}</b>
              <ol start={0} style={{ margin: "4px 0", paddingLeft: 22 }}>{FIELDS[f].areas.map((a) => <li key={a}>{a}</li>)}</ol>
              <div className="small-note">{GA_SETS[FIELDS[f].gaSet].label} — {GA_SETS[FIELDS[f].gaSet].items.length} attributes. Source: {GA_SETS[FIELDS[f].gaSet].source}.</div>
            </div>
          ))}
        </div>
      </details>

      {view === "courses" && (
        <>
          <form method="get" action="/course-catalog" className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ fontSize: 12, display: "grid", gap: 3, flex: "1 1 260px" }}>Search code, title, topic, CLO or book
              <input name="q" defaultValue={q} placeholder="e.g. linked list, CMP-251, Kotler" />
            </label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Catalog
              <select name="field" defaultValue={field || ""}><option value="">All</option>{(Object.keys(FIELDS) as Field[]).map((f) => <option key={f} value={f}>{FIELDS[f].label}</option>)}</select>
            </label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Level
              <select name="level" defaultValue={searchParams.level || ""}><option value="">Any</option>{[1, 2, 3, 4].map((l) => <option key={l} value={l}>Year {l}</option>)}</select>
            </label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Semester
              <select name="semester" defaultValue={searchParams.semester || ""}><option value="">Any</option>{[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>S{s}</option>)}</select>
            </label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Prerequisite
              <select name="prereq" defaultValue={searchParams.prereq || ""}><option value="">Any</option><option value="yes">Has one</option><option value="no">None</option></select>
            </label>
            <button className="btn btn-brass btn-sm" type="submit">Search</button>
          </form>
          {q && <div className="small-note" style={{ margin: "4px 0 8px", display: "flex", gap: 8, flexWrap: "wrap" }}>Matches are coloured by where they were found: {(Object.keys(FIELD_COLOUR) as SearchField[]).map((f) => <span key={f} style={{ background: FIELD_COLOUR[f], padding: "0 6px", borderRadius: 3 }}>{FIELD_NAME[f]}</span>)}</div>}
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", fontSize: 13 }}>
              <thead><tr><th>Code</th><th>Course</th><th>Sem</th><th>CH</th><th>Prerequisites</th><th>Source</th></tr></thead>
              <tbody>
                {hits.slice(0, 150).map(({ entry: e, matches }) => (
                  <tr key={e.id} data-code={e.code}>
                    <td style={{ whiteSpace: "nowrap" }}><Link href={`/course-catalog/${e.code}`}><b><Marked text={e.code} q={matches.some((m) => m.field === "code") ? q : ""} field="code" /></b></Link><div className="small-note">{e.instituteCodes.map((c) => c.code).join(", ")}</div></td>
                    <td>
                      <Link href={`/course-catalog/${e.code}`}><Marked text={e.title} q={matches.some((m) => m.field === "title") ? q : ""} field="title" /></Link>
                      <div className="small-note">{FIELDS[e.field].label} · {e.discipline}</div>
                      {matches.filter((m) => m.field !== "title" && !(m.field === "code" && m.text === e.code)).slice(0, 4).map((m, i) => (
                        <div key={i} className="small-note" data-match={m.field} style={{ marginTop: 2 }}><b style={{ background: FIELD_COLOUR[m.field], padding: "0 4px", borderRadius: 3 }}>{FIELD_NAME[m.field]}{m.where ? ` ${m.where}` : ""}</b> <Marked text={m.text.slice(0, 160)} q={q} field={m.field} /></div>
                      ))}
                    </td>
                    <td>{e.semester ? `S${e.semester}` : "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{e.creditHours} ({e.theoryCh}-{e.labCh})</td>
                    <td className="small-note">{e.prereqs.map((p) => p.code || p.title).join(", ") || "—"}</td>
                    <td className="small-note">{e.source}</td>
                  </tr>
                ))}
                {!hits.length && <tr><td colSpan={6} className="small-note">Nothing matches.</td></tr>}
              </tbody>
            </table>
          </div>
          {hits.length > 150 && <p className="small-note">Showing 150 of {hits.length}. Narrow the search.</p>}
        </>
      )}

      {view === "overlaps" && (
        <>
          <form method="get" action="/course-catalog" className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <input type="hidden" name="view" value="overlaps" />
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Catalog
              <select name="field" defaultValue={field || ""}><option value="">All</option>{(Object.keys(FIELDS) as Field[]).map((f) => <option key={f} value={f}>{FIELDS[f].label}</option>)}</select>
            </label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Kind
              <select name="kind" defaultValue={searchParams.kind || ""}><option value="">Both</option><option value="DUPLICATION">Duplication</option><option value="PROGRESSION">Progression</option></select>
            </label>
            <button className="btn btn-brass btn-sm" type="submit">Show</button>
          </form>
          <p className="small-note">Topics taught in two courses, matched by meaning (synonyms and word forms: “Linked lists” ≈ “Singly and doubly linked lists” ≈ “List ADT”). <b>Progression</b>: the later course builds on the earlier one. <b>Duplication</b>: the same topic with no prerequisite link. Generic lectures (review, revision, recap, mid-term review …) never count. Recomputed whenever a course changes; a course&apos;s page can also check its overlaps with the AI model.</p>
          <div className="card" style={{ padding: 0, overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", fontSize: 13 }}>
              <thead><tr><th>Kind</th><th>Confidence</th><th>Earlier course</th><th>Later course</th><th>Why</th></tr></thead>
              <tbody>
                {ov.slice(0, 300).map((o, i) => (
                  <tr key={i}>
                    <td><b style={{ color: KIND[o.kind][1] }}>{KIND[o.kind][0]}</b></td>
                    <td>{o.confidence}%</td>
                    <td><Link href={`/course-catalog/${o.a.code}`}>{o.a.code}</Link> L{o.a.lecture} — {o.a.topic}</td>
                    <td><Link href={`/course-catalog/${o.b.code}`}>{o.b.code}</Link> L{o.b.lecture} — {o.b.topic}</td>
                    <td className="small-note">{o.reason}</td>
                  </tr>
                ))}
                {!ov.length && <tr><td colSpan={5} className="small-note">No overlaps.</td></tr>}
              </tbody>
            </table>
          </div>
          {ov.length > 300 && <p className="small-note">Showing 300 of {ov.length}. Choose a catalog or kind to narrow it.</p>}
          {editor && (
            <div className="card" style={{ marginTop: 10 }}>
              <b>Generic lectures (never counted as overlaps)</b>
              <p className="small-note" style={{ margin: "4px 0" }}>Always: {DEFAULT_STOP_LIST.join(", ")}, exams, quizzes and presentations. Add your own below, one per line.</p>
              <ActionForm url="/api/course-catalog" fixed={{ action: "stopList" }} submit="Save the list" done="Saved — overlaps recomputed." initial={{ list: stops.join("\n") }} fields={[{ name: "list", label: "Extra generic lectures", type: "textarea", full: true }]} />
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
