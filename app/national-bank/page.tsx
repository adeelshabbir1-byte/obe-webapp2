import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { eligibleCourses } from "../../lib/publicCourse";
import { ActionForm, ActionButton } from "../../components/fyp/FypClient";
import NationalImport from "../../components/NationalImport";
import { nbdb, nationalMember, creditBoard, instituteColor, HEC_GREEN, FRAMEWORKS } from "../../lib/nationalBank";

export const dynamic = "force-dynamic";
export const metadata = { title: "National Curriculum Bank" };
type Rel = { id: string; framework: string; discipline: string; version: number; title: string; notes: string | null; status: string; publishedAt: Date | null };
type RC = { id: string; releaseId: string; publicCourseId: string | null; code: string; title: string; creditHours: number; courseType: string; contributorInstitute: string | null };

const Chip = ({ name }: { name: string | null }) => <span style={{ display: "inline-block", fontSize: 11.5, padding: "1px 8px", borderRadius: 10, background: instituteColor(name), color: "#fff", whiteSpace: "nowrap" }}>{name || "Independent"}</span>;
const HecChip = ({ label }: { label: string }) => <span style={{ display: "inline-block", fontSize: 11.5, padding: "1px 8px", borderRadius: 10, background: HEC_GREEN, color: "#fff", whiteSpace: "nowrap" }}>{label}</span>;

// The national curriculum bank: HEC's green national releases, every university's own flavour (its colour) shared for
// others to build on, credit to contributors like research citations, committee review, and adoption across universities.
export default async function NationalBankPage({ searchParams }: { searchParams: { tab?: string; q?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const nat = await nationalMember(user).catch(() => null);
  const tab = ["contributions", "credit", "review", "adoption", "admin"].includes(searchParams.tab || "") ? searchParams.tab! : "releases";
  const shell = (c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{c}</Shell>;
  const rels = ((await nbdb.nationalRelease.findMany({ where: nat ? {} : { status: { not: "DRAFT" } }, orderBy: [{ framework: "asc" }, { discipline: "asc" }, { version: "desc" }] }).catch(() => null)) as Rel[] | null);
  if (rels === null) return shell(<div className="err">Run prisma/migration_national_bank.sql first.</div>);
  const authority = nat?.name || (((await nbdb.nationalAuthority.findFirst({}).catch(() => null)) as { name: string } | null)?.name ?? "HEC");
  const tabs = [["releases", "National releases"], ["contributions", "Shared by universities"], ["credit", "Credit"], ...(nat ? [["review", "Committee review"]] : []), ...(nat || user.role === "SUPER_USER" ? [["adoption", "Adoption"]] : []), ...(user.role === "SUPER_USER" ? [["admin", "Set up"]] : [])];
  const head = <>
    <div style={{ background: HEC_GREEN, color: "#fff", borderRadius: 10, padding: "16px 18px", marginBottom: 12 }}>
      <div style={{ fontSize: 12, letterSpacing: ".08em", opacity: 0.9 }}>NATIONAL CURRICULUM BANK</div>
      <h1 style={{ fontSize: 22, margin: "4px 0", color: "#fff" }}>National Releases — {authority} curriculum, built together</h1>
      <div style={{ fontSize: 13.5, opacity: 0.95 }}>Green = {authority}&apos;s national releases. Every other colour is one university&apos;s own flavour of the framework, shared so others can build on it. When your course is imported, you get the credit.</div>
    </div>
    <nav className="tabs" style={{ marginBottom: 10 }}>{tabs.map(([k, v]) => <a key={k} className="tab" href={`/national-bank?tab=${k}`} aria-current={tab === k ? "page" : undefined}>{v}</a>)}</nav>
  </>;

  if (tab === "releases") {
    const rcs = (await nbdb.nationalReleaseCourse.findMany({ where: { releaseId: { in: rels.map((r) => r.id) } }, orderBy: { code: "asc" } })) as RC[];
    const mine = ["SUBJECT_EXPERT", "INSTRUCTOR", "PROGRAM_COORDINATOR"].includes(user.role) ? (await eligibleCourses(user)).map((c) => ({ id: c.id, label: `${c.code} ${c.title} — ${c.batchLabel}` })) : [];
    const shared = nat ? await prisma.publicCourse.findMany({ where: { status: "PUBLIC" }, select: { id: true, code: true, title: true, instituteName: true }, orderBy: [{ importCount: "desc" }], take: 300 }) : [];
    return shell(<>{head}
      {nat && <div className="card"><ActionForm url="/api/national-bank" fixed={{ action: "createRelease" }} submit="Start release" collapsed openLabel="Start a new national release" initial={{ framework: "HEC" }} fields={[{ name: "framework", label: "Framework", type: "select", options: FRAMEWORKS.map((f) => [f, f] as [string, string]) }, { name: "discipline", label: "Discipline (e.g. BS Computer Science)", width: 240 }, { name: "title", label: "Title (optional)", width: 240 }, { name: "notes", label: "What changed and why", type: "textarea" }]} /></div>}
      {rels.map((r) => { const cs = rcs.filter((c) => c.releaseId === r.id); return (
        <div key={r.id} className="card" style={{ borderLeft: `6px solid ${r.status === "RETIRED" ? "#9AA5B1" : HEC_GREEN}`, opacity: r.status === "RETIRED" ? 0.75 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <div><HecChip label={`${r.framework} · v${r.version}`} /> <b style={{ fontSize: 16 }}>{r.title}</b> <span className="small-note">{r.discipline} · {r.status === "PUBLISHED" ? `published ${r.publishedAt?.toISOString().slice(0, 10)}` : r.status === "RETIRED" ? "superseded" : "draft"} · {cs.length} courses</span></div>
            {nat && r.status === "DRAFT" && <span style={{ display: "flex", gap: 6 }}><ActionButton url="/api/national-bank" body={{ action: "publish", releaseId: r.id }} label="Publish" confirmText="Publish this release? It replaces the previous version for this discipline." /><ActionButton url="/api/national-bank" body={{ action: "deleteRelease", releaseId: r.id }} label="Delete draft" className="btn btn-secondary btn-sm" confirmText="Delete this draft?" /></span>}
          </div>
          {r.notes && <p style={{ fontSize: 13, margin: "6px 0" }}>{r.notes}</p>}
          <table style={{ marginTop: 6 }}><thead><tr><th>Course</th><th>Cr.</th><th>Contributed by</th><th /></tr></thead>
            <tbody>{cs.map((c) => <tr key={c.id}><td><b>{c.code}</b> {c.title} <span className="small-note">{c.courseType}</span></td><td>{c.creditHours}</td><td>{c.contributorInstitute ? <Chip name={c.contributorInstitute} /> : <HecChip label={authority} />}</td>
              <td>{r.status !== "DRAFT" ? <NationalImport releaseCourseId={c.id} courses={mine} /> : nat && <ActionButton url="/api/national-bank" body={{ action: "removeCourse", releaseId: r.id, id: c.id }} label="Remove" className="btn btn-secondary btn-sm" />}</td></tr>)}</tbody></table>
          {nat && r.status === "DRAFT" && shared.length > 0 && <div style={{ marginTop: 6 }}><ActionForm url="/api/national-bank" fixed={{ action: "addCourse", releaseId: r.id }} submit="Add" collapsed openLabel="Add a course shared by a university" initial={{ publicCourseId: shared[0].id }} fields={[{ name: "publicCourseId", label: "Shared course", type: "select", options: shared.map((s) => [s.id, `${s.code} ${s.title} — ${s.instituteName || "independent"}`] as [string, string]) }]} /></div>}
        </div>); })}
      {!rels.length && <div className="card small-note">No national release yet. {nat ? "Start one above from the best courses universities have shared." : `${authority} will publish its national releases here.`}</div>}
    </>);
  }

  if (tab === "contributions") {
    const q = (searchParams.q || "").toLowerCase().trim();
    const pcs = await prisma.publicCourse.findMany({ where: { status: "PUBLIC", ...(q ? { searchText: { contains: q } } : {}) }, select: { id: true, code: true, title: true, creditHours: true, instituteName: true, authorOrganization: true, summary: true, importCount: true, version: true, author: { select: { name: true } } }, orderBy: [{ importCount: "desc" }, { updatedAt: "desc" }], take: 200 });
    const reviews = (await nbdb.bankReview.findMany({ where: { publicCourseId: { in: pcs.map((p) => p.id) } } }).catch(() => [])) as { publicCourseId: string; verdict: string; reviewerId: string; comment: string | null }[];
    const inRel = new Set(((await nbdb.nationalReleaseCourse.findMany({ where: { publicCourseId: { in: pcs.map((p) => p.id) } }, select: { publicCourseId: true } }).catch(() => [])) as { publicCourseId: string }[]).map((x) => x.publicCourseId));
    return shell(<>{head}
      <form className="card" style={{ display: "flex", gap: 8 }}><input type="hidden" name="tab" value="contributions" /><input name="q" defaultValue={searchParams.q || ""} placeholder="Search code, title, topic or university" style={{ flex: 1 }} /><button className="btn btn-secondary btn-sm">Search</button><Link href="/public-library" className="act">Share a course</Link></form>
      {pcs.map((p) => { const rv = reviews.filter((r) => r.publicCourseId === p.id); const mineRv = rv.find((r) => r.reviewerId === user.id); const inst = p.instituteName || p.authorOrganization; return (
        <div key={p.id} className="card" style={{ borderLeft: `6px solid ${instituteColor(inst)}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><div><b>{p.code}</b> {p.title} <span className="small-note">{p.creditHours} cr · v{p.version}</span></div><div><Chip name={inst} /> {inRel.has(p.id) && <HecChip label={`In ${authority} release`} />}</div></div>
          <div className="small-note">by {p.author.name} · imported {p.importCount} time{p.importCount === 1 ? "" : "s"}{rv.length ? ` · committee: ${rv.filter((r) => r.verdict === "RECOMMEND").length} recommend, ${rv.filter((r) => r.verdict === "REVISE").length} revise` : ""}</div>
          {p.summary && <div style={{ fontSize: 13, marginTop: 4 }}>{p.summary.slice(0, 400)}</div>}
          {nat && <div style={{ marginTop: 6 }}><ActionForm url="/api/national-bank" fixed={{ action: "review", publicCourseId: p.id }} submit="Save review" collapsed openLabel={mineRv ? `Your review: ${mineRv.verdict.toLowerCase()}` : "Review for the national curriculum"} initial={{ verdict: mineRv?.verdict || "RECOMMEND", comment: mineRv?.comment || "" }} fields={[{ name: "verdict", label: "Verdict", type: "select", options: [["RECOMMEND", "Recommend for national release"], ["REVISE", "Good, needs revision"], ["REJECT", "Not suitable"]] }, { name: "comment", label: "Comments to the author", type: "textarea" }]} /></div>}
          <div style={{ marginTop: 4 }}><Link href="/public-library" className="act">Import it from the Public Course Library</Link></div>
        </div>); })}
      {!pcs.length && <p className="small-note">No shared courses match.</p>}
    </>);
  }

  if (tab === "credit") {
    const cb = await creditBoard();
    return shell(<>{head}
      <p className="small-note">Like citations for research: every time a university imports a shared course, its author and institute are credited. Courses chosen for a national release count separately.</p>
      <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Universities</h3><table><thead><tr><th>University</th><th>Courses shared</th><th>Times imported</th><th>Universities using them</th><th>In national releases</th></tr></thead>
        <tbody>{cb.institutes.map((i) => <tr key={i.name}><td><Chip name={i.name === "—" ? null : i.name} /></td><td>{i.courses}</td><td><b>{i.imports}</b></td><td>{i.universities}</td><td>{i.national ? <HecChip label={String(i.national)} /> : "—"}</td></tr>)}</tbody></table></div>
      <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Contributors</h3><table><thead><tr><th>Name</th><th>University</th><th>Courses shared</th><th>Times imported</th><th>Universities using them</th><th>In national releases</th></tr></thead>
        <tbody>{cb.people.map((p) => <tr key={p.id}><td><b>{p.name}</b></td><td><Chip name={p.institute === "—" ? null : p.institute} /></td><td>{p.courses}</td><td><b>{p.imports}</b></td><td>{p.universities}</td><td>{p.national || "—"}</td></tr>)}</tbody></table></div>
      {!cb.people.length && <p className="small-note">No courses shared yet.</p>}
    </>);
  }

  if (tab === "review" && nat) {
    const pcs = await prisma.publicCourse.findMany({ where: { status: "PUBLIC" }, select: { id: true, code: true, title: true, instituteName: true, importCount: true }, orderBy: { importCount: "desc" }, take: 300 });
    const reviews = (await nbdb.bankReview.findMany({ where: { publicCourseId: { in: pcs.map((p) => p.id) } } })) as { publicCourseId: string; verdict: string; reviewerId: string }[];
    const todo = pcs.filter((p) => !reviews.some((r) => r.publicCourseId === p.id && r.reviewerId === user.id));
    return shell(<>{head}
      <p className="small-note">Courses shared by universities that you have not reviewed yet, most imported first. Review them under &quot;Shared by universities&quot;; recommended ones can be added to a draft release.</p>
      <div className="card"><table><thead><tr><th>Course</th><th>University</th><th>Imports</th><th>Committee so far</th></tr></thead>
        <tbody>{todo.map((p) => { const rv = reviews.filter((r) => r.publicCourseId === p.id); return <tr key={p.id}><td><Link href={`/national-bank?tab=contributions&q=${encodeURIComponent(p.code.toLowerCase())}`}>{p.code} {p.title}</Link></td><td><Chip name={p.instituteName} /></td><td>{p.importCount}</td><td>{rv.length ? `${rv.filter((r) => r.verdict === "RECOMMEND").length} recommend / ${rv.length}` : "—"}</td></tr>; })}</tbody></table>
        {!todo.length && <p className="small-note">Nothing left to review.</p>}</div>
    </>);
  }

  if (tab === "adoption" && (nat || user.role === "SUPER_USER")) {
    const rcs = (await nbdb.nationalReleaseCourse.findMany({ where: { releaseId: { in: rels.filter((r) => r.status !== "DRAFT").map((r) => r.id) } } })) as RC[];
    const ad = (await nbdb.nationalAdoption.findMany({ where: { releaseCourseId: { in: rcs.map((c) => c.id) } } })) as { releaseCourseId: string; chairmanId: string }[];
    const heads = new Map((await prisma.user.findMany({ where: { id: { in: Array.from(new Set(ad.map((a) => a.chairmanId))) } }, select: { id: true, instituteName: true, name: true } })).map((h) => [h.id, h.instituteName || h.name]));
    return shell(<>{head}
      <p className="small-note">{new Set(ad.map((a) => a.chairmanId)).size} universities have adopted national courses ({ad.length} course adoptions).</p>
      {rels.filter((r) => r.status !== "DRAFT").map((r) => <div key={r.id} className="card" style={{ borderLeft: `6px solid ${HEC_GREEN}` }}><HecChip label={`${r.framework} · v${r.version}`} /> <b>{r.title}</b>
        <table style={{ marginTop: 6 }}><thead><tr><th>Course</th><th>Universities</th></tr></thead><tbody>{rcs.filter((c) => c.releaseId === r.id).map((c) => { const us = Array.from(new Set(ad.filter((a) => a.releaseCourseId === c.id).map((a) => heads.get(a.chairmanId) || "—"))); return <tr key={c.id}><td>{c.code} {c.title}</td><td>{us.length ? us.map((u) => <span key={u} style={{ marginRight: 4 }}><Chip name={u} /></span>) : <span className="small-note">not adopted yet</span>}</td></tr>; })}</tbody></table></div>)}
    </>);
  }

  if (tab === "admin" && user.role === "SUPER_USER") {
    const heads = await prisma.user.findMany({ where: { role: "CHAIRMAN" as never }, select: { id: true, name: true, instituteName: true }, orderBy: { name: "asc" } });
    const auths = (await nbdb.nationalAuthority.findMany({})) as { chairmanId: string; name: string }[];
    return shell(<>{head}
      <div className="card"><p className="small-note">Choose the account that runs the national bank (for example HEC&apos;s own institute account). Its head and everyone in it act as the national committee: they review shared courses, build and publish national releases, and see adoption.</p>
        {auths.map((a) => <div key={a.chairmanId} style={{ fontSize: 13.5 }}><HecChip label={a.name} /> {heads.find((h) => h.id === a.chairmanId)?.instituteName || heads.find((h) => h.id === a.chairmanId)?.name} <ActionButton url="/api/national-bank" body={{ action: "setAuthority", chairmanId: a.chairmanId, remove: true }} label="Remove" className="btn btn-secondary btn-sm" /></div>)}
        <ActionForm url="/api/national-bank" fixed={{ action: "setAuthority" }} submit="Save" initial={{ name: "HEC", chairmanId: heads[0]?.id || "" }} fields={[{ name: "chairmanId", label: "Account", type: "select", options: heads.map((h) => [h.id, `${h.instituteName || h.name}`] as [string, string]) }, { name: "name", label: "Name shown", width: 120 }]} /></div>
    </>);
  }
  return shell(head);
}
