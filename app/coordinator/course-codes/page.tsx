import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { prisma } from "../../../lib/db";
import CourseCodeApply from "../../../components/CourseCodeApply";
import { proposeCodes, CODES_HINT } from "../../../lib/courseCodes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Course codes" };

export default async function CoordinatorCourseCodes({ searchParams }: { searchParams: { batch?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["PROGRAM_COORDINATOR", "OMC"].includes(user.role)) redirect("/home");
  const batches = await prisma.batch.findMany({ where: user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id } : { coordinator: { managedById: user.managedById || "none" } }, select: { id: true, degreeProgram: true, batchName: true }, orderBy: [{ degreeProgram: "asc" }, { startYear: "desc" }] });
  const sel = batches.find((b) => b.id === searchParams.batch) || batches[0];
  const p = sel ? await proposeCodes(sel.id) : null;
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Course codes</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0, maxWidth: "80ch" }}>New codes from the system your Dean set for each course&apos;s <b>home department</b>. The first digit is the <b>year of study</b> (semesters 1–2 → 1, 3–4 → 2 …). You code only your own department&apos;s courses; a course of another department (e.g. Calculus — Mathematics) keeps the code its department gave it, listed at the end. A course that already has a code in another program gets the same one, so codes stay equal everywhere. Untick or edit any code before changing. Set each course&apos;s home department on the <Link href="/coordinator/courses">Course Catalog</Link>.</p>
      <form className="card" style={{ display: "flex", gap: 8 }}><select name="batch" defaultValue={sel?.id}>{batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}</select><button className="btn btn-sm">Show</button></form>
      {!sel ? null : p === null ? <div className="err">{CODES_HINT}</div> : !p.hasSchemes ? <div className="card">Your Dean has not set a course-code system yet (Dean → Course Codes).</div> : <>
        <div className="card"><CourseCodeApply batchId={sel.id} rows={p.rows.filter((r) => !r.foreign)} /></div>
        {p.rows.some((r) => r.foreign) && <details className="card"><summary style={{ cursor: "pointer", fontWeight: 700 }}>Coded by other departments ({p.rows.filter((r) => r.foreign).length})</summary>
          <table style={{ fontSize: 12.5, width: "100%", marginTop: 6 }}><thead><tr><th>Code now</th><th>Course</th><th>Semester</th><th>Home department</th><th>Their code</th></tr></thead>
            <tbody>{p.rows.filter((r) => r.foreign).map((r) => <tr key={r.courseId}><td>{r.code}</td><td>{r.title}</td><td>{r.semester ?? "—"}</td><td>{r.home}</td><td>{r.why}</td></tr>)}</tbody></table></details>}
      </>}
    </Shell>
  );
}
