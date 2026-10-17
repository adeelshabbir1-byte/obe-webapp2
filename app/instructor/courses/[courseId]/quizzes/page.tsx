import { ensureSynced } from "../../../../../lib/sectionLink";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { chairmanIdFor } from "../../../../../lib/reportScope";
import Shell from "../../../../../components/Shell";
import InstructorCourseSubNav from "../../../../../components/InstructorCourseSubNav";
import { navForRole } from "../../../../../components/reportNav";
import { ActionForm, ActionButton } from "../../../../../components/fyp/FypClient";
import McqImport from "../../../../../components/McqImport";
import { mdb, bankOf, DIFF, BLOOM, letter, fmt, inputValue, plannedCount, type Quiz } from "../../../../../lib/mcq";

export const dynamic = "force-dynamic";

// Online quizzes: the course's MCQ bank (tagged by CLO) and quizzes drawn from it, auto-graded into marks.
export default async function QuizzesPage({ params, searchParams }: { params: { courseId: string }; searchParams: { clo?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "INSTRUCTOR") redirect("/dashboard");
  const course = await prisma.course.findUnique({ where: { id: params.courseId }, select: { id: true, code: true, title: true, instructorId: true } });
  if (!course || course.instructorId !== user.id) notFound();
  await ensureSynced(course.id); // linked section: take the main section's latest plan first
  const shell = (c: React.ReactNode) => <Shell roleLabel="Instructor" userName={user.name} navLinks={navForRole(user.role)}><InstructorCourseSubNav courseId={course.id} active="quizzes" code={course.code} title={course.title} />{c}</Shell>;
  const bank = await bankOf(await chairmanIdFor(user), course.code).catch(() => null);
  if (bank === null) return shell(<div className="err">Online quizzes are not set up yet — run prisma/migration_mcq.sql.</div>);
  const [clos, insts, quizzes] = await Promise.all([
    prisma.cLO.findMany({ where: { courseId: course.id }, select: { code: true, source: true }, orderBy: { code: "asc" } }),
    prisma.assessmentInstrument.findMany({ where: { courseId: course.id, source: "INSTRUCTOR", marksPct: { gt: 0 } }, select: { id: true, label: true, type: true }, orderBy: [{ type: "asc" }, { label: "asc" }] }),
    mdb.onlineQuiz.findMany({ where: { courseId: course.id }, orderBy: { opensAt: "desc" } }) as Promise<Quiz[]>,
  ]);
  const cloCodes = Array.from(new Set([...clos.map((c) => c.code), ...bank.map((q) => q.cloCode).filter((c): c is string => !!c)])).sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")));
  const counts = await mdb.quizAttempt.groupBy({ by: ["quizId"], _count: { _all: true }, where: { quizId: { in: quizzes.map((q) => q.id) }, submittedAt: { not: null } } }) as { quizId: string; _count: { _all: number } }[];
  const cOf = new Map(counts.map((c) => [c.quizId, c._count._all]));
  const live = bank.filter((q) => q.active);
  const shown = searchParams.clo ? bank.filter((q) => (q.cloCode || "none") === searchParams.clo) : bank;
  const cloOpts: [string, string][] = [["", "— none —"], ...cloCodes.map((c) => [c, c] as [string, string])];
  const qFields = [{ name: "stem", label: "Question", type: "textarea" as const }, ...["A", "B", "C", "D", "E"].map((l) => ({ name: `opt${l}`, label: `Option ${l}${l > "B" ? " (optional)" : ""}`, width: 230 })),
    { name: "answer", label: "Correct", type: "select" as const, options: ["A", "B", "C", "D", "E"].map((l) => [l, l] as [string, string]) }, { name: "cloCode", label: "CLO", type: "select" as const, options: cloOpts },
    { name: "difficulty", label: "Difficulty", type: "select" as const, options: DIFF }, { name: "bloom", label: "Bloom", type: "select" as const, options: [["", "—"], ...BLOOM.map((b) => [b, b] as [string, string])] as [string, string][] },
    { name: "topic", label: "Topic", width: 180 }, { name: "explanation", label: "Explanation shown after the quiz", type: "textarea" as const }];
  const now = new Date(); const later = new Date(now.getTime() + 7 * 86400000);
  return shell(<>
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Online quizzes</h3>
      </div>
      <ActionForm url="/api/mcq" fixed={{ action: "saveQuiz", courseId: course.id }} submit="Create quiz" collapsed openLabel="New quiz" initial={{ title: `Quiz ${quizzes.length + 1}`, opensAt: inputValue(now), closesAt: inputValue(later), durationMin: 20, shuffle: true, showResults: true, negativePct: 0, instrumentId: insts.find((i) => i.type === "Quiz")?.id || "" }}
        fields={[{ name: "title", label: "Title", width: 180 }, { name: "instrumentId", label: "Marks go to", type: "select", options: [["", "— not linked —"], ...insts.map((i) => [i.id, `${i.label} (${i.type})`] as [string, string])] },
          { name: "opensAt", label: "Opens (PKT)", type: "datetime-local" }, { name: "closesAt", label: "Closes (PKT)", type: "datetime-local" }, { name: "durationMin", label: "Minutes", type: "number", width: 70 },
          ...cloCodes.map((c) => ({ name: `n_${c}`, label: `${c} questions (${live.filter((q) => q.cloCode === c).length} in bank)`, type: "number" as const, width: 90 })), { name: "n_ANY", label: `Any CLO (${live.length} in bank)`, type: "number", width: 90 },
          { name: "negativePct", label: "Negative marking %", type: "number", width: 80 }, { name: "shuffle", label: "Shuffle questions and options", type: "checkbox" }, { name: "showResults", label: "Show score to students", type: "checkbox" }]} />
      <table style={{ marginTop: 8 }}><thead><tr><th>Quiz</th><th>Window</th><th>Questions</th><th>Submitted</th><th>Status</th><th /></tr></thead>
        <tbody>{quizzes.map((q) => <tr key={q.id}><td><Link href={`/instructor/courses/${course.id}/quizzes/${q.id}`}><b>{q.title}</b></Link><div className="small-note">{insts.find((i) => i.id === q.instrumentId)?.label || "not linked to marks"}</div></td><td style={{ fontSize: 12.5 }}>{fmt(q.opensAt)} → {fmt(q.closesAt)} · {q.durationMin} min</td><td>{plannedCount(q)}</td><td>{cOf.get(q.id) || 0}</td><td>{q.status === "PUBLISHED" ? "Published" : q.status === "CLOSED" ? "Closed" : "Draft"}</td>
          <td style={{ whiteSpace: "nowrap" }}>{q.status !== "PUBLISHED" ? <ActionButton url="/api/mcq" body={{ courseId: course.id, quizId: q.id, action: "status", status: "PUBLISHED" }} label="Publish" /> : <ActionButton url="/api/mcq" body={{ courseId: course.id, quizId: q.id, action: "status", status: "CLOSED" }} label="Close" className="btn btn-secondary btn-sm" />} {!cOf.get(q.id) && <ActionButton url="/api/mcq" body={{ courseId: course.id, quizId: q.id, action: "deleteQuiz" }} label="Delete" className="btn btn-secondary btn-sm" confirmText="Delete this quiz?" />}</td></tr>)}</tbody></table>
      {!quizzes.length && <p className="small-note">No quizzes yet. Build the question bank below, then create a quiz that draws questions per CLO. Every student gets a different random set.</p>}
    </div>

    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Question bank — {course.code} <span className="small-note">shared by every section of this course</span></h3>
        <McqImport courseId={course.id} />
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
        <Link href={`/instructor/courses/${course.id}/quizzes`} className="act">All {bank.length}</Link>
        {[...cloCodes, "none"].map((c) => <Link key={c} href={`/instructor/courses/${course.id}/quizzes?clo=${c}`} className="act" style={{ fontWeight: searchParams.clo === c ? 700 : 400 }}>{c === "none" ? "No CLO" : c} {bank.filter((q) => (q.cloCode || "none") === c).length}</Link>)}
        <span className="small-note">Easy {live.filter((q) => q.difficulty === "EASY").length} · Medium {live.filter((q) => q.difficulty === "MEDIUM").length} · Hard {live.filter((q) => q.difficulty === "HARD").length}</span>
      </div>
      <ActionForm url="/api/mcq" fixed={{ action: "addQ", courseId: course.id }} submit="Add question" collapsed openLabel="Add a question" initial={{ answer: "A", difficulty: "MEDIUM", cloCode: searchParams.clo && searchParams.clo !== "none" ? searchParams.clo : cloCodes[0] || "" }} fields={qFields} />
      {shown.map((q, n) => { const opts = JSON.parse(q.optionsJson) as string[]; return (
        <div key={q.id} style={{ borderTop: "1px solid #E3E9F0", padding: "8px 0", opacity: q.active ? 1 : 0.5, fontSize: 13.5 }}>
          <div><b>{n + 1}.</b> {q.stem} <span className="small-note">{[q.cloCode, q.difficulty.toLowerCase(), q.bloom, q.topic].filter(Boolean).join(" · ")}{q.active ? "" : " · retired"}</span></div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "3px 0" }}>{opts.map((o, i) => <span key={i} style={{ color: i === q.correct ? "#1F5E36" : undefined, fontWeight: i === q.correct ? 700 : 400 }}>{letter(i)}. {o}</span>)}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <ActionForm url="/api/mcq" fixed={{ action: "editQ", courseId: course.id, id: q.id }} submit="Save" collapsed openLabel="Edit" fields={qFields}
              initial={{ stem: q.stem, ...Object.fromEntries(opts.map((o, i) => [`opt${letter(i)}`, o])), answer: letter(q.correct), cloCode: q.cloCode || "", difficulty: q.difficulty, bloom: q.bloom || "", topic: q.topic || "", explanation: q.explanation || "" }} />
            <ActionButton url="/api/mcq" body={{ courseId: course.id, action: "toggleQ", id: q.id }} label={q.active ? "Retire" : "Use again"} className="btn btn-secondary btn-sm" />
            <ActionButton url="/api/mcq" body={{ courseId: course.id, action: "deleteQ", id: q.id }} label="Delete" className="btn btn-secondary btn-sm" confirmText="Delete this question?" />
          </div>
        </div>); })}
      {!shown.length && <p className="small-note">No questions here yet. Add them one by one or import a spreadsheet (download the template).</p>}
    </div>
  </>);
}
