import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import { navForRole } from "../../../../components/reportNav";
import { roleLabel } from "../../../../lib/reportScope";
import { ActionForm } from "../../../../components/fyp/FypClient";
import { Synthesizer } from "../../../../components/SynthesisClient";
import { findOwningChairmanId } from "../../../../lib/institutionCurriculum";
import { canBuild } from "../../../../lib/curriculumBuilder";
import { chainOf, currentParts, proposalsOf } from "../../../../lib/synthesis";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Course proposals & synthesis" };
const SYNTH = ["SUPER_USER", "CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "PROGRAM_LEAD", "OMC"];

// Collaborative drafting for a curriculum's courses: the subject chain, parallel proposals by Subject Experts and
// teachers, and the hybrid synthesizer for the Program Lead / committee lead.
export default async function Synthesis({ params, searchParams }: { params: { id: string }; searchParams: { course?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const c = await prisma.masterCurriculum.findUnique({ where: { id: params.id }, select: { id: true, title: true, version: true, authority: true, chairmanId: true, status: true, courses: { select: { id: true, code: true, title: true, semesterNumber: true }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }] } } });
  if (!c) notFound();
  const mine = c.chairmanId === null || c.chairmanId === (await findOwningChairmanId(user.id).catch(() => null));
  if (!mine && user.role !== "SUPER_USER") notFound();
  const course = c.courses.find((x) => x.id === searchParams.course) || null;
  const canApply = c.chairmanId === null ? (await canBuild(user as never, c)) && c.status !== "PUBLISHED" : SYNTH.includes(user.role);
  const [chain, proposals, now] = course ? await Promise.all([chainOf(course.id), proposalsOf(course.id), currentParts(course.id)]) : [[], [], null];
  return (
    <Shell roleLabel={user.role === "SUPER_USER" ? "Super User" : roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <p className="small-note" style={{ margin: 0 }}><Link href={`/curricula/${c.id}`}>← {c.title} {c.version}</Link></p>
      <h1 style={{ fontSize: 22, margin: "2px 0 4px" }}>Course proposals &amp; synthesis</h1>
      <p className="small-note">Subject Experts and teachers submit parallel proposals for any course of a subject chain; the Program Lead or committee lead builds the final course from the best parts. Every merge is checked against the OBE checklist{c.chairmanId ? " and the HEC Golden Copy's locked content" : ""}.</p>
      <form method="get" className="card" style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Course<select name="course" defaultValue={course?.id || ""} style={{ minWidth: 300 }}><option value="">— choose —</option>{c.courses.map((x) => <option key={x.id} value={x.id}>{x.code} {x.title}{x.semesterNumber ? ` (S${x.semesterNumber})` : ""}</option>)}</select></label>
        <button className="btn btn-brass btn-sm">Open</button>
      </form>
      {course && now && (
        <>
          <div className="card"><b>Subject chain:</b> {chain.map((x, i) => <span key={x.id}>{i ? " → " : " "}{x.id === course.id ? <b>{x.code} {x.title}</b> : <Link href={`?course=${x.id}`}>{x.code} {x.title}</Link>}</span>)}</div>
          <div className="card">
            <b>Proposals ({proposals.length})</b>
            {proposals.map((p) => <p key={p.id} style={{ margin: "3px 0", fontSize: 13 }} data-proposal={p.author}>{p.author} · {p.parts.clos.length} CLOs · {p.parts.topics.length} lectures · {p.parts.assessments.map((a) => `${a.type} ${a.pct}%`).join(", ") || "no assessment split"}{p.note ? <span className="small-note"> — {p.note}</span> : null}</p>)}
            <ActionForm url="/api/synthesis" fixed={{ action: "propose", masterCourseId: course.id }} submit="Submit proposal" collapsed openLabel="+ Submit a proposal" showMessage
              initial={{ description: now.description, clos: now.clos.map((x) => `${x.statement} | ${x.bloom}`).join("\n"), topics: now.topics.map((t) => `${t.topic} | ${t.clo ?? ""}`).join("\n"), labPlan: now.labPlan.map((l) => l.experiment).join("\n"), assessments: now.assessments.map((a) => `${a.type} ${a.pct}`).join("\n"), books: now.books.map((b) => b.title).join("\n") }}
              fields={[{ name: "description", label: "Description", type: "textarea" }, { name: "clos", label: "CLOs — one per line: statement | Bloom", type: "textarea" }, { name: "topics", label: "32 lectures — one per line: topic | CLO number", type: "textarea" }, { name: "labPlan", label: "Lab plan — one experiment per week", type: "textarea" }, { name: "assessments", label: "Assessments — e.g. Quiz 10", type: "textarea" }, { name: "books", label: "Books — text book first", type: "textarea" }, { name: "note", label: "Note", type: "text", width: 300 }]} />
          </div>
          <Synthesizer masterCourseId={course.id} proposals={proposals.map((p) => ({ id: p.id, author: p.author }))} canApply={canApply} />
        </>
      )}
    </Shell>
  );
}
