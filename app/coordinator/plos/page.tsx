import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import PlosManager from "../../../components/PlosManager";
import AutoSubmitSelect from "../../../components/AutoSubmitSelect";

const NAV = [
  { href: "/coordinator/faculty", label: "Faculty Onboarding" },
  { href: "/coordinator/batches", label: "Degree Programs & Batches" },
  { href: "/coordinator/courses", label: "Courses" },
  { href: "/coordinator/plos", label: "Program Learning Outcomes" },
  { href: "/coordinator/semester", label: "Current Semester" },
  { href: "/coordinator/calendar", label: "Calendar & Exam Dates" },
  { href: "/coordinator/students", label: "Students" },
  { href: "/coordinator/repeat-offering", label: "Repeat/Summer Offering" },
  { href: "/coordinator/grading-scale", label: "Grading Scale" },
  { href: "/coordinator/load-report", label: "Teacher Load Report" },
  { href: "/coordinator/semester-health", label: "Semester Health" },
  { href: "/coordinator/batch-comparison", label: "Batch Comparison" },
  { href: "/coordinator/prerequisite-map", label: "Prerequisite Map" },
  { href: "/coordinator/feedforward-digest", label: "Feed-Forward Digest" },
  { href: "/omc/reports", label: "OMC Reports" },
];

export default async function CoordinatorPlosPage({ searchParams }: { searchParams: { batchId?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const batches = await prisma.batch.findMany({ where: { coordinatorId: user.id }, orderBy: [{ degreeProgram: "asc" }, { batchName: "desc" }] });
  const selectedBatchId = searchParams.batchId || batches[0]?.id || "";

  const plos = selectedBatchId
    ? await prisma.pLO.findMany({ where: { coordinatorId: user.id, batchId: selectedBatchId }, orderBy: { number: "asc" } })
    : [];
  const hecPlos = await prisma.masterPLO.findMany({
    where: { masterCurriculum: { authority: "HEC" } },
    orderBy: { number: "asc" },
  });

  return (
    <Shell roleLabel="Program Coordinator" userName={user.name} navLinks={NAV}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, marginBottom: 4 }}>Program Learning Outcomes</h1>
        <a href={`/api/coordinator/plos/export?batchId=${selectedBatchId}`} className="btn btn-brass" style={{ textDecoration: "none" }}>Export to Excel</a>
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 16 }}>
        PLOs are defined separately per batch/cohort — even two intakes of the same degree can have different
        outcomes if the curriculum was revised between them. Copy a starting point from the HEC curriculum or
        write your own; the Chairman reviews and approves them before Subject Experts map CLOs to them.
      </p>

      {batches.length === 0 ? (
        <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>Create a batch first before defining PLOs.</p></div>
      ) : (
        <>
          <div className="card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em" }}>Batch</label>
            <AutoSubmitSelect name="batchId" defaultValue={selectedBatchId} options={batches.map((b) => ({ value: b.id, label: `${b.degreeProgram} — ${b.batchName}` }))} />
          </div>
          <PlosManager
            key={selectedBatchId}
            batchId={selectedBatchId}
            otherBatches={batches.filter((b) => b.id !== selectedBatchId).map((b) => ({ id: b.id, label: `${b.degreeProgram} — ${b.batchName}` }))}
            initialPlos={plos.map((p) => ({ id: p.id, number: p.number, title: p.title, description: p.description, status: p.status, chairmanComment: p.chairmanComment, sourceMasterPloNumber: p.sourceMasterPloNumber }))}
            hecPlos={hecPlos.map((h) => ({ number: h.number, title: h.title, description: h.description }))}
          />
        </>
      )}
    </Shell>
  );
}
