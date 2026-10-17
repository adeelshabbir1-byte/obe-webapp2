import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { reviewBatchWhere } from "../../lib/reviewScope";
import { ActionButton } from "../../components/fyp/FypClient";
import VettingReport from "../../components/VettingReport";
import { vtdb, paperOf, type Vetting } from "../../lib/paperVetting";

export const dynamic = "force-dynamic";

// Program Lead: papers waiting for vetting, each with the system's and AI's reports; approve or return with comments.
export default async function PaperVettingReview({ searchParams }: { searchParams: { id?: string; all?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const where = await reviewBatchWhere(user);
  if (!where) redirect("/dashboard");
  const shell = (c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><h1 style={{ fontSize: 22 }}>Paper Vetting</h1>{c}</Shell>;
  const courses = await prisma.course.findMany({ where: { batch: where }, select: { id: true, code: true, title: true, instructor: { select: { name: true } }, batch: { select: { batchName: true } } } });
  const cOf = new Map(courses.map((c) => [c.id, c]));
  const list = ((await vtdb.paperVetting.findMany({ where: { courseId: { in: courses.map((c) => c.id) }, ...(searchParams.all ? { status: { not: "DRAFT" } } : { status: "SUBMITTED" }) }, orderBy: { submittedAt: "asc" } }).catch(() => null)) as Vetting[] | null);
  if (list === null) return shell(<div className="err">Run prisma/migration_paper_vetting.sql first.</div>);
  const sel = list.find((v) => v.id === searchParams.id) || null;
  let detail: React.ReactNode = null;
  if (sel) {
    const { items, clos } = await paperOf(sel.courseId, sel.examType);
    const code = new Map(clos.map((c) => [c.id, c.code]));
    const qs = JSON.parse(sel.questionsJson) as Record<string, string>;
    const rows = items.map((i) => ({ no: i.questionNo, clo: (i.cloId && code.get(i.cloId)) || "no CLO", level: i.cognitiveLevel || "", marks: i.marks, text: qs[i.id] || "" }));
    const c = cOf.get(sel.courseId)!;
    detail = <>
      <div className="card"><h3 style={{ marginTop: 0 }}>{c.code} {c.title} — {sel.examType} paper</h3>
        <p className="small-note">{c.instructor?.name} · {c.batch?.batchName} · round {sel.round}{sel.teacherNote ? ` · note: ${sel.teacherNote}` : ""}</p>
        {rows.map((r) => <div key={r.no} style={{ fontSize: 13.5, margin: "6px 0" }}><b>Q{r.no}</b> <span className="small-note">{r.clo} · {r.level} · {r.marks} marks</span><div style={{ whiteSpace: "pre-wrap" }}>{r.text || <i className="small-note">question text not written</i>}</div></div>)}
        {sel.status === "SUBMITTED" && <div style={{ display: "flex", gap: 8, marginTop: 8 }}><ActionButton url="/api/paper-vetting" body={{ action: "decide", id: sel.id, approve: true }} label="Approve paper" askNote="Comments (optional)" /><ActionButton url="/api/paper-vetting" body={{ action: "decide", id: sel.id, approve: false }} label="Return for improvement" className="btn btn-secondary btn-sm" askNote="What should be improved?" noteRequired /></div>}
        {sel.status !== "SUBMITTED" && <p><b>{sel.status === "APPROVED" ? "Approved" : sel.status === "RETURNED" ? "Returned" : sel.status}</b>{sel.reviewNote ? `: ${sel.reviewNote}` : ""}</p>}
      </div>
      <VettingReport systemJson={sel.systemJson} aiJson={sel.aiJson} items={rows} />
    </>;
  }
  return shell(<>
    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}><Link href="/paper-vetting" className="act" style={{ fontWeight: searchParams.all ? 400 : 700 }}>Waiting ({searchParams.all ? "…" : list.length})</Link><Link href="/paper-vetting?all=1" className="act" style={{ fontWeight: searchParams.all ? 700 : 400 }}>All sent papers</Link></div>
    <div className="card">{list.map((v) => { const c = cOf.get(v.courseId); const sys = v.systemJson ? (JSON.parse(v.systemJson) as { findings: { level: string }[] }) : null; const ai = v.aiJson ? (JSON.parse(v.aiJson) as { questions: { agrees: boolean }[] }) : null; return (
      <div key={v.id} style={{ padding: "4px 0" }}><Link href={`/paper-vetting?id=${v.id}${searchParams.all ? "&all=1" : ""}`}><b>{c?.code} {c?.title}</b> — {v.examType}</Link> <span className="small-note">{c?.instructor?.name} · {sys ? `${sys.findings.filter((f) => f.level !== "ok").length} system notes` : "no check"}{ai ? ` · AI disagrees on ${ai.questions.filter((q) => !q.agrees).length}` : ""} · {v.status.toLowerCase()}</span></div>); })}
      {!list.length && <p className="small-note">No papers waiting.</p>}</div>
    {detail}
  </>);
}
