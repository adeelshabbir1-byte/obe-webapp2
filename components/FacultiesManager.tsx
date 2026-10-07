"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import GiveRole, { TakeRoleBack } from "./GiveRole";

type Fac = { id: string; name: string; deans: { id: string; name: string; fromTeacher: boolean }[] };
type Dept = { id: string; name: string; facultyId: string | null };

export default function FacultiesManager({ faculties, departments, teachers = [] }: { faculties: Fac[]; departments: Dept[]; teachers?: { id: string; name: string; departmentName?: string | null }[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");
  const [deanFaculty, setDeanFaculty] = useState(faculties[0]?.id || "");

  async function call(url: string, method: string, body?: unknown) {
    setMsg("");
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(data.error || "Something went wrong"); return false; }
    router.refresh();
    return true;
  }

  async function addDean(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const ok = await call("/api/chairman/deans", "POST", { name: fd.get("name"), email: fd.get("email"), username: fd.get("username"), password: fd.get("password"), facultyId: deanFaculty });
    if (ok) { form.reset(); setMsg("Dean created. They must change the password on first login."); }
  }

  const unplaced = departments.filter((d) => !d.facultyId);
  return (
    <>
      {msg && <div className="card" style={{ color: msg.startsWith("Dean created") ? "var(--sage)" : "#b3261e" }}>{msg}</div>}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Faculties</h3>
        <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>A faculty groups departments under one Dean, for example Faculty of Computing holding CS, SE and IT.</p>
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) call("/api/chairman/faculties", "POST", { name }).then((ok) => ok && setName("")); }} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New faculty name, e.g. Faculty of Computing" style={{ flex: 1 }} />
          <button className="btn btn-brass" type="submit">Add faculty</button>
        </form>
        <table>
          <thead><tr><th>Faculty</th><th>Dean</th><th>Departments</th><th></th></tr></thead>
          <tbody>
            {faculties.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>No faculties yet.</td></tr>}
            {faculties.map((f) => (
              <tr key={f.id}>
                <td><b>{f.name}</b></td>
                <td>{f.deans.length ? f.deans.map((d) => <div key={d.id}>{d.name}<TakeRoleBack userId={d.id} label="Remove Dean" /></div>) : <span style={{ color: "var(--slate)" }}>no Dean yet</span>}</td>
                <td>{departments.filter((d) => d.facultyId === f.id).map((d) => d.name).join(", ") || <span style={{ color: "var(--slate)" }}>none</span>}</td>
                <td><button className="btn" onClick={() => window.confirm(`Delete ${f.name}? Its departments stay, just outside any faculty.`) && call(`/api/chairman/faculties?id=${f.id}`, "DELETE")}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Which faculty is each department in?</h3>
        {unplaced.length > 0 && <p style={{ color: "#96650F", fontSize: 13, marginTop: 0 }}>{unplaced.length} department(s) are not in a faculty yet: {unplaced.map((d) => d.name).join(", ")}.</p>}
        <table>
          <thead><tr><th>Department</th><th>Faculty</th></tr></thead>
          <tbody>
            {departments.map((d) => (
              <tr key={d.id}><td>{d.name}</td><td>
                <select value={d.facultyId || ""} onChange={(e) => call("/api/chairman/faculties", "PUT", { departmentId: d.id, facultyId: e.target.value || null })}>
                  <option value="">— not in a faculty —</option>
                  {faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Make one of your teachers a Dean</h3>
        <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>The person keeps their login and earlier roles (teacher, Subject Expert) and chooses which role to work as each time they sign in.</p>
        {faculties.length === 0 ? <p style={{ color: "var(--slate)" }}>Add a faculty first.</p> : <GiveRole roles={["DEAN"]} teachers={teachers} faculties={faculties.map((f) => ({ id: f.id, name: f.name }))} />}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Add a Dean who is not one of your teachers</h3>
        {faculties.length === 0 ? <p style={{ color: "var(--slate)" }}>Add a faculty first.</p> : (
          <form onSubmit={addDean} style={{ display: "grid", gap: 8, maxWidth: 420 }}>
            <select value={deanFaculty} onChange={(e) => setDeanFaculty(e.target.value)}>{faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            <input name="name" placeholder="Full name" required />
            <input name="email" type="email" placeholder="Email" required />
            <input name="username" placeholder="Username" required />
            <input name="password" type="text" placeholder="Temporary password" required />
            <button className="btn btn-brass" type="submit">Create Dean</button>
          </form>
        )}
      </div>
    </>
  );
}
