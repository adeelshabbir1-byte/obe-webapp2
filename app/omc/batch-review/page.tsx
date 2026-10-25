import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { OMC_ACTION_NAV, navForRole } from "../../../components/reportNav";

// Batches sent by Program Leads for OMC approval.
export default async function OmcBatchReviews() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const db = prisma as unknown as Record<string, any>;
  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById || "none";
  const reviews = ((await db.batchReview.findMany({ orderBy: { submittedAt: "desc" } }).catch(() => [])) as { batchId: string; status: string; submittedAt: Date; decidedByName: string | null; decidedAt: Date | null }[]);
  const batches = await prisma.batch.findMany({ where: { id: { in: reviews.map((r) => r.batchId).concat("none") }, coordinator: { managedById: chairmanId } }, select: { id: true, degreeProgram: true, batchName: true, coordinator: { select: { name: true } } } });
  const endorse = ((await db.batchReviewEndorse.findMany({ where: { batchId: { in: batches.map((b) => b.id).concat("none") }, endorse: true } }).catch(() => [])) as { batchId: string }[]);
  const rows = reviews.map((r) => ({ r, b: batches.find((b) => b.id === r.batchId) })).filter((x) => x.b);
  return (
    <Shell roleLabel={user.role === "OMC" ? "OMC Member" : "Faculty"} userName={user.name} navLinks={user.role === "OMC" ? OMC_ACTION_NAV : navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Batch Approvals</h1>
      <p style={{ color: "var(--slate)", fontSize: 13 }}>New batches sent by Program Leads. Review each step by step, propose changes with reasons, endorse; the Convener finalises on a majority.</p>
      <div className="card"><table style={{ fontSize: 13, width: "100%" }}><thead><tr><th>Batch</th><th>Program Lead</th><th>Sent</th><th>Status</th><th /></tr></thead>
        <tbody>{rows.map(({ r, b }) => <tr key={r.batchId}><td>{b!.degreeProgram} — {b!.batchName}</td><td>{b!.coordinator.name}</td><td>{new Date(r.submittedAt).toLocaleDateString("en-GB")}</td>
          <td>{r.status === "APPROVED" ? `Approved (${r.decidedByName})` : `With the OMC · ${endorse.filter((e) => e.batchId === r.batchId).length} endorsed`}</td>
          <td><Link className="btn btn-sm" href={`/omc/batch-review/${r.batchId}`}>{r.status === "APPROVED" ? "View" : "Review →"}</Link></td></tr>)}
          {!rows.length && <tr><td colSpan={5} className="small-note">Nothing sent yet.</td></tr>}</tbody></table></div>
    </Shell>
  );
}
