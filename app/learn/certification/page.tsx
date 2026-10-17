import { redirect } from "next/navigation";
import Link from "next/link";
import { getSignedInUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import CertExam, { StartExam } from "../../../components/CertExam";
import { tdb, BADGES, badgeOf, questionById, PASS_PCT, EXAM_MIN, trainingBlock } from "../../../lib/training";

export const dynamic = "force-dynamic";

export default async function CertificationPage({ searchParams }: { searchParams: { exam?: string } }) {
  const user = await getSignedInUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const shell = (c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{c}</Shell>;
  const atts = ((await tdb.trainingAttempt.findMany({ where: { userId: user.id }, orderBy: { startedAt: "desc" } }).catch(() => null)) as { id: string; badge: string; idsJson: string; startedAt: Date; submittedAt: Date | null; score: number | null; total: number | null; passed: boolean }[] | null);
  if (atts === null) return shell(<div className="err">Certification is not set up yet — run prisma/migration_training.sql.</div>);
  const exam = searchParams.exam ? badgeOf(searchParams.exam) : null;
  const open = exam ? atts.find((a) => a.badge === exam.key && !a.submittedAt && Date.now() - a.startedAt.getTime() < EXAM_MIN * 60000) : null;
  if (exam && open) {
    const items = (JSON.parse(open.idsJson) as string[]).map((id) => ({ id, prompt: questionById(id)?.prompt || "", options: questionById(id)?.options || [] }));
    return shell(<><h1 style={{ fontSize: 21 }}>{exam.name} — certification exam</h1><p className="small-note">{items.length} questions · {EXAM_MIN} minutes · pass mark {PASS_PCT}%</p><CertExam badge={exam.key} items={items} endsAt={open.startedAt.getTime() + EXAM_MIN * 60000} /></>);
  }
  const block = await trainingBlock(user);
  return shell(<>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>OBE Certification</h1>
    <p className="small-note">Study the <Link href="/learn">Learn OBE</Link> lessons, then take the exam for your role. Each exam has random questions, {EXAM_MIN} minutes and a {PASS_PCT}% pass mark; if you don&apos;t pass you can retry after an hour. Badges show beside your name for course assignment.</p>
    {block && <div className="card" style={{ borderLeft: "4px solid #B3261E" }}>{block}</div>}
    {BADGES.map((b) => { const won = atts.find((a) => a.badge === b.key && a.passed); const tries = atts.filter((a) => a.badge === b.key && a.submittedAt).length; return (
      <div key={b.key} className="card" style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div><b style={{ fontSize: 16 }}>{won ? "🏅 " : ""}{b.name}</b> <span className="small-note">{b.for} · {b.count} questions</span>{tries > 0 && !won && <div className="small-note">{tries} attempt(s), best {Math.max(...atts.filter((a) => a.badge === b.key && a.submittedAt).map((a) => a.score || 0))}/{b.count}</div>}</div>
        {won ? <a className="btn btn-secondary btn-sm" href={`/learn/certificate/${won.id}`}>Certificate ({won.submittedAt?.toISOString().slice(0, 10)})</a> : <StartExam badge={b.key} label="Start exam" />}
      </div>); })}
  </>);
}
