"use client";

import { useState } from "react";

export default function MfaSetupManager({ mfaEnabled: initialMfaEnabled }: { mfaEnabled: boolean }) {
  const [mfaEnabled, setMfaEnabled] = useState(initialMfaEnabled);
  const [step, setStep] = useState<"idle" | "setup" | "done">("idle");
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function startSetup() {
    setLoading(true); setError("");
    const res = await fetch("/api/settings/mfa/setup", { method: "POST" });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
    setSecret(data.secret); setUri(data.uri); setStep("setup"); setLoading(false);
  }

  async function confirmSetup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await fetch("/api/settings/mfa/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
    setBackupCodes(data.backupCodes); setStep("done"); setMfaEnabled(true); setLoading(false);
  }

  async function disable() {
    if (!confirm("Turn off two-factor authentication for your account?")) return;
    setLoading(true);
    await fetch("/api/settings/mfa/disable", { method: "POST" });
    setMfaEnabled(false);
    setLoading(false);
  }

  if (mfaEnabled) {
    return (
      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Two-Factor Authentication</h3>
        <p style={{ fontSize: 12.5, color: "var(--sage)", marginBottom: 10 }}>Enabled on your account.</p>
        <button onClick={disable} disabled={loading} className="btn" style={{ background: "var(--rust)", borderColor: "var(--rust)", color: "#fff" }}>Turn Off 2FA</button>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 8 }}>Two-Factor Authentication</h3>
      {error && <div className="err">{error}</div>}

      {step === "idle" && (
        <>
          <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 10 }}>Not enabled. Add an extra layer of security using an authenticator app (Google Authenticator, Authy, etc.).</p>
          <button onClick={startSetup} disabled={loading} className="btn btn-brass">{loading ? "Starting…" : "Set Up 2FA"}</button>
        </>
      )}

      {step === "setup" && (
        <form onSubmit={confirmSetup}>
          <p style={{ fontSize: 12.5, marginBottom: 8 }}>In your authenticator app, add a new account manually using this key:</p>
          <div style={{ fontFamily: "monospace", fontSize: 14, background: "var(--paper)", padding: "10px 14px", marginBottom: 10, letterSpacing: 2, wordBreak: "break-all" }}>{secret}</div>
          <p style={{ fontSize: 11, color: "var(--slate)", marginBottom: 14 }}>(Or if your app supports pasting a URI: {uri})</p>
          <div className="field"><label>Enter the 6-digit code your app shows</label><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" required /></div>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Confirming…" : "Confirm & Enable"}</button>
        </form>
      )}

      {step === "done" && (
        <>
          <p style={{ fontSize: 12.5, color: "var(--sage)", marginBottom: 10 }}>2FA is now enabled. Save these one-time backup codes somewhere safe — each works once if you lose access to your app:</p>
          <div style={{ fontFamily: "monospace", fontSize: 13, background: "var(--paper)", padding: "10px 14px", lineHeight: 1.8 }}>
            {backupCodes.map((c) => <div key={c}>{c}</div>)}
          </div>
        </>
      )}
    </div>
  );
}
