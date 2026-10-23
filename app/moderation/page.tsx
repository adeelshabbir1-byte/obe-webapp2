import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import HowCalculated from "../../components/HowCalculated";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { reviewBatchWhere } from "../../lib/reviewScope";
import { moderationLog, examinersOf, MOD_HINT, MOD_ROLES } from "../../lib/moderation";
import { ExaminerForm } from "../../components/ModerationForms";
import { ActionButton } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";

// Moderation: the log of every paper and result vetted (internal and external), and outside examiners' temporary links.
export default async function ModerationPage({ searchParams }: { searchParams: { tab?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!MOD_ROLES.includes(user.role)) redirect("/dashboard");
  const where = await reviewBatchWhere(user);
  if (!where) redirect("/dashboard");
  const tab = searchParams.tab === "examiners" ? "examiners" : "log";
  const courses = await prisma.course.findMany({ where: { batch: where }, select: { id: true, code: true, title: true, isOffered: true, batch: { select: { batchName: true, degreeProgram: true } } }, orderBy: { code: "asc" } });
  const head = <>
    <h1 style={{ fontSize: 22, marginBottom: 4 }}>Moderation</h1>
    <p className="small-note" style={{ marginBottom: 10 }}>Every question paper and result vetted — by the Program Lead, OMC, the result approvers and outside examiners — with who, when, what they said and what changed. Ready for the SAR.</p>
    <HowCalculated shows="The log brings together paper vetting decisions (with the vetter's checklist), result approvals, grade changes and external examiners' remarks.">
      <ul style={{ margin: "0 0 4px 18px", padding: 0 }}>
        <li>Vetting checklist: CLO coverage, Bloom balance and marks spread come from OBEHUB&apos;s paper check; “no repeats” compares each question with past papers of the same course (more than 55% of the same words is flagged); clarity is the vetter&apos;s own tick.</li>
        <li>External examiners get a link that expires; they see only the courses given to them (final paper, its checks and the result summary) and cannot change anything.</li>
      </ul>
    </HowCalculated>
    <div role="tablist" className="tabs no-print"><a role="tab" className="tab" aria-selected={tab === "log"} href="?tab=log">Moderation log</a><a role="tab" className="tab" aria-selected={tab === "examiners"} href="?tab=examiners">External examiners</a></div>
  </>;
  const shell = (x: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>{head}{x}</Shell>;
  if (tab === "examiners") {
    const list = await examinersOf(await chairmanIdFor(user));
    return shell(<>
      {list === null && <div className="err">{MOD_HINT}</div>}
      <div className="card"><h3 style={{ marginTop: 0 }}>Invite an external examiner</h3><ExaminerForm courses={courses.filter((c) => c.isOffered).map((c) => ({ id: c.id, label: `${c.code} ${c.title} — ${c.batch?.degreeProgram} ${c.batch?.batchName}` }))} /></div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Examiners</h3>
        <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Examiner</th><th>Courses</th><th>Link valid until</th><th></th></tr></thead>
          <tbody>{(list || []).map((e) => { const ids = JSON.parse(e.courseIdsJson) as string[]; const live = !e.revokedAt && new Date(e.expiresAt) > new Date(); return (
            <tr key={e.id}><td><b>{e.name}</b><div className="small-note" style={{ margin: 0 }}>{[e.designation, e.organisation, e.email].filter(Boolean).join(" · ")}</div></td>
              <td style={{ fontSize: 12.5 }}>{ids.map((id) => courses.find((c) => c.id === id)?.code || "—").join(", ")}</td>
              <td style={{ color: live ? undefined : "#B3261E" }}>{e.revokedAt ? "withdrawn" : new Date(e.expiresAt).toLocaleDateString("en-GB")}{!e.revokedAt && !live ? " (expired)" : ""}</td>
              <td>{live && <ActionButton url="/api/moderation" body={{ action: "revoke", id: e.id }} label="Withdraw link" className="btn btn-secondary btn-sm" confirmText="Withdraw this examiner's link?" />}</td></tr>); })}
            {(list || []).length === 0 && <tr><td colSpan={4}>No examiner invited yet.</td></tr>}</tbody>
        </table>
        <p className="small-note">Final year project external examiners are invited from the FYP module, as before.</p>
      </div>
    </>);
  }
  const rows = await moderationLog(courses.map((c) => c.id));
  return shell(<div className="card" style={{ overflowX: "auto" }}>
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}><b>{rows.length} entries</b><a className="btn btn-brass btn-sm no-print" style={{ marginLeft: "auto" }} href="/api/moderation?format=docx">⬇ Moderation log (Word, for the SAR)</a></div>
    <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Date</th><th>Course</th><th>What</th><th>Who</th><th>Decision</th><th>Comments</th><th>Changes / checklist</th></tr></thead>
      <tbody>{rows.slice(0, 300).map((r, i) => <tr key={i}><td style={{ whiteSpace: "nowrap" }}>{new Date(r.at).toLocaleDateString("en-GB")}</td><td>{r.course}</td><td>{r.what}</td><td>{r.who}</td><td style={{ fontWeight: 700, color: /approved|satisfactory/i.test(r.decision) ? "#1E6B3A" : "#9A3412" }}>{r.decision}</td><td style={{ fontSize: 12.5 }}>{r.comments || "—"}</td><td style={{ fontSize: 12 }}>{r.changes || "—"}</td></tr>)}
        {rows.length === 0 && <tr><td colSpan={7}>Nothing vetted yet.</td></tr>}</tbody>
    </table>
    {rows.length > 300 && <p className="small-note">Showing the latest 300; the Word file has all.</p>}
  </div>);
}
