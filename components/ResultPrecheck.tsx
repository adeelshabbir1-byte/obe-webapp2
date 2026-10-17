import { courseChain } from "../lib/outcomeFlow";
import { prisma } from "../lib/db";
import PloImpactPreview, { DeltaList } from "./PloImpactPreview";

// "Before you submit": unmeasured CLOs (blocks submission), CLOs below target (write a CQI note), and the course's effect on
// the batch's PLO attainment — a preview before approval, the recorded change after it.
export default async function ResultPrecheck({ courseId }: { courseId: string }) {
  const chain = await courseChain(courseId, "INSTRUCTOR").catch(() => null);
  if (!chain) return null;
  const unassessed = chain.clos.filter((c) => !chain.assessments.some((a) => a.cloId === c.id));
  const below = chain.clos.filter((c) => c.attainment != null && c.attainment < c.target);
  const log = (await (prisma as unknown as Record<string, any>).ploChangeLog.findUnique({ where: { courseId } }).catch(() => null)) as { deltasJson: string } | null;
  return (
    <div className="card no-print" style={{ borderLeft: `4px solid ${unassessed.length ? "#B3261E" : below.length ? "#B7791F" : "#2E7D4F"}` }}>
      <h3 style={{ marginTop: 0 }}>{log ? "Effect of this course on the batch" : "Before you submit the result"}</h3>
      {!log && (unassessed.length ? <p style={{ color: "#B3261E", margin: "4px 0" }}><b>Blocks submission:</b> {unassessed.map((c) => c.code).join(", ")} {unassessed.length > 1 ? "are" : "is"} not measured by any assessment.</p>
        : <p style={{ color: "#1F5E36", margin: "4px 0" }}>✓ Every CLO is measured by at least one assessment.</p>)}
      {below.length > 0 && <p style={{ margin: "4px 0", color: "#7A520C" }}>Below target: {below.map((c) => `${c.code} ${c.attainment}% (target ${c.target}%)`).join(", ")}. {log ? "" : "Mention the CQI action you plan in the submission note, so the approver and the OMC see it."}</p>}
      <div style={{ fontSize: 13, marginTop: 6 }}><b>Batch PLO attainment:</b> {log ? <DeltaList deltas={JSON.parse(log.deltasJson)} /> : <PloImpactPreview courseId={courseId} />}</div>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 0 }}>Figures = share of the batch&apos;s students reaching each PLO, over the courses whose results are approved, weighted by the batch&apos;s course weights — without and with this course.</p>
    </div>
  );
}
