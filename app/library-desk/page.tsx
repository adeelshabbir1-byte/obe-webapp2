import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import HowCalculated from "../../components/HowCalculated";
import UploadForm from "../../components/UploadForm";
import LibraryDesk from "../../components/LibraryDesk";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { whoIs } from "../../lib/registers";
import { ldb, LIB_HINT, SUBJECTS, policyOf, libraryReport, memberById, type Title, type Copy } from "../../lib/library";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
const TABS: [string, string][] = [["desk", "Issue & return"], ["catalogue", "Catalogue"], ["holds", "Reservations & overdue"], ["reports", "Reports"], ["rules", "Rules"]];
const day = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const subjectOpts = SUBJECTS.map((s) => [s, s] as [string, string]);
const kindOpts: [string, string][] = [["PRINT", "Printed book"], ["EBOOK", "E-book"], ["DATABASE", "Online database"]];

// The library: circulation desk, catalogue (with Excel import), reservations, overdue books, reports and the rules.
export default async function LibraryDeskPage({ searchParams }: { searchParams: { tab?: string; q?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const w = await whoIs(user as never);
  if (!w || !(w.librarian || w.head)) redirect("/dashboard");
  const H = w.chairmanId;
  const tab = TABS.some(([k]) => k === searchParams.tab) ? searchParams.tab! : "desk";
  const q = (searchParams.q || "").trim();
  let missing = false;
  let titles: Title[] = [], copies: Copy[] = [];
  try {
    if (tab === "catalogue") {
      titles = await ldb.libraryTitle.findMany({ where: { chairmanId: H, ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { authors: { contains: q, mode: "insensitive" } }, { isbn: { contains: q.replace(/[^0-9Xx]/g, "") || q } }, { subject: { contains: q, mode: "insensitive" } }] } : {}) }, orderBy: { title: "asc" }, take: 100 });
      copies = await ldb.libraryCopy.findMany({ where: { titleId: { in: titles.map((t) => t.id).concat(["none"]) } }, orderBy: { accessionNo: "asc" } });
      if (q && !titles.length) { const c = await ldb.libraryCopy.findFirst({ where: { chairmanId: H, accessionNo: q.toUpperCase() } }); if (c) { titles = await ldb.libraryTitle.findMany({ where: { id: c.titleId } }); copies = await ldb.libraryCopy.findMany({ where: { titleId: c.titleId } }); } }
    } else await ldb.libraryTitle.count({ where: { chairmanId: H } });
  } catch { missing = true; }
  const p = await policyOf(H);
  const shell = (body: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{body}</Shell>;

  let holds: { id: string; titleId: string; memberType: "STUDENT" | "STAFF"; memberId: string; status: string; createdAt: Date; readyAt: Date | null }[] = [], overdue: { id: string; titleId: string; memberType: "STUDENT" | "STAFF"; memberId: string; dueAt: Date }[] = [];
  const names = new Map<string, string>(), titleNames = new Map<string, string>();
  if (tab === "holds" && !missing) {
    holds = await ldb.libraryHold.findMany({ where: { chairmanId: H, status: { in: ["WAITING", "READY"] } }, orderBy: { createdAt: "asc" } });
    overdue = await ldb.libraryLoan.findMany({ where: { chairmanId: H, returnedAt: null, dueAt: { lt: new Date() } }, orderBy: { dueAt: "asc" }, take: 300 });
    for (const x of [...holds, ...overdue]) { const k = `${x.memberType}:${x.memberId}`; if (!names.has(k)) { const m = await memberById(x.memberType, x.memberId); names.set(k, m ? `${m.name} (${m.ref})` : "—"); } }
    for (const t of (await ldb.libraryTitle.findMany({ where: { id: { in: [...holds, ...overdue].map((x) => x.titleId).concat(["none"]) } }, select: { id: true, title: true } })) as { id: string; title: string }[]) titleNames.set(t.id, t.title);
  }
  const rep = tab === "reports" && !missing ? await libraryReport(H) : null;

  return shell(
    <>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Library</h1>
      <p className="small-note" style={{ marginBottom: 8 }}>Members borrow up to {p.studentLimit} book(s) for {p.studentDays} days (students) or {p.staffLimit} for {p.staffDays} days (staff). Late books are fined Rs {p.finePerDay} a day. Books or fines outstanding block the library clearance for a degree and for leaving or transferring.</p>
      <div className="no-print" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>{TABS.map(([k, l]) => <Link key={k} href={`/library-desk?tab=${k}`} className={`btn btn-sm ${tab === k ? "btn-brass" : "btn-secondary"}`}>{l}</Link>)}</div>
      {missing && <div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{LIB_HINT}</p></div>}

      {tab === "desk" && !missing && <LibraryDesk />}

      {tab === "catalogue" && !missing && (
        <>
          <div className="card no-print" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <form method="get" style={{ display: "flex", gap: 6, alignItems: "end" }}><input type="hidden" name="tab" value="catalogue" /><label style={{ fontSize: 13 }}>Find<br /><input name="q" className="input" defaultValue={q} placeholder="title, author, ISBN, accession no." /></label><button className="btn btn-brass btn-sm">Find</button></form>
            <ActionForm url="/api/library" fixed={{ action: "title" }} collapsed openLabel="Add a title…" submit="Add title" initial={{ subject: "Computing", kind: "PRINT" }}
              fields={[{ name: "title", label: "Title", type: "text" }, { name: "authors", label: "Authors", type: "text" }, { name: "isbn", label: "ISBN", type: "text" }, { name: "edition", label: "Edition", type: "text" }, { name: "publisher", label: "Publisher", type: "text" }, { name: "year", label: "Year", type: "number" }, { name: "subject", label: "Subject", type: "select", options: subjectOpts }, { name: "callNumber", label: "Call number", type: "text" }, { name: "kind", label: "Kind", type: "select", options: kindOpts }, { name: "url", label: "Link (e-books / databases)", type: "text" }]} />
            <UploadForm url="/api/library" fields={[]} file={{ name: "file", label: "Catalogue (Excel)", accept: ".xlsx" }} submit="Import" collapsed openLabel="Import from Excel…" />
            <a className="btn btn-secondary btn-sm" href="/api/library?template=1">Excel template</a>
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            {titles.length === 0 ? <p className="small-note" style={{ margin: 0 }}>{q ? "Nothing matches." : "The catalogue is empty. Add titles or import the Excel template."}</p> : (
              <table className="table" style={{ fontSize: 13 }}>
                <thead><tr><th>Title</th><th>Subject</th><th>Copies (accession no.)</th><th></th></tr></thead>
                <tbody>{titles.map((t) => { const cs = copies.filter((c) => c.titleId === t.id); return (
                  <tr key={t.id}>
                    <td><b>{t.title}</b>{t.edition ? ` (${t.edition} ed.)` : ""}<div className="small-note" style={{ margin: 0 }}>{[t.authors, t.publisher, t.year, t.isbn ? `ISBN ${t.isbn}` : "", t.callNumber].filter(Boolean).join(" · ")}</div>{t.url && <a href={t.url} target="_blank" rel="noreferrer" className="small-note">open online</a>}</td>
                    <td>{t.subject}<div className="small-note" style={{ margin: 0 }}>{kindOpts.find(([k]) => k === t.kind)?.[1]}</div></td>
                    <td style={{ fontSize: 12.5 }}>{t.kind !== "PRINT" ? "—" : cs.length === 0 ? <span style={{ color: "#9A3412" }}>no copies yet</span> : cs.map((c) => <span key={c.id} style={{ display: "inline-flex", gap: 3, alignItems: "center", marginRight: 6, color: c.status === "AVAILABLE" ? "#1E6B3A" : c.status === "ON_LOAN" ? "#7A4B00" : "#777" }}>{c.accessionNo} <i>({c.status.replace("_", " ").toLowerCase()})</i>{["AVAILABLE", "DAMAGED"].includes(c.status) && <ActionButton url="/api/library" body={{ action: "withdraw", copyId: c.id }} label="×" className="btn btn-secondary btn-sm" confirmText={`Withdraw copy ${c.accessionNo}?`} />}</span>)}</td>
                    <td>{t.kind === "PRINT" && <ActionForm url="/api/library" fixed={{ action: "copies", titleId: t.id }} collapsed openLabel="Add copies…" submit="Add" fields={[{ name: "accessionNos", label: "Accession numbers (comma separated)", type: "text" }, { name: "location", label: "Shelf", type: "text" }, { name: "price", label: "Price per copy (Rs)", type: "number" }, { name: "acquiredAt", label: "Received on", type: "date" }]} />}</td>
                  </tr>
                ); })}</tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === "holds" && !missing && (
        <>
          <h2 style={{ fontSize: 17, margin: "4px 0 6px" }}>Overdue ({overdue.length})</h2>
          <div className="card" style={{ overflowX: "auto" }}>
            {overdue.length === 0 ? <p className="small-note" style={{ margin: 0 }}>No overdue books.</p> : (
              <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Book</th><th>Member</th><th>Due</th><th>Fine so far</th></tr></thead>
                <tbody>{overdue.map((l) => { const days = Math.floor((Date.now() - new Date(l.dueAt).getTime()) / 864e5); return <tr key={l.id}><td>{titleNames.get(l.titleId)}</td><td>{names.get(`${l.memberType}:${l.memberId}`)}</td><td style={{ color: "#B3261E" }}>{day(l.dueAt)} ({days} day{days === 1 ? "" : "s"})</td><td>Rs {(days * p.finePerDay).toLocaleString("en-PK")}</td></tr>; })}</tbody></table>
            )}
            <p className="small-note" style={{ marginBottom: 0 }}>Members are reminded automatically every three days while a book is overdue.</p>
          </div>
          <h2 style={{ fontSize: 17, margin: "14px 0 6px" }}>Reservations ({holds.length})</h2>
          <div className="card" style={{ overflowX: "auto" }}>
            {holds.length === 0 ? <p className="small-note" style={{ margin: 0 }}>No reservations.</p> : (
              <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Book</th><th>Member</th><th>Since</th><th>Status</th></tr></thead>
                <tbody>{holds.map((h) => <tr key={h.id}><td>{titleNames.get(h.titleId)}</td><td>{names.get(`${h.memberType}:${h.memberId}`)}</td><td>{day(h.createdAt)}</td><td style={{ color: h.status === "READY" ? "#1E6B3A" : undefined, fontWeight: 700 }}>{h.status === "READY" ? `ready since ${day(h.readyAt!)} — keep for ${p.holdDays} day(s)` : "waiting for a copy"}</td></tr>)}</tbody></table>
            )}
          </div>
        </>
      )}

      {rep && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            {([["Titles", rep.titles], ["Volumes", rep.volumes], ["On loan", rep.onLoan], ["Overdue", rep.overdue], [`Added in ${rep.year}`, rep.newThisYear], [`Spent in ${rep.year}`, `Rs ${rep.spentThisYear.toLocaleString("en-PK")}`]] as [string, string | number][]).map(([l, v]) => <div key={l} className="card" style={{ margin: 0, minWidth: 130, padding: "10px 14px" }}><div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div><div className="small-note" style={{ margin: 0 }}>{l}</div></div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 10 }}>
            <div className="card" style={{ margin: 0 }}><h3 style={{ marginTop: 0 }}>Collection by subject</h3><table className="table" style={{ fontSize: 13 }}><thead><tr><th>Subject</th><th>Titles</th><th>Volumes</th></tr></thead><tbody>{rep.bySubject.map((s) => <tr key={s.subject}><td>{s.subject}</td><td>{s.titles}</td><td>{s.volumes}</td></tr>)}</tbody></table></div>
            <div className="card" style={{ margin: 0 }}><h3 style={{ marginTop: 0 }}>Most borrowed (12 months)</h3><table className="table" style={{ fontSize: 13 }}><tbody>{rep.top.map((t) => <tr key={t.title}><td>{t.title}</td><td>{t.loans}</td></tr>)}</tbody></table>{!rep.top.length && <p className="small-note">No loans yet.</p>}</div>
            <div className="card" style={{ margin: 0 }}><h3 style={{ marginTop: 0 }}>Loans per program (12 months)</h3><table className="table" style={{ fontSize: 13 }}><tbody>{rep.byProgram.map((b) => <tr key={b.program}><td>{b.program}</td><td>{b.loans}</td></tr>)}</tbody></table>{!rep.byProgram.length && <p className="small-note">No loans yet.</p>}</div>
          </div>
          <HowCalculated shows="Where these figures go.">
            <p style={{ margin: 0 }}>{p.catalogueFigures ? "" : "(Switched off under Rules while the collection is being entered.) "}Every change to the catalogue updates the library figures (titles, computing titles, volumes, e-books) on <a href="/library-inventory">Library facilities</a>, which the NCEAC and NBEAC library tables and the readiness checks read — they no longer need typing.</p>
          </HowCalculated>
        </>
      )}

      {tab === "rules" && !missing && (
        <div className="card">
          <ActionForm url="/api/library" fixed={{ action: "policy" }} submit="Save the rules" initial={p} done="Saved."
            fields={[{ name: "studentLimit", label: "Books a student may borrow", type: "number" }, { name: "studentDays", label: "Days a student keeps a book", type: "number" }, { name: "staffLimit", label: "Books a staff member may borrow", type: "number" }, { name: "staffDays", label: "Days staff keep a book", type: "number" }, { name: "finePerDay", label: "Fine per late day (Rs)", type: "number" }, { name: "maxRenewals", label: "Renewals allowed", type: "number" }, { name: "holdDays", label: "Days a reserved book is kept", type: "number" }, { name: "catalogueFigures", label: "The catalogue is complete: use it for the library figures (titles, volumes, e-books)", type: "checkbox" }]} />
          <p className="small-note" style={{ marginBottom: 0 }}>Leave the last box empty while the collection is still being entered — the figures typed on <a href="/library-inventory">Library facilities</a> are then kept.</p>
        </div>
      )}
    </>
  );
}
