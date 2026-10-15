import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import Shell from "../../components/Shell";
import OverlapVerdict from "../../components/OverlapVerdict";
import { canEditLinks, visibleCourses } from "../../lib/topicLinks";
import { overlapMatrix, pairKey } from "../../lib/overlapMatrix";

export const dynamic = "force-dynamic";
export const metadata = { title: "Topic Overlap Matrix" };
const ROLES = ["SUBJECT_EXPERT", "INSTRUCTOR", "PROGRAM_COORDINATOR", "OMC", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "CHAIRMAN"];

// Topics taught in more than one course of a program, as a course-by-course matrix. Each repeat is judged an
// intentional progression or an accidental duplication.
export default async function TopicOverlapsPage({ searchParams }: { searchParams: { program?: string; a?: string; b?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!ROLES.includes(user.role)) redirect("/dashboard");

  const visible = await visibleCourses(user);
  const programs = Array.from(new Map(visible.map((c) => [c.coordinatorId, c.batch?.degreeProgram || "Program"])).entries()).sort((x, y) => x[1].localeCompare(y[1]));
  const program = programs.find(([id]) => id === searchParams.program)?.[0] || programs[0]?.[0] || null;
  const m = program ? await overlapMatrix(program) : null;
  const sel = m && searchParams.a && searchParams.b ? m.cells[pairKey(searchParams.a, searchParams.b)] || [] : null;
  const selA = sel ? m!.courses.find((c) => c.code === searchParams.a) : null, selB = sel ? m!.courses.find((c) => c.code === searchParams.b) : null;
  const pick = { id: true, coordinatorId: true, subjectExpertId: true } as const;
  const [ca, cb] = selA && selB ? await Promise.all([prisma.course.findUnique({ where: { id: selA.id }, select: pick }), prisma.course.findUnique({ where: { id: selB.id }, select: pick })]) : [null, null];
  const canEdit = ca && cb ? await canEditLinks(user, ca, cb) : false;
  const maxCount = m ? Math.max(1, ...Object.values(m.cells).map((x) => x.length)) : 1;
  const open = (cell: { verdict: string | null }[]) => cell.filter((x) => !x.verdict).length;
  const dupes = (cell: { verdict: string | null }[]) => cell.filter((x) => x.verdict === "DUPLICATION").length;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Topic Overlap Matrix</h1>
          <p style={{ color: "var(--slate)", fontSize: 13, margin: 0, maxWidth: 900 }}>
            Topics taught in two courses of the program. A repeat can be an <b>intentional progression</b> (a later course on the same chain builds on it)
            or an <b>accidental duplication</b> (teaching time spent twice). Open a cell to judge each repeat; the system suggests one from the prerequisite chain and semesters.
          </p>
        </div>
        <Link href="/topic-prerequisites" className="btn btn-secondary btn-sm">Prerequisite Topics</Link>
      </div>

      {programs.length > 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0" }}>
          {programs.map(([id, name]) => <Link key={id} href={`/topic-overlaps?program=${id}`} className={`btn btn-sm ${id === program ? "btn-brass" : "btn-secondary"}`}>{name}</Link>)}
        </div>
      )}
      {!m && <div className="card">You have no courses yet.</div>}

      {m && (
        <>
          <div className="card">
            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, marginBottom: 8 }}>
              <span><b>{m.courses.length}</b> courses</span><span><b>{m.total}</b> repeated topics</span><span><b>{m.reviewed}</b> judged</span>
              <span><b>{Object.values(m.cells).reduce((n, c) => n + dupes(c), 0)}</b> marked as duplication</span>
            </div>
            {m.courses.length < 2 ? <p className="small-note">Not enough courses with lecture plans.</p> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 11.5 }}>
                  <thead>
                    <tr><th style={{ position: "sticky", left: 0, background: "var(--card, #fff)" }} />{m.courses.slice(1).map((c) => <th key={c.id} title={c.title} style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>{c.code}<div className="small-note" style={{ fontWeight: 400 }}>S{c.semester ?? "?"}</div></th>)}</tr>
                  </thead>
                  <tbody>
                    {m.courses.slice(0, -1).map((r, i) => (
                      <tr key={r.id}>
                        <th title={r.title} style={{ position: "sticky", left: 0, background: "var(--card, #fff)", textAlign: "left", whiteSpace: "nowrap", padding: "4px 6px" }}>{r.code} <span className="small-note" style={{ fontWeight: 400 }}>S{r.semester ?? "?"}</span></th>
                        {m.courses.slice(1).map((c, j) => {
                          if (j < i) return <td key={c.id} />;
                          const cell = m.cells[pairKey(r.code, c.code)];
                          if (!cell) return <td key={c.id} style={{ border: "1px solid var(--line)", minWidth: 34 }} />;
                          const intensity = cell.length / maxCount;
                          const selected = searchParams.a && pairKey(searchParams.a, searchParams.b || "") === pairKey(r.code, c.code);
                          return (
                            <td key={c.id} style={{ border: "1px solid var(--line)", textAlign: "center", padding: 0, minWidth: 34, background: dupes(cell) ? `rgba(166,61,64,${0.15 + intensity * 0.6})` : open(cell) ? `rgba(196,154,60,${0.15 + intensity * 0.6})` : `rgba(46,125,91,${0.12 + intensity * 0.4})`, outline: selected ? "2px solid var(--navy-900)" : undefined }}>
                              <Link href={`/topic-overlaps?program=${program}&a=${r.code}&b=${c.code}`} title={`${r.code} × ${c.code}: ${cell.length} shared topic(s), ${open(cell)} not judged`} style={{ display: "block", padding: "5px 4px", color: "inherit", textDecoration: "none", fontWeight: 600 }}>{cell.length}</Link>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="small-note" style={{ marginBottom: 0 }}>Number = topics both courses teach. Amber: not judged yet · red: has a duplication · green: all judged as progression. Darker = more topics.</p>
          </div>

          {sel && selA && selB && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>{selA.code} {selA.title} × {selB.code} {selB.title}</h3>
              {sel.length === 0 ? <p className="small-note">No shared topics.</p> : (
                <table>
                  <thead><tr><th>{selA.code}</th><th>{selB.code}</th><th>Match</th><th>Judgement</th></tr></thead>
                  <tbody>{sel.map((x) => (
                    <tr key={x.topicKey}>
                      <td>{x.topicA}</td><td>{x.topicB}</td><td className="small-note">{Math.round(x.score * 100)}%</td>
                      <td><OverlapVerdict coordinatorId={program!} codeA={selA.code} codeB={selB.code} topicA={x.topicA} topicB={x.topicB} verdict={x.verdict} suggested={x.suggested} canEdit={!!canEdit} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
              {!canEdit && <p className="small-note">Only the Subject Expert of one of these courses, the Program Lead or the OMC can judge these repeats.</p>}
            </div>
          )}

          {m.recurring.length > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Topics taught in three or more courses</h3>
              <table>
                <thead><tr><th>Topic</th><th>Courses</th></tr></thead>
                <tbody>{m.recurring.map((g) => <tr key={g.topic}><td>{g.topic}</td><td className="small-note">{g.codes.join(", ")}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
