import { Fragment } from "react";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, roleLabel, coordinatorIdsFor } from "../../../../lib/reportScope";
import { canViewReport } from "../../../../lib/reportAcl";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";
import AutoSubmitSelect from "../../../../components/AutoSubmitSelect";

export default async function CrossInstructorComparisonPage({ searchParams }: { searchParams: { code?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.reports.cross-instructor-comparison"))) redirect("/dashboard");

  const coordinatorIds = await coordinatorIdsFor(user);
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: coordinatorIds } } });
  const batchIds = batches.map((b) => b.id);

  // Only course codes taught by more than one instructor (across
  // batches/terms) are worth comparing — a single-instructor code has
  // nothing to compare against.
  const allCourses = await prisma.course.findMany({
    where: { batchId: { in: batchIds }, instructorId: { not: null } },
    select: { code: true, instructorId: true },
  });
  const codeInstructorCounts = new Map<string, Set<string>>();
  for (const c of allCourses) {
    if (!c.instructorId) continue;
    const set = codeInstructorCounts.get(c.code) || new Set();
    set.add(c.instructorId);
    codeInstructorCounts.set(c.code, set);
  }
  const comparableCodes = Array.from(codeInstructorCounts.entries()).filter(([, s]) => s.size > 0).map(([code]) => code).sort();
  const selectedCode = searchParams.code || comparableCodes[0] || "";

  const offerings = selectedCode
    ? await prisma.course.findMany({
        where: { batchId: { in: batchIds }, code: selectedCode, instructorId: { not: null } },
        include: { instructor: true, batch: true, lectureRows: { where: { source: "INSTRUCTOR" } } },
        orderBy: [{ offeredTermYear: "desc" }, { offeredTermName: "asc" }],
      })
    : [];

  // Union of topics across every offering, matched by normalized text.
  const topicKey = (t: string) => t.trim().toLowerCase();
  const topicDisplay = new Map<string, string>(); // normalized -> first-seen display text
  for (const o of offerings) {
    for (const r of o.lectureRows) {
      const key = topicKey(r.topic);
      if (!topicDisplay.has(key)) topicDisplay.set(key, r.topic);
    }
  }
  const topics = Array.from(topicDisplay.keys());

  type Cell = { covered: boolean; lectureCount: number; marksPct: number };
  const dataByOffering = offerings.map((o) => {
    const byTopic = new Map<string, Cell>();
    for (const r of o.lectureRows) {
      const key = topicKey(r.topic);
      const entry = byTopic.get(key) || { covered: false, lectureCount: 0, marksPct: 0 };
      entry.lectureCount++;
      entry.marksPct += r.weightPct;
      if (r.actualDate) entry.covered = true;
      byTopic.set(key, entry);
    }
    return {
      label: `${o.batch?.degreeProgram || "Unknown Program"} — ${o.offeredTermName || "?"} ${o.offeredTermYear || ""} (${o.instructor?.name || "Unassigned"})`,
      byTopic,
    };
  });

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <ReportPrintHeader title="Cross-Instructor Topic Comparison" />
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        For one course code, compare every instructor/term's actual delivery — which topics were covered vs
        skipped, how many lectures each got, and how marks were distributed across the same topics.
      </p>

      <div className="card no-print">
        <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em", marginRight: 10 }}>Course Code</label>
        <AutoSubmitSelect name="code" defaultValue={selectedCode} options={comparableCodes.map((c) => ({ value: c, label: c }))} />
      </div>

      {offerings.length === 0 ? (
        <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No comparable offerings found for this code.</p></div>
      ) : (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th rowSpan={2} style={{ minWidth: 200 }}>Topic</th>
                {dataByOffering.map((o, i) => <th key={i} colSpan={3} style={{ textAlign: "center" }}>{o.label}</th>)}
              </tr>
              <tr>
                {dataByOffering.map((_, i) => (
                  <Fragment key={i}>
                    <th style={{ minWidth: 70 }}>Covered</th>
                    <th style={{ minWidth: 70 }}>Lectures</th>
                    <th style={{ minWidth: 70 }}>Marks %</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {topics.map((key) => (
                <tr key={key}>
                  <td>{topicDisplay.get(key)}</td>
                  {dataByOffering.map((o, i) => {
                    const cell = o.byTopic.get(key);
                    return (
                      <Fragment key={i}>
                        <td style={!cell?.covered ? { background: "#FFE4DC", color: "var(--rust)", fontWeight: 700 } : { color: "var(--sage)", fontWeight: 700 }}>
                          {cell ? (cell.covered ? "Yes" : "Not Yet") : "Not Planned"}
                        </td>
                        <td>{cell?.lectureCount || 0}</td>
                        <td>{cell ? `${Math.round(cell.marksPct)}%` : "—"}</td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
