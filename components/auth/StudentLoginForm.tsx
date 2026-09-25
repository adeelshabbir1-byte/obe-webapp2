"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SquareUser, Lock, ArrowRight } from "lucide-react";
import AuthInput from "./AuthInput";

export default function StudentLoginForm() {
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
    <form onSubmit={onSubmit}>
      {error && <div className="err" role="alert">{error}</div>}
      <AuthInput id="rollNumber" name="rollNumber" label="Roll Number" icon={SquareUser} placeholder="e.g. BSCS-F23-042" autoComplete="username" autoFocus />
      <AuthInput id="password" name="password" label="Password" icon={Lock} type="password" placeholder="Enter your password" autoComplete="current-password" />
      <button className="btn btn-brass btn-full auth-submit" type="submit" disabled={loading}>
        {loading && <span className="spinner" />}
        {loading ? "Signing in…" : <>Sign in <ArrowRight size={18} /></>}
      </button>
    </form>
  );
}
