import { redirect } from "next/navigation";
import SortableTable from "../../../../components/SortableTable";
import { getAuthenticatedUser } from "../../../../lib/session";
import { canViewReports, roleLabel, chairmanIdFor } from "../../../../lib/reportScope";
import { canViewReport } from "../../../../lib/reportAcl";
import { navForRole } from "../../../../components/reportNav";
import { prisma } from "../../../../lib/db";
import ReportPrintHeader from "../../../../components/ReportPrintHeader";
import { getOmcActivityLog } from "../../../../lib/reports";
import { formatActionLabel, formatMetadata } from "../../../../lib/auditLabels";
import Shell from "../../../../components/Shell";
import OmcActivityFilters from "../../../../components/OmcActivityFilters";
import ReportsSubNav from "../../../../components/ReportsSubNav";

export default async function OmcActivityLogPage({ searchParams }: { searchParams: { omcId?: string; from?: string; to?: string; page?: string; degreeProgram?: string; termName?: string; termYear?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!canViewReports(user.role)) redirect("/dashboard");
  if (!(await canViewReport(user, "omc.reports.omc-activity-log"))) redirect("/dashboard");

  const chairmanId = await chairmanIdFor(user);
  const omcMembers = chairmanId ? await prisma.user.findMany({ where: { role: "OMC", managedById: chairmanId }, orderBy: { name: "asc" } }) : [];
  const coordinatorIds = chairmanId ? (await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } })).map((c) => c.id) : [];
  // Every recorded term (across every program) this institution has set
  // Semester & Exam Dates for — the Word export uses one of these to
  // split "before start / midterm / before final / final / after final".
  const terms = coordinatorIds.length > 0 ? await prisma.semesterDates.findMany({
    where: { coordinatorId: { in: coordinatorIds } },
    select: { degreeProgram: true, termName: true, termYear: true },
    distinct: ["degreeProgram", "termName", "termYear"],
    orderBy: [{ termYear: "desc" }, { termName: "asc" }],
  }) : [];

  const pageNum = parseInt(searchParams.page || "1", 10);
  const filter = { omcId: searchParams.omcId, from: searchParams.from, to: searchParams.to, page: pageNum };
  const { rows, total, pageSize } = await getOmcActivityLog(user, filter);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const qs = (overrides: Record<string, string | number>) => {
    const params = new URLSearchParams();
    if (searchParams.omcId) params.set("omcId", searchParams.omcId);
    if (searchParams.from) params.set("from", searchParams.from);
    if (searchParams.to) params.set("to", searchParams.to);
    for (const [k, v] of Object.entries(overrides)) params.set(k, String(v));
    return `?${params.toString()}`;
  };

  const selectedTermKey = searchParams.degreeProgram && searchParams.termName && searchParams.termYear
    ? `${searchParams.degreeProgram}|${searchParams.termName}|${searchParams.termYear}` : "";
  const docxHref = (() => {
    const params = new URLSearchParams();
    if (searchParams.omcId) params.set("omcId", searchParams.omcId);
    if (searchParams.from) params.set("from", searchParams.from);
    if (searchParams.to) params.set("to", searchParams.to);
    if (searchParams.degreeProgram) params.set("degreeProgram", searchParams.degreeProgram);
    if (searchParams.termName) params.set("termName", searchParams.termName);
    if (searchParams.termYear) params.set("termYear", searchParams.termYear);
    return `/api/omc/reports/omc-activity-log/export-docx?${params.toString()}`;
  })();

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <ReportPrintHeader title="OMC Activity Log — Minutes of Meeting" />
        <a href={`/api/omc/reports/omc-activity-log/export${qs({})}`} className="btn btn-brass no-print" style={{ textDecoration: "none" }}>Export to Excel</a>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        Every recorded action taken by an OMC member — course template reviews and approvals, PLO/CLO mapping
        decisions, content-sync and curriculum changes, policy settings — in plain language, with who did it,
        when, and on what. This is the record to hand an accreditation panel showing OMC oversight actually
        happened, and when.
      </p>
      <ReportsSubNav active="omc-activity-log" />

      <OmcActivityFilters omcMembers={omcMembers.map((m) => ({ id: m.id, name: m.name }))} omcId={searchParams.omcId || ""} from={searchParams.from || ""} to={searchParams.to || ""}
        terms={terms.map((t) => ({ degreeProgram: t.degreeProgram, termName: t.termName, termYear: t.termYear }))} selectedTermKey={selectedTermKey}
        degreeProgram={searchParams.degreeProgram || ""} termName={searchParams.termName || ""} termYear={searchParams.termYear || ""} />

      <div className="card no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ fontSize: 12, color: "var(--slate)" }}>
          Download the minutes for the record above — grouped by "Before Start of Semester", "During Midterm",
          "After Midterm / Before Final", "During Final", and "After Final" when a semester is selected above,
          or one chronological list if not.
        </p>
        <a href={docxHref} className="btn" style={{ textDecoration: "none", flexShrink: 0 }}>Download Word (Minutes of Meeting)</a>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <SortableTable>
          <thead><tr><th>When</th><th>OMC Member</th><th>Action</th><th>On</th><th>Details</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No OMC activity recorded for this filter yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>{r.createdAt.toISOString().replace("T", " ").slice(0, 16)}</td>
                <td style={{ fontSize: 12 }}>{r.actorName}</td>
                <td style={{ fontSize: 12 }}>{formatActionLabel(r.action)}</td>
                <td style={{ fontSize: 12 }}>{r.entityLabel}</td>
                <td style={{ fontSize: 11.5, color: "var(--slate)" }}>{formatMetadata(r.metadata)}</td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
        <div className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
          <span style={{ fontSize: 11.5, color: "var(--slate)" }}>Page {pageNum} of {totalPages} ({total} total)</span>
          <div style={{ display: "flex", gap: 8 }}>
            {pageNum > 1 && <a href={qs({ page: pageNum - 1 })} style={{ fontSize: 12, color: "var(--brass-dark)" }}>← Previous</a>}
            {pageNum < totalPages && <a href={qs({ page: pageNum + 1 })} style={{ fontSize: 12, color: "var(--brass-dark)" }}>Next →</a>}
          </div>
        </div>
      </div>
    </Shell>
  );
}
