"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StudentChangePasswordPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const newPassword = fd.get("newPassword") as string;
    const confirmPassword = fd.get("confirmPassword") as string;
    if (newPassword !== confirmPassword) { setError("Passwords don't match."); return; }

    setLoading(true); setError("");
    try {
      const res = await fetch("/api/student/change-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: fd.get("currentPassword"), newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      router.push("/student/dashboard");
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
        <h1 style={{ textAlign: "center", fontSize: 20, marginBottom: 4 }}>Set Your Password</h1>
        <p style={{ textAlign: "center", color: "var(--slate)", fontSize: 13, marginBottom: 24 }}>
          Choose a password only you know — you won't use your roll number to sign in again after this.
        </p>
        {error && <div className="err">{error}</div>}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Current Password (your roll number, if this is your first time)</label>
            <input name="currentPassword" type="password" />
          </div>
          <div className="field">
            <label>New Password</label>
            <input name="newPassword" type="password" required minLength={8} />
          </div>
          <div className="field">
            <label>Confirm New Password</label>
            <input name="confirmPassword" type="password" required minLength={8} />
          </div>
          <button className="btn btn-full" type="submit" disabled={loading}>
            {loading && <span className="spinner" />}
            {loading ? "Saving…" : "Set Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
