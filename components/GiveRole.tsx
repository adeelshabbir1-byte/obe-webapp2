"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Teacher = { id: string; name: string; departmentName?: string | null };
type Role = "DEAN" | "HEAD_OF_DEPARTMENT" | "DEPARTMENT_COORDINATOR" | "PROGRAM_LEAD" | "COURSE_ASSIGNER" | "OMC";
const ROLE_LABEL: Record<Role, string> = { DEAN: "Dean of a faculty", HEAD_OF_DEPARTMENT: "Chairman of a department", DEPARTMENT_COORDINATOR: "Program Coordinator of a department (assistant to the Program Leads)", PROGRAM_LEAD: "Program Lead of a program", COURSE_ASSIGNER: "Course Assigner (for a semester)", OMC: "OMC member (outcome management committee)" };

// Pick a teacher and give them an extra role. They keep teaching and choose which hat to wear at sign-in.
export default function GiveRole({ teachers, roles, faculties = [], departments = [], programs = [], leaders = [] }: {
  teachers: Teacher[]; roles: Role[]; leaders?: { id: string; name: string; departmentName?: string | null; holds: string[] }[];
  faculties?: { id: string; name: string }[]; departments?: { id: string; name: string }[]; programs?: { name: string; department: string }[];
}) {
  const router = useRouter();
  const [role, setRole] = useState<Role>(roles[0]);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setMsg("");
    const res = await fetch(role === "COURSE_ASSIGNER" ? "/api/chairman/assigner-hat" : role === "OMC" ? "/api/chairman/omc-hat" : "/api/chairman/give-role", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(role === "OMC" ? { userId: fd.get("userId") } : role === "COURSE_ASSIGNER" ? { userId: fd.get("userId"), term: fd.get("term") } : { userId: fd.get("userId"), role, facultyId: fd.get("facultyId"), departmentId: fd.get("departmentId"), program: fd.get("program") }),
    });
    const d = await res.json().catch(() => ({}));
    setOk(res.ok);
    setMsg(res.ok ? "Done. They keep their teacher login and will be asked which role to work as when they sign in." : d.error || "Something went wrong");
    if (res.ok) router.refresh();
  }

  // A Dean can also be given the Chairman role, and a Chairman the Dean role.
  const extraLeaders = (role === "HEAD_OF_DEPARTMENT" ? leaders.filter((l) => l.holds.includes("DEAN") && !l.holds.includes("HEAD_OF_DEPARTMENT")) : role === "DEAN" ? leaders.filter((l) => l.holds.includes("HEAD_OF_DEPARTMENT") && !l.holds.includes("DEAN")) : [])
    .map((l) => ({ id: l.id, name: `${l.name} (${role === "HEAD_OF_DEPARTMENT" ? "Dean" : "Chairman"})`, departmentName: l.departmentName }));
  const pickList = [...teachers, ...extraLeaders];

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 8, maxWidth: 460 }}>
      <select name="userId" required defaultValue="">
        <option value="" disabled>Choose a teacher…</option>
        {Array.from(new Set(pickList.map((t) => t.departmentName || ""))).sort((a, b) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b))).map((dept) => (
          <optgroup key={dept || "none"} label={dept || "No department yet"}>
            {pickList.filter((t) => (t.departmentName || "") === dept).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>
        ))}
      </select>
      {roles.length > 1 && (
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      )}
      {role === "DEAN" && <select name="facultyId" required defaultValue=""><option value="" disabled>Which faculty?</option>{faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
      {(role === "HEAD_OF_DEPARTMENT" || role === "DEPARTMENT_COORDINATOR") && <select name="departmentId" required defaultValue=""><option value="" disabled>Which department?</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}
      {role === "COURSE_ASSIGNER" && <select name="term" required defaultValue="CURRENT"><option value="CURRENT">This semester</option><option value="NEXT">Next semester</option><option value="ALWAYS">Until I remove it</option></select>}
      {role === "PROGRAM_LEAD" && <select name="program" required defaultValue=""><option value="" disabled>Which program?</option>{programs.map((p) => <option key={p.name} value={p.name}>{p.name}{p.department ? ` (${p.department})` : ""}</option>)}</select>}
      <button className="btn btn-brass" type="submit">Give this role</button>
      {msg && <div style={{ color: ok ? "var(--sage)" : "#b3261e", fontSize: 13 }}>{msg}</div>}
    </form>
  );
}

export function TakeRoleBack({ userId, label = "Take role back", role }: { userId: string; label?: string; role?: "DEAN" | "HEAD_OF_DEPARTMENT" }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  async function go() {
    if (!window.confirm("Remove this role? A teacher or Subject Expert goes back to their earlier role. An account made only for this role is deleted.")) return;
    const res = await fetch("/api/chairman/give-role", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, action: "REVOKE", ...(role ? { role } : {}) }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(d.error || "Could not take it back"); return; }
    router.refresh();
  }
  return <span><button className="btn" onClick={go} type="button" style={{ marginLeft: 8 }}>{label}</button>{err && <span style={{ color: "#b3261e", fontSize: 12, marginLeft: 6 }}>{err}</span>}</span>;
}
