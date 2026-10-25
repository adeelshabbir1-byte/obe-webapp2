import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV, navForRole } from "../../../components/reportNav";
import BatchComparisonView from "../../../components/BatchComparisonView";
import { ActionButton, ActionForm } from "../../../components/fyp/FypClient";
import { compareBatch } from "../../../lib/batchCompare";
import { approvalOf, proposalsOf, endorsementsOf, describe, queueFor, REVIEW_STEPS, PROPOSAL_KINDS } from "../../../lib/batchApproval";
import { batchAccess } from "../../../lib/batchAccess";
import { tally } from "../../../lib/omcMembers";
import { schemeChanges, offeredTracks } from "../../../lib/batchSetup";
import { LIST_TYPES } from "../../../lib/autoCopyPreviousBatch";
import { chairmanIdFor } from "../../../lib/reportScope";

export const dynamic = "force-dynamic";
export const metadata = { title: "Batch approval" };

// The department OMC's review of a new batch, in seven steps: comparison · structure check · changes · semester plan &
// prerequisites · electives & tracks · Subject Experts · course → GA mapping (decided by the OMC on the GA–course matrix).
// Members make proposals with reasons, endorse or not; the Convener finalises once more than half endorse.
export default async function OmcBatchReviewPage({ searchParams }: { searchParams: { batchId?: string; step?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (!["OMC", "HEAD_OF_DEPARTMENT", "DEAN", "CHAIRMAN"].includes(user.role)) redirect("/dashboard");
  const nav = user.role === "OMC" ? OMC_ACTION_NAV : navForRole(user.role);
  const roleName = user.role === "OMC" ? "OMC Member" : user.role === "CHAIRMAN" ? "Institute Head" : user.role === "DEAN" ? "Dean" : "Chairman";

  if (!searchParams.batchId) {
    const chairmanId = await chairmanIdFor(user);
    const rows = await queueFor(chairmanId, user.role === "OMC" ? user.departmentId || null : null);
    return (
      <Shell roleLabel={roleName} userName={user.name} navLinks={nav}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>New batches to approve</h1>
        <p className="small-note" style={{ marginTop: 0 }}>Each Program Lead sends a new batch here at the end of its set-up. Every member of the department&apos;s OMC sees it.</p>
        <div className="card">{rows.length === 0 ? <p className="small-note">No batches sent to the OMC yet.</p> : (
          <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Batch</th><th>Program Lead</th><th>Sent</th><th>Status</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.batchId}><td><Link href={`/omc/batch-review?batchId=${r.batchId}`}><b>{r.batch!.degreeProgram} {r.batch!.batchName}</b></Link></td><td>{r.batch!.coordinator.name}</td><td>{new Date(r.submittedAt).toLocaleDateString("en-GB")}</td><td style={{ fontWeight: 700, color: r.status === "APPROVED" ? "#2E7D32" : "#B26A00" }}>{r.status === "APPROVED" ? `approved ${r.finalisedAt ? new Date(r.finalisedAt).toLocaleDateString("en-GB") : ""}` : "waiting"}</td></tr>)}</tbody></table>)}
        </div>
      </Shell>
    );
  }

  const acc = await batchAccess(user, searchParams.batchId);
  if (!acc) redirect("/omc/batch-review");
  const batchId = acc.batch.id;
  const label = `${acc.batch.degreeProgram} ${acc.batch.batchName}`;
  const [approval, props, ends, cmp] = await Promise.all([approvalOf(batchId), proposalsOf(batchId), endorsementsOf(batchId), compareBatch(batchId)]);
  if (!approval) redirect("/omc/batch-review");
  const open = approval.status === "SUBMITTED";
  const canAct = acc.member && open;
  const omc = acc.omc!;
  const t = tally(omc.members, ends.map((e) => ({ memberId: e.memberId, yes: e.endorse })));
  const names = new Map(omc.members.map((m) => [m.id, m.name]));
  const step = REVIEW_STEPS.find((s) => s.key === searchParams.step)?.key || "comparison";
  const idx = REVIEW_STEPS.findIndex((s) => s.key === step);
  const courses = await prisma.course.findMany({ where: { batchId, courseType: { notIn: LIST_TYPES } }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }], select: { id: true, code: true, title: true, creditHours: true, courseType: true, semesterNumber: true, subjectExpert: { select: { name: true } }, prerequisiteCourse: { select: { code: true } }, ploMappings: { select: { ploId: true } } } });
  const descs = await Promise.all(props.map((p) => describe(p)));
  const href = (k: string) => `/omc/batch-review?batchId=${batchId}&step=${k}`;
  const ses = canAct ? await prisma.user.findMany({ where: { role: { in: ["SUBJECT_EXPERT", "INSTRUCTOR"] }, OR: [{ managedById: acc.chairmanId }, { managedBy: { managedById: acc.chairmanId } }], isActive: true } as never, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 400 }) : [];

  let body: React.ReactNode = null;
  if (step === "comparison" && cmp) body = <BatchComparisonView cmp={cmp} batchId={batchId} />;
  if (step === "structure") {
    const bySem = new Map<number, number>(); for (const c of courses) bySem.set(c.semesterNumber || 0, (bySem.get(c.semesterNumber || 0) || 0) + c.creditHours);
    body = <div className="card"><h3 style={{ marginTop: 0 }}>Structure check</h3>
      {cmp && <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Type</th><th>CH now</th><th>Council rule</th><th>Meets</th></tr></thead><tbody>
        <tr><td><b>Total</b></td><td><b>{cmp.totals.ch[0]}</b></td><td>{cmp.totals.target ? `${cmp.totals.target[0]}–${cmp.totals.target[1]}` : "—"}</td><td>{cmp.totals.chOk === null ? "—" : cmp.totals.chOk ? "✓" : "✗"}</td></tr>
        {cmp.byType.map((x) => <tr key={x.type}><td>{x.type}</td><td>{x.now}</td><td>{x.min !== null && x.max !== null ? `${x.min}–${x.max}` : x.min !== null ? `at least ${x.min}` : x.max !== null ? `at most ${x.max}` : "—"}</td><td style={{ color: x.ok === false ? "#C62828" : "#2E7D32", fontWeight: 700 }}>{x.ok === null ? "—" : x.ok ? "✓" : "✗"}</td></tr>)}</tbody></table>}
      <p style={{ fontSize: 13 }}>Credit hours per semester: {Array.from(bySem.entries()).sort((a, b) => a[0] - b[0]).map(([s, n]) => `${s ? `S${s}` : "unplaced"} ${n}`).join(" · ")}</p></div>;
  }
  if (step === "changes") {
    const ch = await schemeChanges(batchId);
    body = <div className="card"><h3 style={{ marginTop: 0 }}>Changes made to the scheme</h3>{ch.length === 0 ? <p className="small-note">None recorded.</p> : <ul style={{ fontSize: 12.5, paddingLeft: 18 }}>{ch.map((c) => <li key={c.id}>{new Date(c.at).toLocaleDateString("en-GB")} · {c.action.toLowerCase().replace(/_/g, " ")} <b>{c.code}</b> {c.title}{c.why ? ` — ${c.why}` : ""} · {c.byName}</li>)}</ul>}
      {cmp && <p className="small-note">{(["renamed", "recoded", "moved", "ch", "added", "dropped"] as const).map((k) => `${cmp.counts[k]} ${k === "ch" ? "CH changed" : k}`).join(" · ")} compared with the previous batch / council.</p>}</div>;
  }
  if (step === "plan") body = <div className="card" style={{ overflowX: "auto" }}><h3 style={{ marginTop: 0 }}>Semester plan &amp; prerequisites</h3><p className="small-note">Also on <Link href={`/coordinator/prerequisite-map?batchId=${batchId}`}>the Prerequisite Map</Link> and <Link href={`/omc/course-repositioning?batchId=${batchId}`}>Course Repositioning</Link>.</p>
    <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Sem</th><th>Course</th><th>CH</th><th>Type</th><th>Prerequisite</th></tr></thead><tbody>{courses.map((c) => <tr key={c.id}><td>{c.semesterNumber ?? "—"}</td><td><b>{c.code}</b> {c.title}</td><td>{c.creditHours}</td><td>{c.courseType}</td><td>{c.prerequisiteCourse?.code || "—"}</td></tr>)}</tbody></table></div>;
  if (step === "electives") {
    const tracks = await offeredTracks(batchId);
    const el = courses.filter((c) => /elective|ids/i.test(c.courseType));
    body = <div className="card"><h3 style={{ marginTop: 0 }}>Electives &amp; tracks</h3><p style={{ fontSize: 13 }}>Tracks offered: <b>{tracks.length ? tracks.map((x) => x.name).join(", ") : "none chosen"}</b></p>
      <ul style={{ fontSize: 12.5, paddingLeft: 18 }}>{el.map((c) => <li key={c.id}>S{c.semesterNumber ?? "?"} · <b>{c.code}</b> {c.title} ({c.courseType})</li>)}</ul></div>;
  }
  if (step === "se") body = <div className="card"><h3 style={{ marginTop: 0 }}>Subject Experts</h3><table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th>Subject Expert</th></tr></thead><tbody>{courses.map((c) => <tr key={c.id}><td><b>{c.code}</b> {c.title}</td><td style={{ color: c.subjectExpert ? undefined : "#C62828", fontWeight: c.subjectExpert ? 400 : 700 }}>{c.subjectExpert?.name || "none"}</td></tr>)}</tbody></table></div>;
  if (step === "ga") {
    const none = courses.filter((c) => !c.ploMappings.length);
    body = <div className="card"><h3 style={{ marginTop: 0 }}>Course → GA mapping</h3><p style={{ fontSize: 13 }}>The OMC decides which GAs each course serves on the GA–course matrix. {none.length ? <b style={{ color: "#C62828" }}>{none.length} course(s) serve no GA yet: {none.map((c) => c.code).join(", ")}.</b> : "Every course serves at least one GA."}</p>
      {user.role === "OMC" && <Link className="btn btn-sm" href={`/omc/plo-matrix?batchId=${batchId}`}>Open the GA–course matrix →</Link>}</div>;
  }

  const fields = [
    { name: "courseId", label: "Course", type: "select" as const, width: 260, options: [["", "— (a note on the whole batch)"] as [string, string], ...courses.map((c) => [c.id, `${c.code} ${c.title}`] as [string, string])] },
    { name: "kind", label: "Proposal", type: "select" as const, width: 200, options: Object.entries(PROPOSAL_KINDS) as [string, string][] },
    { name: "semester", label: "New semester", type: "number" as const, width: 90 },
    { name: "ch", label: "New CH", type: "number" as const, width: 80 },
    { name: "code", label: "New code", width: 110 },
    { name: "title", label: "New name", width: 200 },
    { name: "type", label: "New type", width: 130 },
    { name: "subjectExpertId", label: "Subject Expert", type: "select" as const, width: 200, options: [["", "—"] as [string, string], ...ses.map((u) => [u.id, u.name] as [string, string])] },
    { name: "prerequisiteCourseId", label: "Prerequisite", type: "select" as const, width: 180, options: [["", "none"] as [string, string], ...courses.map((c) => [c.id, c.code] as [string, string])] },
    { name: "reason", label: "Reason (required)", type: "textarea" as const, full: true },
  ];
  return (
    <Shell roleLabel={roleName} userName={user.name} navLinks={nav}>
      <p className="small-note" style={{ margin: 0 }}><Link href="/omc/batch-review">← All batches to approve</Link></p>
      <h1 style={{ fontSize: 22, margin: "2px 0 4px" }}>OMC approval · {label}</h1>
      <div className="card" role="navigation" aria-label="Review steps" style={{ borderLeft: "5px solid #0D2A4A", padding: "10px 14px" }}>
        <b style={{ fontSize: 13.5 }}>Review · step {idx + 1} of {REVIEW_STEPS.length}: {REVIEW_STEPS[idx].title}</b>
        <ol style={{ display: "flex", gap: 4, listStyle: "none", padding: 0, margin: "8px 0", flexWrap: "wrap" }}>{REVIEW_STEPS.map((s, i) => { const done = !!approval.review[s.key]; const here = s.key === step; return (
          <li key={s.key}><Link href={href(s.key)} aria-current={here ? "step" : undefined} title={done ? `Reviewed by ${approval.review[s.key].byName}` : s.title} style={{ display: "inline-flex", gap: 4, padding: "2px 8px", borderRadius: 999, fontSize: 12, textDecoration: "none", border: `1.5px solid ${here ? "#0D2A4A" : done ? "#2E7D32" : "#C9CED6"}`, background: here ? "#EAF1FA" : done ? "#EEF7EF" : "#fff", color: done ? "#1E6B34" : "#0D2A4A", fontWeight: here ? 700 : 500 }}><span aria-hidden>{done ? "✓" : here ? "●" : "○"}</span>{i + 1}<span className="setup-strip-title"> {s.title}</span></Link></li>); })}</ol>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {idx > 0 && <Link className="btn btn-secondary btn-sm" href={href(REVIEW_STEPS[idx - 1].key)}>← Previous step</Link>}
          {canAct && <ActionButton url="/api/omc/batch-review" body={{ batchId, action: "review", step, on: !approval.review[step] }} label={approval.review[step] ? "Mark not reviewed" : "Reviewed ✓"} className={approval.review[step] ? "btn btn-secondary btn-sm" : "btn btn-sm"} />}
          {idx < REVIEW_STEPS.length - 1 && <Link className="btn btn-sm" href={href(REVIEW_STEPS[idx + 1].key)}>Next step →</Link>}
          {approval.review[step] && <span className="small-note" style={{ margin: 0 }}>reviewed by {approval.review[step].byName}, {new Date(approval.review[step].at).toLocaleDateString("en-GB")}</span>}
        </div>
      </div>
      {approval.status === "APPROVED" && approval.summary && <div className="card" style={{ borderLeft: "5px solid #2E7D32" }}><b>{label} is approved by the OMC</b> — finalised by {approval.summary.finalisedBy} on {new Date(approval.summary.at).toLocaleDateString("en-GB")}, endorsed {approval.summary.endorsed}.</div>}
      {body}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Proposals ({props.length})</h3>
        {props.length === 0 ? <p className="small-note">No proposals yet.</p> : (
          <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Proposal</th><th>Reason</th><th>By</th><th>Program Lead</th><th>Status</th>{acc.convener && open && <th />}</tr></thead>
            <tbody>{props.map((p, i) => <tr key={p.id}><td><span className="small-note" style={{ margin: 0 }}>{REVIEW_STEPS.find((s) => s.key === p.step)?.title || p.step}</span><br />{descs[i]}</td><td>{p.reason}</td><td>{p.byName}</td>
              <td>{p.plOpinion ? <><b style={{ color: p.plOpinion === "AGREE" ? "#2E7D32" : "#C62828" }}>{p.plOpinion === "AGREE" ? "agrees" : "disagrees"}</b>{p.plComment ? ` — ${p.plComment}` : ""}</> : "waiting"}</td>
              <td>{p.status === "OPEN" ? "will be applied" : p.status === "ACCEPTED" ? "applied" : "dropped"}</td>
              {acc.convener && open && <td>{p.status === "OPEN" ? <ActionButton url="/api/omc/batch-review" body={{ batchId, action: "drop", proposalId: p.id }} label="Drop" className="btn btn-secondary btn-sm" /> : <ActionButton url="/api/omc/batch-review" body={{ batchId, action: "keep", proposalId: p.id }} label="Keep" className="btn btn-secondary btn-sm" />}</td>}</tr>)}</tbody></table>)}
        {canAct && <ActionForm url="/api/omc/batch-review" fixed={{ batchId, action: "propose", step }} submit="Send proposal" collapsed openLabel="+ Make a proposal" initial={{ kind: "MOVE" }} fields={fields} />}
      </div>
      <div className="card" style={{ borderLeft: `5px solid ${t.carried ? "#2E7D32" : "#B26A00"}` }}>
        <h3 style={{ marginTop: 0 }}>Endorsement</h3>
        <p style={{ fontSize: 13.5, margin: "0 0 6px" }}><b>Endorsed {t.yes} of {t.total}</b>{t.no ? ` · ${t.no} not` : ""}{t.waiting.length ? ` · waiting: ${t.waiting.join(", ")}` : ""} · more than half ({t.need}) needed</p>
        {ends.length > 0 && <ul style={{ fontSize: 12.5, paddingLeft: 18, margin: "0 0 6px" }}>{ends.map((e) => <li key={e.memberId}>{names.get(e.memberId) || "—"}: <b style={{ color: e.endorse ? "#2E7D32" : "#C62828" }}>{e.endorse ? "endorses" : "does not endorse"}</b>{e.comment ? ` — ${e.comment}` : ""}</li>)}</ul>}
        {canAct && <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
          <ActionButton url="/api/omc/batch-review" body={{ batchId, action: "endorse", yes: true }} label="Endorse" askNote="Comment (optional)" showMessage />
          <ActionButton url="/api/omc/batch-review" body={{ batchId, action: "endorse", yes: false }} label="Do not endorse" className="btn btn-secondary btn-sm" askNote="Why not?" noteRequired showMessage />
        </span>}
        {acc.convener && open && <div style={{ marginTop: 8 }}><ActionButton url="/api/omc/batch-review" body={{ batchId, action: "finalise" }} label="Finalise — approve the batch" className="btn" showMessage confirmText={`Finalise ${label}? ${props.filter((p) => p.status === "OPEN").length} proposal(s) will be applied. This is final.`} />{!t.carried && <span className="small-note"> Waiting for more than half of the members to endorse.</span>}</div>}
        {!acc.member && <p className="small-note">You can follow this review; only the department&apos;s OMC members act on it.</p>}
      </div>
    </Shell>
  );
}
