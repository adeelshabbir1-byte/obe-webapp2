"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Creates a Program Lead for one of the department's programs. `departmentId` is only sent by the Institute Head;
// a Chairman's own department is taken from their account.
export default function LeadForm({ program, departmentId }: { program: string; departmentId?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(""); setOk("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    const res = await fetch("/api/leads", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fd.get("name"), email: fd.get("email"), username: fd.get("username"), password: fd.get("password"), program, departmentId }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error || "Could not create"); return; }
    setOk("Program Lead created. They log in as a Program Coordinator and must change the password on first login.");
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
      <button className="btn btn-brass" type="submit">Create Program Lead</button>
    </form>
  );
}
