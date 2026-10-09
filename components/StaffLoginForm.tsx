"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input = { padding: "6px 8px", border: "1px solid var(--line)" } as const;
export default function StaffLoginForm() {
  const router = useRouter();
  const [f, setF] = useState({ role: "LIBRARIAN", name: "", email: "", username: "", password: "" });
  const [msg, setMsg] = useState(""); const [ok, setOk] = useState(false);
  async function add() {
    setMsg("");
    const res = await fetch("/api/chairman/staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await res.json().catch(() => ({}));
    setOk(res.ok); setMsg(res.ok ? `Login created. Give ${f.username} the temporary password; they must change it at first sign-in.` : d.error || "Something went wrong");
    if (res.ok) { setF({ ...f, name: "", email: "", username: "", password: "" }); router.refresh(); }
  }
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h3 style={{ marginTop: 0 }}>Create a login</h3>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ fontSize: 12 }}>Role<br /><select style={input} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="LIBRARIAN">Librarian (keeps the library record)</option><option value="FINANCE_OFFICER">Finance Officer (keeps budget and spending)</option><option value="STUDENT_AFFAIRS">Student Affairs (enters admission criteria)</option></select></label>
        <label style={{ fontSize: 12 }}>Name<br /><input style={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label style={{ fontSize: 12 }}>Email<br /><input style={input} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label style={{ fontSize: 12 }}>Username<br /><input style={input} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></label>
        <label style={{ fontSize: 12 }}>Temporary password<br /><input style={input} type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        <button className="btn" onClick={add}>Create login</button>
      </div>
      {msg && <p style={{ fontSize: 12.5, color: ok ? "var(--sage)" : "#b3261e", marginBottom: 0 }}>{msg}</p>}
    </div>
  );
}
