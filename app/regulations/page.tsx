import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";
import { rdb, REG_HINT, COUNCILS, KINDS, SUBMIT_ROLES, search, canPublish, instituteOfUser, TARGETS, storageReady, type RegDoc } from "../../lib/regulations";
import { RULES } from "../../lib/consortium";

export const dynamic = "force-dynamic";
export const metadata = { title: "Regulations Library" };

const ST: Record<string, [string, string]> = { PUBLISHED: ["In force", "#2E7D32"], SUPERSEDED: ["Superseded", "#6B7177"], SUBMITTED: ["Waiting for review", "#B26A00"], REJECTED: ["Returned", "#C62828"], WITHDRAWN: ["Withdrawn", "#6B7177"] };
const CC: Record<string, string> = { HEC: "#0D2A4A", NCEAC: "#1565C0", NBEAC: "#6A1B9A", PEC: "#00796B", NAHE: "#8D6E63", CONSORTIUM: "#B8860B", OTHER: "#555" };

// The official documents OBEHUB applies — HEC, NCEAC, NBEAC, PEC policies, notifications, curricula, manuals — and
// consortium MoUs. Signed-in users only.
export default async function Regulations({ searchParams }: { searchParams: { q?: string; council?: string; kind?: string; tab?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const shell = (x: React.ReactNode) => <Shell roleLabel={user.role === "SUPER_USER" ? "Super User" : roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  const tab = searchParams.tab || "force";
  const r = await search(user, searchParams.q || "", { council: searchParams.council, kind: searchParams.kind, status: tab === "all" ? "all" : tab === "review" ? "review" : undefined }).catch(() => null);
  if (!r) return shell(<div className="err">{REG_HINT}</div>);
  const reviewer = await canPublish(user);
  const me = await instituteOfUser(user);
  const counts = (await rdb.regClause.groupBy({ by: ["docId"], where: { docId: { in: r.docs.map((d) => d.id) } }, _count: { _all: true } }).catch(() => [])) as { docId: string; _count: { _all: number } }[];
  const pendingN = (await rdb.regDocument.count({ where: { status: "SUBMITTED" } }).catch(() => 0)) as number;
  const published = (await rdb.regDocument.findMany({ where: { status: "PUBLISHED", kind: { not: "MOU" } }, select: { id: true, council: true, title: true }, orderBy: { title: "asc" } })) as Pick<RegDoc, "id" | "council" | "title">[];
  const myAgreements = me ? ((await rdb.consortiumAgreementParty.findMany({ where: { chairmanId: me } }).catch(() => [])) as { agreementId: string }[]) : [];
  const ags = myAgreements.length ? ((await rdb.consortiumAgreement.findMany({ where: { id: { in: myAgreements.map((a) => a.agreementId) }, status: "ACTIVE" }, select: { id: true, title: true } })) as { id: string; title: string }[]) : [];
  // Which consortium rules no published clause backs yet (a warning, for the Super Admin).
  const backed = new Set(((await rdb.regLink.findMany({ where: { target: { startsWith: "rule:" } } }).catch(() => [])) as { target: string }[]).map((l) => l.target));
  const unbacked = RULES.filter((x) => !backed.has(`rule:${x.key}`));
  const tabBtn = (k: string, l: string) => <Link href={`?tab=${k}`} className={tab === k ? "btn btn-sm" : "btn btn-secondary btn-sm"}>{l}</Link>;
  return shell(<>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>Regulations Library</h1>
    <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>The official documents OBEHUB applies — HEC, NCEAC, NBEAC and PEC policies, notifications, curricula and manuals — with the clauses the portal relies on and a screenshot of each. Wherever the portal applies a rule you will see a 📄 link to its clause. The Super Admin, Institute Heads and Deans submit documents; the Super Admin or a Curriculum Builder publishes them. Consortium MoUs appear once both universities confirm them and the Super Admin accepts.</p>
    {user.role === "SUPER_USER" && <div className="card" style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
      {!storageReady() && <span className="err" style={{ margin: 0 }}>File storage is not set up — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.</span>}
      <ActionButton showMessage url="/api/regulations" body={{ action: "seed" }} label="Load starter documents (HEC CS 2025, NCEAC Manual 2023, NCEAC AAS)" className="btn btn-secondary btn-sm" />
      <span style={{ color: unbacked.length ? "#B26A00" : "#2E7D32" }}>{unbacked.length ? `⚠ ${unbacked.length} of ${RULES.length} consortium rules have no source document: ${unbacked.slice(0, 6).map((x) => x.label).join("; ")}${unbacked.length > 6 ? "…" : ""}` : "Every consortium rule has a source document."}</span>
    </div>}
    <div style={{ display: "flex", gap: 6, margin: "6px 0" }}>{tabBtn("force", "In force")}{tabBtn("all", "All versions")}{(reviewer || SUBMIT_ROLES.includes(user.role)) && tabBtn("review", `Waiting for review${pendingN && reviewer ? ` (${pendingN})` : ""}`)}</div>
    <form method="get" className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", margin: "6px 0" }}>
      <input type="hidden" name="tab" value={tab} />
      <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Search (title, number, text of the documents)<input name="q" defaultValue={searchParams.q || ""} style={{ width: 300 }} placeholder="e.g. internship, ODL, 8163" /></label>
      <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Council<select name="council" defaultValue={searchParams.council || ""}><option value="">All</option>{COUNCILS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Kind<select name="kind" defaultValue={searchParams.kind || ""}><option value="">All</option>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <button className="btn btn-sm">Search</button>
    </form>
    {r.clauses.length > 0 && <div className="card"><b>Clauses mentioning “{searchParams.q}”</b><ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13 }}>{r.clauses.map((c) => <li key={c.id}><Link href={`/regulations/${c.docId}#c-${c.id}`}>{c.ref}{c.page ? `, p. ${c.page}` : ""}</Link> — <span className="small-note">{c.quote.slice(0, 180)}{c.quote.length > 180 ? "…" : ""}</span></li>)}</ul></div>}
    <div style={{ display: "grid", gap: 8 }}>{!r.docs.length ? <div className="card small-note">No documents{searchParams.q ? " match" : " yet"}.</div> : r.docs.map((d) => { const [l, c] = ST[d.status] || [d.status, "#555"]; return (
      <Link key={d.id} href={`/regulations/${d.id}`} className="card" style={{ margin: 0, color: "inherit", textDecoration: "none", borderLeft: `4px solid ${CC[d.council] || "#555"}`, display: "grid", gap: 4 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", fontSize: 12 }}><b style={{ color: CC[d.council] }}>{d.council} · {KINDS.find(([k]) => k === d.kind)?.[1]}</b><b style={{ color: c }}>{l}</b></div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{d.title}</div>
        <div className="small-note">{[d.number, d.issuedOn ? `issued ${d.issuedOn.toISOString().slice(0, 10)}` : null, d.effectiveFrom ? `effective ${d.effectiveFrom.toISOString().slice(0, 10)}` : null, `${counts.find((x) => x.docId === d.id)?._count._all || 0} clause(s) applied in OBEHUB`].filter(Boolean).join(" · ")}</div>
      </Link>); })}</div>
    {SUBMIT_ROLES.includes(user.role) && <div className="card" style={{ marginTop: 12 }}><h3 style={{ marginTop: 0 }}>Submit a document</h3>
      <ActionForm showMessage url="/api/regulations" fixed={{ action: "submit" }} submit="Submit" collapsed openLabel="+ Submit a notification, policy or MoU" initial={{ council: "HEC", kind: "NOTIFICATION" }}
        fields={[{ name: "council", label: "Council", type: "select", options: COUNCILS }, { name: "kind", label: "Kind", type: "select", width: 220, options: KINDS },
          { name: "title", label: "Title", width: 420 }, { name: "number", label: "Notification / letter no.", width: 220 }, { name: "issuedOn", label: "Issued on", type: "date" }, { name: "effectiveFrom", label: "Effective from", type: "date" },
          { name: "url", label: "Official web address", width: 360 }, { name: "supersedesId", label: "Replaces (older document)", type: "select", width: 380, options: [["", "— nothing —"], ...published.map((p) => [p.id, `${p.council}: ${p.title}`] as [string, string])] },
          ...(ags.length ? [{ name: "agreementId", label: "For an MoU: the consortium agreement", type: "select" as const, width: 320, options: [["", "—"] as [string, string], ...ags.map((a) => [a.id, a.title] as [string, string])] }] : []),
          { name: "summary", label: "What it says / changes (short)", type: "textarea" }]} />
      <p className="small-note">After submitting, open the document to attach the PDF and screenshots of the notification and to mark the clauses the portal applies. {TARGETS().length} places in the portal can cite a clause.</p></div>}
  </>);
}
