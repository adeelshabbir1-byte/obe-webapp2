import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { ActionForm } from "../../components/fyp/FypClient";
import { exdb, FORMS, KIND_LABEL } from "../../lib/exitSurveys";

export const dynamic = "force-dynamic";
type Row = { id: string; kind: string; subjectName: string; token: string; answersJson: string | null; submittedAt: Date | null; createdAt: Date };

// Exit surveys: why students and employees leave, average ratings, comments; pending links; send one by hand.
export default async function ExitSurveysPage({ searchParams }: { searchParams: { kind?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["CHAIRMAN", "FINANCE_OFFICER", "STUDENT_AFFAIRS", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEAN"].includes(user.role)) redirect("/dashboard");
  const cid = await chairmanIdFor(user);
  const kind = FORMS[searchParams.kind || ""] ? searchParams.kind! : "STUDENT_EXIT";
  const shell = (c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><h1 style={{ fontSize: 22, marginBottom: 4 }}>Exit Surveys</h1>{c}</Shell>;
  const rows = ((await exdb.exitSurvey.findMany({ where: { chairmanId: cid, kind }, orderBy: { createdAt: "desc" }, take: 500 }).catch(() => null)) as Row[] | null);
  if (rows === null) return shell(<div className="err">Run prisma/migration_visit_extras.sql first.</div>);
  const done = rows.filter((r) => r.submittedAt).map((r) => ({ r, a: JSON.parse(r.answersJson || "{}") as Record<string, string | number | boolean> }));
  const f = FORMS[kind];
  const reasons = new Map<string, number>(); for (const d of done) reasons.set(String(d.a.reason), (reasons.get(String(d.a.reason)) || 0) + 1);
  const staff = user.role === "CHAIRMAN" || user.role === "FINANCE_OFFICER" ? await prisma.user.findMany({ where: { OR: [{ managedById: cid }, { managedBy: { managedById: cid } }] }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  return shell(<>
    <p className="small-note">Sent automatically when a student is marked Left / Dropped (and graduates get the graduating survey), and when an employee is recorded as leaving. You can also send one by hand.</p>
    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>{Object.keys(FORMS).map((k) => <Link key={k} href={`/exit-surveys?kind=${k}`} className="act" style={{ fontWeight: k === kind ? 700 : 400 }}>{KIND_LABEL[k]}</Link>)}</div>
    <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <ActionForm url="/api/exit-surveys" fixed={{}} submit="Create link" collapsed openLabel="Send to a student" fields={[{ name: "rollNumber", label: "Roll number", width: 160 }]} done="Link created — copy it from the list below." />
      {staff.length > 0 && <ActionForm url="/api/exit-surveys" fixed={{}} submit="Create link" collapsed openLabel="Send to an employee" initial={{ userId: staff[0]?.id }} fields={[{ name: "userId", label: "Employee", type: "select", options: staff.map((s) => [s.id, s.name] as [string, string]) }]} done="Link created — copy it from the list below." />}
    </div>
    <div className="card"><b>{done.length}</b> answered of {rows.length} sent. Reasons: {Array.from(reasons.entries()).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} (${n})`).join(" · ") || "—"}
      <table style={{ marginTop: 8 }}><thead><tr><th>Question</th><th>Average (1–5)</th></tr></thead><tbody>{f.questions.filter((q) => q.type === "rating").map((q) => { const v = done.map((d) => Number(d.a[q.key])).filter((x) => x > 0); return <tr key={q.key}><td>{q.label}</td><td style={{ color: v.length && v.reduce((a, b) => a + b, 0) / v.length < 3 ? "#B3261E" : undefined }}>{v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "—"}</td></tr>; })}</tbody></table>
      {(() => { const yn = f.questions.find((q) => q.type === "yesno"); if (!yn) return null; const v = done.filter((d) => typeof d.a[yn.key] === "boolean"); return <p style={{ fontSize: 13 }}>{yn.label}: {v.length ? `${Math.round((100 * v.filter((d) => d.a[yn.key]).length) / v.length)}% yes` : "—"}</p>; })()}
    </div>
    <div className="card" style={{ overflowX: "auto" }}><table><thead><tr><th>Person</th><th>Sent</th><th>Status</th><th>Comments</th></tr></thead>
      <tbody>{rows.map((r) => { const a = JSON.parse(r.answersJson || "{}") as Record<string, unknown>; return <tr key={r.id}><td>{r.subjectName}</td><td>{r.createdAt.toISOString().slice(0, 10)}</td><td>{r.submittedAt ? `Answered — ${a.reason}` : <span className="small-note">Pending · link: /exit/{r.token}</span>}</td><td style={{ fontSize: 12, maxWidth: 360 }}>{[a.reason2, a.couldHelp, a.improve].filter(Boolean).join(" · ")}</td></tr>; })}</tbody></table></div>
  </>);
}
