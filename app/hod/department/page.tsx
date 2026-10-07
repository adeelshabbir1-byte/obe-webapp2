import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import HodApprovals from "../../../components/HodApprovals";
import HodLoanRequests from "../../../components/HodLoanRequests";
import ProgramLeads from "../../../components/ProgramLeads";
import MemberProgramSelect from "../../../components/MemberProgramSelect";
import GiveRole, { TakeRoleBack } from "../../../components/GiveRole";

export default async function HodDepartmentPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "HEAD_OF_DEPARTMENT") redirect("/dashboard");

  const departmentId = user.departmentId || "none";
  const chairmanId = user.managedById || "";
  const [incomingLoans, pending, department, programs, members, noTeacher, visiting] = await Promise.all([
    prisma.teacherLoanRequest.findMany({
      where: { lendingDepartmentId: departmentId, status: "PENDING", chairmanId, requesterDeanStatus: { not: "PENDING" }, lenderDeanStatus: { not: "PENDING" } },
      include: { course: { select: { code: true, title: true } }, instructor: { select: { name: true } }, requestingDepartment: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.course.findMany({
      where: { instructorApproval: "PENDING", coordinator: { managedById: chairmanId, departmentId } },
      select: { id: true, code: true, title: true, instructor: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: { code: "asc" },
    }),
    prisma.department.findUnique({ where: { id: departmentId } }),
    prisma.departmentProgram.findMany({ where: { departmentId }, orderBy: { degreeProgram: "asc" } }),
    prisma.user.findMany({ where: { departmentId, isVisitingPlaceholder: false }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true, secondaryRole: true, managedById: true, leadProgram: true } }),
    prisma.course.findMany({
      where: { isOffered: true, instructorId: null, coordinator: { managedById: chairmanId, departmentId } },
      select: { id: true, code: true, title: true, batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: { code: "asc" },
    }),
    prisma.course.findMany({
      where: { isOffered: true, instructor: { isVisitingPlaceholder: true }, coordinator: { managedById: chairmanId, departmentId } },
      select: { id: true, code: true, title: true, batch: { select: { degreeProgram: true, batchName: true } } }, orderBy: { code: "asc" },
    }),
  ]);

  const coordinators = members.filter((m) => m.role === "PROGRAM_COORDINATOR");
  const coordOptions = coordinators.map((c) => ({ id: c.id, label: c.leadProgram ? `${c.leadProgram} (${c.name})` : c.name }));
  const roleName: Record<string, string> = { PROGRAM_COORDINATOR: "Program Coordinator", COURSE_ASSIGNER: "Course Assigner", HEAD_OF_DEPARTMENT: "Chairman", INSTRUCTOR: "Teacher", SUBJECT_EXPERT: "Subject Expert", OMC: "OMC Member" };
  const courseRow = (c: { id: string; code: string; title: string; batch: { degreeProgram: string; batchName: string } | null }) => (
    <tr key={c.id}><td>{c.code}</td><td>{c.title}</td><td>{c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—"}</td></tr>
  );

  return (
    <Shell roleLabel="Chairman" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>{department?.name || "My Department"}</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Your programs, your people, and the courses still waiting for a teacher. Teacher assignments wait here for your approval.
      </p>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Requests for your people ({incomingLoans.length})</h3>
        <p style={{ color: "var(--slate)", fontSize: 13 }}>Other departments asking for a teacher or Subject Expert from your department. Tick the people you allow; the requester then picks one.</p>
        <HodLoanRequests people={members.map((m) => ({ ...m, alsoFaculty: m.secondaryRole === "INSTRUCTOR" })).filter((m) => ["INSTRUCTOR", "SUBJECT_EXPERT"].includes(m.role) || (m.role === "HEAD_OF_DEPARTMENT" && m.alsoFaculty)).map((m) => ({ id: m.id, name: m.name, role: m.role }))} items={incomingLoans.map((l) => ({ id: l.id, kind: l.kind, askedId: l.instructorId, asked: l.instructor?.name || null, course: `${l.course.code} — ${l.course.title}`, from: l.requestingDepartment.name, note: l.note }))} />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Waiting for your approval ({pending.length})</h3>
        <HodApprovals items={pending.map((c) => ({ id: c.id, code: c.code, title: c.title, batch: c.batch ? `${c.batch.degreeProgram} — ${c.batch.batchName}` : "—", teacher: c.instructor?.name || "—" }))} />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Program Leads</h3>
        <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>
          A Program Lead is the Program Coordinator responsible for one program of your department. They can do everything for their program: batches, courses, faculty, Subject Experts, timetable.
          Choose a coordinator for each program, or create a new one.
        </p>
        <div style={{ margin: "10px 0 14px" }}>
          <b style={{ fontSize: 13 }}>Make one of your teachers a Program Lead</b>
          <GiveRole roles={["PROGRAM_LEAD"]} teachers={members.filter((m) => m.role === "INSTRUCTOR" || m.role === "SUBJECT_EXPERT").map((m) => ({ id: m.id, name: m.name + (m.role === "SUBJECT_EXPERT" ? " (Subject Expert)" : "") }))} programs={programs.map((p) => ({ name: p.degreeProgram, department: "" }))} />
        </div>
        <ProgramLeads departmentId={departmentId} programs={programs.map((p) => p.degreeProgram)} coordinators={coordinators.map((c) => ({ id: c.id, name: c.name, leadProgram: c.leadProgram || null }))} />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Programs</h3>
        {programs.length === 0 ? <p style={{ color: "var(--slate)" }}>No programs assigned to this department yet — ask the Institute Head.</p> : <ul>{programs.map((p) => <li key={p.id}>{p.degreeProgram}</li>)}</ul>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Offered courses with no teacher yet ({noTeacher.length})</h3>
        <table><thead><tr><th>Code</th><th>Title</th><th>Batch</th></tr></thead>
          <tbody>{noTeacher.length === 0 ? <tr><td colSpan={3} style={{ color: "var(--slate)" }}>None — every offered course has a teacher.</td></tr> : noTeacher.map(courseRow)}</tbody></table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Waiting for a visiting teacher ({visiting.length})</h3>
        <p style={{ color: "var(--slate)", fontSize: 13 }}>These courses were given to “Visiting Faculty (to be decided)”. A real teacher still has to be chosen.</p>
        <table><thead><tr><th>Code</th><th>Title</th><th>Batch</th></tr></thead>
          <tbody>{visiting.length === 0 ? <tr><td colSpan={3} style={{ color: "var(--slate)" }}>None.</td></tr> : visiting.map(courseRow)}</tbody></table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>People in this department ({members.length})</h3>
        <table><thead><tr><th>Name</th><th>Role</th><th>Program (who looks after them)</th></tr></thead>
          <tbody>{members.map((m) => (
            <tr key={m.id}><td>{m.name}</td><td>{roleName[m.role] || m.role}{m.role === "PROGRAM_COORDINATOR" && m.leadProgram ? ` — Lead of ${m.leadProgram}` : ""}{m.role === "PROGRAM_COORDINATOR" && m.leadProgram && <TakeRoleBack userId={m.id} label="Remove as Program Lead" />}</td>
              <td>{["INSTRUCTOR", "SUBJECT_EXPERT"].includes(m.role) && coordOptions.length > 0 ? <MemberProgramSelect userId={m.id} current={m.managedById} coordinators={coordOptions} /> : "—"}</td></tr>
          ))}</tbody></table>
      </div>
    </Shell>
  );
}
