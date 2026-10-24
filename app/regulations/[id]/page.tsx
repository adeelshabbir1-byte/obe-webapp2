import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { prisma } from "../../../lib/db";
import { ActionForm, ActionButton } from "../../../components/fyp/FypClient";
import FileUpload from "../../../components/regulations/FileUpload";
import { rdb, REG_HINT, KINDS, canSee, canPublish, instituteOfUser, mouPending, TARGETS, SUBMIT_ROLES, type RegDoc, type RegFile, type RegClause } from "../../../lib/regulations";

export const dynamic = "force-dynamic";
export const metadata = { title: "Regulation" };

const ST: Record<string, [string, string]> = { PUBLISHED: ["In force", "#2E7D32"], SUPERSEDED: ["Superseded", "#6B7177"], SUBMITTED: ["Waiting for review", "#B26A00"], REJECTED: ["Returned", "#C62828"], WITHDRAWN: ["Withdrawn", "#6B7177"] };

export default async function RegulationPage({ params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const shell = (x: React.ReactNode) => <Shell roleLabel={user.role === "SUPER_USER" ? "Super User" : roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  const d = (await rdb.regDocument.findUnique({ where: { id: params.id } }).catch(() => undefined)) as RegDoc | null | undefined;
  if (d === undefined) return shell(<div className="err">{REG_HINT}</div>);
  if (!d || !(await canSee(user, d))) notFound();
  const [files, clauses] = await Promise.all([rdb.regFile.findMany({ where: { docId: d.id }, orderBy: { createdAt: "asc" } }) as Promise<RegFile[]>, rdb.regClause.findMany({ where: { docId: d.id }, orderBy: [{ page: "asc" }, { createdAt: "asc" }] }) as Promise<RegClause[]>]);
  const links = (await rdb.regLink.findMany({ where: { clauseId: { in: clauses.map((c) => c.id) } } })) as { clauseId: string; target: string }[];
  const reviewer = await canPublish(user, d.council);
  const me = await instituteOfUser(user);
  const editor = reviewer || ((d.status === "SUBMITTED" || d.status === "REJECTED") && SUBMIT_ROLES.includes(user.role) && (d.submittedById === user.id || (!!me && d.instituteId === me)));
  const [prev, next] = await Promise.all([d.supersedesId ? rdb.regDocument.findUnique({ where: { id: d.supersedesId }, select: { id: true, title: true } }) : null, rdb.regDocument.findFirst({ where: { supersedesId: d.id }, select: { id: true, title: true, status: true } })]) as [{ id: string; title: string } | null, { id: string; title: string; status: string } | null];
  const waiting = await mouPending(d);
  const heads = await prisma.user.findMany({ where: { id: { in: [...waiting, d.submittedById] } }, select: { id: true, instituteName: true, name: true } });
  const T = TARGETS(); const tl = (k: string) => T.find((t) => t.key === k)?.label || k;
  const images = files.filter((f) => f.mime.startsWith("image/")), pdfs = files.filter((f) => f.mime === "application/pdf");
  const [l, col] = ST[d.status] || [d.status, "#555"];
  const groups = Array.from(new Set(T.map((t) => t.group)));
  return shell(<>
    <p className="small-note" style={{ margin: 0 }}><Link href="/regulations">← Regulations Library</Link></p>
    <div style={{ fontSize: 12, fontWeight: 700, color: "#1565C0", marginTop: 6 }}>{d.council} · {KINDS.find(([k]) => k === d.kind)?.[1]}</div>
    <h1 style={{ fontSize: 22, margin: "2px 0 6px" }}>{d.title}</h1>
    <div className="card" style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13 }}>
      <span><b style={{ color: col }}>{l}</b>{d.reviewNote ? <span className="small-note"> — {d.reviewNote}</span> : null}</span>
      {d.number && <span>No. <b>{d.number}</b></span>}{d.issuedOn && <span>Issued <b>{d.issuedOn.toISOString().slice(0, 10)}</b></span>}{d.effectiveFrom && <span>Effective <b>{d.effectiveFrom.toISOString().slice(0, 10)}</b></span>}
      {d.url && <a href={d.url} target="_blank" rel="noreferrer">Official source ↗</a>}
      {prev && <span>Replaces <Link href={`/regulations/${prev.id}`}>{prev.title}</Link></span>}{next && <span style={{ color: "#B26A00" }}>Replaced by <Link href={`/regulations/${next.id}`}>{next.title}</Link>{next.status !== "PUBLISHED" ? " (pending)" : ""}</span>}
    </div>
    {d.summary && <div className="card" style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{d.summary}</div>}
    {d.kind === "MOU" && <div className="card" style={{ borderLeft: `4px solid ${waiting.length ? "#B26A00" : "#2E7D32"}` }}>{waiting.length ? <>Waiting for confirmation from: {waiting.map((w) => heads.find((h) => h.id === w)?.instituteName || "a partner").join(", ")}. {["CHAIRMAN", "DEAN"].includes(user.role) && me && waiting.includes(me) && <ActionButton showMessage url="/api/regulations" body={{ action: "confirm", id: d.id }} label="Confirm this is our signed MoU" />}</> : "Both universities have confirmed this MoU."}</div>}
    {(reviewer && d.status === "SUBMITTED") && <div className="card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><b>Review:</b>
      <ActionButton showMessage url="/api/regulations" body={{ action: "publish", id: d.id }} label="Publish" confirmText="Publish this document? Every signed-in user can see it and Institute Heads / Deans are notified." />
      <ActionButton showMessage url="/api/regulations" body={{ action: "reject", id: d.id }} label="Return to submitter" className="btn btn-secondary btn-sm" askNote="What needs fixing?" noteRequired />
      <span className="small-note">Submitted by {heads.find((h) => h.id === d.submittedById)?.name || "—"}</span></div>}
    {reviewer && d.status === "PUBLISHED" && <p style={{ margin: "0 0 8px" }}><ActionButton showMessage url="/api/regulations" body={{ action: "withdraw", id: d.id }} label="Withdraw" className="btn btn-secondary btn-sm" confirmText="Withdraw this document? Its clauses stop showing as sources." /></p>}

    <div className="card"><h3 style={{ marginTop: 0 }}>Document</h3>
      {!files.length && <p className="small-note">No file attached yet.</p>}
      {pdfs.map((f) => <div key={f.id} style={{ fontSize: 13, marginBottom: 4 }}>📕 <a href={`/api/regulations/file/${f.id}`} target="_blank" rel="noreferrer"><b>{f.name}</b></a> <span className="small-note">{f.caption || ""} · {(f.size / 1048576).toFixed(1)} MB · <a href={`/api/regulations/file/${f.id}?download=1`}>download</a></span></div>)}
      {images.length > 0 && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginTop: 8 }}>{images.map((f) => <a key={f.id} href={`/api/regulations/file/${f.id}`} target="_blank" rel="noreferrer" style={{ border: "1px solid var(--line, #E1E5EA)", borderRadius: 8, padding: 6, textDecoration: "none", color: "inherit" }}><img src={`/api/regulations/file/${f.id}`} alt={f.caption || f.name} style={{ width: "100%", height: 260, objectFit: "cover", objectPosition: "top", borderRadius: 4 }} /><div className="small-note">{f.caption || f.name}</div></a>)}</div>}
      {editor && <div style={{ marginTop: 8 }}><FileUpload docId={d.id} /></div>}
    </div>

    <div className="card"><h3 style={{ marginTop: 0 }}>Clauses OBEHUB applies</h3>
      {!clauses.length && <p className="small-note">None marked yet.</p>}
      {clauses.map((c) => { const img = images.find((f) => f.id === c.imageFileId); const ts = links.filter((x) => x.clauseId === c.id).map((x) => x.target); return (
        <div key={c.id} id={`c-${c.id}`} style={{ borderTop: "1px solid var(--line, #E1E5EA)", padding: "10px 0", scrollMarginTop: 80 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><b>{c.ref}{c.page ? <span className="small-note"> · page {c.page}</span> : null}</b>{editor && <ActionButton showMessage url="/api/regulations" body={{ action: "deleteClause", clauseId: c.id }} label="Remove" className="btn btn-secondary btn-sm" confirmText="Remove this clause and its links?" />}</div>
          <blockquote style={{ margin: "6px 0", padding: "6px 12px", borderLeft: "3px solid #1565C0", background: "#F6F8FA", fontSize: 13.5, whiteSpace: "pre-wrap" }}>{c.quote}</blockquote>
          {img && <a href={`/api/regulations/file/${img.id}`} target="_blank" rel="noreferrer"><img src={`/api/regulations/file/${img.id}`} alt={`${c.ref} — screenshot`} style={{ maxWidth: "100%", maxHeight: 420, border: "1px solid #ddd", borderRadius: 4 }} /></a>}
          <div style={{ fontSize: 12.5, marginTop: 4 }}><b>Applied in OBEHUB at:</b> {ts.length ? ts.map((t) => <span key={t} style={{ display: "inline-block", margin: "2px 4px 0 0", padding: "1px 8px", border: "1px solid #ccd", borderRadius: 999 }}>{tl(t)}{editor && <ActionButton url="/api/regulations" body={{ action: "unlink", clauseId: c.id, target: t }} label="×" className="btn btn-secondary btn-sm" />}</span>) : <span className="small-note">nowhere yet</span>}</div>
          {editor && <ActionForm showMessage url="/api/regulations" fixed={{ action: "link", clauseId: c.id }} submit="Link" collapsed openLabel="+ Applied at…" fields={[{ name: "target", label: "Place in the portal", type: "select", width: 460, options: [["", "—"], ...T.filter((t) => !ts.includes(t.key)).map((t) => [t.key, `${t.group}: ${t.label}`] as [string, string])] }]} />}
        </div>); })}
      {editor && <ActionForm showMessage url="/api/regulations" fixed={{ action: "clause", docId: d.id }} submit="Add clause" collapsed openLabel="+ Mark a clause"
        fields={[{ name: "ref", label: "Reference (e.g. § 4.2, Note on internships)", width: 280 }, { name: "page", label: "Page", type: "number", width: 70 }, ...(images.length ? [{ name: "imageFileId", label: "Screenshot", type: "select" as const, width: 260, options: [["", "—"] as [string, string], ...images.map((f) => [f.id, f.caption || f.name] as [string, string])] }] : []), { name: "quote", label: "The clause, as written", type: "textarea" },
          ...groups.flatMap((g) => T.filter((t) => t.group === g).map((t) => ({ name: `t:${t.key}`, label: `${g === "Pages" ? "" : `${g.replace("Consortium rules — ", "")}: `}${t.label}`, type: "checkbox" as const })))]} />}
    </div>
  </>);
}
