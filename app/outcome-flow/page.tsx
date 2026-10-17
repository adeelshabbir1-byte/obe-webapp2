import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, coordinatorIdsFor } from "../../lib/reportScope";
import DegreeBatchFilter from "../../components/DegreeBatchFilter";
import OutcomeFlow from "../../components/OutcomeFlow";
import { batchFlow, courseChain, cohortSuggestion, FLOW_VIEW_ROLES } from "../../lib/outcomeFlow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Outcome Flow page. Program leaders (OMC, Program Lead, Chairman, Institute Head, Dean) choose a batch; a Subject
// Expert or Instructor chooses one of their own courses and sees that course's chain only.
export default async function OutcomeFlowPage({ searchParams }: { searchParams: { batchId?: string; degree?: string; courseId?: string; cohort?: string } }) {
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
        How every assessment feeds a CLO, every CLO its course, every course its PLOs and every PLO the program&apos;s objectives (PEOs) — with the
        weight of each link and how many students reach each outcome. Batch PLO attainment is the weighted average of its courses; a PEO&apos;s, of its PLOs.
        {canEdit ? " You set the Course → PLO weights (per batch) and PLO → PEO weights (per program); assessment and CLO weights come from each course plan." : ""}
      </p>
    </>
  );

  if (own) {
    const mine = await prisma.course.findMany({ where: user.role === "SUBJECT_EXPERT" ? { subjectExpertId: user.id } : { instructorId: user.id, isOffered: true }, orderBy: { code: "asc" }, select: { id: true, code: true, title: true, batch: { select: { degreeProgram: true, batchName: true } } } });
    const pick = mine.find((c) => c.id === searchParams.courseId) || mine[0] || null;
    const chain = pick ? await courseChain(pick.id) : null;
    const flow = chain?.course.batchId ? await batchFlow(chain.course.batchId) : null;
    const ploNumbers = new Set(chain?.clos.map((c) => c.ploNumber).filter((n): n is number => n !== null));
    const plos = (flow?.plos || []).filter((p) => p.courses.some((c) => c.id === pick?.id) || ploNumbers.has(p.number)).map((p) => ({ ...p, courses: p.courses.filter((c) => c.id === pick?.id) }));
    const keep = new Set(plos.map((p) => p.number));
    const peos = (flow?.peos || []).map((e) => ({ ...e, links: e.links.filter((l) => keep.has(l.ploNumber)) })).filter((e) => e.links.length);
    return (
      <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
        {intro}
        <form className="card no-print" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ fontSize: 12.5 }}>Course</label>
          <select name="courseId" defaultValue={pick?.id || ""} style={{ minWidth: 320 }}>{mine.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}{c.batch ? ` (${c.batch.batchName})` : ""}</option>)}</select>
          <button className="btn" type="submit">Show</button>
        </form>
        {!pick && <div className="card"><p style={{ margin: 0 }}>You have no course yet.</p></div>}
        {pick && chain && <OutcomeFlow key={pick.id} mode="course" batchId={chain.course.batchId} canEdit={false} target={flow?.target || 60}
          courses={[{ id: pick.id, code: chain.course.code, title: chain.course.title, courseType: "", creditHours: chain.course.creditHours, semesterNumber: null, family: flow?.courses.find((c) => c.id === pick.id)?.family || "COMPUTING" }]}
          plos={plos} peos={peos} initialChain={chain} peoNote="No program objective is linked to this course's PLOs yet." />}
      </Shell>
    );
  }

  const leads = await coordinatorIdsFor(user);
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: leads } }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }], select: { id: true, degreeProgram: true, batchName: true } });
  const batch = batches.find((b) => b.id === searchParams.batchId) || null;
  const flow = batch ? await batchFlow(batch.id) : null;
  const cohort = batch && canEdit && searchParams.cohort === "1" ? await cohortSuggestion(batch.id) : null;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      {intro}
      <div className="card no-print" style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
        <DegreeBatchFilter batches={batches} selectedDegree={searchParams.degree || ""} selectedBatchId={searchParams.batchId || ""} />
        {batch && canEdit && (searchParams.cohort === "1"
          ? <span style={{ fontSize: 12.5 }}>{cohort?.prevLabel ? <>Compared with last batch: <b>{cohort.prevLabel}</b> — open a PLO&apos;s weights to see its cohort suggestion.</> : "No earlier batch of this program to compare with."}</span>
          : <Link className="btn btn-secondary" href={`/outcome-flow?batchId=${batch.id}&degree=${encodeURIComponent(searchParams.degree || "")}&cohort=1`}>Compare with last batch</Link>)}
        {batch && canEdit && <Link href={`/omc/plo-weights?batchId=${batch.id}`} style={{ fontSize: 12.5, marginLeft: "auto" }}>All PLO weights as a table →</Link>}
      </div>
      {!batch && <div className="card"><p style={{ margin: 0, fontSize: 13, color: "var(--slate)" }}>Choose a batch above.</p></div>}
      {flow?.missing && <div className="err">The outcome weight tables are not in the database yet — run prisma/migration_plo_weights.sql (or the System Health fix script) in Supabase. Until then every PLO uses the equal split and PEOs have no links.</div>}
      {flow && <OutcomeFlow key={batch!.id} mode="batch" batchId={batch!.id} canEdit={canEdit} target={flow.target} courses={flow.courses} plos={flow.plos} peos={flow.peos} cohort={cohort} />}
    </Shell>
  );
}
