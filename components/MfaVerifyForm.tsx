"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MfaVerifyForm() {
  const router = useRouter();
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
      router.push("/dashboard");
      router.refresh();
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
