"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Teacher = { id: string; name: string; departmentName?: string | null };
type Role = "DEAN" | "HEAD_OF_DEPARTMENT" | "PROGRAM_LEAD";
const ROLE_LABEL: Record<Role, string> = { DEAN: "Dean of a faculty", HEAD_OF_DEPARTMENT: "Chairman of a department", PROGRAM_LEAD: "Program Lead of a program" };

// Pick a teacher and give them an extra role. They keep teaching and choose which hat to wear at sign-in.
export default function GiveRole({ teachers, roles, faculties = [], departments = [], programs = [] }: {
  teachers: Teacher[]; roles: Role[];
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
    const res = await fetch("/api/chairman/give-role", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: fd.get("userId"), role, facultyId: fd.get("facultyId"), departmentId: fd.get("departmentId"), program: fd.get("program") }),
    });
    const d = await res.json().catch(() => ({}));
    setOk(res.ok);
    setMsg(res.ok ? "Done. They keep their teacher login and will be asked which role to work as when they sign in." : d.error || "Something went wrong");
    if (res.ok) router.refresh();
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 8, maxWidth: 460 }}>
      <select name="userId" required defaultValue="">
        <option value="" disabled>Choose a teacher…</option>
        {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.departmentName ? ` — ${t.departmentName}` : ""}</option>)}
      </select>
      {roles.length > 1 && (
        <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
      )}
      {role === "DEAN" && <select name="facultyId" required defaultValue=""><option value="" disabled>Which faculty?</option>{faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}
      {role === "HEAD_OF_DEPARTMENT" && <select name="departmentId" required defaultValue=""><option value="" disabled>Which department?</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}
      {role === "PROGRAM_LEAD" && <select name="program" required defaultValue=""><option value="" disabled>Which program?</option>{programs.map((p) => <option key={p.name} value={p.name}>{p.name}{p.department ? ` (${p.department})` : ""}</option>)}</select>}
      <button className="btn btn-brass" type="submit">Give this role</button>
      {msg && <div style={{ color: ok ? "var(--sage)" : "#b3261e", fontSize: 13 }}>{msg}</div>}
    </form>
  );
}

export function TakeRoleBack({ userId, label = "Take role back" }: { userId: string; label?: string }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  async function go() {
    if (!window.confirm("Take this role back? The person stays on as a teacher.")) return;
    const res = await fetch("/api/chairman/give-role", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, action: "REVOKE" }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(d.error || "Could not take it back"); return; }
    router.refresh();
  }
  return <span><button className="btn" onClick={go} type="button" style={{ marginLeft: 8 }}>{label}</button>{err && <span style={{ color: "#b3261e", fontSize: 12, marginLeft: 6 }}>{err}</span>}</span>;
}
