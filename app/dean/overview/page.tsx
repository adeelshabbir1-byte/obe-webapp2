import { prisma } from "../../../lib/db";
import { requireDean } from "../../../lib/deanGuard";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";

export default async function DeanOverviewPage() {
  const user = await requireDean();
  const facultyId = user.facultyId || "none";
  const chairmanId = user.managedById || "";
  const [faculty, departments] = await Promise.all([
    prisma.faculty.findUnique({ where: { id: facultyId } }),
    prisma.department.findMany({ where: { facultyId }, orderBy: { name: "asc" }, include: { programs: true } }),
  ]);
  const rows = await Promise.all(departments.map(async (d) => {
    const [heads, leads, teachers, noTeacher, awaiting, offered] = await Promise.all([
      prisma.user.findMany({ where: { role: "HEAD_OF_DEPARTMENT", departmentId: d.id }, select: { name: true } }),
      prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", departmentId: d.id, leadProgram: { not: null } }, select: { name: true, leadProgram: true } }),
      prisma.user.count({ where: { departmentId: d.id, role: { in: ["INSTRUCTOR", "SUBJECT_EXPERT"] }, isVisitingPlaceholder: false } }),
      prisma.course.count({ where: { isOffered: true, instructorId: null, coordinator: { managedById: chairmanId, departmentId: d.id } } }),
      prisma.course.count({ where: { instructorApproval: "PENDING", coordinator: { managedById: chairmanId, departmentId: d.id } } }),
      prisma.course.count({ where: { isOffered: true, coordinator: { managedById: chairmanId, departmentId: d.id } } }),
    ]);
    return { d, heads, leads, teachers, noTeacher, awaiting, offered };
  }));

  return (
    <Shell roleLabel="Dean" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{faculty?.name || "My Faculty"}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>Every department in your faculty at a glance: who leads it, how many teachers it has, and where courses are still missing a teacher.</p>
      {departments.length === 0 && <div className="card" style={{ color: "var(--slate)" }}>No departments are in your faculty yet — ask the Institute Head to add them.</div>}
      {rows.map(({ d, heads, leads, teachers, noTeacher, awaiting, offered }) => (
        <div className="card" key={d.id}>
          <h3 style={{ marginTop: 0 }}>{d.name}</h3>
          <p style={{ fontSize: 13, margin: "0 0 8px" }}>
            Chairman: <b>{heads.length ? heads.map((h) => h.name).join(", ") : "none yet"}</b> · Teachers: <b>{teachers}</b> · Offered courses: <b>{offered}</b>
            {" "}· <span style={{ color: noTeacher > 0 ? "#96650F" : "var(--sage)" }}>{noTeacher} without a teacher</span>
            {" "}· <span style={{ color: awaiting > 0 ? "#96650F" : "var(--sage)" }}>{awaiting} awaiting the Chairman</span>
          </p>
          <table>
            <thead><tr><th>Program</th><th>Program Lead</th></tr></thead>
            <tbody>
              {d.programs.length === 0 && <tr><td colSpan={2} style={{ color: "var(--slate)" }}>No programs yet.</td></tr>}
              {d.programs.map((p) => <tr key={p.id}><td>{p.degreeProgram}</td><td>{leads.find((l) => l.leadProgram === p.degreeProgram)?.name || <span style={{ color: "var(--slate)" }}>no lead yet</span>}</td></tr>)}
            </tbody>
          </table>
        </div>
      ))}
    </Shell>
  );
}
