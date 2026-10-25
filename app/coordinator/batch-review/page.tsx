import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import SetupStrip from "../../../components/SetupStrip";
import BatchComparisonView from "../../../components/BatchComparisonView";
import { ActionButton } from "../../../components/fyp/FypClient";
import { compareBatch } from "../../../lib/batchCompare";
import { flowOf, TOTAL_STEPS } from "../../../lib/batchFlow";
import { approvalOf, proposalsOf, endorsementsOf, describe, PROPOSAL_KINDS } from "../../../lib/batchApproval";
import { omcOfBatch, tally } from "../../../lib/omcMembers";

export const dynamic = "force-dynamic";
export const metadata = { title: "Batch review" };

// Step 13 of a batch's set-up: the three-way comparison, the checklist, and "Send to OMC for approval". Once sent, the
// OMC's proposals arrive here for the Program Lead's agree / disagree and comment; once approved, the final version.
export default async function BatchReviewPage({ searchParams }: { searchParams: { batchId?: string; setup?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");
  const batch = searchParams.batchId ? await prisma.batch.findFirst({ where: { id: searchParams.batchId, coordinatorId: user.id }, select: { id: true, degreeProgram: true, batchName: true } }) : null;
  if (!batch) redirect("/coordinator/batches");
  const [cmp, flow, approval, props, ends, omc] = await Promise.all([compareBatch(batch.id), flowOf(batch.id), approvalOf(batch.id), proposalsOf(batch.id), endorsementsOf(batch.id), omcOfBatch(batch.id)]);
  const label = `${batch.degreeProgram} ${batch.batchName}`;
  const t = omc ? tally(omc.members, ends.map((e) => ({ memberId: e.memberId, yes: e.endorse }))) : null;
  const openSteps = (flow?.steps || []).filter((s) => s.n < TOTAL_STEPS && !s.done);
  const descs = await Promise.all(props.map((p) => describe(p)));
  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      {searchParams.setup === batch.id && <SetupStrip batchId={batch.id} step={13} hideNext />}
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Review &amp; send to OMC · {label}</h1>
      {approval?.status === "APPROVED" && approval.summary && (
        <div className="card" style={{ borderLeft: "5px solid #2E7D32" }}>
          <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>{label} is approved by the OMC</h2>
          <p className="small-note" style={{ marginTop: 0 }}>Finalised by {approval.summary.finalisedBy} on {new Date(approval.summary.at).toLocaleDateString("en-GB")} · endorsed {approval.summary.endorsed}. This record is kept as accreditation evidence.</p>
          {approval.summary.proposals.length > 0 && <><b>OMC proposals</b><ul style={{ fontSize: 13, margin: "4px 0 8px", paddingLeft: 18 }}>{approval.summary.proposals.map((p, i) => <li key={i}>{p.what} — <i>{p.reason}</i> · you {p.pl} · <b>{p.outcome}</b></li>)}</ul></>}
          <details><summary style={{ cursor: "pointer" }}>Course by course ({approval.summary.courses.length})</summary>
            <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Course</th><th>CH</th><th>Sem</th><th>Compared with before</th></tr></thead>
              <tbody>{approval.summary.courses.map((c, i) => <tr key={i}><td><b>{c.code}</b> {c.title}</td><td>{c.ch}</td><td>{c.semester ?? "—"}</td><td>{c.tags.join(", ")}</td></tr>)}</tbody></table></details>
        </div>
      )}
      {!approval && (
        <div className="card" style={{ borderLeft: `5px solid ${openSteps.length ? "#B26A00" : "#2E7D32"}` }}>
          <h3 style={{ marginTop: 0 }}>Checklist</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 8px", columns: 2, fontSize: 13 }}>{(flow?.steps || []).filter((s) => s.n < TOTAL_STEPS).map((s) => (
            <li key={s.n} style={{ breakInside: "avoid", padding: "2px 0" }}><span style={{ color: s.done ? "#2E7D32" : "#C62828", fontWeight: 700 }} aria-label={s.done ? "done" : "not done"}>{s.done ? "✓" : "✗"}</span> <Link href={s.href}>{s.n}. {s.title}</Link>{s.note ? <span className="small-note" style={{ margin: 0 }}> · {s.note}</span> : null}</li>))}</ul>
          <ActionButton url="/api/coordinator/batch-flow" body={{ batchId: batch.id, action: "submit" }} label="Send to OMC for approval" className="btn" showMessage
            confirmText={openSteps.length ? `${openSteps.length} step(s) are not done yet (${openSteps.map((s) => s.n).join(", ")}). Send to the OMC anyway?` : `Send ${label} to the OMC for approval?`} />
          <p className="small-note">The department&apos;s OMC ({omc?.members.length || 0} member{omc?.members.length === 1 ? "" : "s"}{omc?.convenerName ? `, Convener ${omc.convenerName}` : ""}) reviews it, may propose changes (you give your opinion on each), and the Convener finalises it once more than half endorse.</p>
        </div>
      )}
      {approval && approval.status !== "APPROVED" && (
        <div className="card" style={{ borderLeft: "5px solid #1565C0" }}>
          <b>With the OMC since {new Date(approval.submittedAt).toLocaleDateString("en-GB")}</b>
          {t && <p style={{ margin: "4px 0", fontSize: 13 }}>Endorsed {t.yes} of {t.total}{t.no ? ` · ${t.no} not` : ""}{t.waiting.length ? ` · waiting: ${t.waiting.join(", ")}` : ""} · {t.need} needed</p>}
        </div>
      )}
      {props.length > 0 && (
        <div className="card" id="proposals">
          <h3 style={{ marginTop: 0 }}>The OMC&apos;s proposals ({props.length})</h3>
          <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th>Proposal</th><th>Reason</th><th>By</th><th>Your opinion</th><th>Status</th></tr></thead>
            <tbody>{props.map((p, i) => (
              <tr key={p.id}><td><span className="small-note" style={{ margin: 0 }}>{PROPOSAL_KINDS[p.kind]}</span><br />{descs[i]}</td><td>{p.reason}</td><td>{p.byName}<br /><span className="small-note" style={{ margin: 0 }}>{new Date(p.createdAt).toLocaleDateString("en-GB")}</span></td>
                <td>{p.plOpinion ? <><b style={{ color: p.plOpinion === "AGREE" ? "#2E7D32" : "#C62828" }}>{p.plOpinion === "AGREE" ? "Agree" : "Disagree"}</b>{p.plComment ? ` — ${p.plComment}` : ""}</> : <span className="small-note" style={{ margin: 0 }}>not given</span>}
                  {approval?.status === "SUBMITTED" && <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                    <ActionButton url="/api/coordinator/batch-flow" body={{ batchId: batch.id, action: "opinion", proposalId: p.id, agree: true }} label="Agree" askNote="Comment (optional)" />
                    <ActionButton url="/api/coordinator/batch-flow" body={{ batchId: batch.id, action: "opinion", proposalId: p.id, agree: false }} label="Disagree" className="btn btn-secondary btn-sm" askNote="Why do you disagree?" noteRequired />
                  </div>}</td>
                <td>{p.status === "OPEN" ? "open" : p.status === "ACCEPTED" ? "applied" : "dropped"}</td></tr>))}</tbody></table>
          <p className="small-note">The OMC&apos;s decision is final; your opinion on each proposal stays on the record.</p>
        </div>
      )}
      {cmp && <BatchComparisonView cmp={cmp} batchId={batch.id} />}
    </Shell>
  );
}
