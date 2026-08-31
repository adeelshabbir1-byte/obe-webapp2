"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateUserForm({
  endpoint,
  showRoleSelect,
  roleOptions,
  buttonLabel,
}: {
  endpoint: string;
  showRoleSelect?: boolean;
  roleOptions?: { value: string; label: string }[];
  buttonLabel: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const body: Record<string, string> = {
      name: String(fd.get("name") || ""),
      email: String(fd.get("email") || ""),
      username: String(fd.get("username") || ""),
      password: String(fd.get("password") || ""),
    };
    if (showRoleSelect) body.role = String(fd.get("role") || "");

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }
      (e.target as HTMLFormElement).reset();
      setLoading(false);
      router.refresh();
    } catch (err: any) {
      setError("Unexpected error: " + err.message);
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 12 }}>Create Account</h3>
      {error && <div className="err">{error}</div>}
      <form onSubmit={onSubmit}>
        <div className="field"><label>Full Name</label><input name="name" required /></div>
        <div className="field"><label>Email</label><input name="email" type="email" required /></div>
        <div className="field"><label>Username</label><input name="username" required /></div>
        <div className="field"><label>Temporary Password</label><input name="password" required /></div>
        {showRoleSelect && (
          <div className="field">
            <label>Role</label>
            <select name="role" required>
              {roleOptions?.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        )}
        <button className="btn btn-brass" type="submit" disabled={loading}>
          {loading ? "Creating…" : buttonLabel}
        </button>
      </form>
    </div>
  );
}
