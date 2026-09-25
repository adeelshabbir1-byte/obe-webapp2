"use client";

import { useState } from "react";

type Request = {
  id: string; name: string; email: string; institutionName: string; phone: string | null; message: string | null;
  status: string; reviewedBy: { name: string } | null; reviewNote: string | null; createdAt: string;
};

export default function AccountRequestsManager({ initialRequests }: { initialRequests: Request[] }) {
  const [requests, setRequests] = useState<Request[]>(initialRequests);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [approvedCredentials, setApprovedCredentials] = useState<Record<string, { username: string; initialPassword: string; clonedCurricula: number }>>({});

  async function approve(id: string) {
    if (!confirm("Approve this request? This creates the Chairman account and clones the master curriculum for them right away.")) return;
    setBusyId(id); setError("");
    try {
      const res = await fetch(`/api/admin/account-requests/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyId(null); return; }
      setApprovedCredentials((prev) => ({ ...prev, [id]: { username: data.chairman.username, initialPassword: data.chairman.initialPassword, clonedCurricula: data.clonedCurricula } }));
      setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "APPROVED" } : r));
      setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  async function reject(id: string) {
    const note = prompt("Optional note for why this is being rejected:") || "";
    setBusyId(id); setError("");
    try {
      const res = await fetch(`/api/admin/account-requests/${id}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusyId(null); return; }
      setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "REJECTED", reviewNote: note } : r));
      setBusyId(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusyId(null); }
  }

  const pending = requests.filter((r) => r.status === "PENDING");
  const reviewed = requests.filter((r) => r.status !== "PENDING");

  return (
    <>
      {error && <div className="err">{error}</div>}

      <h3 style={{ fontSize: 14, marginBottom: 10 }}>Pending ({pending.length})</h3>
      {pending.length === 0 && <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No pending requests.</p></div>}
      {pending.map((r) => {
        const creds = approvedCredentials[r.id];
        return (
          <div key={r.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
              <div>
                <b style={{ fontSize: 14 }}>{r.institutionName}</b>
                <div style={{ fontSize: 12.5, color: "var(--slate)", marginTop: 2 }}>{r.name} · {r.email}{r.phone ? ` · ${r.phone}` : ""}</div>
                {r.message && <p style={{ fontSize: 12.5, marginTop: 6 }}>{r.message}</p>}
                <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 4 }}>Requested {new Date(r.createdAt).toLocaleDateString()}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => approve(r.id)} disabled={busyId === r.id} className="btn btn-approve" style={{ fontSize: 12, padding: "5px 10px" }}>Approve</button>
                <button onClick={() => reject(r.id)} disabled={busyId === r.id} className="btn btn-danger" style={{ fontSize: 12, padding: "5px 10px", color: "var(--rust)" }}>Reject</button>
              </div>
            </div>
            {creds && (
              <div style={{ marginTop: 12, background: "#FFF3DC", border: "1px solid #8A4B00", padding: 10, fontSize: 12.5 }}>
                <b>Account created</b> — {creds.clonedCurricula} curriculum(s) cloned for them. This password is shown only this once — copy it now and share it with them directly:
                <div style={{ marginTop: 6, fontFamily: "monospace", fontSize: 13 }}>Username: {creds.username}<br />Initial password: {creds.initialPassword}</div>
                <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 4 }}>They'll be asked to set their own password the first time they sign in.</div>
              </div>
            )}
          </div>
        );
      })}

      {reviewed.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 13.5, marginBottom: 10 }}>Reviewed</h3>
          {reviewed.map((r) => (
            <div key={r.id} style={{ fontSize: 12.5, padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
              <b>{r.institutionName}</b> ({r.name}) —{" "}
              <span className={r.status === "APPROVED" ? "badge badge-ok" : "badge badge-no"}>{r.status}</span>
              {r.reviewedBy && <span style={{ color: "var(--slate)" }}> by {r.reviewedBy.name}</span>}
              {r.reviewNote && <div style={{ fontSize: 11.5, color: "var(--slate)" }}>{r.reviewNote}</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
