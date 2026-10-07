import { prisma } from "../../../lib/db";
import { requireDean } from "../../../lib/deanGuard";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import { DeanLoanDecisions } from "../../../components/DeanDecisions";

export default async function DeanApprovalsPage() {
  const user = await requireDean();
  const facultyId = user.facultyId || "none";
  const loans = await prisma.teacherLoanRequest.findMany({
    where: {
      chairmanId: user.managedById || "", status: { in: ["PENDING", "APPROVED"] },
      OR: [{ requesterDeanStatus: "PENDING", requestingDepartment: { facultyId } }, { lenderDeanStatus: "PENDING", lendingDepartment: { facultyId } }],
    },
    include: { course: { select: { code: true, title: true } }, instructor: { select: { name: true } }, requestingDepartment: { select: { name: true } }, lendingDepartment: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return (
    <Shell roleLabel="Dean" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Approvals</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Requests for a teacher or Subject Expert from another department. Once you approve, the lending Chairman chooses who may be lent. Requests between two faculties need both Deans.
      </p>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Teacher requests waiting for you ({loans.length})</h3>
        <DeanLoanDecisions items={loans.map((l) => ({ id: l.id, kind: l.kind, course: `${l.course.code} — ${l.course.title}`, from: l.lendingDepartment.name, to: l.requestingDepartment.name, asked: l.instructor?.name || null, note: l.note, side: "" }))} />
      </div>
    </Shell>
  );
}
