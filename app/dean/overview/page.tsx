import { holdsRoleWhere } from "../../../lib/dualRoles";
import { prisma } from "../../../lib/db";
import { requireDean } from "../../../lib/deanGuard";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import Link from "next/link";
import { reportPeople } from "../../../lib/facultyProfile";
import { appraiseesFor } from "../../../lib/appraisal";

const ROLE_TEXT: Record<string, string> = { INSTRUCTOR: "Instructor", SUBJECT_EXPERT: "University Subject Expert", PROGRAM_COORDINATOR: "Program Lead", HEAD_OF_DEPARTMENT: "Chairman", DEPARTMENT_COORDINATOR: "Program Coordinator", DEAN: "Dean", LAB_ENGINEER: "Lab Engineer" };

export default async function DeanOverviewPage() {
  const user = await requireDean();
  const facultyId = user.facultyId || "none";
  const chairmanId = user.managedById || "";
  const [faculty, departments] = await Promise.all([
    prisma.faculty.findUnique({ where: { id: facultyId } }),
    prisma.department.findMany({ where: { facultyId }, orderBy: { name: "asc" }, include: { programs: true } }),
  ]);
  // Everyone on the faculty's staff (teachers under a Program Lead count in the lead's department), with their designation.
  const people = await reportPeople(user);
  const designations = new Map((await prisma.facultyProfile.findMany({ where: { userId: { in: people.map((p) => p.id).concat(["none"]) } }, select: { userId: true, designation: true } })).map((f) => [f.userId, f.designation]));
  const year = new Date().getFullYear();
  // Appraisals cover teaching staff only.
  const appraisable = new Set((await appraiseesFor(user)).people.map((p) => p.id));
  const rows = await Promise.all(departments.map(async (d) => {
    const staff = people.filter((p) => p.departmentId === d.id);
    const [heads, leads, noTeacher, awaiting, offered] = await Promise.all([
      prisma.user.findMany({ where: { ...holdsRoleWhere("HEAD_OF_DEPARTMENT"), departmentId: d.id }, select: { name: true } }),
      prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", departmentId: d.id, leadProgram: { not: null } }, select: { name: true, leadProgram: true } }),
      prisma.course.count({ where: { isOffered: true, instructorId: null, coordinator: { managedById: chairmanId, departmentId: d.id } } }),
      prisma.course.count({ where: { instructorApproval: "PENDING", coordinator: { managedById: chairmanId, departmentId: d.id } } }),
      prisma.course.count({ where: { isOffered: true, coordinator: { managedById: chairmanId, departmentId: d.id } } }),
    ]);
    const teachers = staff.filter((p) => ["INSTRUCTOR", "SUBJECT_EXPERT"].includes(p.role) || ["INSTRUCTOR", "SUBJECT_EXPERT"].includes(p.secondaryRole || "")).length;
    return { d, heads, leads, teachers, staff, noTeacher, awaiting, offered };
  }));

  return (
    <Shell roleLabel="Dean" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{faculty?.name || "My Faculty"}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>Every department in your faculty at a glance: who leads it, its faculty members (open anyone’s details or appraisal), and where courses are still missing a teacher.</p>
      {departments.length === 0 && <div className="card" style={{ color: "var(--slate)" }}>No departments are in your faculty yet — ask the Institute Head to add them.</div>}
      {rows.map(({ d, heads, leads, teachers, staff, noTeacher, awaiting, offered }) => (
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
          <h4 style={{ margin: "16px 0 6px" }}>Faculty members ({staff.length})</h4>
          <table>
            <thead><tr><th>Name</th><th>Designation</th><th>Role</th><th></th></tr></thead>
            <tbody>
              {staff.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No faculty members recorded in this department yet.</td></tr>}
              {staff.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}<div style={{ fontSize: 11.5, color: "var(--slate)" }}>{p.email}</div></td>
                  <td>{designations.get(p.id) || <span style={{ color: "var(--slate)" }}>not entered</span>}</td>
                  <td style={{ fontSize: 12 }}>{ROLE_TEXT[p.role] || p.role}{p.secondaryRole ? ` + ${ROLE_TEXT[p.secondaryRole] || p.secondaryRole}` : ""}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <Link href={`/faculty-report/${p.id}`} className="act act-primary">Details</Link>{" "}
                    {appraisable.has(p.id) && <Link href={`/appraisals/${p.id}?year=${year}`} className="act act-neutral">Appraisal {year}</Link>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </Shell>
  );
}
