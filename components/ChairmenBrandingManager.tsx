"use client";

import { Fragment, useState } from "react";
import SortableTable from "./SortableTable";
import { useRouter } from "next/navigation";

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type Chairman = { id: string; username: string; name: string; email: string; department: string | null; instituteName: string | null; instituteLogo: string | null };

export default function ChairmenBrandingManager({ chairmen }: { chairmen: Chairman[] }) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [instituteName, setInstituteName] = useState("");
  const [instituteLogo, setInstituteLogo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function startEdit(c: Chairman) {
    setExpandedId(c.id); setInstituteName(c.instituteName || ""); setInstituteLogo(c.instituteLogo); setError("");
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setError("Please keep logo files under 2MB."); return; }
    setError("");
    setInstituteLogo(await fileToDataUri(file));
  }

  async function save(chairmanId: string) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/admin/users/${chairmanId}/branding`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ instituteName, instituteLogo }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setExpandedId(null); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <SortableTable>
      <thead><tr><th>Username</th><th>Name</th><th>Email</th><th>Department</th><th>Institute Branding</th><th></th></tr></thead>
      <tbody>
        {chairmen.length === 0 && (
          <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No Chairman accounts yet.</td></tr>
        )}
        {chairmen.map((c) => (
          <Fragment key={c.id}>
            <tr>
              <td>{c.username}</td><td>{c.name}</td><td>{c.email}</td><td>{c.department || "—"}</td>
              <td style={{ fontSize: 11.5 }}>{c.instituteName || <span style={{ color: "var(--slate)" }}>Not set</span>}</td>
              <td><button onClick={() => startEdit(c)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>Edit Branding</button></td>
            </tr>
            {expandedId === c.id && (
              <tr>
                <td colSpan={6}>
                  <div style={{ padding: "10px 0" }}>
                    {error && <div className="err">{error}</div>}
                    <div className="field">
                      <label>Institute Name (for {c.name}'s institution)</label>
                      <input value={instituteName} onChange={(e) => setInstituteName(e.target.value)} placeholder="e.g. SS CASEIT" />
                    </div>
                    <div className="field">
                      <label>Institute Logo</label>
                      {instituteLogo && <img src={instituteLogo} alt="Institute logo" style={{ maxHeight: 60, maxWidth: 160, display: "block", marginBottom: 8, border: "1px solid var(--line)", padding: 6, background: "#fff" }} />}
                      <input type="file" accept="image/png,image/jpeg,image/svg+xml" onChange={handleFile} style={{ fontSize: 12.5 }} />
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => save(c.id)} disabled={loading} className="btn btn-brass">{loading ? "Saving…" : "Save"}</button>
                      <button onClick={() => setExpandedId(null)} style={{ background: "none", border: "1px solid var(--line)", padding: "6px 12px", cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </SortableTable>
  );
}
