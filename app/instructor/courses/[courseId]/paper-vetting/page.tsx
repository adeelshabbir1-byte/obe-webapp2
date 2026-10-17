import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import { navForRole } from "../../../../../components/reportNav";
import PaperVettingEditor from "../../../../../components/PaperVettingEditor";
import VettingReport from "../../../../../components/VettingReport";
import { vtdb, paperOf, type Vetting } from "../../../../../lib/paperVetting";

export const dynamic = "force-dynamic";
const STATUS: Record<string, string> = { DRAFT: "Draft", SUBMITTED: "With the Program Lead", APPROVED: "Approved", RETURNED: "Returned for improvement" };

export default async function PaperVettingPage({ params, searchParams }: { params: { courseId: string }; searchParams: { exam?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");
  const course = await prisma.course.findUnique({ where: { id: params.courseId }, select: { id: true, code: true, title: true, instructorId: true } });
  if (!course || course.instructorId !== user.id) notFound();
  const exam = searchParams.exam === "Final" ? "Final" : "Midterm";
  const shell = (c: React.ReactNode) => <Shell roleLabel="Instructor" userName={user.name} navLinks={navForRole(user.role)}><InstructorCourseSubNav courseId={course.id} active="paper-vetting" code={course.code} title={course.title} />{c}</Shell>;
  const v = (await vtdb.paperVetting.findUnique({ where: { courseId_examType: { courseId: course.id, examType: exam } } }).catch(() => undefined)) as Vetting | null | undefined;
  if (v === undefined) return shell(<div className="err">Run prisma/migration_paper_vetting.sql first.</div>);
  const { items, clos } = await paperOf(course.id, exam);
  const cOf = new Map(clos.map((c) => [c.id, c.code]));
  const rows = items.map((i) => ({ id: i.id, no: i.questionNo, clo: (i.cloId && cOf.get(i.cloId)) || "no CLO", level: i.cognitiveLevel || "", marks: i.marks, topic: i.topicText }));
  const qs = v ? (JSON.parse(v.questionsJson) as Record<string, string>) : {};
  return shell(<>
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0" }}>
      {["Midterm", "Final"].map((e) => <Link key={e} href={`?exam=${e}`} className="act" style={{ fontWeight: exam === e ? 700 : 400 }}>{e} paper</Link>)}
      <span className="small-note">Status: <b>{STATUS[v?.status || "DRAFT"]}</b>{v && v.round > 1 ? ` · round ${v.round}` : ""}</span>
      <Link href={`/instructor/courses/${course.id}/paper-distribution`} className="act">Edit questions' CLO, level and marks</Link>
    </div>
    <p className="small-note">Write each question as it will appear. The system checks it against your plan (CLOs taught, marks per CLO, Bloom levels); the AI check reads the wording and says which CLO and level it really tests. Then send it to the Program Lead, who approves or returns it.</p>
    {v?.status === "RETURNED" && v.reviewNote && <div className="card" style={{ borderLeft: "4px solid #B3261E" }}><b>Program Lead&apos;s comments:</b> {v.reviewNote}</div>}
    {v?.status === "APPROVED" && <div className="card" style={{ borderLeft: "4px solid #1F5E36" }}><b>Approved</b>{v.reviewNote ? `: ${v.reviewNote}` : ""}</div>}
    {rows.length ? <PaperVettingEditor courseId={course.id} examType={exam} items={rows} initial={qs} note={v?.teacherNote || ""} status={v?.status || "DRAFT"} /> : <div className="card small-note">Set up the {exam.toLowerCase()} paper under Paper Distribution first (questions with CLO, Bloom level and marks).</div>}
    <VettingReport systemJson={v?.systemJson || null} aiJson={v?.aiJson || null} items={rows.map((r) => ({ ...r, text: qs[r.id] || "" }))} />
  </>);
}
