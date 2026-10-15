import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor, roleLabel } from "../../../lib/reportScope";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import RequisitionRowEditor from "../../../components/RequisitionRowEditor";
import { requisitions } from "../../../lib/courseResources";

export const dynamic = "force-dynamic";
export const metadata = { title: "Textbook Requisitions" };

// The library's purchase list: the textbooks chosen for the courses running now or next semester, with the copies
// needed for the number of students and what is already on the shelf or ordered.
export default async function TextbookRequisitionsPage({ searchParams }: { searchParams: { which?: string; per?: string; ref?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["LIBRARIAN", "CHAIRMAN"].includes(user.role)) redirect("/dashboard");
  const which = searchParams.which === "next" ? "next" : "current";
  const per = Math.max(1, Math.min(100, Number(searchParams.per) || 10));
  const ref = searchParams.ref === "1";
  let missing = false;
  const r = await requisitions(await chairmanIdFor(user), which, per, ref).catch(() => { missing = true; return null; });
  const q = (o: Record<string, string>) => `/library/requisitions?${new URLSearchParams({ which, per: String(per), ref: ref ? "1" : "0", ...o }).toString()}`;
  const toOrder = r ? r.rows.reduce((n, x) => n + x.shortfall, 0) : 0;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Textbook Requisitions</h1>
          <p style={{ color: "var(--slate)", fontSize: 13, margin: 0, maxWidth: 900 }}>
            Built from the textbooks teachers choose for their courses (from the HEC curriculum and the shared university pool). Copies are recommended at one
            per {per} students; record what is in stock, ordered and received.
          </p>
        </div>
        {r && r.rows.length > 0 && <a href={`/api/library/requisitions?which=${which}&per=${per}&ref=${ref ? 1 : 0}`} className="btn btn-brass btn-sm">Download (Excel / CSV)</a>}
      </div>
      {missing && <div className="err">Textbook requisitions are not set up in the database yet — run prisma/migration_master_spec.sql in Supabase.</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "12px 0" }}>
        <Link href={q({ which: "current" })} className={`btn btn-sm ${which === "current" ? "btn-brass" : "btn-secondary"}`}>This semester</Link>
        <Link href={q({ which: "next" })} className={`btn btn-sm ${which === "next" ? "btn-brass" : "btn-secondary"}`}>Next semester</Link>
        <span className="small-note" style={{ marginLeft: 8 }}>One copy per</span>
        {[5, 10, 15, 20].map((n) => <Link key={n} href={q({ per: String(n) })} className={`btn btn-sm ${per === n ? "btn-brass" : "btn-secondary"}`}>{n}</Link>)}
        <span className="small-note">students ·</span>
        <Link href={q({ ref: ref ? "0" : "1" })} className="btn btn-sm btn-secondary">{ref ? "Textbooks only" : "Include reference books"}</Link>
      </div>
      {r && (
        <>
          <div className="card">
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, marginBottom: 8 }}>
              <span><b>{r.term}</b></span><span><b>{r.courseCount}</b> courses</span><span><b>{r.rows.length}</b> titles</span><span><b>{toOrder}</b> copies still to order</span>
            </div>
            {r.rows.length === 0 ? <p className="small-note">No textbook has been chosen for these courses yet. Teachers choose them under Tools &amp; Books.</p> : (
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead><tr><th>Book</th><th>Courses</th><th>Students</th><th>Copies needed</th><th>To order</th><th>In stock</th><th>Ordered</th><th>Received</th><th>Status</th><th /></tr></thead>
                  <tbody>{r.rows.map((x) => (
                    <tr key={x.textbookId}>
                      <td><b>{x.title}</b><div className="small-note">{[x.authors, x.edition, x.publisher, x.isbn && `ISBN ${x.isbn}`].filter(Boolean).join(" · ")}</div></td>
                      <td className="small-note">{x.courses.map((c) => `${c.code} (${c.program}, ${c.students})`).join("; ")}</td>
                      <td>{x.students}</td><td>{x.recommended}</td>
                      <td>{x.shortfall > 0 ? <b style={{ color: "var(--rust)" }}>{x.shortfall}</b> : <span style={{ color: "var(--sage)" }}>0</span>}</td>
                      <RequisitionRowEditor term={r.term} textbookId={x.textbookId} initial={{ inStock: x.inStock, ordered: x.ordered, received: x.received, status: x.status, note: x.note }} />
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
          {r.uncatalogued.length > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Courses without a chosen textbook ({r.uncatalogued.length})</h3>
              <p className="small-note" style={{ marginTop: 0 }}>Their teachers haven&apos;t picked a book under Tools &amp; Books yet; the course outline&apos;s text is shown where there is one.</p>
              <table>
                <thead><tr><th>Course</th><th>Program</th><th>Outline says</th></tr></thead>
                <tbody>{r.uncatalogued.map((c, i) => <tr key={i}><td>{c.code} {c.title}</td><td className="small-note">{c.program}</td><td className="small-note" style={{ whiteSpace: "pre-wrap" }}>{c.text || "—"}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
