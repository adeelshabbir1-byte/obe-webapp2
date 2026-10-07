"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Dept = { id: string; name: string };
type Person = { id: string; name: string; role: string; departmentId: string | null };

const ROLE_NAME: Record<string, string> = {
  PROGRAM_COORDINATOR: "Program Coordinator", COURSE_ASSIGNER: "Course Assigner", OMC: "OMC Member",
  HEAD_OF_DEPARTMENT: "Head of Department", INSTRUCTOR: "Faculty", SUBJECT_EXPERT: "Subject Expert",
};

export default function DepartmentsManager({ departments, programsByDept, allPrograms, people }: {
  departments: Dept[]; programsByDept: Record<string, string[]>; allPrograms: string[]; people: Person[];
}) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [msg, setMsg] = useState("");
  const [headDept, setHeadDept] = useState(departments[0]?.id || "");
  const [roleFilter, setRoleFilter] = useState("ALL");

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
  const shown = people.filter((p) => roleFilter === "ALL" || p.role === roleFilter);

  return (
    <>
      {msg && <div className="card" style={{ color: "var(--rose, #b3261e)" }}>{msg}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Departments</h3>
        {departments.map((d) => {
          const heads = people.filter((p) => p.role === "HEAD_OF_DEPARTMENT" && p.departmentId === d.id);
          return (
            <div key={d.id} style={{ borderTop: "1px solid #eee", paddingTop: 10, marginTop: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong>{d.name}</strong>
                <button className="btn" onClick={() => { const n = window.prompt("New name for this department", d.name); if (n && n.trim()) call(`/api/chairman/departments/${d.id}`, "PATCH", { name: n }); }}>Rename</button>
                <button className="btn" onClick={() => { if (window.confirm(`Delete department "${d.name}"?`)) call(`/api/chairman/departments/${d.id}`, "DELETE"); }}>Delete</button>
                <span style={{ color: "var(--slate)", fontSize: 13 }}>Head(s): {heads.length ? heads.map((h) => h.name).join(", ") : "none yet"}</span>
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
                {allPrograms.length === 0 && <span style={{ color: "var(--slate)" }}>No programs exist yet.</span>}
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

      <div className="card">
        <h3 style={{ marginTop: 0 }}>People and their department</h3>
        <p style={{ color: "var(--slate)", fontSize: 13 }}>Choose the department for each coordinator, course assigner, head and faculty member.</p>
        <label style={{ fontSize: 13 }}>Show: {" "}
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="ALL">Everyone</option>
            {Object.entries(ROLE_NAME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <table style={{ marginTop: 8 }}>
          <thead><tr><th>Name</th><th>Role</th><th>Department</th></tr></thead>
          <tbody>
            {shown.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td><td>{ROLE_NAME[p.role] || p.role}</td>
                <td>
                  <select value={p.departmentId || ""} onChange={(e) => e.target.value && call("/api/chairman/department-members", "PUT", { userId: p.id, departmentId: e.target.value })}>
                    {!p.departmentId && <option value="">— none —</option>}
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <span style={{ display: "none" }}>{deptName(p.departmentId)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add a Head of Department</h3>
        <label style={{ fontSize: 13 }}>Department: {" "}
          <select value={headDept} onChange={(e) => setHeadDept(e.target.value)}>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <HeadForm departmentId={headDept} />
      </div>
    </>
  );
}

// CreateUserForm posts only name/email/username/password, but a head also needs the department, so a thin wrapper form is used.
function HeadForm({ departmentId }: { departmentId: string }) {
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
      body: JSON.stringify({ name: fd.get("name"), email: fd.get("email"), username: fd.get("username"), password: fd.get("password"), departmentId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || "Could not create"); return; }
    setOk("Head of Department created. They must change the password on first login.");
    form.reset();
    router.refresh();
  }
  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 420, marginTop: 10 }}>
      <input name="name" placeholder="Full name" required />
      <input name="email" type="email" placeholder="Email" required />
      <input name="username" placeholder="Username" required />
      <input name="password" type="password" placeholder="Temporary password" required />
      {error && <div style={{ color: "#b3261e" }}>{error}</div>}
      {ok && <div style={{ color: "var(--sage)" }}>{ok}</div>}
      <button className="btn btn-brass" type="submit" disabled={!departmentId}>Create Head of Department</button>
    </form>
  );
}
