import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../lib/reportScope";
import QuestionBankEditor from "../../../components/QuestionBankEditor";

export const dynamic = "force-dynamic";

export default async function QuestionBankPage({ searchParams }: { searchParams: { course?: string; q?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["OMC", "CHAIRMAN", "SUPER_USER"].includes(user.role)) redirect("/learn");
  const head = user.role === "SUPER_USER" ? null : await chairmanIdFor(user);
  const q = (searchParams.q || "").trim();
  const courses = q ? await prisma.masterCourse.findMany({ where: { OR: [{ title: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] }, select: { id: true, code: true, title: true }, take: 20 }) : [];
  const course = searchParams.course ? await prisma.masterCourse.findUnique({ where: { id: searchParams.course }, select: { id: true, code: true, title: true } }) : null;
  const rows = course ? ((await (prisma as unknown as Record<string, any>).obeQuestion.findMany({ where: { masterCourseId: course.id, chairmanId: head }, orderBy: { createdAt: "desc" } }).catch(() => [])) as { id: string; prompt: string; optionsJson: string; answer: number }[]) : [];
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <Link href="/learn" style={{ fontSize: 12.5 }}>← Learn OBE</Link>
      <h1 style={{ fontSize: 22, margin: "4px 0 4px" }}>Question Bank</h1>
      <p style={{ color: "var(--slate)", fontSize: 13 }}>Questions made automatically from each HEC course are always there. Add your own here (e.g. about your institute&apos;s practice) — they appear first in that course&apos;s practice{user.role === "SUPER_USER" ? ", for every institute" : ", for your institute"}.</p>
      <form className="card" style={{ display: "flex", gap: 8 }}><input name="q" defaultValue={q} placeholder="Find the HEC course…" style={{ flex: 1 }} /><button className="btn btn-secondary">Search</button></form>
      {courses.map((c) => <div key={c.id} style={{ fontSize: 13, padding: "2px 0" }}><Link href={`/learn/questions?course=${c.id}`}>{c.code} — {c.title}</Link></div>)}
      {course && <QuestionBankEditor course={course} rows={rows.map((r) => ({ id: r.id, prompt: r.prompt, options: JSON.parse(r.optionsJson) as string[], answer: r.answer }))} />}
    </Shell>
  );
}
