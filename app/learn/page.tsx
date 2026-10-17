import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { LESSONS } from "../../lib/obeLessons";
import { PLO_GUIDE, BLOOM } from "../../lib/obeGlossary";
import ObeAssistant from "../../components/ObeAssistant";

export const dynamic = "force-dynamic";
const LEADERS = ["OMC", "CHAIRMAN", "HEAD_OF_DEPARTMENT", "DEAN", "PROGRAM_COORDINATOR"];
const ldb = prisma as unknown as Record<string, any>;

export default async function LearnPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const progress = ((await ldb.obeProgress.findMany({ where: { userId: user.id } }).catch(() => [])) as { key: string; score: number; total: number; passed: boolean }[]);
  const prog = new Map(progress.map((p) => [p.key, p]));
  const done = LESSONS.filter((l) => prog.get(`lesson:${l.key}`)?.passed).length;
  // Practice: HEC courses behind the courses this person sets or teaches.
  const mine = await prisma.course.findMany({ where: { OR: [{ subjectExpertId: user.id }, { instructorId: user.id }], masterCourseId: { not: null } }, select: { masterCourseId: true, code: true, title: true }, distinct: ["masterCourseId"], take: 30 });
  const q = (searchParams.q || "").trim();
  const found = q ? await prisma.masterCourse.findMany({ where: { OR: [{ title: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] }, select: { id: true, code: true, title: true, masterCurriculum: { select: { title: true, version: true } } }, take: 30 }) : [];
  // Leaders see who in the institute has completed OBE Basics.
  let readiness: { name: string; passed: number }[] = [];
  if (LEADERS.includes(user.role)) {
    const head = await chairmanIdFor(user);
    const staff = await prisma.user.findMany({ where: { isActive: true, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] }, OR: [{ managedById: head }, { managedBy: { managedById: head } }] }, select: { id: true, name: true }, take: 400 });
    const rows = ((await ldb.obeProgress.findMany({ where: { userId: { in: staff.map((s) => s.id) }, key: { startsWith: "lesson:" }, passed: true } }).catch(() => [])) as { userId: string }[]);
    const n = new Map<string, number>(); rows.forEach((r) => n.set(r.userId, (n.get(r.userId) || 0) + 1));
    readiness = staff.map((s) => ({ name: s.name, passed: n.get(s.id) || 0 })).sort((a, b) => b.passed - a.passed || a.name.localeCompare(b.name));
  }
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Learn OBE</h1>
      <div className="card" style={{ borderLeft: "4px solid #1B6CA8" }}>After the lessons, take your role&apos;s exam and earn your badge: <Link href="/learn/certification"><b>OBE Certification →</b></Link></div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12 }}>Short lessons on Outcome-Based Education, a guide to every PLO, and practice questions built from the HEC curriculum of the courses you set or teach.</p>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>OBE Basics {done === LESSONS.length && <span className="badge badge-ok" style={{ marginLeft: 6 }}>OBE Ready ✓</span>}</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>{done} of {LESSONS.length} lessons passed. Pass all five (4 of 5 correct in each quiz) to earn the <b>OBE Ready</b> badge.</p>
        {LESSONS.map((l) => { const p = prog.get(`lesson:${l.key}`); return (
          <div key={l.key} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid #F0EAEA" }}>
            <Link href={`/learn/lesson/${l.key}`} style={{ fontWeight: 600 }}>{l.title}</Link>
            <span style={{ fontSize: 12, color: p?.passed ? "#1F5E36" : "var(--slate)" }}>{p ? `${p.score}/${p.total}${p.passed ? " ✓" : ""}` : `${l.minutes} min`}</span>
          </div>); })}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Practice on your courses</h3>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 0 }}>Questions made from each course&apos;s HEC CLOs, PLO mapping, Bloom levels and topics — e.g. &quot;which PLO does this CLO build?&quot; — with the reason after each answer.</p>
        {mine.length === 0 && <p style={{ fontSize: 13 }}>None of your courses is linked to an HEC course yet — search below.</p>}
        {mine.map((c) => { const p = prog.get(`course:${c.masterCourseId}`); return <div key={c.masterCourseId} style={{ padding: "4px 0" }}><Link href={`/learn/course/${c.masterCourseId}`}>{c.code} — {c.title}</Link>{p && <span style={{ fontSize: 12, color: "var(--slate)", marginLeft: 8 }}>best {p.score}/{p.total}</span>}</div>; })}
        <form style={{ marginTop: 10, display: "flex", gap: 8 }}><input name="q" defaultValue={q} placeholder="Search any HEC course (e.g. Data Structures)" style={{ flex: 1 }} /><button className="btn btn-secondary" type="submit">Search</button></form>
        {found.map((c) => <div key={c.id} style={{ padding: "3px 0", fontSize: 13 }}><Link href={`/learn/course/${c.id}`}>{c.code} — {c.title}</Link> <span style={{ color: "var(--slate)", fontSize: 11.5 }}>{c.masterCurriculum ? `${c.masterCurriculum.title} ${c.masterCurriculum.version}` : ""}</span></div>)}
        {q && !found.length && <p style={{ fontSize: 13 }}>No HEC course matches “{q}”.</p>}
        {["OMC", "CHAIRMAN", "SUPER_USER"].includes(user.role) && <p style={{ fontSize: 12.5, marginBottom: 0 }}><Link href="/learn/questions">Add your own questions to the bank →</Link></p>}
      </div>

      <details className="card">
        <summary style={{ cursor: "pointer" }}><b>PLO guide</b> — what each PLO means and how it differs from its neighbours</summary>
        {PLO_GUIDE.map((p) => (
          <div key={p.n} style={{ borderTop: "1px solid #F0EAEA", padding: "8px 0", fontSize: 13 }}>
            <b>PLO-{p.n} {p.title}</b> <span style={{ color: "var(--slate)", fontSize: 12 }}>· typical level {p.bloom} · verbs: {p.verbs.join(", ")}</span>
            <div>{p.meaning}</div>
            <div style={{ color: "#1F5E36" }}>Good CLO: {p.good.join(" / ")}</div>
            <div style={{ color: "#7A520C" }}>{p.notThis}</div>
          </div>
        ))}
        <p style={{ fontSize: 12, color: "var(--slate)" }}>Your program&apos;s own PLO statements (Program Profile / PLOs page) are what count; this guide explains the standard NCEAC computing PLOs in plain words.</p>
        <b>Bloom levels:</b> {BLOOM.map((b) => <span key={b.level} style={{ fontSize: 12.5, marginRight: 10 }}>{b.level} {b.name} ({b.verbs.slice(0, 3).join(", ")})</span>)}
      </details>

      {readiness.length > 0 && (
        <details className="card"><summary style={{ cursor: "pointer" }}><b>Faculty OBE readiness</b> — {readiness.filter((r) => r.passed === LESSONS.length).length} of {readiness.length} are OBE Ready</summary>
          <table style={{ marginTop: 6 }}><tbody>{readiness.map((r) => <tr key={r.name}><td>{r.name}</td><td>{r.passed}/{LESSONS.length} lessons{r.passed === LESSONS.length ? " ✓" : ""}</td></tr>)}</tbody></table>
        </details>
      )}
      <ObeAssistant />
    </Shell>
  );
}
