"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Lock, ArrowRight } from "lucide-react";
import AuthInput from "./AuthInput";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usernameOrEmail: fd.get("username"),
          password: fd.get("password"),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data?.error === "temporarily_locked"
            ? "Too many failed attempts. This account is temporarily locked — please try again in 15 minutes."
            : "Incorrect username or password.",
        );
        setLoading(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      setError("Unexpected error: " + err.message);
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate={false}>
      {error && <div className="err" role="alert">{error}</div>}
      <AuthInput id="username" name="username" label="Username or Email" icon={User} placeholder="Enter your username or email" autoComplete="username" autoFocus />
      <AuthInput id="password" name="password" label="Password" icon={Lock} type="password" placeholder="Enter your password" autoComplete="current-password" />
      <p className="auth-hint">Forgot your password? Ask your Program Coordinator or administrator to reset it.</p>
      <button className="btn btn-brass btn-full auth-submit" type="submit" disabled={loading}>
        {loading && <span className="spinner" />}
        {loading ? "Signing in…" : <>Sign in <ArrowRight size={18} /></>}
      </button>
    </form>
  );
}
