"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StudentLoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/student/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rollNumber: fd.get("rollNumber"), password: fd.get("password") }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Incorrect roll number or password.");
        setLoading(false);
        return;
      }
      router.push(data.mustChangePassword ? "/student/change-password" : "/student/dashboard");
      router.refresh();
    } catch (err: any) {
      setError("Unexpected error: " + err.message);
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="seal">S</div>
        <h1 style={{ textAlign: "center", fontSize: 20, marginBottom: 4 }}>Student Portal</h1>
        <p style={{ textAlign: "center", color: "var(--slate)", fontSize: 13, marginBottom: 24 }}>
          Sign in with your roll number
        </p>
        {error && <div className="err">{error}</div>}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Roll Number</label>
            <input name="rollNumber" required placeholder="e.g. BSCS-F23-042" />
          </div>
          <div className="field">
            <label>Password</label>
            <input name="password" type="password" required />
          </div>
          <button className="btn btn-full" type="submit" disabled={loading}>
            {loading && <span className="spinner" />}
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
        <p style={{ textAlign: "center", fontSize: 11.5, color: "var(--slate)", marginTop: 16 }}>
          First time here? Your initial password is your own roll number — you'll be asked to set a new one
          right after signing in. If that doesn't work, check with your Program Coordinator.
        </p>
      </div>
    </div>
  );
}
