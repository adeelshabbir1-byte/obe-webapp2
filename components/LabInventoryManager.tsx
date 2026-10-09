"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";

type Spec = { id: string; labId: string; quantity: number; makeModel: string | null; processor: string | null; ramGb: number | null; storage: string | null; gpu: string | null; os: string | null; purchaseYear: number | null; notes: string | null };
type Lab = { id: string; name: string; departmentId: string | null; departmentName: string; location: string | null; seats: number; computers: number; computersWorking: number; software: string | null; equipment: string | null; internetMbps: number | null; lastAudit: string | null; notes: string | null };

export default function LabInventoryManager({ labs, specs, canEdit, departments }: { labs: Lab[]; specs: Spec[]; canEdit: boolean; departments: { id: string; name: string }[] | null }) {
  const [specLab, setSpecLab] = useState<string | null>(null);
  const [specEdit, setSpecEdit] = useState<Spec | "new" | null>(null);
  const router = useRouter();
  const [editing, setEditing] = useState<Lab | "new" | null>(null);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);
  const cur = editing && editing !== "new" ? editing : null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body: Record<string, unknown> = Object.fromEntries(Array.from(new FormData(e.currentTarget).entries()));
    if (cur) body.id = cur.id;
    const res = await fetch("/api/lab-inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setOk(res.ok); setMsg(res.ok ? "Saved." : d.error || "Something went wrong");
    if (res.ok) { setEditing(null); router.refresh(); }
  }
  async function remove(l: Lab) {
    if (!window.confirm(`Delete ${l.name}?`)) return;
    const res = await fetch(`/api/lab-inventory?id=${l.id}`, { method: "DELETE" });
    setOk(res.ok); setMsg(res.ok ? "Deleted." : "Could not delete");
    if (res.ok) router.refresh();
  }
  async function saveSpec(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body: Record<string, unknown> = Object.fromEntries(Array.from(new FormData(e.currentTarget).entries()));
    body.labId = specLab; if (specEdit && specEdit !== "new") body.id = specEdit.id;
    const res = await fetch("/api/lab-inventory/specs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setOk(res.ok); setMsg(res.ok ? "Saved." : d.error || "Something went wrong");
    if (res.ok) { setSpecEdit(null); router.refresh(); }
  }
  async function removeSpec(sp: Spec) {
    if (!window.confirm("Delete this line?")) return;
    const res = await fetch(`/api/lab-inventory/specs?id=${sp.id}`, { method: "DELETE" });
    setOk(res.ok); setMsg(res.ok ? "Deleted." : "Could not delete"); if (res.ok) router.refresh();
  }
  const inp = { padding: "6px 8px", border: "1px solid var(--line)", width: "100%" } as const;
  const f = (label: string, el: React.ReactNode, wide?: boolean) => <div className="field" style={wide ? { gridColumn: "1 / -1" } : undefined}><label>{label}</label>{el}</div>;

  return (
    <>
      {msg && <div className="card" style={{ color: ok ? "var(--sage)" : "#b3261e" }}>{msg}</div>}
      {canEdit && !editing && <div style={{ marginBottom: 12 }}><button className="btn btn-brass" onClick={() => setEditing("new")}>Add a lab</button></div>}
      {editing && (
        <form className="card" onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>{cur ? `Change ${cur.name}` : "Add a lab"}</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
            {f("Lab name *", <input name="name" required defaultValue={cur?.name || ""} style={inp} />)}
            {departments && f("Department", <select name="departmentId" defaultValue={cur?.departmentId || ""} style={inp}><option value="">— common —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>)}
            {f("Location (building / floor)", <input name="location" defaultValue={cur?.location || ""} style={inp} />)}
            {f("Seats (student workstations)", <input name="seats" type="number" min={0} defaultValue={cur?.seats ?? 0} style={inp} />)}
            {f("Computers installed", <input name="computers" type="number" min={0} defaultValue={cur?.computers ?? 0} style={inp} />)}
            {f("Computers working", <input name="computersWorking" type="number" min={0} defaultValue={cur?.computersWorking ?? 0} style={inp} />)}
            {f("Internet speed (Mbps)", <input name="internetMbps" type="number" min={0} defaultValue={cur?.internetMbps ?? ""} style={inp} />)}
            {f("Last stock check", <input name="lastAudit" type="date" defaultValue={cur?.lastAudit ? cur.lastAudit.slice(0, 10) : ""} style={inp} />)}
            {f("Software installed (and licences)", <textarea name="software" rows={3} defaultValue={cur?.software || ""} style={inp} />, true)}
            {f("Other equipment (projector, switches, printers …)", <textarea name="equipment" rows={3} defaultValue={cur?.equipment || ""} style={inp} />, true)}
            {f("Notes", <textarea name="notes" rows={2} defaultValue={cur?.notes || ""} style={inp} />, true)}
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}><button className="btn btn-brass" type="submit">Save</button><button className="btn" type="button" onClick={() => setEditing(null)}>Cancel</button></div>
        </form>
      )}
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Lab</th><th>Department</th><th>Seats</th><th>Computers</th><th>Working</th><th>Internet</th><th>Last check</th>{canEdit && <th></th>}</tr></thead>
          <tbody>
            {labs.length === 0 && <tr><td colSpan={canEdit ? 8 : 7} style={{ color: "var(--slate)" }}>No lab recorded yet.</td></tr>}
            {labs.map((l) => { const mine = specs.filter((x) => x.labId === l.id); const counted = mine.reduce((n, x) => n + x.quantity, 0); return (
              <Fragment key={l.id}>
              <tr>
                <td><b>{l.name}</b>{l.location && <div style={{ fontSize: 12, color: "var(--slate)" }}>{l.location}</div>}
                  {l.software && <details style={{ fontSize: 12 }}><summary style={{ cursor: "pointer", color: "var(--slate)" }}>Software and equipment</summary><div>{l.software}</div>{l.equipment && <div style={{ marginTop: 4 }}>{l.equipment}</div>}</details>}</td>
                <td>{l.departmentName}</td><td>{l.seats}</td>
                <td>{l.computers}<div><button type="button" className="btn" style={{ fontSize: 11, padding: "1px 7px", marginTop: 3 }} onClick={() => { setSpecLab(specLab === l.id ? null : l.id); setSpecEdit(null); }}>PC specs ({counted}/{l.computers})</button></div></td>
                <td style={{ color: l.computers > 0 && l.computersWorking < l.computers ? "#B3261E" : undefined }}>{l.computersWorking}</td>
                <td>{l.internetMbps !== null ? `${l.internetMbps} Mbps` : "—"}</td><td>{l.lastAudit ? l.lastAudit.slice(0, 10) : "—"}</td>
                {canEdit && <td style={{ whiteSpace: "nowrap" }}><button className="btn" style={{ fontSize: 12 }} onClick={() => setEditing(l)}>Edit</button>{" "}<button className="btn" style={{ fontSize: 12 }} onClick={() => remove(l)}>Delete</button></td>}
              </tr>
              {specLab === l.id && (
                <tr><td colSpan={canEdit ? 8 : 7} style={{ background: "#faf8f3" }}>
                  <b style={{ fontSize: 13 }}>PC specifications, {l.name}</b>
                  {counted !== l.computers && <span style={{ marginLeft: 10, fontSize: 12, color: "#C58A12" }}>{counted} of {l.computers} installed computers described</span>}
                  <table style={{ marginTop: 6 }}>
                    <thead><tr><th>Qty</th><th>Make / model</th><th>Processor</th><th>RAM</th><th>Storage</th><th>Graphics</th><th>OS</th><th>Bought</th>{canEdit && <th></th>}</tr></thead>
                    <tbody>
                      {mine.length === 0 && <tr><td colSpan={9} style={{ color: "var(--slate)" }}>No specification recorded yet.</td></tr>}
                      {mine.map((sp) => <tr key={sp.id}><td><b>{sp.quantity}</b></td><td>{sp.makeModel || "—"}</td><td>{sp.processor || "—"}</td><td>{sp.ramGb ? `${sp.ramGb} GB` : "—"}</td><td>{sp.storage || "—"}</td><td>{sp.gpu || "—"}</td><td>{sp.os || "—"}</td><td>{sp.purchaseYear || "—"}</td>
                        {canEdit && <td style={{ whiteSpace: "nowrap" }}><button className="btn" style={{ fontSize: 11 }} onClick={() => setSpecEdit(sp)}>Edit</button>{" "}<button className="btn" style={{ fontSize: 11 }} onClick={() => removeSpec(sp)}>Delete</button></td>}</tr>)}
                    </tbody>
                  </table>
                  {canEdit && !specEdit && <button className="btn btn-brass" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setSpecEdit("new")}>Add a line</button>}
                  {canEdit && specEdit && (
                    <form onSubmit={saveSpec} style={{ marginTop: 8, padding: 10, border: "1px solid var(--line)", background: "#fff" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
                        {[["quantity", "How many *", "number"], ["makeModel", "Make / model", "text"], ["processor", "Processor (e.g. Core i7-12700)", "text"], ["ramGb", "RAM (GB)", "number"], ["storage", "Storage (e.g. 512 GB SSD)", "text"], ["gpu", "Graphics card", "text"], ["os", "Operating system", "text"], ["purchaseYear", "Year bought", "number"], ["notes", "Notes", "text"]].map(([k, label, type]) => (
                          <div className="field" key={k}><label>{label}</label>
                            <input name={k} type={type} min={type === "number" ? 0 : undefined} required={k === "quantity"} defaultValue={String(specEdit !== "new" ? (specEdit as unknown as Record<string, unknown>)[k] ?? "" : k === "quantity" ? 1 : "")} style={inp} /></div>
                        ))}
                      </div>
                      <div style={{ marginTop: 8, display: "flex", gap: 8 }}><button className="btn btn-brass" type="submit">Save</button><button className="btn" type="button" onClick={() => setSpecEdit(null)}>Cancel</button></div>
                    </form>
                  )}
                </td></tr>
              )}
              </Fragment>
            ); })}
          </tbody>
        </table>
      </div>
    </>
  );
}
