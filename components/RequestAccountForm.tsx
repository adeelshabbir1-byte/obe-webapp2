"use client";

import { useState } from "react";

export default function RequestAccountForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/request-account", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"), email: fd.get("email"), institutionName: fd.get("institutionName"),
          phone: fd.get("phone"), message: fd.get("message"),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setSubmitted(true); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  if (submitted) {
    return (
      <p style={{ fontSize: 14, color: "var(--sage)", textAlign: "center" }}>
        Thank you — your request has been submitted. We'll be in touch once it's reviewed.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      {error && <div className="err">{error}</div>}
      <div className="field">
        <label>Your Name</label>
        <input name="name" required />
      </div>
      <div className="field">
        <label>Email</label>
        <input name="email" type="email" required />
      </div>
      <div className="field">
        <label>Institution Name</label>
        <input name="institutionName" required />
      </div>
      <div className="field">
        <label>Phone (optional)</label>
        <input name="phone" />
      </div>
      <div className="field">
        <label>Anything else we should know? (optional)</label>
        <textarea name="message" rows={3} style={{ width: "100%", padding: "9px 11px", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", fontSize: 14, fontFamily: "var(--font-ui)" }} />
      </div>
      <button className="btn btn-full" type="submit" disabled={loading}>
        {loading && <span className="spinner" />}
        {loading ? "Submitting…" : "Submit Request"}
      </button>
    </form>
  );
}
