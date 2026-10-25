import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, coordinatorIdsFor } from "../../lib/reportScope";
import DegreeBatchFilter from "../../components/DegreeBatchFilter";
import OutcomeFlow from "../../components/OutcomeFlow";
import CourseFlowPanel from "../../components/CourseFlowPanel";
import CoursePicker from "../../components/CoursePicker";
import { computeCurrentSemesterNumber } from "../../lib/termLogic";
import { cachedBatchFlow, cohortSuggestion, FLOW_VIEW_ROLES } from "../../lib/outcomeFlow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Outcome Flow page. Program leaders (OMC, Program Lead, Chairman, Institute Head, Dean) choose a batch; a Subject
// Expert or Instructor chooses one of their own courses and sees that course's chain only.
export default async function OutcomeFlowPage({ searchParams }: { searchParams: { batchId?: string; degree?: string; courseId?: string; cohort?: string; semester?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const leader = FLOW_VIEW_ROLES.includes(user.role);
  const own = user.role === "SUBJECT_EXPERT" || user.role === "INSTRUCTOR";
  if (!leader && !own) redirect("/dashboard");
  const canEdit = user.role === "OMC";
  const intro = (
    <>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Outcome Flow</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12 }}>
        How every assessment feeds a CLO, every CLO its course, every course its GAs and every GA the program&apos;s objectives (PEOs) — with the
        weight of each link and how many students reach each outcome. Batch GA attainment is the weighted average of its courses; a PEO&apos;s, of its GAs.
        {canEdit ? " You set the Course → GA weights (per batch) and GA → PEO weights (per program); assessment and CLO weights come from each course plan." : ""}
      </p>
    </>
  );

  if (own) {
    const mine = await prisma.course.findMany({ where: user.role === "SUBJECT_EXPERT" ? { subjectExpertId: user.id } : { instructorId: user.id, isOffered: true }, orderBy: { code: "asc" }, select: { id: true, code: true, title: true, batch: { select: { degreeProgram: true, batchName: true } } } });
    const pick = mine.find((c) => c.id === searchParams.courseId) || mine[0] || null;
    return (
      <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
        {intro}
        <form className="card no-print" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ fontSize: 12.5 }}>Course</label>
          <select name="courseId" defaultValue={pick?.id || ""} style={{ minWidth: 320 }}>{mine.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}{c.batch ? ` (${c.batch.batchName})` : ""}</option>)}</select>
          <button className="btn" type="submit">Show</button>
        </form>
        {!pick && <div className="card"><p style={{ margin: 0 }}>You have no course yet.</p></div>}
        {pick && <CourseFlowPanel key={pick.id} courseId={pick.id} />}
      </Shell>
    );
  }

  const leads = await coordinatorIdsFor(user);
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: leads } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }], select: { id: true, degreeProgram: true, batchName: true } });
  const batch = batches.find((b) => b.id === searchParams.batchId) || null;
  // Course picker: batch → semester (any; current highlighted) → course. With a course chosen, show that course's flow only.
  const cs = await prisma.course.findMany({ where: { coordinatorId: { in: leads } }, select: { id: true, code: true, title: true, batchId: true, semesterNumber: true }, orderBy: { code: "asc" } });
  const full = await prisma.batch.findMany({ where: { id: { in: batches.map((x) => x.id) } }, select: { id: true, startTerm: true, startYear: true } });
  const now = new Date(), cur = { termName: now.getMonth() < 6 ? "Spring" : "Fall", year: now.getFullYear() };
  const curSem = (id: string) => { const f = full.find((x) => x.id === id); if (!f) return null; const n = computeCurrentSemesterNumber(f, cur); return n >= 1 && n <= 12 ? n : null; };
  const pickBatches = batches.map((x) => ({ id: x.id, label: `${x.degreeProgram} — ${x.batchName}`, current: curSem(x.id) }));
  const picked = searchParams.courseId ? cs.find((c) => c.id === searchParams.courseId) || null : null;
  const semester = searchParams.semester ? Number(searchParams.semester) : null;
  const flow = batch ? await cachedBatchFlow(batch.id) : null;
  const obeNote = batch ? (await (await import("../../lib/obeTerm")).batchObeNote(batch.id).catch(() => null))?.text || null : null;
  const cohort = batch && canEdit && searchParams.cohort === "1" ? await cohortSuggestion(batch.id) : null;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      {intro}
      <div className="card no-print" style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <DegreeBatchFilter batches={batches} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} />
        {batch && canEdit && (searchParams.cohort === "1"
          ? <span style={{ fontSize: 12.5 }}>{cohort?.prevLabel ? <>Compared with last batch: <b>{cohort.prevLabel}</b> — open a GA&apos;s weights to see its cohort suggestion.</> : "No earlier batch of this program to compare with."}</span>
          : <Link className="btn btn-secondary" href={`/outcome-flow?batchId=${batch.id}&degree=${encodeURIComponent(searchParams.degree || "")}&cohort=1`}>Compare with last batch</Link>)}
        {batch && canEdit && <Link href={`/omc/plo-weights?batchId=${batch.id}`} style={{ fontSize: 12.5, marginLeft: "auto" }}>All GA weights as a table →</Link>}
      </div>
      <div className="card no-print"><CoursePicker basePath="/outcome-flow" batches={pickBatches} courses={cs.map((c) => ({ id: c.id, code: c.code, title: c.title, batchId: c.batchId, semester: c.semesterNumber }))} batchId={searchParams.batchId || ""} semester={semester} courseId={picked?.id || ""} extra={searchParams.degree ? { degree: searchParams.degree } : {}} />
        {picked && <p className="small-note" style={{ marginBottom: 0 }}><Link href={`/outcome-flow?batchId=${picked.batchId || ""}`}>← Back to the whole batch&apos;s flow</Link></p>}</div>
      {picked && <CourseFlowPanel key={picked.id} courseId={picked.id} />}
      {!batch && !picked && <div className="card"><p style={{ margin: 0, fontSize: 13, color: "var(--slate)" }}>Choose a batch above.</p></div>}
      {flow?.missing && <div className="err">The outcome weight tables are not in the database yet — run prisma/migration_plo_weights.sql (or the System Health fix script) in Supabase. Until then every GA uses the equal split and PEOs have no links.</div>}
      {flow && !picked && obeNote && <p className="small-note" style={{ borderLeft: "4px solid #B26A00", paddingLeft: 8 }}>{obeNote}</p>}
      {flow && !picked && <OutcomeFlow key={batch!.id} mode="batch" batchId={batch!.id} canEdit={canEdit} target={flow.target} courses={flow.courses} plos={flow.plos} peos={flow.peos} cohort={cohort} />}
    </Shell>
  );
}
