"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Lock, ArrowRight } from "lucide-react";
import AuthInput from "./AuthInput";

/** Choose a new password from an emailed reset link. */
export default function ResetPasswordForm({ token }: { token: string }) {
  const [valid, setValid] = useState<boolean | null>(token ? null : false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`).then((r) => r.json()).then((d) => setValid(!!d.valid)).catch(() => setValid(false));
  }, [token]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pw = String(fd.get("password") || ""), again = String(fd.get("confirm") || "");
    if (pw !== again) { setError("The two passwords don't match."); return; }
    setBusy(true); setError("");
    const res = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, newPassword: pw }) }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res || !res.ok) { setError(d.error || "Something went wrong. Try again."); return; }
    setDone(true);
  }

  if (done) return (
    <div role="status" style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 14 }}>
      <p>Your password has been changed and you have been signed out everywhere else.</p>
      <Link href="/login" className="btn btn-brass btn-full" style={{ textDecoration: "none" }}>Sign in</Link>
    </div>
  );
  if (valid === null) return <p className="auth-sub">Checking the link…</p>;
  if (!valid) return (
    <div style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 14 }}>
      <div className="err" role="alert">This link has expired or was already used.</div>
      <Link href="/forgot-password">Ask for a new link</Link>
    </div>
  );
  return (
    <form method="post" onSubmit={onSubmit}>
      {error && <div className="err" role="alert">{error}</div>}
      <AuthInput id="password" name="password" label="New password" icon={Lock} type="password" placeholder="At least 8 characters" autoComplete="new-password" autoFocus />
      <AuthInput id="confirm" name="confirm" label="New password again" icon={Lock} type="password" placeholder="Type it again" autoComplete="new-password" />
      <button className="btn btn-brass btn-full auth-submit" type="submit" disabled={busy}>
        {busy && <span className="spinner" />}
        {busy ? "Saving…" : <>Set new password <ArrowRight size={18} /></>}
      </button>
    </form>
  );
}
