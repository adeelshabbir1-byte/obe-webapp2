"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Expert = { id: string; name: string; username: string; organization: string | null };
type MCourse = { id: string; code: string; title: string; semesterNumber: number | null; designerId: string | null };

export default function PlatformExpertsManager({ experts: initial, curricula, curriculumId, courses: initialCourses }: {
  experts: Expert[]; curricula: { id: string; label: string }[]; curriculumId: string; courses: MCourse[];
}) {
  const router = useRouter();
  const [experts, setExperts] = useState(initial);
  const [courses, setCourses] = useState(initialCourses);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError(""); setMsg("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    const res = await fetch("/api/admin/platform-experts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(fd.entries())) });
    const d = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { setError(d.error || "Something went wrong."); return; }
    setExperts((p) => [{ id: d.user.id, name: d.user.name, username: d.user.username, organization: d.user.organization }, ...p]);
    setMsg(`Created ${d.user.name}. They must set a new password at first login.`);
    form.reset();
  }

  async function assign(courseId: string, designerId: string) {
    setError("");
    const res = await fetch(`/api/admin/master-courses/${courseId}/designer`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ designerId: designerId || null }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error || "Couldn't assign."); return; }
    setCourses((p) => p.map((c) => c.id === courseId ? { ...c, designerId: designerId || null } : c));
  }

  return (
    <div>
      {error && <div className="err">{error}</div>}
      {msg && <div style={{ background: "#E2F4E8", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>{msg}</div>}

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>New Master Curriculum Expert</h3>
        <form onSubmit={create}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <div className="field"><label>Name</label><input name="name" required /></div>
            <div className="field"><label>Email</label><input name="email" type="email" required /></div>
            <div className="field"><label>Username</label><input name="username" required /></div>
            <div className="field"><label>Temporary password</label><input name="password" type="password" required /></div>
            <div className="field"><label>Organization (optional)</label><input name="organization" placeholder="company or university" /></div>
            <div className="field"><label>Specialization (optional)</label><input name="specialization" /></div>
          </div>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Creating…" : "Create expert"}</button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Experts ({experts.length})</h3>
        {experts.length === 0 ? <p style={{ fontSize: 13, color: "var(--slate)" }}>None yet.</p> : (
          <table><thead><tr><th>Name</th><th>Username</th><th>Organization</th></tr></thead>
            <tbody>{experts.map((x) => <tr key={x.id}><td>{x.name}</td><td>{x.username}</td><td>{x.organization || "—"}</td></tr>)}</tbody></table>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Assign courses to experts</h3>
        {curricula.length === 0 ? <p style={{ fontSize: 13, color: "var(--slate)" }}>There is no official Master Curriculum yet.</p> : (
          <>
            <div style={{ marginBottom: 10 }}>
              <select value={curriculumId} onChange={(e) => router.push(`/admin/master-experts?curriculumId=${e.target.value}`)} style={{ padding: 6, border: "1px solid var(--line)" }}>
                {curricula.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <table>
              <thead><tr><th>Sem.</th><th>Course</th><th>Designed by</th></tr></thead>
              <tbody>
                {courses.map((c) => (
                  <tr key={c.id}>
                    <td>{c.semesterNumber ?? "—"}</td><td><strong>{c.code}</strong> — {c.title}</td>
                    <td>
                      <select value={c.designerId || ""} onChange={(e) => assign(c.id, e.target.value)} disabled={experts.length === 0} style={{ padding: 5, border: "1px solid var(--line)" }}>
                        <option value="">— not assigned —</option>
                        {experts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
