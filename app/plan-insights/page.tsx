import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor, coordinatorIdsFor } from "../../lib/reportScope";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { ActionForm } from "../../components/fyp/FypClient";
import { extraCourseSuggestions, minClass } from "../../lib/extraCourses";
import { checkCurriculumChanges } from "../../lib/curriculumWatch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Extra courses to offer" };
const ROLES = ["PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN", "DEAN", "DEPARTMENT_COORDINATOR", "OMC"];

// Extra sections that would let students who are behind finish with their batch, and how many each would help.
export default async function PlanInsightsPage({ searchParams }: { searchParams: { program?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!ROLES.includes(user.role)) redirect("/dashboard");
  const chairmanId = await chairmanIdFor(user);
  const leads = user.role === "CHAIRMAN" || user.role === "OMC" ? (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } })).map((u) => u.id) : await coordinatorIdsFor(user);
  const programs = Array.from(new Set((await prisma.batch.findMany({ where: { coordinatorId: { in: leads.concat(["none"]) } }, select: { degreeProgram: true } })).map((b) => b.degreeProgram))).sort();
  const program = programs.find((p) => p === searchParams.program) || programs[0] || null;
  const [min, res, changes] = await Promise.all([
    minClass(chairmanId),
    program ? extraCourseSuggestions(chairmanId, leads, program).catch((e) => { console.error("plan-insights", e); return null; }) : Promise.resolve(null),
    checkCurriculumChanges(chairmanId).catch(() => []),
  ]);
  const worth = (res?.suggestions || []).filter((s) => s.students.length >= min);
  const rest = (res?.suggestions || []).filter((s) => s.students.length < min);
  const Row = ({ s }: { s: NonNullable<typeof res>["suggestions"][number] }) => (
    <tr>
      <td><b>{s.code}</b> {s.title}</td>
      <td>{s.termLabel}{s.summer ? <span className="small-note"> (summer)</span> : null}</td>
      <td style={{ textAlign: "center", fontWeight: 700 }}>{s.students.length}</td>
      <td className="small-note" style={{ maxWidth: 520 }}>{s.students.map((x) => `${x.name} (${x.roll}): ${x.before} → ${x.after}`).join("; ")}</td>
    </tr>
  );
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Extra Courses to Offer</h1>
      <p className="small-note" style={{ maxWidth: 920 }}>
        For every student who is behind (a failed, withdrawn or dropped course), the degree plan is worked out with the loads their advisor saved. Where a course ends up after
        the batch&apos;s last term, the plan is tried with an extra section of it in each coming term, summers included. The table shows which extra sections would let how many
        students finish earlier. Sections that help at least <b>{min}</b> students are suggested{user.role === "CHAIRMAN" ? " (change the number below)" : " (the Institute Head sets this number)"}.
      </p>
      {changes.length > 0 && <div className="err" style={{ background: "#FFF8EC", color: "#7A5208" }}><b>Curriculum changed:</b> {changes.map((c) => `${c.program}: ${c.lines.join("; ")}`).join(" · ")}. Advisors were notified.</div>}
      <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span className="small-note">Program</span>
        {programs.map((p) => <Link key={p} href={`/plan-insights?program=${encodeURIComponent(p)}`} className={`btn btn-sm ${p === program ? "btn-brass" : "btn-secondary"}`}>{p}</Link>)}
        {user.role === "CHAIRMAN" && <span style={{ marginLeft: "auto" }}><ActionForm url="/api/plan-insights" fixed={{}} submit="Save" collapsed openLabel={`Minimum class: ${min}`} initial={{ minExtraClass: String(min) }} fields={[{ name: "minExtraClass", label: "Smallest class worth an extra section", type: "number" }]} /></span>}
      </div>
      {!res ? <div className="card"><p className="small-note" style={{ margin: 0 }}>{program ? "Could not work this out — run prisma/migration_degree_planner.sql if you haven't." : "No program."}</p></div> : (
        <>
          <p className="small-note">{res.total} students studying · {res.checked} behind · {res.late.length} would finish after their batch as planned{res.current ? ` · now ${res.current}` : ""}.</p>
          <div className="card" style={{ overflowX: "auto" }}>
            <b>Suggested extra sections ({worth.length})</b>
            {worth.length === 0 ? <p className="small-note">No extra section would help {min} or more students.</p> : (
              <table style={{ fontSize: 13, marginTop: 6 }}><thead><tr><th>Course</th><th>Term</th><th style={{ textAlign: "center" }}>Students</th><th>Who, and their finish (now → with the section)</th></tr></thead><tbody>{worth.map((s) => <Row key={s.code + s.termKey} s={s} />)}</tbody></table>
            )}
          </div>
          {rest.length > 0 && (
            <details className="card"><summary style={{ cursor: "pointer" }}>Would help fewer than {min} ({rest.length})</summary>
              <table style={{ fontSize: 12.5, marginTop: 6 }}><tbody>{rest.map((s) => <Row key={s.code + s.termKey} s={s} />)}</tbody></table>
            </details>
          )}
          {res.late.length > 0 && (
            <details className="card"><summary style={{ cursor: "pointer" }}>Students finishing late ({res.late.length})</summary>
              <table style={{ fontSize: 12.5, marginTop: 6 }}><thead><tr><th>Student</th><th>Finishes</th><th>Batch finishes</th><th></th></tr></thead>
                <tbody>{res.late.map((l) => <tr key={l.id}><td>{l.name} <span className="small-note">{l.roll}</span></td><td style={{ color: "#c93c3c" }}>{l.finish || "—"}{l.unplaced ? ` (${l.unplaced} course(s) can't be placed)` : l.late ? ` (+${l.late})` : ""}</td><td>{l.expected}</td><td><Link href={`/advisor/students/${l.id}`} className="small-note">plan</Link></td></tr>)}</tbody></table>
            </details>
          )}
        </>
      )}
    </Shell>
  );
}
