"use client";

import { Fragment, useState } from "react";
import ProgramLeads from "./ProgramLeads";
import GiveRole, { TakeRoleBack } from "./GiveRole";
import { useRouter } from "next/navigation";

type Dept = { id: string; name: string; timetableMode: string };
type RoomRow = { id: string; name: string; type: string; departmentId: string | null };
type Person = { id: string; name: string; role: string; departmentId: string | null; alsoFaculty?: boolean; hats?: string[]; leadProgram?: string | null; managerId?: string | null };

const ROLE_NAME: Record<string, string> = {
  PROGRAM_COORDINATOR: "Program Lead", DEPARTMENT_COORDINATOR: "Program Coordinator", COURSE_ASSIGNER: "Course Assigner", OMC: "OMC Member",
  HEAD_OF_DEPARTMENT: "Chairman", DEAN: "Dean", INSTRUCTOR: "Teacher", SUBJECT_EXPERT: "Subject Expert", LAB_ENGINEER: "Lab Engineer",
};

const TABS: [string, string][] = [["depts", "Departments"], ["rooms", "Rooms"], ["people", "People"], ["leads", "Program Leads"], ["roles", "Give a role"], ["accounts", "Add accounts"]];

export default function DepartmentsManager({ departments, rooms, programsByDept, allPrograms, people, faculties = [] }: {
  departments: Dept[]; rooms: RoomRow[]; programsByDept: Record<string, string[]>; allPrograms: string[]; people: Person[]; faculties?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState("");
  const [headDept, setHeadDept] = useState(departments[0]?.id || "");
  const [leadDept, setLeadDept] = useState(departments[0]?.id || "");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [tab, setTab] = useState<string>(() => { try { const h = window.location.hash.slice(1); return TABS.some(([k]) => k === h) ? h : "depts"; } catch { return "depts"; } });

  async function call(url: string, method: string, body?: unknown) {
    setMsg("");
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(data.error || "Something went wrong"); return false; }
    router.refresh();
    return true;
  }

  async function toggleProgram(deptId: string, program: string, on: boolean) {
    const current = programsByDept[deptId] || [];
    const next = on ? [...current, program] : current.filter((p) => p !== program);
    await call(`/api/chairman/departments/${deptId}/programs`, "PUT", { programs: next });
  }

  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name || "—";
  const ownerOf = (program: string) => departments.find((d) => (programsByDept[d.id] || []).includes(program));
  // Sorted by department (people with no department first, so nobody is missed), then role, then name.
  const ROLE_ORDER = ["DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR", "COURSE_ASSIGNER", "OMC", "SUBJECT_EXPERT", "INSTRUCTOR", "LAB_ENGINEER"];
  const shown = people
    .filter((p) => roleFilter === "ALL" || p.role === roleFilter)
    .sort((a, b) =>
      (a.departmentId ? deptName(a.departmentId) : "").localeCompare(b.departmentId ? deptName(b.departmentId) : "") ||
      ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.name.localeCompare(b.name));
  const noDeptCount = people.filter((p) => !p.departmentId).length;

  return (
    <>
      {msg && <div className="card" style={{ color: "var(--rose, #b3261e)" }}>{msg}</div>}
      <div role="tablist" className="tabs" style={{ marginBottom: 16, position: "sticky", top: "calc(var(--topbar-h, 0px) + 8px)", zIndex: 5 }}>
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" className="tab" aria-selected={tab === k} onClick={() => { setTab(k); try { window.location.hash = k; } catch {} }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "depts" && (<>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Departments</h3>
        {departments.map((d) => {
          const heads = people.filter((p) => (p.role === "HEAD_OF_DEPARTMENT" || (p.hats || []).includes("HEAD_OF_DEPARTMENT")) && p.departmentId === d.id);
          return (
            <div key={d.id} style={{ borderTop: "1px solid #eee", paddingTop: 10, marginTop: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong>{d.name}</strong>
                <button className="btn" onClick={() => { const n = window.prompt("New name for this department", d.name); if (n && n.trim()) call(`/api/chairman/departments/${d.id}`, "PATCH", { name: n }); }}>Rename</button>
                <button className="btn" onClick={() => { if (window.confirm(`Delete department "${d.name}"?`)) call(`/api/chairman/departments/${d.id}`, "DELETE"); }}>Delete</button>
                <select value={d.timetableMode} title="Shared = timetabled together with the other shared departments (common rooms). Own = its own timetable and its own rooms." onChange={(e) => call(`/api/chairman/departments/${d.id}`, "PATCH", { timetableMode: e.target.value })}>
                  <option value="SHARED">Shared timetable</option>
                  <option value="SEPARATE">Own timetable</option>
                </select>
                <span style={{ color: "var(--slate)", fontSize: 13 }}>Head(s): {heads.length ? heads.map((h) => h.name).join(", ") : "none yet"}</span>
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
                {allPrograms.length === 0 && <span style={{ color: "var(--slate)" }}>No programs exist yet.</span>}
                <form style={{ display: "flex", gap: 6, alignItems: "center", width: "100%" }} onSubmit={(e) => {
                  e.preventDefault();
                  const input = (e.currentTarget.elements.namedItem("newProgram") as HTMLInputElement);
                  const name = input.value.trim();
                  if (!name) return;
                  const exists = allPrograms.find((p) => p.toLowerCase() === name.toLowerCase());
                  input.value = "";
                  toggleProgram(d.id, exists || name, true);
                }}>
                  <input name="newProgram" placeholder={`New program for ${d.name}, e.g. BBA`} style={{ padding: "5px 8px", minWidth: 220 }} />
                  <button className="btn btn-brass" type="submit">Add program</button>
                </form>
                {allPrograms.map((p) => {
                  const owner = ownerOf(p);
                  return (
                    <label key={p} title={owner && owner.id !== d.id ? `Currently in ${owner.name} — ticking moves it here` : ""}>
                      <input type="checkbox" checked={(programsByDept[d.id] || []).includes(p)} onChange={(e) => toggleProgram(d.id, p, e.target.checked)} /> {p}
                      {owner && owner.id !== d.id && <span style={{ color: "var(--slate)" }}> (in {owner.name})</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New department name, e.g. Computer Science" style={{ flex: 1 }} />
          <button className="btn btn-brass" onClick={async () => { if (newName.trim() && await call("/api/chairman/departments", "POST", { name: newName })) setNewName(""); }}>Add Department</button>
        </div>
      </div>
      </>)}

      {tab === "rooms" && (<>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Room ownership</h3>
        <p style={{ color: "var(--slate)", fontSize: 13 }}>
          Common rooms are used by every department on the shared timetable. A room given to a department is used only by that department.
          A department with its own timetable needs at least one room of its own (lecture, and a lab if it has labs).
        </p>
        <table>
          <thead><tr><th>Room</th><th>Type</th><th>Belongs to</th></tr></thead>
          <tbody>
            {rooms.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No rooms yet - coordinators add them on the Timetable page.</td></tr>}
            {rooms.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td><td>{r.type}</td>
                <td>
                  <select value={r.departmentId || ""} onChange={(e) => call("/api/chairman/room-department", "PUT", { roomId: r.id, departmentId: e.target.value || null })}>
                    <option value="">Common room</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>)}

      {tab === "people" && (<>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>People and their department</h3>
        <p style={{ color: "var(--slate)", fontSize: 13 }}>Choose the department for each person. The list is grouped by department, with anyone still without one at the top.{noDeptCount > 0 ? ` ${noDeptCount} still need a department.` : " Everyone has a department."}</p>
        <label style={{ fontSize: 13 }}>Show: {" "}
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="ALL">Everyone</option>
            {Object.entries(ROLE_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <table style={{ marginTop: 8 }}>
          <thead><tr><th>Name</th><th>Role</th><th>Department</th></tr></thead>
          <tbody>
            {shown.map((p, idx) => (
              <Fragment key={p.id}>
                {(idx === 0 || shown[idx - 1].departmentId !== p.departmentId) && (
                  <tr><td colSpan={3} style={{ background: p.departmentId ? "#F4EFEE" : "#FBEED2", fontWeight: 700, fontSize: 12.5 }}>
                    {p.departmentId ? `${deptName(p.departmentId)} (${people.filter((x) => x.departmentId === p.departmentId).length})` : `No department yet (${noDeptCount}) — please choose one`}
                  </td></tr>
                )}
              <tr>
                <td>{p.name}</td><td>{ROLE_NAME[p.role] || p.role}{(p.hats || []).filter((h) => ["DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR"].includes(h)).map((h) => ` + ${ROLE_NAME[h] || h}`).join("")}{p.role === "PROGRAM_COORDINATOR" && p.leadProgram ? ` — Program Lead of ${p.leadProgram}` : ""}</td>
                <td>
                  <select value={p.departmentId || ""} onChange={(e) => e.target.value && call("/api/chairman/department-members", "PUT", { userId: p.id, departmentId: e.target.value })}>
                    {!p.departmentId && <option value="">— none —</option>}
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <span style={{ display: "none" }}>{deptName(p.departmentId)}</span>
                  {(p.role === "INSTRUCTOR" || p.role === "SUBJECT_EXPERT" || p.role === "LAB_ENGINEER") && p.departmentId && (
                    <label style={{ marginLeft: 12, fontSize: 12 }}>Program:{" "}
                      <select value={p.managerId || ""} onChange={(e) => e.target.value && call("/api/faculty-program", "PUT", { userId: p.id, coordinatorId: e.target.value })}>
                        {people.filter((c) => c.role === "PROGRAM_COORDINATOR" && c.departmentId === p.departmentId).map((c) => <option key={c.id} value={c.id}>{c.leadProgram ? `${c.leadProgram} (${c.name})` : c.name}</option>)}
                      </select>
                    </label>
                  )}
                  {[p.role, ...(p.hats || [])].filter((r) => ["DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR"].includes(r) && (r !== "PROGRAM_COORDINATOR" || !!p.leadProgram || (p.hats || []).includes("PROGRAM_COORDINATOR") || false)).map((r) => (
                    <TakeRoleBack key={r} userId={p.id} role={r} label={r === "HEAD_OF_DEPARTMENT" ? "Remove Chairman" : r === "DEPARTMENT_COORDINATOR" ? "Remove Program Coordinator" : r === "DEAN" ? "Remove Dean" : "Remove as Program Lead"} />
                  ))}
                  {p.role === "HEAD_OF_DEPARTMENT" && (
                    <label style={{ marginLeft: 12, fontSize: 12 }}>
                      <input type="checkbox" checked={!!p.alsoFaculty} onChange={(e) => call("/api/chairman/heads", "PATCH", { userId: p.id, alsoFaculty: e.target.checked })} /> Also teaches (faculty)
                    </label>
                  )}
                </td>
              </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      </>)}

      {tab === "leads" && (<>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Program Leads</h3>
        <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>
          A Program Lead is the Program Coordinator responsible for one program of a department, under its Head. They can do everything for their program:
          batches, courses, faculty, Subject Experts, timetable. Choose one of the department's coordinators for each program, or create a new one.
        </p>
        <label style={{ fontSize: 13 }}>Department: {" "}
          <select value={leadDept} onChange={(e) => setLeadDept(e.target.value)}>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <div style={{ marginTop: 10 }}>
          <ProgramLeads key={leadDept} departmentId={leadDept} programs={programsByDept[leadDept] || []}
            coordinators={people.filter((p) => p.role === "PROGRAM_COORDINATOR" && p.departmentId === leadDept).map((p) => ({ id: p.id, name: p.name, leadProgram: p.leadProgram || null }))}
            teachers={people.filter((p) => (p.role === "INSTRUCTOR" || p.role === "SUBJECT_EXPERT") && p.departmentId === leadDept).map((p) => ({ id: p.id, name: p.name + (p.role === "SUBJECT_EXPERT" ? " (Subject Expert)" : "") }))} />
        </div>
      </div>
      </>)}

      {tab === "roles" && (<>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Give a role to one of your teachers</h3>
        <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>
          Deans, Chairmen and Program Leads are usually teachers. Pick the teacher and the role. They keep their teacher login and choose which role to work as each time they sign in.
          Subject Experts can be chosen too and keep their Subject Expert and teaching roles. The list is grouped by department.
          In a small university one person can hold every role at once: Dean, Chairman, Program Lead, Program Coordinator, Subject Expert and Instructor. Everyone is listed for every role, with the roles they already hold in brackets.
          The only rule: roles tied to a department (Chairman, Program Coordinator, Program Lead) must all be in the same department.
        </p>
        <GiveRole
          roles={["DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_LEAD", "COURSE_ASSIGNER", "OMC"]}
          leaders={people.filter((p) => ["DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"].includes(p.role)).map((p) => ({ id: p.id, name: p.name, departmentName: departments.find((d) => d.id === p.departmentId)?.name || null, holds: [p.role, ...(p.hats || [])] }))}
          teachers={people.filter((p) => p.role === "INSTRUCTOR" || p.role === "SUBJECT_EXPERT").map((p) => ({ id: p.id, name: p.name + (p.role === "SUBJECT_EXPERT" ? " (Subject Expert)" : ""), departmentName: departments.find((d) => d.id === p.departmentId)?.name || null }))}
          faculties={faculties} departments={departments.map((d) => ({ id: d.id, name: d.name }))}
          programs={departments.flatMap((d) => (programsByDept[d.id] || []).map((name) => ({ name, department: d.name })))}
        />
      </div>
      </>)}

      {tab === "accounts" && (<>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add a Program Coordinator</h3>
        <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>
          One per department: the Program Leads' assistant. They look after what involves all programs of the department (teacher onboarding, students, the semester and holidays, the timetable).
          For someone who is not already one of your teachers; otherwise use the box above.
        </p>
        <label style={{ fontSize: 13 }}>Department: {" "}
          <select value={headDept} onChange={(e) => setHeadDept(e.target.value)}>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <HeadForm departmentId={headDept} role="DEPARTMENT_COORDINATOR" />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add a Chairman</h3>
        <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>For someone who is not already one of your teachers. Otherwise use the box above.</p>
        <label style={{ fontSize: 13 }}>Department: {" "}
          <select value={headDept} onChange={(e) => setHeadDept(e.target.value)}>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <HeadForm departmentId={headDept} />
      </div>
      </>)}
    </>
  );
}

// CreateUserForm posts only name/email/username/password, but a head also needs the department, so a thin wrapper form is used.
function HeadForm({ departmentId, role = "HEAD_OF_DEPARTMENT" }: { departmentId: string; role?: "HEAD_OF_DEPARTMENT" | "DEPARTMENT_COORDINATOR" }) {
  const roleName = role === "DEPARTMENT_COORDINATOR" ? "Program Coordinator" : "Chairman";
  const router = useRouter();
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(""); setOk("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    const res = await fetch("/api/chairman/heads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fd.get("name"), email: fd.get("email"), username: fd.get("username"), password: fd.get("password"), departmentId, role, alsoFaculty: fd.get("alsoFaculty") === "on" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || "Could not create"); return; }
    setOk(`${roleName} created. They must change the password on first login.`);
    form.reset();
    router.refresh();
  }
  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 420, marginTop: 10 }}>
      <input name="name" placeholder="Full name" required />
      <input name="email" type="email" placeholder="Email" required />
      <input name="username" placeholder="Username" required />
      <input name="password" type="password" placeholder="Temporary password" required />
      <label style={{ fontSize: 13 }}><input type="checkbox" name="alsoFaculty" /> Also teaches as a faculty member</label>
      {error && <div style={{ color: "#b3261e" }}>{error}</div>}
      {ok && <div style={{ color: "var(--sage)" }}>{ok}</div>}
      <button className="btn btn-brass" type="submit" disabled={!departmentId}>Create {roleName}</button>
    </form>
  );
}
