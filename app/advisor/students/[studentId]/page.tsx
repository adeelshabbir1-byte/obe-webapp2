import AdviserNotes from "./AdviserNotes";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import StudentPicker from "../../../../components/StudentPicker";
import PersonAvatar from "../../../../components/PersonAvatar";
import { studentPhotos } from "../../../../lib/studentPhotos";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { roleLabel } from "../../../../lib/reportScope";
import { navForRole } from "../../../../components/reportNav";
import Shell from "../../../../components/Shell";
import AdvisorStudentPlanner from "../../../../components/AdvisorStudentPlanner";
import { computeCgpa, standingFromCgpa } from "../../../../lib/academicStanding";
import { computeCurrentSemesterNumber } from "../../../../lib/termLogic";
import { syncSemesters, holdBacks } from "../../../../lib/semesterSync";
import KeyButton from "../../../../components/KeyButton";
import AdvisorCourseStatus from "../../../../components/AdvisorCourseStatus";
import { liveCourseStatus, plannedVsActual } from "../../../../lib/studentCourseStatus";
import { ActionButton } from "../../../../components/fyp/FypClient";
import PlanHistoryPanel from "../../../../components/PlanHistoryPanel";
import Tabs from "../../../../components/Tabs";
import GaMatrix from "../../../../components/GaMatrix";
import TranscriptView from "../../../../components/TranscriptView";
import { repeatsOf } from "../../../../lib/repeats";
import SuggestPlanPanel from "../../../../components/SuggestPlanPanel";

export const dynamic = "force-dynamic";

const STANDING: Record<string, [string, string]> = { PROBATION: ["Probation", "badge-no"], WARNING: ["Warning", "badge-warn"], GOOD_STANDING: ["Good standing", "badge-ok"] };

/** One advisee: who they are, where they stand, their current courses, and their degree plan to manage. */
export default async function AdvisorStudentPage({ params, searchParams }: { params: { studentId: string }; searchParams: { tab?: string; ga?: string; view?: string; t?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const s = await prisma.student.findUnique({
    where: { id: params.studentId },
    include: { batch: true, enrollments: { where: { course: { isOffered: true } }, include: { course: { select: { code: true, title: true, creditHours: true } } } } },
  });
  if (!s || s.batch?.advisorId !== user.id) notFound();
  // The student's semester follows the calendar (unless held back) — bring it up to date before showing anything.
  if (s.batch && (await syncSemesters([s.batch.coordinatorId])) > 0) s.currentSemesterNumber = (await prisma.student.findUnique({ where: { id: s.id }, select: { currentSemesterNumber: true } }))?.currentSemesterNumber ?? s.currentSemesterNumber;
  const held = (await holdBacks([s.id])).get(s.id);
  const cgpa = await computeCgpa(s.id);
  const [label, tone] = STANDING[standingFromCgpa(cgpa)] || ["—", "badge-neutral"];
  const ct = s.batch ? await prisma.currentTerm.findUnique({ where: { coordinatorId: s.batch.coordinatorId } }) : null;
  const expected = s.batch && ct ? computeCurrentSemesterNumber(s.batch, ct) : null;
  const pending = await prisma.registrationApprovalRequest.count({ where: { studentId: s.id, status: "PENDING" } });
  // Tabs (Adeel prompt §20): each tab's data is loaded only when that tab is open.
  const TAB_KEYS = ["overview", "semester", "register", "transcript", "plan", "history", "obe"];
  const tab = TAB_KEYS.includes(searchParams.tab || "") ? searchParams.tab! : "overview";
  const base = `/advisor/students/${s.id}`;
  const [live, history] = tab === "semester" || tab === "overview" ? await Promise.all([liveCourseStatus(s.id).catch(() => []), plannedVsActual(s.id).catch(() => [])]) : [[], []];
  const repeats = tab === "overview" ? await repeatsOf(s.id).catch(() => []) : [];
  const atRisk = (live as { status?: string; atRisk?: boolean }[]).filter((c) => c.atRisk || c.status === "AT_RISK").length;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <Link href="/advisor/dashboard" style={{ fontSize: 13 }}>← All advisees</Link>
      <StudentPicker current={s.id} template="/advisor/students/{id}" label="Another student" />
      <div className="card" style={{ marginTop: 10 }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 21, margin: 0 }}><PersonAvatar name={s.name} photo={(await studentPhotos([s.id])).get(s.id)} size={44} />{s.name}</h1>
            <div style={{ fontSize: 13, color: "var(--slate)" }}>{s.rollNumber} · {s.batch ? `${s.batch.degreeProgram} — ${s.batch.batchName}` : ""} · Semester {s.currentSemesterNumber} · <Link href={`/prediction/student/${s.id}`}>Prediction</Link></div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 18, alignItems: "center" }}>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 11.5, color: "var(--slate)" }}>CGPA</div><div style={{ fontSize: 22, fontWeight: 700 }}>{cgpa !== null ? cgpa.toFixed(2) : "—"}</div></div>
            <span className={`badge ${tone}`}>{label}</span>
            {pending > 0 && <Link href="/advisor/dashboard" className="badge badge-warn">{pending} request{pending > 1 ? "s" : ""} waiting</Link>}
          </div>
        </div>
        <div style={{ fontSize: 12.5, marginTop: 10 }}>
          <b>This semester:</b> {s.enrollments.length ? s.enrollments.map((e) => `${e.course.code} ${e.course.title} (${e.course.creditHours})`).join(" · ") : <span style={{ color: "var(--slate)" }}>not enrolled in any course</span>}
        </div>
      </div>
      {expected !== null && expected > 0 && expected !== s.currentSemesterNumber && (
        <div className="err" style={{ background: "#FFF8EC", color: "#7A5208" }}>
          The student is in <b>semester {s.currentSemesterNumber}</b>; by the calendar ({ct!.termName} {ct!.year}) the batch is in <b>semester {expected}</b>{held ? <> — held back by the Program Lead{held.reason ? ` (${held.reason})` : ""}.</> : "."}
        </div>
      )}
      <Tabs base={base} current={tab} tabs={[
        { key: "overview", label: "Overview", badge: repeats.filter((r) => r.kind === "MUST").length || (label === "Probation" ? "!" : null), warn: true },
        { key: "semester", label: "This semester", badge: atRisk || null, warn: atRisk > 0 },
        { key: "register", label: "Register next", badge: pending || null },
        { key: "transcript", label: "Transcript" },
        { key: "plan", label: "Degree plan" },
        { key: "history", label: "History & notes" },
        { key: "obe", label: "OBE transcript" },
      ]} />
      {tab === "overview" && <>
        <div style={{ marginTop: 8 }}><KeyButton url="/api/parent-link" body={{ studentId: s.id, action: "create" }} label="Parent / guardian link" /></div>
        {repeats.length > 0 && (
          <div className="card" style={{ marginTop: 10 }}>
            <h3 style={{ marginTop: 0, fontSize: 15 }}>Courses to repeat or improve</h3>
            <ul style={{ paddingLeft: 18, fontSize: 13, margin: 0 }}>{repeats.map((r) => (
              <li key={r.code} style={{ marginBottom: 4 }}>
                <b style={{ color: r.kind === "MUST" ? "#B3261E" : r.kind === "IMPROVE" ? "#B26A00" : "inherit" }}>{r.code} {r.title}</b> — {r.grade} ({r.term}) <span className="badge" style={{ background: r.kind === "MUST" ? "#FBE9E7" : "#FBF3E4" }}>{r.kind === "MUST" ? "Must repeat" : r.kind === "IMPROVE" ? "Can improve" : "Check"}</span>
                {r.options.length ? <div className="small-note">Retake {r.options.map((o) => `${o.when === "now" ? "this term" : "next term"} ${o.label}`).join(" · or ")}
                  {r.options.filter((o) => o.when === "now").slice(0, 1).map((o) => <span key={o.courseId}> · <ActionButton url={`/api/advisor/students/${s.id}/retake-request`} body={{ courseId: o.courseId }} label="Request out-of-batch registration" className="btn btn-sm" done="Requested ✓" /></span>)}</div> : <div className="small-note">Not offered to another batch now or next term — consider a summer / repeat offering.</div>}
              </li>
            ))}</ul>
          </div>
        )}
        <div className="card" style={{ marginTop: 10, fontSize: 13 }}>
          <div><b>This semester:</b> {s.enrollments.length} course{s.enrollments.length === 1 ? "" : "s"}{atRisk ? ` · ${atRisk} at risk` : ""} — <Link href={`${base}?tab=semester`}>open</Link></div>
          <div><b>Register next:</b> {pending ? `${pending} request(s) waiting · ` : ""}<Link href={`${base}?tab=register`}>see recommended courses</Link></div>
          <div><b>OBE:</b> <Link href={`${base}?tab=obe`}>GA matrix and degree audit</Link></div>
        </div>
      </>}
      {tab === "semester" && <>
        <AdvisorCourseStatus courses={live} history={history} />
        {live.length > 0 && <div style={{ marginTop: 8 }}><ActionButton url={`/api/advisor/students/${s.id}/freeze-grades`} body={{}} label="Save target grades as this semester's plan" className="btn btn-secondary btn-sm" done="Saved" /></div>}
        <AdvisorStudentPlanner studentId={s.id} part="semester" />
      </>}
      {tab === "register" && <AdvisorStudentPlanner studentId={s.id} part="register" />}
      {tab === "transcript" && <AdvisorStudentPlanner studentId={s.id} part="transcript" />}
      {tab === "plan" && <><SuggestPlanPanel studentId={s.id} probation={label === "Probation"} /><AdvisorStudentPlanner studentId={s.id} part="plan" /></>}
      {tab === "history" && <PlanHistoryPanel studentId={s.id} staff />}
      {tab === "obe" && <>
        <div className="no-print" style={{ fontSize: 13, margin: "4px 0 8px" }}>View: {searchParams.view === "plo" ? <Link href={`${base}?tab=obe`}>GA matrix</Link> : <b>GA matrix</b>} · {searchParams.view === "plo" ? <b>GA list & degree audit</b> : <Link href={`${base}?tab=obe&view=plo`}>GA list & degree audit</Link>}</div>
        {searchParams.view === "plo" ? <TranscriptView studentId={s.id} tab={searchParams.t || "plo"} base={`${base}?tab=obe&view=plo`} param="t" staff /> : <GaMatrix studentId={s.id} base={base} ga={searchParams.ga ? Number(searchParams.ga) : null} />}
      </>}
      <AdviserNotes studentId={s.id} />
    </Shell>
  );
}
