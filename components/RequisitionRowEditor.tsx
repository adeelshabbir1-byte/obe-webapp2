"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Stock / ordered / received / status for one book on the requisition list. */
export default function RequisitionRowEditor({ term, textbookId, initial }: { term: string; textbookId: string; initial: { inStock: number; ordered: number; received: number; status: string; note: string | null } }) {
  const router = useRouter();
  const [v, setV] = useState({ ...initial, note: initial.note || "" });
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");
  const dirty = JSON.stringify({ ...initial, note: initial.note || "" }) !== JSON.stringify(v);
  async function save() {
    setState("saving");
    const res = await fetch("/api/library/requisitions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ term, textbookId, ...v }) });
    setState(res.ok ? "saved" : "error");
    if (res.ok) router.refresh();
  }
  const n = (k: "inStock" | "ordered" | "received", label: string) => (
    <input type="number" min={0} value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: Number(e.target.value) }))} aria-label={label} style={{ width: 64 }} />
  );
  return (
    <>
      <td>{n("inStock", "Copies in stock")}</td>
      <td>{n("ordered", "Copies ordered")}</td>
      <td>{n("received", "Copies received")}</td>
      <td>
        <select value={v.status} onChange={(e) => setV((x) => ({ ...x, status: e.target.value }))} aria-label="Status">
          <option value="PENDING">To order</option><option value="ORDERED">Ordered</option><option value="RECEIVED">Received</option><option value="NOT_NEEDED">Not needed</option>
        </select>
        <input value={v.note} onChange={(e) => setV((x) => ({ ...x, note: e.target.value }))} placeholder="Note / PO no." aria-label="Note" style={{ width: 120, marginTop: 4, display: "block" }} />
      </td>
      <td style={{ whiteSpace: "nowrap" }}>
        <button type="button" className="act act-primary" disabled={!dirty || state === "saving"} onClick={save}>{state === "saving" ? "…" : "Save"}</button>
        {state === "saved" && !dirty && <span className="small-note" style={{ color: "var(--sage)", marginLeft: 4 }}>Saved</span>}
        {state === "error" && <span className="small-note" style={{ color: "var(--rust)", marginLeft: 4 }}>Could not save</span>}
      </td>
    </>
  );
}
