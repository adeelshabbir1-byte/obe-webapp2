import { redirect } from "next/navigation";
import Sources from "../../../components/regulations/Sources";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { prisma } from "../../../lib/db";
import StartCurriculum from "../../../components/builder/StartCurriculum";
import { canBuild, builderScope, bdb } from "../../../lib/curriculumBuilder";
import { TEMPLATES } from "../../../lib/curriculumTemplates";
import { findOwningChairmanId } from "../../../lib/institutionCurriculum";
import CurriculaTabs from "../../../components/CurriculaTabs";
import { adminCan, teams as loadTeams, teamsCovering } from "../../../lib/platformTeam";
import { ActionButton } from "../../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Curriculum Builder" };

const PILL: Record<string, string> = { DRAFT: "#B26A00", SUBMITTED: "#1565C0", PUBLISHED: "#2E7D32", SUPERSEDED: "#6B7177" };

export default async function Builder() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!(await canBuild(user))) redirect("/curricula");
  const sc = user.role === "SUPER_USER" ? null : await builderScope(user.id);
  const own = user.role === "SUPER_USER" || sc ? null : await findOwningChairmanId(user.id);
  const where = user.role === "SUPER_USER" ? { chairmanId: null } : sc ? { chairmanId: null, ...(sc.councils.length ? { authority: { in: sc.councils } } : {}) } : { chairmanId: own || "none" };
  const list = await prisma.masterCurriculum.findMany({ where, select: { id: true, title: true, version: true, authority: true, status: true, _count: { select: { courses: true } } }, orderBy: [{ status: "asc" }, { title: "asc" }, { version: "desc" }] });
  const typed = new Set(((await bdb.curriculumType.findMany({ where: { curriculumId: { in: list.map((c) => c.id).concat("none") } }, select: { curriculumId: true } }).catch(() => [])) as { curriculumId: string }[]).map((t) => t.curriculumId));
  // Who builds what: each national curriculum's platform team (by council and program).
  const ts = user.role === "SUPER_USER" || sc ? await loadTeams().catch(() => []) : [];
  const teamOf = (c: { authority: string; title: string }) => teamsCovering(ts, c);
  const teamText = (c: { authority: string; title: string }) => teamOf(c).map((t) => `${t.name} team${t.members.find((m) => m.role === "CONVENER")?.user ? ` · Convener: ${t.members.find((m) => m.role === "CONVENER")!.user!.name}` : ""}`).join("; ");
  const uncovered = user.role === "SUPER_USER" ? list.filter((c) => !teamOf(c).length) : [];
  const inWork = list.filter((c) => c.status === "DRAFT" || c.status === "SUBMITTED");
  return (
    <Shell roleLabel={user.role === "SUPER_USER" ? "Super User" : roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <CurriculaTabs active="builder" showAdmin={await adminCan(user, "CURRICULUM")} />
      <h1 style={{ fontSize: 24, marginBottom: 2 }}>{user.role === "SUPER_USER" || sc ? "National Curriculum Builder" : "Curriculum Builder"}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13.5, marginTop: 0, maxWidth: "75ch" }}>Build a master curriculum in four steps: define its <b>course types</b> (with the number of courses, credit hours and the courses each must have), <b>place the courses</b> into them by dragging, sort the <b>elective list into tracks</b>, then <b>publish</b>. Every column is checked against its targets while you work.</p>
      <div className="small-note" style={{ marginBottom: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>Council documents behind the templates: <Sources targets={TEMPLATES.map((t) => `template:${t.key}`)} /></div>
      {inWork.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>In progress</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 8 }}>
            {inWork.map((c) => <Link key={c.id} href={`/curricula/builder/${c.id}`} className="card" style={{ margin: 0, textDecoration: "none", borderLeft: `5px solid ${PILL[c.status]}` }}><div style={{ fontSize: 12, fontWeight: 700, color: PILL[c.status] }}>{c.status === "DRAFT" ? "Draft" : "Waiting to publish"} · {c.authority}</div><b>{c.title} {c.version}</b><div className="small-note">{c._count.courses} courses{typed.has(c.id) ? "" : " · types not set yet"}</div>{ts.length > 0 && <div className="small-note" style={{ margin: 0, color: teamOf(c).length ? undefined : "#B3261E" }}>{teamText(c) || "No team"}</div>}</Link>)}
          </div>
        </div>
      )}
      {user.role === "SUPER_USER" && <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
          <h3 style={{ margin: 0 }}>Who builds what</h3>
          <span className="small-note"><Link href="/admin/team">Platform Team →</Link> add people, change scopes</span>
        </div>
        {ts.length === 0 ? <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}><span className="small-note" style={{ margin: 0 }}>No national curriculum teams yet — every curriculum is yours to build.</span><ActionButton showMessage url="/api/admin/team" body={{ action: "starterTeams" }} label="Add the starter teams (Computing, Management Sciences, Engineering …)" className="btn btn-sm" /></div> :
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8, marginTop: 8 }}>
            {ts.map((t) => { const cs = list.filter((c) => teamOf(c).some((x) => x.id === t.id)); const conv = t.members.find((m) => m.role === "CONVENER"); return (
              <div key={t.id} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px" }}>
                <b>{t.name}</b> <span className="small-note">{t.councils.join(", ") || "all councils"}</span>
                <div style={{ fontSize: 12.5, color: conv ? undefined : "#B3261E" }}>{conv?.user ? `Convener: ${conv.user.name}` : "No Convener yet"} · {t.members.filter((m) => m.role !== "CONVENER").length} National SE(s)</div>
                <div className="small-note" style={{ margin: "2px 0 0" }}>{cs.length} curricula · {cs.filter((c) => c.status === "DRAFT" || c.status === "SUBMITTED").length} in progress</div>
              </div>); })}
          </div>}
        {ts.length > 0 && uncovered.length > 0 && <p style={{ color: "#B3261E", fontSize: 12.5, marginBottom: 0 }}><b>{uncovered.length} curricula no team covers</b> (still yours): {uncovered.slice(0, 8).map((c) => `${c.authority} ${c.title} ${c.version}`).join(" · ")}{uncovered.length > 8 ? " …" : ""}</p>}
      </div>}
      <h3>Start a curriculum</h3>
      <StartCurriculum templates={TEMPLATES.map((t) => ({ key: t.key, program: t.program, council: t.council, version: t.version, types: t.types.length, note: t.note.split(" — ")[0] }))} sources={list.map((c) => ({ id: c.id, label: `${c.authority} ${c.title} ${c.version}`, program: c.title }))} />
      <div className="card">
        <h3 style={{ marginTop: 0 }}>All curricula you can build</h3>
        <table style={{ fontSize: 13 }}><thead><tr><th>Curriculum</th>{ts.length > 0 && <th>Team</th>}<th>Status</th><th>Courses</th><th></th></tr></thead>
          <tbody>{list.map((c) => <tr key={c.id}><td>{c.authority} <b>{c.title}</b> {c.version}</td>{ts.length > 0 && <td className="small-note" style={{ color: teamOf(c).length ? undefined : "#B3261E" }}>{teamText(c) || "No team"}</td>}<td style={{ color: PILL[c.status] || undefined, fontWeight: 700 }}>{c.status.toLowerCase()}</td><td>{c._count.courses}</td><td><Link href={`/curricula/builder/${c.id}`}>{typed.has(c.id) ? "Open in builder" : "Set types"}</Link></td></tr>)}</tbody></table>
      </div>
    </Shell>
  );
}
