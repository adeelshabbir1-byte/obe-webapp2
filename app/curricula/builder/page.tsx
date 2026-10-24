import { redirect } from "next/navigation";
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
  const inWork = list.filter((c) => c.status === "DRAFT" || c.status === "SUBMITTED");
  return (
    <Shell roleLabel={user.role === "SUPER_USER" ? "Super User" : roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 24, marginBottom: 2 }}>Curriculum Builder</h1>
      <p style={{ color: "var(--slate)", fontSize: 13.5, marginTop: 0, maxWidth: "75ch" }}>Build a master curriculum in four steps: define its <b>course types</b> (with the number of courses, credit hours and the courses each must have), <b>place the courses</b> into them by dragging, sort the <b>elective list into tracks</b>, then <b>publish</b>. Every column is checked against its targets while you work.</p>
      {inWork.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>In progress</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 8 }}>
            {inWork.map((c) => <Link key={c.id} href={`/curricula/builder/${c.id}`} className="card" style={{ margin: 0, textDecoration: "none", borderLeft: `5px solid ${PILL[c.status]}` }}><div style={{ fontSize: 12, fontWeight: 700, color: PILL[c.status] }}>{c.status === "DRAFT" ? "Draft" : "Waiting to publish"} · {c.authority}</div><b>{c.title} {c.version}</b><div className="small-note">{c._count.courses} courses{typed.has(c.id) ? "" : " · types not set yet"}</div></Link>)}
          </div>
        </div>
      )}
      <h3>Start a curriculum</h3>
      <StartCurriculum templates={TEMPLATES.map((t) => ({ key: t.key, program: t.program, council: t.council, version: t.version, types: t.types.length, note: t.note.split(" — ")[0] }))} sources={list.map((c) => ({ id: c.id, label: `${c.authority} ${c.title} ${c.version}`, program: c.title }))} />
      <div className="card">
        <h3 style={{ marginTop: 0 }}>All curricula you can build</h3>
        <table style={{ fontSize: 13 }}><thead><tr><th>Curriculum</th><th>Status</th><th>Courses</th><th></th></tr></thead>
          <tbody>{list.map((c) => <tr key={c.id}><td>{c.authority} <b>{c.title}</b> {c.version}</td><td style={{ color: PILL[c.status] || undefined, fontWeight: 700 }}>{c.status.toLowerCase()}</td><td>{c._count.courses}</td><td><Link href={`/curricula/builder/${c.id}`}>{typed.has(c.id) ? "Open in builder" : "Set types"}</Link></td></tr>)}</tbody></table>
      </div>
    </Shell>
  );
}
