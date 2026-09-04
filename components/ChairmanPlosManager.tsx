"use client";

import { Fragment, useState } from "react";
import SortableTable from "./SortableTable";
import { useRouter } from "next/navigation";

type Plo = { id: string; number: number; title: string; description: string; status: string; chairmanComment: string | null; coordinatorName: string; degreeProgram: string };

function statusBadge(status: string) {
  const map: Record<string, [string, string]> = {
    draft: ["#EFECE3", "#5B6B7C"], approved: ["#CCFBF1", "#4B7A63"], "changes-requested": ["#FFE4DC", "#B1512E"],
  };
  const [bg, fg] = map[status] || map.draft;
  return <span style={{ background: bg, color: fg, fontSize: 10, textTransform: "uppercase", padding: "2px 8px", borderRadius: 2, fontWeight: 600 }}>{status.replace("-", " ")}</span>;
}

export default function ChairmanPlosManager({ initialPlos }: { initialPlos: Plo[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState("");

  const pendingCount = initialPlos.filter((p) => p.status !== "approved").length;

  async function approveAll() {
    if (!confirm(`Approve all ${pendingCount} pending PLO(s)? This can't be undone in bulk.`)) return;
    setLoading(true); setError(""); setBulkResult("");
    try {
      const res = await fetch("/api/chairman/plos/approve-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setBulkResult(`Approved ${data.approved} PLO(s).`);
      setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function decide(e: React.FormEvent<HTMLFormElement>, ploId: string, status: string) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/chairman/plos/${ploId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: fd.get("title"), description: fd.get("description"), status, chairmanComment: fd.get("comment") || "" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setOpenId(null); setLoading(false); router.refresh();
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  return (
    <div className="card">
      {error && <div className="err">{error}</div>}
      {bulkResult && <div style={{ background: "#CCFBF1", color: "var(--sage)", border: "1px solid #99F1E4", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>{bulkResult}</div>}
      {pendingCount > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <button onClick={approveAll} disabled={loading} className="btn" style={{ background: "var(--sage)", borderColor: "var(--sage)", color: "#fff" }}>
            Approve All ({pendingCount} pending)
          </button>
        </div>
      )}
      <SortableTable>
        <thead><tr><th>#</th><th>Title</th><th>Batch</th><th>Coordinator</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {initialPlos.length === 0 && <tr><td colSpan={6} style={{ color: "var(--slate)" }}>No PLOs submitted by your coordinators yet.</td></tr>}
          {initialPlos.map((p) => (
            <Fragment key={p.id}>
              <tr>
                <td>PLO-{p.number}</td><td>{p.title}</td><td style={{ fontSize: 11.5 }}>{p.degreeProgram}</td><td>{p.coordinatorName}</td>
                <td>{statusBadge(p.status)}</td>
                <td><button onClick={() => setOpenId(openId === p.id ? null : p.id)} style={{ background: "none", border: "none", color: "var(--brass-dark)", fontSize: 12, textDecoration: "underline", cursor: "pointer", padding: 0 }}>{openId === p.id ? "Close" : "Review"}</button></td>
              </tr>
              {openId === p.id && (
                <tr>
                  <td colSpan={6}>
                    <form onSubmit={(e) => decide(e, p.id, "approved")} style={{ padding: "10px 0" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 10 }}>
                        <div className="field"><label>Title</label><input name="title" defaultValue={p.title} required /></div>
                        <div className="field"><label>Description</label><input name="description" defaultValue={p.description} required /></div>
                      </div>
                      <div className="field"><label>Comment (optional)</label><input name="comment" defaultValue={p.chairmanComment || ""} placeholder="Notes for the coordinator..." /></div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button type="submit" disabled={loading} className="btn" style={{ background: "var(--sage)", borderColor: "var(--sage)", color: "#fff" }}>Approve</button>
                        <button type="button" disabled={loading}
                          onClick={(e) => { const form = (e.target as HTMLElement).closest("form") as HTMLFormElement; decide({ preventDefault: () => {}, currentTarget: form } as any, p.id, "changes-requested"); }}
                          className="btn" style={{ background: "var(--rust)", borderColor: "var(--rust)", color: "#fff" }}>Request Changes</button>
                      </div>
                    </form>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </SortableTable>
    </div>
  );
}
