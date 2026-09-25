"use client";

import { useState } from "react";

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PlatformSettingsForm({ initial }: { initial: { ownerLogo: string | null; nceacLogo: string | null } }) {
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [error, setError] = useState("");
  const [ownerLogo, setOwnerLogo] = useState(initial.ownerLogo);
  const [nceacLogo, setNceacLogo] = useState(initial.nceacLogo);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>, setter: (v: string) => void) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError("Please keep logo files under 2MB."); return; }
    setError("");
    const dataUri = await fileToDataUri(file);
    setter(dataUri);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setOk(false); setError("");
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerLogo, nceacLogo }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setOk(true); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  function LogoField({ label, value, onChange }: { label: string; value: string | null; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
    return (
      <div className="field">
        <label>{label}</label>
        {value && <img src={value} alt={label} style={{ maxHeight: 60, maxWidth: 160, display: "block", marginBottom: 8, border: "1px solid var(--line)", padding: 6, background: "#fff" }} />}
        <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={onChange} style={{ fontSize: 12.5 }} />
      </div>
    );
  }

  return (
    <div className="card">
      {ok && <div style={{ background: "#E3F8EF", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>Saved.</div>}
      {error && <div className="err">{error}</div>}
      <form onSubmit={onSubmit}>
        <LogoField label="NCEAC Logo" value={nceacLogo} onChange={(e) => handleFile(e, setNceacLogo)} />
        <LogoField label="Lets Innovate Pvt Ltd Logo (for copyright)" value={ownerLogo} onChange={(e) => handleFile(e, setOwnerLogo)} />
        <p style={{ fontSize: 11, color: "var(--slate)", marginBottom: 12 }}>
          These two are truly platform-wide — the same across every tenant institution on this deployment.
          Each institution's own name and logo is set per-Chairman on the Manage Chairmen page instead.
        </p>
        <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Saving…" : "Save"}</button>
      </form>
    </div>
  );
}
