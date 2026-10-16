"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PersonRow } from "../lib/institutePeople";

type Opt = { id: string; name: string };
const LEADER_LABEL: Record<string, string> = { DEAN: "Dean", HEAD_OF_DEPARTMENT: "Chairman", PROGRAM_COORDINATOR: "Program Lead", DEPARTMENT_COORDINATOR: "Program Coordinator" };
const STAFF: Record<string, string> = { LAB_MANAGER: "Lab Manager", LIBRARIAN: "Librarian", FINANCE_OFFICER: "Finance Officer", STUDENT_AFFAIRS: "Student Affairs", FACILITIES_MANAGER: "Facilities Manager" };
const TEACH: Record<string, string> = { SUBJECT_EXPERT: "Subject Expert", INSTRUCTOR: "Course Instructor", LAB_ENGINEER: "Lab Engineer" };

async function post(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  return { ok: res.ok, msg: res.ok ? d.result || "Saved" : d.error || "Something went wrong" };
}

export default function PeopleRolesEditor({ people, departments, faculties, programs }: { people: PersonRow[]; departments: Opt[]; faculties: Opt[]; programs: { name: string; department: string }[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? people.filter((p) => [p.username, p.name, p.email, p.role, p.also, p.department, p.program].join(" ").toLowerCase().includes(t)) : people;
  }, [q, people]);

  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, username, role, department…" style={{ padding: "6px 10px", minWidth: 280 }} />
        <span style={{ fontSize: 12.5, color: "var(--slate)" }}>{shown.length} of {people.length} people · click Edit on a row to change details or roles</span>
      </div>
      <table>
        <thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Also works as</th><th>Department</th><th>Program</th><th>Login</th><th>Email</th><th></th></tr></thead>
        <tbody>
          {shown.length === 0 && <tr><td colSpan={9} style={{ color: "var(--slate)" }}>No one found.</td></tr>}
          {shown.map((p) => [
            <tr key={p.id} style={open === p.id ? { background: "rgba(79,125,90,0.08)" } : undefined}>
              <td><b>{p.username}</b></td><td>{p.name}</td><td>{p.role}</td>
              <td style={{ fontSize: 12 }}>{p.also || <span style={{ color: "var(--slate)" }}>—</span>}</td>
              <td>{p.department}</td><td>{p.program}</td>
              <td style={{ fontSize: 12, color: p.isActive ? undefined : "#B3261E" }}>{p.status}</td><td style={{ fontSize: 12 }}>{p.email}</td>
              <td><button className="btn" type="button" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? "Close" : "Edit"}</button></td>
            </tr>,
            open === p.id && (
              <tr key={p.id + "-edit"}><td colSpan={9} style={{ background: "rgba(79,125,90,0.05)" }}>
                <EditPanel p={p} departments={departments} faculties={faculties} programs={programs} />
              </td></tr>
            ),
          ])}
        </tbody>
      </table>
    </div>
  );
}

function EditPanel({ p, departments, faculties, programs }: { p: PersonRow; departments: Opt[]; faculties: Opt[]; programs: { name: string; department: string }[] }) {
  const router = useRouter();
  const isStaff = p.rawRole in STAFF;
  const [name, setName] = useState(p.name);
  const [email, setEmail] = useState(p.email);
  const [dept, setDept] = useState(p.departmentId || "");
  const [active, setActive] = useState(p.isActive);
  const [teach, setTeach] = useState<string[]>(p.held.filter((r) => r in TEACH));
  const [staffRole, setStaffRole] = useState(isStaff ? p.rawRole : "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const leaders = p.held.filter((r) => r in LEADER_LABEL);
  const canHaveHats = !isStaff && p.rawRole !== "LAB_ENGINEER";

  async function run(fn: () => Promise<{ ok: boolean; msg: string }>) {
    setBusy(true); setMsg(null);
    const r = await fn();
    setBusy(false); setMsg({ ok: r.ok, text: r.msg });
    if (r.ok) router.refresh();
  }
  const save = () => run(() => post("/api/chairman/people", { userId: p.id, name, email, departmentId: dept || null, isActive: active, roles: isStaff ? [staffRole] : [...teach] }, "PATCH"));
  // Forgotten password or lost phone: a temporary password they must change, and/or two-step sign-in turned off.
  const [tempPw, setTempPw] = useState("");
  const [twoStepOff, setTwoStepOff] = useState(false);
  const resetAccess = () => run(async () => {
    const r = await post("/api/chairman/people/reset-password", { userId: p.id, newPassword: tempPw, turnOffTwoStep: twoStepOff });
    if (r.ok) { setTempPw(""); setTwoStepOff(false); }
    return r;
  });
  const toggleTeach = (r: string) => setTeach((t) => (t.includes(r) ? t.filter((x) => x !== r) : r === "LAB_ENGINEER" ? ["LAB_ENGINEER"] : [...t.filter((x) => x !== "LAB_ENGINEER"), r]));

  // add a leader role
  const [addRole, setAddRole] = useState("");
  const [target, setTarget] = useState("");
  const addLeader = () => run(() => post("/api/chairman/give-role", {
    userId: p.id, role: addRole,
    ...(addRole === "DEAN" ? { facultyId: target } : addRole === "PROGRAM_LEAD" ? { program: target } : { departmentId: target }),
  }));
  const removeLeader = (r: string) => {
    const only = p.held.length === 1;
    if (!window.confirm(only ? `${p.name} has no other role. Removing ${LEADER_LABEL[r]} deletes (or switches off) this login. Continue?` : `Remove the ${LEADER_LABEL[r]} role from ${p.name}? Their other roles stay.`)) return;
    run(() => post("/api/chairman/give-role", { userId: p.id, action: "REVOKE", role: r }));
  };

  const label: React.CSSProperties = { display: "grid", gap: 3, fontSize: 12, color: "var(--slate)" };
  return (
    <div style={{ display: "grid", gap: 14, padding: "6px 2px" }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={label}>Name<input value={name} onChange={(e) => setName(e.target.value)} style={{ padding: "5px 8px", minWidth: 200 }} /></label>
        <label style={label}>Email<input value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: "5px 8px", minWidth: 230 }} /></label>
        <label style={label}>Department
          <select value={dept} onChange={(e) => setDept(e.target.value)} style={{ padding: "5px 8px" }} disabled={leaders.some((r) => r !== "DEAN")}>
            <option value="">— none —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label style={{ ...label, flexDirection: "row", display: "flex", alignItems: "center", gap: 6, color: "inherit" }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Login switched on
        </label>
      </div>

      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>{isStaff ? "Staff role" : "Teaching roles"}</div>
        {isStaff ? (
          <select value={staffRole} onChange={(e) => setStaffRole(e.target.value)} style={{ padding: "5px 8px" }}>
            {Object.entries(STAFF).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        ) : (
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}>
            {Object.entries(TEACH).map(([k, v]) => (
              <label key={k} style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <input type="checkbox" checked={teach.includes(k)} onChange={() => toggleTeach(k)} disabled={k === "LAB_ENGINEER" && leaders.length > 0} /> {v}
              </label>
            ))}
          </div>
        )}
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-brass" type="button" onClick={save} disabled={busy}>Save details and roles</button>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "grid", gap: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>Password and two-step sign-in <span style={{ fontWeight: 400, color: "var(--slate)" }}>(forgotten password or lost phone)</span></div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
          <input type="text" value={tempPw} onChange={(e) => setTempPw(e.target.value)} placeholder="Temporary password (8+ characters)" autoComplete="new-password" aria-label={`Temporary password for ${p.name}`} style={{ padding: "5px 8px", minWidth: 240 }} />
          <label style={{ display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" checked={twoStepOff} onChange={(e) => setTwoStepOff(e.target.checked)} /> Also turn off two-step sign-in</label>
          <button className="btn" type="button" onClick={resetAccess} disabled={busy || (!twoStepOff && tempPw.length < 8)}>{tempPw ? (twoStepOff ? "Reset password and turn off two-step" : "Reset password") : twoStepOff ? "Turn off two-step sign-in" : "Reset password"}</button>
        </div>
        <span style={{ fontSize: 12, color: "var(--slate)" }}>They are signed out everywhere and must choose their own password at the next sign-in. Give them the temporary password in person or by phone.</span>
      </div>

      {canHaveHats && (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10, display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>Leadership and committee roles <span style={{ fontWeight: 400, color: "var(--slate)" }}>(applied straight away)</span></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
            {leaders.length === 0 && <span style={{ color: "var(--slate)" }}>No leadership role.</span>}
            {leaders.map((r) => (
              <span key={r} style={{ border: "1px solid var(--line)", borderRadius: 14, padding: "3px 6px 3px 10px", display: "inline-flex", gap: 6, alignItems: "center" }}>
                {LEADER_LABEL[r]}{r === "PROGRAM_COORDINATOR" && p.leadProgram ? ` — ${p.leadProgram}` : ""}
                <button type="button" className="btn" style={{ padding: "0 7px", fontSize: 12 }} onClick={() => removeLeader(r)} disabled={busy} title="Remove this role">✕</button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select value={addRole} onChange={(e) => { setAddRole(e.target.value); setTarget(""); }} style={{ padding: "5px 8px" }}>
              <option value="">Add a role…</option>
              <option value="DEAN">Dean of a faculty</option>
              <option value="HEAD_OF_DEPARTMENT">Chairman of a department</option>
              <option value="DEPARTMENT_COORDINATOR">Program Coordinator of a department</option>
              <option value="PROGRAM_LEAD">Program Lead of a program</option>
            </select>
            {addRole && (
              <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ padding: "5px 8px" }}>
                <option value="">{addRole === "DEAN" ? "Which faculty?" : addRole === "PROGRAM_LEAD" ? "Which program?" : "Which department?"}</option>
                {addRole === "DEAN" ? faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)
                  : addRole === "PROGRAM_LEAD" ? programs.map((x) => <option key={x.name} value={x.name}>{x.name}{x.department ? ` (${x.department})` : ""}</option>)
                  : departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            )}
            {addRole && <button className="btn" type="button" disabled={!target || busy} onClick={addLeader}>Give role</button>}
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
            <label style={{ display: "flex", gap: 5, alignItems: "center" }}>
              <input type="checkbox" checked={p.omcHat} disabled={busy} onChange={(e) => run(() => post("/api/chairman/omc-hat", { userId: p.id, ...(e.target.checked ? {} : { action: "REVOKE" }) }))} /> OMC member
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>Course Assigner:
              <select value={p.assignerTerm ? (p.assignerTerm === "ALWAYS" ? "ALWAYS" : "KEEP") : ""} disabled={busy} style={{ padding: "4px 6px" }}
                onChange={(e) => { const v = e.target.value; if (v === "KEEP") return; run(() => post("/api/chairman/assigner-hat", v ? { userId: p.id, term: v } : { userId: p.id, action: "REVOKE" })); }}>
                <option value="">No</option>
                {p.assignerTerm && p.assignerTerm !== "ALWAYS" && <option value="KEEP">{p.assignerTerm}</option>}
                <option value="CURRENT">This semester</option>
                <option value="NEXT">Next semester</option>
                <option value="ALWAYS">Until I remove it</option>
              </select>
            </label>
          </div>
        </div>
      )}
      {msg && <div style={{ fontSize: 13, color: msg.ok ? "#2E7D4F" : "#B3261E" }}>{msg.text}</div>}
    </div>
  );
}
