"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    const newPassword = fd.get("newPassword") as string;
    const confirmPassword = fd.get("confirmPassword") as string;
    if (newPassword !== confirmPassword) { setError("Passwords don't match."); setLoading(false); return; }
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: fd.get("currentPassword"), newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <form onSubmit={onSubmit}>
      {error && <div className="err">{error}</div>}
      {!forced && <div className="field"><label>Current Password</label><input name="currentPassword" type="password" required /></div>}
      <div className="field"><label>New Password</label><input name="newPassword" type="password" required minLength={8} /></div>
      <div className="field"><label>Confirm New Password</label><input name="confirmPassword" type="password" required minLength={8} /></div>
      <button className="btn btn-brass" type="submit" disabled={loading} style={{ width: "100%" }}>{loading ? "Saving…" : "Set New Password"}</button>
    </form>
  );
}
