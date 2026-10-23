import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import Shell from "../../components/Shell";
import HowCalculated from "../../components/HowCalculated";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { whoIs, staffOf } from "../../lib/registers";
import { xdb, RES_HINT, STATUS, isOric, oricIds, researchDashboard, type Proposal, type Candidate } from "../../lib/research";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
const TABS: [string, string][] = [["mine", "My publications"], ["grants", "Grants"], ["dashboard", "Research dashboard"], ["journals", "Journal list"]];
const day = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const catOpts: [string, string][] = [["W", "W"], ["X", "X"], ["Y", "Y"], ["OTHER", "Other / not HEC-recognised"]];
const money = (n: number | null | undefined) => (n ? `Rs ${Math.round(n).toLocaleString("en-PK")}` : "—");

// Research office (ORIC): my publications (ORCID import, Google Scholar BibTeX or a pasted list — confirmed one by one),
// grant proposals and their review, the research dashboard, and the journal list with HEC categories.
export default async function ResearchPage({ searchParams }: { searchParams: { tab?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const w = await whoIs(user as never);
  if (!w || ["STUDENT", "SUPER_USER"].includes(user.role)) redirect("/dashboard");
  const oric = await isOric(w);
  const tab = TABS.some(([k]) => k === searchParams.tab) ? searchParams.tab! : "mine";
  let missing = false, profile: { orcid: string | null; scholarUrl: string | null; lastImportAt: Date | null } | null = null, cands: Candidate[] = [], mine: Proposal[] = [], toReview: Proposal[] = [], journals: { id: string; title: string; issn: string | null; category: string; impactFactor: number | null }[] = [];
  try {
    profile = await xdb.researchProfile.findUnique({ where: { userId: user.id } });
    cands = await xdb.publicationCandidate.findMany({ where: { userId: user.id, status: "PENDING" }, orderBy: [{ year: "desc" }] });
    mine = await xdb.grantProposal.findMany({ where: { piId: user.id }, orderBy: { createdAt: "desc" } });
    if (oric) toReview = await xdb.grantProposal.findMany({ where: { chairmanId: w.chairmanId, status: { in: ["INTERNAL_REVIEW", "SUBMITTED", "AWARDED", "REJECTED"] }, piId: { not: user.id } }, orderBy: { updatedAt: "desc" }, take: 100 });
    if (tab === "journals") journals = await xdb.journalCategory.findMany({ where: { chairmanId: w.chairmanId }, orderBy: { title: "asc" } });
  } catch { missing = true; }
  const staff = await staffOf(w.chairmanId);
  const nameOf = new Map(staff.map((s) => [s.id, s.name]));
  const dash = tab === "dashboard" && !missing && (oric || w.leader || w.qec) ? await researchDashboard(w.chairmanId, w.hod ? [user.departmentId || "none"] : null) : null;
  const oricStaff = await oricIds(w.chairmanId);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Research &amp; ORIC</h1>
      <p className="small-note" style={{ marginBottom: 8 }}>Your papers and grants, kept on your faculty profile — which NBEAC Form 5, the NCEAC faculty criterion, the Faculty Performance Report and the institute dashboard all read. Research centres, groups, patents and MoUs are kept on the <a href="/accreditation/research">research registers</a>.</p>
      {missing && <div className="card"><p style={{ color: "#B3261E", margin: 0 }}>{RES_HINT}</p></div>}
      <div className="no-print" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>{TABS.filter(([k]) => k !== "journals" || oric).filter(([k]) => k !== "dashboard" || oric || w.leader || w.qec).map(([k, l]) => <Link key={k} href={`/research?tab=${k}`} className={`btn btn-sm ${tab === k ? "btn-brass" : "btn-secondary"}`}>{l}</Link>)}</div>

      {tab === "mine" && !missing && (
        <>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Import my papers</h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 300px" }}>
                <p className="small-note" style={{ marginTop: 0 }}><b>ORCID</b>: {profile?.orcid ? <>iD {profile.orcid}{profile.lastImportAt ? ` · last imported ${day(profile.lastImportAt)}` : ""}</> : "not linked yet"}. <b>Google Scholar</b>: {profile?.scholarUrl ? <a href={profile.scholarUrl} target="_blank" rel="noreferrer">profile linked</a> : "not linked"}.</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <ActionForm url="/api/research" fixed={{ action: "profile" }} collapsed openLabel="Link ORCID / Scholar…" submit="Save" initial={{ orcid: profile?.orcid || "", scholarUrl: profile?.scholarUrl || "" }} fields={[{ name: "orcid", label: "ORCID iD (0000-0002-1825-0097)", type: "text" }, { name: "scholarUrl", label: "Google Scholar profile address", type: "text" }]} />
                  {profile?.orcid && <ActionButton url="/api/research" body={{ action: "importOrcid" }} label="Import from ORCID" />}
                </div>
              </div>
              <div style={{ flex: "1 1 300px" }}>
                <ActionForm url="/api/research" fixed={{ action: "importText" }} collapsed openLabel="Paste from Google Scholar (BibTeX) or a list…" submit="Read the papers" fields={[{ name: "format", label: "What you paste", type: "select", options: [["bibtex", "BibTeX (Scholar: select papers → Export → BibTeX)"], ["lines", "A list: Title | Journal | Year | DOI | Citations"]] }, { name: "text", label: "Paste here", type: "textarea" }]} />
                <p className="small-note" style={{ marginBottom: 0 }}>Google Scholar is never read automatically — paste its export. Papers already on your profile are skipped.</p>
              </div>
            </div>
          </div>
          <h2 style={{ fontSize: 17, margin: "12px 0 6px" }}>Waiting for you to confirm ({cands.length})</h2>
          <div className="card" style={{ overflowX: "auto" }}>
            {cands.length === 0 ? <p className="small-note" style={{ margin: 0 }}>Nothing to confirm. Your confirmed papers are on your <a href="/faculty/profile">faculty profile</a>.</p> : (
              <table className="table" style={{ fontSize: 13 }}>
                <thead><tr><th>Paper</th><th>From</th><th>Confirm</th></tr></thead>
                <tbody>{cands.map((c) => (
                  <tr key={c.id}>
                    <td><b>{c.title}</b><div className="small-note" style={{ margin: 0 }}>{[c.journal, c.year, c.doi ? `DOI ${c.doi}` : "", c.citations ? `${c.citations} citations` : "", c.category ? `HEC ${c.category} (journal list)` : ""].filter(Boolean).join(" · ")}</div></td>
                    <td>{c.source.toLowerCase()}</td>
                    <td><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <ActionForm url="/api/research" fixed={{ action: "confirm", id: c.id, add: true }} collapsed openLabel="Add to my profile…" submit="Add" initial={{ category: c.category || "OTHER", studentWork: false }} fields={[{ name: "category", label: "HEC journal category", type: "select", options: catOpts }, { name: "studentWork", label: "Written with a student (FYP / thesis)", type: "checkbox" }]} />
                      <ActionButton url="/api/research" body={{ action: "confirm", id: c.id, add: false }} label="Not mine" className="btn btn-secondary btn-sm" />
                    </div></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === "grants" && !missing && (
        <>
          <div className="card">
            <ActionForm url="/api/research" fixed={{ action: "proposal" }} collapsed openLabel="New grant proposal…" submit="Save as draft" fields={[{ name: "title", label: "Title", type: "text" }, { name: "agency", label: "Funding agency (HEC NRPU, PSF, Ignite …)", type: "text" }, { name: "callName", label: "Call", type: "text" }, { name: "amount", label: "Amount asked (Rs)", type: "number" }, { name: "durationMonths", label: "Duration (months)", type: "number" }, { name: "coInvestigators", label: "Co-investigators", type: "text" }, { name: "abstract", label: "Abstract", type: "textarea" }]} />
          </div>
          <h2 style={{ fontSize: 17, margin: "12px 0 6px" }}>My proposals</h2>
          <div className="card" style={{ overflowX: "auto" }}>
            {mine.length === 0 ? <p className="small-note" style={{ margin: 0 }}>None yet.</p> : (
              <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Proposal</th><th>Amount</th><th>Status</th><th></th></tr></thead>
                <tbody>{mine.map((p) => (
                  <tr key={p.id}><td><b>{p.title}</b><div className="small-note" style={{ margin: 0 }}>{p.agency}{p.callName ? ` · ${p.callName}` : ""}{p.coInvestigators ? ` · with ${p.coInvestigators}` : ""}</div>{p.reviewNote && <div style={{ fontSize: 12, color: "#7A4B00" }}>ORIC: {p.reviewNote}</div>}</td>
                    <td>{money(p.awardedAmount || p.amount)}</td>
                    <td style={{ fontWeight: 700, color: p.status === "AWARDED" ? "#1E6B3A" : p.status === "REJECTED" || p.status === "RETURNED" ? "#B3261E" : undefined }}>{STATUS[p.status]}</td>
                    <td>{["DRAFT", "RETURNED"].includes(p.status) && <div style={{ display: "flex", gap: 4 }}><ActionForm url="/api/research" fixed={{ action: "proposal", id: p.id }} collapsed openLabel="Edit" submit="Save" initial={p as never} fields={[{ name: "title", label: "Title", type: "text" }, { name: "agency", label: "Agency", type: "text" }, { name: "amount", label: "Amount (Rs)", type: "number" }, { name: "abstract", label: "Abstract", type: "textarea" }]} /><ActionButton url="/api/research" body={{ action: "submit", id: p.id }} label="Send to ORIC" /></div>}</td></tr>
                ))}</tbody></table>
            )}
          </div>
          {oric && (
            <>
              <h2 style={{ fontSize: 17, margin: "14px 0 6px" }}>ORIC: proposals of the institute</h2>
              <div className="card" style={{ overflowX: "auto" }}>
                {toReview.length === 0 ? <p className="small-note" style={{ margin: 0 }}>Nothing yet.</p> : (
                  <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Proposal</th><th>PI</th><th>Amount</th><th>Status</th><th></th></tr></thead>
                    <tbody>{toReview.map((p) => (
                      <tr key={p.id}><td><b>{p.title}</b><div className="small-note" style={{ margin: 0 }}>{p.agency}</div>{p.abstract && <div style={{ fontSize: 12 }}>{p.abstract.slice(0, 220)}{p.abstract.length > 220 ? "…" : ""}</div>}</td><td>{nameOf.get(p.piId)}</td><td>{money(p.awardedAmount || p.amount)}</td><td style={{ fontWeight: 700 }}>{STATUS[p.status]}</td>
                        <td>
                          {p.status === "INTERNAL_REVIEW" && <div style={{ display: "flex", gap: 4 }}><ActionButton url="/api/research" body={{ action: "review", id: p.id, ok: true }} label="Clear for submission" askNote="Note to the PI (optional)" /><ActionButton url="/api/research" body={{ action: "review", id: p.id, ok: false }} label="Return" className="btn btn-secondary btn-sm" askNote="What needs changing?" noteRequired /></div>}
                          {p.status === "SUBMITTED" && <div style={{ display: "grid", gap: 4 }}><ActionForm url="/api/research" fixed={{ action: "decide", id: p.id, awarded: true }} collapsed openLabel="Awarded…" submit="Record the award" initial={{ amount: p.amount || "" }} fields={[{ name: "amount", label: "Amount awarded (Rs)", type: "number" }, { name: "startDate", label: "Start", type: "date" }, { name: "endDate", label: "End", type: "date" }]} /><ActionButton url="/api/research" body={{ action: "decide", id: p.id, awarded: false }} label="Not funded" className="btn btn-secondary btn-sm" confirmText="Record that the agency did not fund it?" /></div>}
                          {p.status === "AWARDED" && <span className="small-note">in the funded projects register</span>}
                        </td></tr>
                    ))}</tbody></table>
                )}
                <p className="small-note" style={{ marginBottom: 0 }}>An award is added to the funded research projects register (NBEAC Table 5.5) and as a grant on the PI&apos;s faculty profile.</p>
              </div>
            </>
          )}
        </>
      )}

      {dash && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            {([["Papers on profiles", dash.total], [`In ${dash.years[4]}`, dash.thisYear], ["Citations (imported)", dash.citations], ["With students", dash.studentWork], ["Grants applied", `${dash.grants.applied} (${money(dash.grants.appliedAmount)})`], ["Grants awarded", `${dash.grants.awarded} (${money(dash.grants.awardedAmount)})`]] as [string, string | number][]).map(([l, v]) => <div key={l} className="card" style={{ margin: 0, minWidth: 140, padding: "10px 14px" }}><div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div><div className="small-note" style={{ margin: 0 }}>{l}</div></div>)}
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <p style={{ margin: "0 0 8px", fontSize: 14 }}>By HEC category: {dash.byCategory.map((c) => `${c.c} ${c.n}`).join(" · ")}</p>
            <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Teacher</th>{dash.years.map((y) => <th key={y}>{y}</th>)}<th>All</th><th>Category W</th></tr></thead>
              <tbody>{dash.perTeacher.map((t) => <tr key={t.name}><td>{t.name}</td>{t.byYear.map((n, i) => <td key={i}>{n || ""}</td>)}<td><b>{t.total}</b></td><td>{t.w}</td></tr>)}</tbody></table>
            {!dash.perTeacher.length && <p className="small-note">No papers on profiles yet.</p>}
            <HowCalculated shows="Where these figures come from.">
              <p style={{ margin: 0 }}>Papers are those on teachers&apos; faculty profiles (typed, or imported and confirmed here); the year is the publication year. Citations add up the counts that came with imported papers. Grants count every proposal sent beyond draft, and the awards recorded by ORIC.</p>
            </HowCalculated>
          </div>
        </>
      )}

      {tab === "journals" && oric && !missing && (
        <div className="card" style={{ overflowX: "auto" }}>
          <p className="small-note" style={{ marginTop: 0 }}>The institute&apos;s list of journals with their HEC category (from the HEC Journal Recognition System) and impact factor. Imported papers in these journals get their category filled in.</p>
          <ActionForm url="/api/research" fixed={{ action: "journal" }} collapsed openLabel="Add a journal…" submit="Add" initial={{ category: "W" }} fields={[{ name: "title", label: "Journal", type: "text" }, { name: "issn", label: "ISSN", type: "text" }, { name: "category", label: "HEC category", type: "select", options: [["W", "W"], ["X", "X"], ["Y", "Y"]] }, { name: "impactFactor", label: "Impact factor", type: "number" }]} />
          <table className="table" style={{ fontSize: 13, marginTop: 8 }}><thead><tr><th>Journal</th><th>ISSN</th><th>HEC</th><th>Impact factor</th><th></th></tr></thead>
            <tbody>{journals.map((j) => <tr key={j.id}><td>{j.title}</td><td>{j.issn || "—"}</td><td><b>{j.category}</b></td><td>{j.impactFactor ?? "—"}</td><td><ActionButton url="/api/research" body={{ action: "removeJournal", id: j.id }} label="×" className="btn btn-secondary btn-sm" confirmText="Remove this journal?" /></td></tr>)}</tbody></table>
        </div>
      )}

      {w.head && tab !== "mine" && (
        <div className="card" style={{ marginTop: 12 }}>
          <b style={{ fontSize: 13 }}>ORIC staff:</b> {oricStaff.length ? oricStaff.map((id) => <span key={id} style={{ marginRight: 8 }}>{nameOf.get(id)} <ActionButton url="/api/research" body={{ action: "oric", userId: id, on: false }} label="×" className="btn btn-secondary btn-sm" /></span>) : <span className="small-note">none named — you review proposals yourself</span>}
          <div style={{ marginTop: 6 }}><ActionForm url="/api/research" fixed={{ action: "oric", on: true }} collapsed openLabel="Name an ORIC member…" submit="Add" fields={[{ name: "userId", label: "Member of staff", type: "select", options: staff.filter((s) => !oricStaff.includes(s.id)).map((s) => [s.id, s.name] as [string, string]) }]} /></div>
        </div>
      )}
    </Shell>
  );
}
