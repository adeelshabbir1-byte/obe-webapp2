import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { ActionForm, ActionButton } from "../../../components/fyp/FypClient";
import { AFFILIATE_HINT, HEADS, DEFAULT_HEADS, parseHeads, policies, collegesOf, universityMarkCourses, universitySheet } from "../../../lib/affiliates";

export const dynamic = "force-dynamic";
export const metadata = { title: "Affiliated colleges — marks" };

// The university sets, for its affiliated colleges, each course's marks distribution and who enters each head, and
// enters its own heads (e.g. the final exam it conducts) for the colleges' students.
export default async function AffiliateMarks({ searchParams }: { searchParams: { college?: string; course?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "CHAIRMAN") redirect("/home");
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{x}</Shell>;
  const cols = (await collegesOf(user.id)).filter((c) => c.status === "ACTIVE");
  let ps: Awaited<ReturnType<typeof policies>>;
  try { ps = await policies(user.id); } catch { return shell(<div className="err">{AFFILIATE_HINT}</div>); }
  const colName = (id: string | null) => (id ? cols.find((c) => c.collegeId === id)?.head?.instituteName || cols.find((c) => c.collegeId === id)?.head?.name || "a college no longer affiliated" : "All colleges");
  const college = cols.find((c) => c.collegeId === searchParams.college)?.collegeId || null;
  const courses = college ? await universityMarkCourses(user.id, college) : [];
  const sheet = college && searchParams.course && courses.some((c) => c.id === searchParams.course) ? await universitySheet(user.id, searchParams.course) : null;
  const headText = (json: string) => parseHeads(json).map((h) => `${h.type} ${h.pct}% (${h.by === "UNIVERSITY" ? "university" : "college"})`).join(" · ");

  return shell(<>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>Affiliated colleges — marks</h1>
    <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>Set each course&apos;s marks distribution for your affiliated colleges and who enters each part: the <b>college</b>&apos;s teacher (quizzes, assignments, midterm …) or the <b>university</b> (e.g. the final exam you conduct). A college sees the whole distribution but enters only its own parts; yours are locked for it. Most specific wins: one college + one course, then one college, then one course, then all colleges. <Link href="/chairman/affiliates">Your colleges →</Link></p>
    {cols.length === 0 && <div className="card small-note">No colleges are affiliated to your university yet (the Super Admin links them).</div>}

    <div className="card" style={{ overflowX: "auto" }}>
      <h3 style={{ marginTop: 0 }}>Marks distribution</h3>
      {ps.length === 0 ? <p className="small-note">None set yet — colleges enter every part themselves until you set one.</p> : <table style={{ fontSize: 12.5 }}><thead><tr><th>College</th><th>Course</th><th>Distribution</th><th /></tr></thead>
        <tbody>{ps.map((p) => <tr key={p.id}><td>{colName(p.collegeId)}</td><td>{p.courseKey || "All courses"}</td><td>{headText(p.headsJson)}</td>
          <td><ActionButton showMessage url="/api/affiliates" body={{ action: "policyDelete", id: p.id }} label="Remove" className="btn btn-secondary btn-sm" confirmText="Remove this distribution?" /></td></tr>)}</tbody></table>}
      {cols.length > 0 && <ActionForm showMessage url="/api/affiliates" fixed={{ action: "policy" }} submit="Save distribution" collapsed openLabel="Set a distribution…"
        initial={Object.fromEntries([["collegeId", ""], ["courseKey", ""], ...HEADS.flatMap((h) => { const d = DEFAULT_HEADS.find((x) => x.type === h); return [[`pct_${h}`, d ? String(d.pct) : ""], [`by_${h}`, d?.by || "COLLEGE"]]; })])}
        fields={[
          { name: "collegeId", label: "College", type: "select", options: [["", "All colleges"], ...cols.map((c) => [c.collegeId, c.head?.instituteName || c.head?.name || c.collegeId] as [string, string])] },
          { name: "courseKey", label: "Course code (blank = all courses)", placeholder: "e.g. CS-301" },
          ...HEADS.flatMap((h) => [{ name: `pct_${h}`, label: `${h} %`, type: "number" as const, width: 80 }, { name: `by_${h}`, label: `${h} entered by`, type: "select" as const, options: [["COLLEGE", "College"], ["UNIVERSITY", "University"]] as [string, string][] }]),
        ]} />}
    </div>

    {cols.length > 0 && <div className="card">
      <h3 style={{ marginTop: 0 }}>Enter the university&apos;s marks</h3>
      <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select name="college" defaultValue={college || ""}><option value="">Pick a college…</option>{cols.map((c) => <option key={c.collegeId} value={c.collegeId}>{c.head?.instituteName || c.head?.name}</option>)}</select>
        <button className="btn btn-sm" type="submit">Show courses</button>
      </form>
      {college && (courses.length === 0 ? <p className="small-note">No offered course of this college has a part the university enters.</p> : <table style={{ fontSize: 12.5, marginTop: 10 }}><thead><tr><th>Course</th><th>Batch</th><th>College marks</th><th>University marks</th><th /></tr></thead>
        <tbody>{courses.map((c) => <tr key={c.id} style={c.id === searchParams.course ? { background: "#F3F7FC" } : undefined}><td><b>{c.code}</b> {c.title}</td><td>{c.batch?.degreeProgram} — {c.batch?.batchName}</td>
          <td style={{ color: c.status.college.done ? "#1F5E36" : "#8A5A0F" }}>{c.status.college.done ? "done" : `${c.status.college.got}/${c.status.college.need}`}</td>
          <td style={{ color: c.status.university.done ? "#1F5E36" : "#8A5A0F" }}>{c.status.university.done ? "done" : `${c.status.university.got}/${c.status.university.need}`}</td>
          <td><Link className="btn btn-secondary btn-sm" href={`/affiliates/marks?college=${college}&course=${c.id}`}>Enter</Link></td></tr>)}</tbody></table>)}
    </div>}

    {sheet && <div className="card">
      <h3 style={{ marginTop: 0 }}>{sheet.course?.code} {sheet.course?.title} <span className="small-note">{sheet.course?.batch?.degreeProgram} — {sheet.course?.batch?.batchName} · {sheet.students.length} students</span></h3>
      {sheet.insts.length === 0 ? <p className="small-note">The course has no assessment of a type the university enters ({sheet.heads.filter((h) => h.by === "UNIVERSITY").map((h) => h.type).join(", ")}). The college&apos;s plan needs one first.</p> :
        sheet.insts.map((i) => { const have = new Map(sheet.marks.filter((m) => m.instrumentId === i.id).map((m) => [m.studentId, m.score])); return (
          <div key={i.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
            <b>{i.label}</b> <span className="small-note">{i.type} · out of {i.maxScore} · {have.size}/{sheet.students.length} entered</span>
            <ActionForm showMessage url="/api/affiliates" fixed={{ action: "marks", courseId: searchParams.course, instrumentId: i.id }} submit="Save marks"
              initial={{ lines: sheet.students.map((s) => `${s.rollNumber}, ${have.has(s.id) ? have.get(s.id) : ""}`).join("\n") }}
              fields={[{ name: "lines", label: "One line per student: roll number, score (paste from your result sheet)", type: "textarea", full: true }]} />
          </div>); })}
    </div>}
  </>);
}
