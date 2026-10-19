import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor, coordinatorIdsFor } from "../../lib/reportScope";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { ActionButton, ActionForm } from "../../components/fyp/FypClient";
import { BLOOMS, draftPaper, questions } from "../../lib/questionBank";

export const dynamic = "force-dynamic";
export const metadata = { title: "Question bank" };
const ROLES = ["INSTRUCTOR", "SUBJECT_EXPERT", "OMC", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT"];

// Written questions tagged by CLO and Bloom level, and a drafted paper that covers the chosen CLOs.
export default async function QuestionBankPage({ searchParams }: { searchParams: { course?: string; clos?: string; total?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!ROLES.includes(user.role)) redirect("/dashboard");
  const chairmanId = await chairmanIdFor(user);
  const where = user.role === "INSTRUCTOR" ? { instructorId: user.id } : user.role === "SUBJECT_EXPERT" ? { subjectExpertId: user.id } : { coordinatorId: { in: (await coordinatorIdsFor(user)).concat(["none"]) } };
  const codes = Array.from(new Map((await prisma.course.findMany({ where, select: { code: true, title: true }, orderBy: { code: "asc" }, take: 500 })).map((c) => [c.code, c.title])).entries());
  const code = codes.find(([c]) => c === searchParams.course)?.[0] || codes[0]?.[0] || "";
  const bank = code ? await questions(chairmanId, code) : [];
  const clos = Array.from(new Set((await prisma.cLO.findMany({ where: { course: { code }, source: "SE" }, select: { code: true }, orderBy: { orderIndex: "asc" } })).map((c) => c.code)));
  const pick = (searchParams.clos || "").split(",").filter(Boolean);
  const draft = pick.length && bank ? draftPaper(bank, pick, Number(searchParams.total) || 50) : null;
  const mcqCount = code ? await (prisma as unknown as Record<string, any>).mcqQuestion.count({ where: { chairmanId, courseCode: code, active: true } }).catch(() => 0) : 0;
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Question Bank</h1>
      <p className="small-note">Written questions for each course, tagged with their CLO, Bloom level and marks ({mcqCount} MCQs are in the MCQ bank too). Draft a paper: choose the CLOs and the total marks, and the system picks questions covering each CLO in proportion with a spread of Bloom levels — least-used first.</p>
      {bank === null && <div className="err">Run prisma/migration_platform_plus.sql in Supabase first.</div>}
      <div className="card" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{codes.map(([c, t]) => <Link key={c} href={`/question-bank?course=${encodeURIComponent(c)}`} className={`btn btn-sm ${c === code ? "btn-brass" : "btn-secondary"}`} title={t}>{c}</Link>)}</div>
      {code && <>
        <div className="card">
          <ActionForm url="/api/question-bank" fixed={{ action: "add", courseCode: code }} submit="Add" collapsed openLabel="+ Add a question" initial={{ cloCode: clos[0] || "CLO-1", bloom: "C3", kind: "SHORT", marks: 5 }}
            fields={[{ name: "cloCode", label: "CLO", type: "select", options: (clos.length ? clos : ["CLO-1"]).map((c) => [c, c] as [string, string]) }, { name: "bloom", label: "Bloom", type: "select", options: BLOOMS.map((b) => [b, b] as [string, string]) }, { name: "kind", label: "Kind", type: "select", options: [["SHORT", "Short"], ["LONG", "Long"], ["PROBLEM", "Problem / numerical"]] }, { name: "marks", label: "Marks", type: "number", width: 80 }, { name: "text", label: "Question", type: "textarea" }]} />
          <form style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
            <input type="hidden" name="course" value={code} />
            <label style={{ fontSize: 12 }}>CLOs (comma)<br /><input name="clos" defaultValue={searchParams.clos || clos.join(",")} style={{ width: 240 }} /></label>
            <label style={{ fontSize: 12 }}>Total marks<br /><input name="total" type="number" defaultValue={searchParams.total || "50"} style={{ width: 90 }} /></label>
            <button className="btn btn-secondary btn-sm">Draft a paper</button>
          </form>
        </div>
        {draft && (
          <div className="card">
            <b>Draft paper — {code}, {draft.total} marks</b>
            {draft.gaps.length > 0 && <p className="small-note" style={{ color: "#c93c3c" }}>{draft.gaps.join(" · ")}</p>}
            <ol style={{ fontSize: 13.5 }}>{draft.chosen.map((q) => <li key={q.id} style={{ marginBottom: 8 }}><span style={{ whiteSpace: "pre-wrap" }}>{q.text}</span> <span className="small-note">[{q.marks} marks · {q.cloCode} · {q.bloom}]</span></li>)}</ol>
            <ActionButton url="/api/question-bank" body={{ action: "used", ids: draft.chosen.map((q) => q.id) }} label="Use this paper (count the questions as used)" className="btn btn-brass btn-sm" done="Counted — next drafts prefer other questions." />
          </div>
        )}
        <div className="card" style={{ overflowX: "auto" }}>
          <b>{(bank || []).length} question{(bank || []).length === 1 ? "" : "s"}</b>
          <table style={{ fontSize: 12.5, marginTop: 6 }}><thead><tr><th>CLO</th><th>Bloom</th><th>Kind</th><th>Marks</th><th>Question</th><th>Used</th><th></th></tr></thead>
            <tbody>{(bank || []).map((q) => <tr key={q.id}><td>{q.cloCode}</td><td>{q.bloom}</td><td>{q.kind.toLowerCase()}</td><td>{q.marks}</td><td style={{ whiteSpace: "pre-wrap", maxWidth: 520 }}>{q.text}</td><td>{q.usedCount}</td><td>{(q.createdById === user.id || user.role !== "INSTRUCTOR") && <ActionButton url="/api/question-bank" body={{ action: "remove", id: q.id }} label="Remove" className="btn btn-secondary btn-sm" confirmText="Remove this question?" />}</td></tr>)}</tbody></table>
        </div>
      </>}
    </Shell>
  );
}
