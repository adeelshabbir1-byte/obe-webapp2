import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import LmsImport from "../../../components/LmsImport";
import { ForumRow, SessionRow, ToolCard } from "../../../components/CourseTools";
import * as T from "../../../lib/teachingTools";
import { TOOLS, TOOL_KEYS } from "../../../lib/teachingToolsCore";

export const dynamic = "force-dynamic";
export const metadata = { title: "Teaching tools for this course" };

// A course's class in Moodle, Google Classroom + Meet, Teams and YouTube: link it, push the class and the plan, post
// assessments, make the live-lecture meetings, and pull grades, attendance, recordings and forum activity back.
export default async function CourseToolsPage({ params }: { params: { courseId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const ctx = await T.courseCtx(params.courseId);
  if (!ctx) notFound();
  const access = await T.courseAccess(user, ctx);
  if (!access) notFound();
  const canAct = access === "act";
  const [connected, links, sessions, forums, insts] = await Promise.all([
    T.connected(ctx.chairmanId), T.linksOf(ctx.id), T.sessionsOf(ctx.id), T.forumsOf(ctx.id),
    prisma.assessmentInstrument.findMany({ where: { courseId: ctx.id, source: "INSTRUCTOR" }, select: { id: true, label: true, type: true, maxScore: true, marksPct: true, partOfId: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const cards = TOOL_KEYS.filter((t) => connected.includes(t)).map((t) => { const l = links.find((x) => x.tool === t); return { tool: t, label: TOOLS[t].label, externalId: l?.externalId || "", note: l?.lastSyncNote || null, at: l?.lastSyncAt ? l.lastSyncAt.toISOString() : null }; });
  const gradeTools = cards.filter((c) => c.externalId && c.tool !== "YOUTUBE").map((c) => ({ tool: c.tool, label: c.label }));
  const now = Date.now();
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div className="small-note">{user.role === "INSTRUCTOR" ? <Link href={`/instructor/courses/${ctx.id}/clos`}>{ctx.code}</Link> : ctx.code} › Teaching tools</div>
      <h1 style={{ fontSize: 22, margin: "2px 0 4px" }}>{ctx.code} — {ctx.title}: teaching tools</h1>
      <p className="small-note" style={{ marginTop: 0 }}>The class is taught in the tools; marks, attendance and recordings come back here for the OBE record. {!canAct && "You can see this page; the teacher or Program Lead acts on it."} <Link href={`/odl-content/${ctx.id}`}>ODL content modules</Link></p>
      {!cards.length ? <div className="card" style={{ fontSize: 13 }}>No teaching tool is connected for the institute yet. The IT Manager (or the Institute Head) connects them under <Link href="/teaching-tools">Teaching tools</Link>.</div> :
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>{cards.map((c) => <ToolCard key={c.tool} courseId={ctx.id} link={c} canAct={canAct} instruments={insts.filter((i) => i.marksPct > 0).map((i) => ({ id: i.id, label: i.label, type: i.type }))} />)}</div>}

      {canAct && gradeTools.length > 0 && <div style={{ marginTop: 12 }}><LmsImport courseId={ctx.id} tools={gradeTools} instruments={insts.filter((i) => i.marksPct > 0 || !i.partOfId).map((i) => ({ id: i.id, type: i.type, label: i.label, maxScore: i.maxScore }))} /></div>}

      <section className="card" style={{ marginTop: 12 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>Live lectures</h2>
        <p className="small-note" style={{ marginTop: 0 }}>Attendance and recordings are read from Meet / Teams each night for meetings of the last three days, or now with &quot;Read attendance and recordings&quot;. Live sessions count toward the synchronous and blended rules (HEC ODL 8.1.ii.a, 8.2.3) and the attendance record (21.1.viii).</p>
        {!sessions.length ? <p className="small-note">No live lecture scheduled yet.</p> :
          <div style={{ overflowX: "auto" }}><table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Lecture</th><th>When</th><th>Tool</th><th>Link</th><th>Held?</th><th>Recording</th><th>Attended</th><th /></tr></thead>
            <tbody>{sessions.map((s) => <SessionRow key={s.id} courseId={ctx.id} canAct={canAct} s={{ id: s.id, lectureNumber: s.lectureNumber, tool: s.tool, startsAt: s.startsAt.toISOString(), joinUrl: s.joinUrl, status: s.status, recordingUrl: s.recordingUrl, attendees: s.attendees, heldMinutes: s.heldMinutes, syncNote: s.syncNote, ended: s.endsAt.getTime() < now }} />)}</tbody></table></div>}
      </section>

      <section className="card" style={{ marginTop: 12 }}>
        <h2 style={{ fontSize: 16, margin: "0 0 6px" }}>Discussion boards</h2>
        <p className="small-note" style={{ marginTop: 0 }}>Posts per forum and week come from Moodle; enter the contact hours each board gave. An asynchronous course needs, per credit hour, 5 h on a moderated board and 4 h on a graded one (HEC ODL 8.1.ii.b).</p>
        {!forums.length ? <p className="small-note">No forum activity read yet.</p> :
          <div style={{ overflowX: "auto" }}><table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Week</th><th>Forum</th><th>Kind</th><th>Student posts</th><th>Teacher posts</th><th>Contact hours</th></tr></thead>
            <tbody>{forums.map((f) => <ForumRow key={`${f.forumId}-${f.week}`} courseId={ctx.id} canAct={canAct} f={f} />)}</tbody></table></div>}
      </section>
    </Shell>
  );
}
