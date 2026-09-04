"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InstituteSettingsForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setOk(false);
    const fd = new FormData(e.currentTarget);
    await fetch("/api/chairman/institute-settings", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instituteName: fd.get("instituteName") }),
    });
    setOk(true); setLoading(false); router.refresh();
  }

  return (
    <div className="card">
      {ok && <div style={{ background: "#CCFBF1", color: "var(--sage)", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>Saved.</div>}
      <form onSubmit={onSubmit}>
        <div className="field">
          <label>Institute Name</label>
          <input name="instituteName" defaultValue={initialName} placeholder="e.g. National University of Computing Sciences" />
        </div>
        <p style={{ fontSize: 11, color: "var(--slate)", marginBottom: 12 }}>Shown in the sidebar and footer of every page, alongside the NCEAC seal.</p>
        <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Saving…" : "Save"}</button>
      </form>
    </div>
  );
}
