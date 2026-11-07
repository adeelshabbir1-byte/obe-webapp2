"use client";

import { useState } from "react";

export default function MfaVerifyForm() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/mfa-verify", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Invalid code."); setLoading(false); return; }
      // One full page load of the right home page (push + refresh rendered the page twice).
      window.location.assign(typeof data.href === "string" && data.href.startsWith("/") ? data.href : "/dashboard");
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <form onSubmit={onSubmit}>
      {error && <div className="err">{error}</div>}
      <div className="field">
        <label>Verification Code</label>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" autoFocus style={{ textAlign: "center", fontSize: 20, letterSpacing: 4 }} />
      </div>
      <button className="btn btn-brass" type="submit" disabled={loading} style={{ width: "100%" }}>{loading ? "Verifying…" : "Verify"}</button>
      <p style={{ fontSize: 11, color: "var(--slate)", marginTop: 10, textAlign: "center" }}>You can also use one of your backup codes.</p>
    </form>
  );
}
