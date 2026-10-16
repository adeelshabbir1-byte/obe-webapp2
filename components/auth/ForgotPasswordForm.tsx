"use client";

import { useState } from "react";
import { User, ArrowRight } from "lucide-react";
import AuthInput from "./AuthInput";

/** Ask for a password reset link by login name or email. The answer is the same whether or not the account exists. */
export default function ForgotPasswordForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: fd.get("identifier") }) }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) { setError(d.error || "Something went wrong. Try again."); return; }
    setDone(d.message);
  }

  if (done) return <div className="ok-box" role="status" style={{ fontSize: 13.5, lineHeight: 1.5, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", background: "#F3F8F4", marginBottom: 14 }}>{done}</div>;
  return (
    <form method="post" onSubmit={onSubmit}>
      {error && <div className="err" role="alert">{error}</div>}
      <AuthInput id="identifier" name="identifier" label="Username or Email" icon={User} placeholder="Enter your username or email" autoComplete="username" autoFocus />
      <button className="btn btn-brass btn-full auth-submit" type="submit" disabled={busy}>
        {busy && <span className="spinner" />}
        {busy ? "Sending…" : <>Send reset link <ArrowRight size={18} /></>}
      </button>
    </form>
  );
}
