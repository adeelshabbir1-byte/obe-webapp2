import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { navForRole } from "../../../components/reportNav";
import Shell from "../../../components/Shell";
import { heldSet } from "../../../lib/dualRoles";

type DeptNode = {
  id: string; name: string; heads: string[]; coordinators: string[]; assigners: string[]; teachers: string[];
  programs: { name: string; lead: string | null; teachers: string[] }[];
};

const CSS = `
.org, .org ul { list-style: none; margin: 0; padding: 0; }
.org { overflow-x: auto; padding-bottom: 12px; }
.org ul { display: flex; justify-content: center; padding-top: 22px; position: relative; }
.org li { position: relative; padding: 22px 8px 0; text-align: center; display: flex; flex-direction: column; align-items: center; }
.org > li { padding-top: 0; }
.org li::before, .org li::after { content: ""; position: absolute; top: 0; right: 50%; width: 50%; height: 22px; border-top: 2px solid var(--line, #b9b4a8); }
.org li::after { right: auto; left: 50%; border-left: 2px solid var(--line, #b9b4a8); }
.org li:only-child::before, .org li:only-child::after { display: none; }
.org li:only-child { padding-top: 0; }
.org li:first-child::before, .org li:last-child::after { border: 0 none; }
.org li:last-child::before { border-right: 2px solid var(--line, #b9b4a8); border-radius: 0 6px 0 0; }
.org li:first-child::after { border-radius: 6px 0 0 0; }
.org ul ul::before { content: ""; position: absolute; top: 0; left: 50%; border-left: 2px solid var(--line, #b9b4a8); height: 22px; }
.node { border: 1.5px solid var(--line, #b9b4a8); border-radius: 10px; padding: 8px 12px; min-width: 150px; max-width: 250px; background: var(--card-bg, rgba(255,255,255,.6)); font-size: 13px; text-align: left; }
.node b { display: block; font-size: 14px; }
.node .role { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--slate); margin-bottom: 2px; }
.node .who { color: var(--slate); font-size: 12px; margin-top: 2px; }
.node.inst { border-color: #96650F; border-width: 2px; text-align: center; }
.node.fac { border-color: #3d6b8f; }
.node.dept { border-color: #4f7d5a; }
.node.warn { border-style: dashed; }
.prog { margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--line, #b9b4a8); }
.prog div { font-size: 12px; margin-bottom: 4px; }
.prog .lead { color: var(--sage); }
.prog .nolead { color: #96650F; }
.key span { display: inline-block; margin-right: 14px; font-size: 12px; }
.key i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; border: 2px solid; vertical-align: -1px; }
`;

export default async function InstituteHierarchyPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "CHAIRMAN") redirect("/dashboard");

  const [faculties, departments, people] = await Promise.all([
    prisma.faculty.findMany({ where: { chairmanId: user.id }, include: { deans: { select: { name: true } } }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ where: { chairmanId: user.id }, include: { programs: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: { OR: [{ managedById: user.id }, { managedBy: { managedById: user.id } }], isVisitingPlaceholder: false, AND: [{ OR: [{ role: { in: ["HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR", "INSTRUCTOR", "SUBJECT_EXPERT", "COURSE_ASSIGNER"] } }, { assignerTerm: { not: null } }] }] },
      select: { id: true, name: true, role: true, secondaryRole: true, tertiaryRole: true, extraRoles: true, assignerTerm: true, departmentId: true, leadProgram: true, managedById: true },
    }),
  ]);

  // A person can hold several roles (small universities), so every test looks at all the roles they hold.
  const holds = (p: (typeof people)[number], role: string) => heldSet(p).includes(role);
  const teaches = (p: (typeof people)[number]) => holds(p, "INSTRUCTOR") || holds(p, "SUBJECT_EXPERT");
  const assignerOf = (p: (typeof people)[number]) => p.role === "COURSE_ASSIGNER" || !!p.assignerTerm;
  const nodeFor = (d: (typeof departments)[number]): DeptNode => {
    const inDept = people.filter((p) => p.departmentId === d.id);
    const leads = inDept.filter((p) => holds(p, "PROGRAM_COORDINATOR") && p.leadProgram);
    const names = (xs: typeof people) => xs.map((p) => p.name).sort();
    return {
      id: d.id, name: d.name,
      heads: names(inDept.filter((p) => holds(p, "HEAD_OF_DEPARTMENT"))),
      coordinators: names(inDept.filter((p) => holds(p, "DEPARTMENT_COORDINATOR"))),
      assigners: names(inDept.filter(assignerOf)),
      teachers: names(inDept.filter(teaches)),
      programs: d.programs.map((p) => {
        const lead = leads.find((c) => c.leadProgram === p.degreeProgram) || null;
        return { name: p.degreeProgram, lead: lead?.name || null, teachers: lead ? names(people.filter((t) => t.managedById === lead.id && teaches(t))) : [] };
      }),
    };
  };
  const instituteAssigners = people.filter((p) => assignerOf(p) && !p.departmentId).map((p) => p.name).sort();
  // One name per row, numbered, so long faculty lists are easy to read.
  const rows = (xs: string[]) => (xs.length ? xs.map((name, i) => <div key={name + i} style={{ padding: "1px 0" }}>{i + 1}. {name}</div>) : "—");
  const list = (xs: string[]) => (xs.length ? xs.join(", ") : "—");

  const deptCard = (n: DeptNode) => (
    <div className={`node dept${n.heads.length === 0 ? " warn" : ""}`}>
      <div className="role">Department</div>
      <b>{n.name}</b>
      <div className="who">Chairman: {n.heads.length ? n.heads.join(", ") : "not set"}</div>
      <div className="who">Program Coordinator: {list(n.coordinators)}</div>
      <div className="who">Course Assigner: {list(n.assigners)}</div>
      {n.programs.length > 0 && (
        <div className="prog">
          {n.programs.map((p) => (
            <div key={p.name}>
              <b style={{ fontSize: 12.5 }}>{p.name}</b>
              <span className={p.lead ? "lead" : "nolead"}>Program Lead: {p.lead || "none yet"}</span>
              {p.lead && (
                <details style={{ marginTop: 2 }}><summary style={{ cursor: "pointer", color: "var(--slate)" }}>{p.teachers.length} faculty</summary>
                  <div style={{ color: "var(--slate)" }}>{rows(p.teachers)}</div></details>
              )}
            </div>
          ))}
        </div>
      )}
      <details className="prog"><summary style={{ cursor: "pointer", fontSize: 12 }}>All faculty of the department ({n.teachers.length})</summary>
        <div className="who">{rows(n.teachers)}</div></details>
    </div>
  );

  const unplaced = departments.filter((d) => !d.facultyId);
  const instituteName = user.instituteName || user.name;

  return (
    <Shell roleLabel="Institute Head" userName={user.name} navLinks={navForRole("CHAIRMAN")}>
      <style>{CSS}</style>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Institute Chart</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12 }}>Your whole institute at a glance. Dashed boxes are missing a head or a lead. Click “faculty” to see the teachers. Change any of this from Faculties &amp; Deans and Departments.</p>
      <div className="key" style={{ marginBottom: 14 }}>
        <span><i style={{ borderColor: "#96650F" }} />Institute Head</span>
        <span><i style={{ borderColor: "#3d6b8f" }} />Faculty (Dean)</span>
        <span><i style={{ borderColor: "#4f7d5a" }} />Department (Chairman)</span>
      </div>
      <div className="card">
        <ul className="org">
          <li>
            <div className="node inst"><div className="role">Institute Head</div><b>{instituteName}</b><div className="who">{user.name}</div>{instituteAssigners.length > 0 && <div className="who">Course Assigner: {instituteAssigners.join(", ")}</div>}</div>
            <ul>
              {faculties.map((f) => (
                <li key={f.id}>
                  <div className={`node fac${f.deans.length === 0 ? " warn" : ""}`}>
                    <div className="role">Faculty</div><b>{f.name}</b>
                    <div className="who">Dean: {f.deans.length ? f.deans.map((d) => d.name).join(", ") : "not set"}</div>
                  </div>
                  {departments.some((d) => d.facultyId === f.id) && (
                    <ul>{departments.filter((d) => d.facultyId === f.id).map((d) => <li key={d.id}>{deptCard(nodeFor(d))}</li>)}</ul>
                  )}
                </li>
              ))}
              {unplaced.length > 0 && (
                <li>
                  <div className="node fac warn"><div className="role">Faculty</div><b>Not in a faculty yet</b><div className="who">Place these in a faculty</div></div>
                  <ul>{unplaced.map((d) => <li key={d.id}>{deptCard(nodeFor(d))}</li>)}</ul>
                </li>
              )}
            </ul>
          </li>
        </ul>
      </div>
    </Shell>
  );
}
