"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Field, KindDef } from "../../lib/sarRegistry";

type Val = string | number | boolean | null | undefined;
const post = async (body: Record<string, unknown>) => {
  const res = await fetch("/api/accreditation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return res.ok ? null : (data.error as string) || "Could not save.";
};

/** One input for a field definition. */
export function FieldInput({ f, value, onChange, disabled }: { f: Field; value: Val; onChange: (v: Val) => void; disabled?: boolean }) {
  const common = { disabled, "aria-label": f.label };
  if (f.type === "textarea") return <textarea rows={3} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} style={{ width: "100%" }} {...common} />;
  if (f.type === "checkbox") return <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} {...common} />;
  if (f.type === "select") return (
    <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value || null)} style={{ width: f.width || 200, maxWidth: "100%" }} {...common}>
      <option value="">—</option>{f.options!.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  return <input type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"} step={f.type === "number" ? "any" : undefined} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} style={{ width: f.width || (f.type === "date" ? 150 : 180), maxWidth: "100%" }} {...common} />;
}

function Labelled({ f, children }: { f: Field; children: React.ReactNode }) {
  const wide = f.type === "textarea";
  return (
    <label style={{ fontSize: 12, display: f.type === "checkbox" ? "flex" : "grid", gridTemplateColumns: f.type === "checkbox" ? undefined : "minmax(0, 1fr)", gap: f.type === "checkbox" ? 6 : 3, alignItems: f.type === "checkbox" ? "center" : undefined, flex: wide ? "1 1 100%" : undefined, maxWidth: "100%" }}>
      {f.type === "checkbox" ? <>{children} {f.label}</> : <>{f.label}{f.required ? " *" : ""}{children}{f.hint && <span className="small-note">{f.hint}</span>}</>}
    </label>
  );
}

/** A profile section (institute or business school): one form, saved as a whole. */
export function SarSectionForm({ scopeKey, section, fields, initial, canEdit }: { scopeKey: string; section: string; fields: Field[]; initial: Record<string, Val>; canEdit: boolean }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, Val>>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const filled = fields.filter((f) => f.type !== "checkbox" && v[f.key] !== null && v[f.key] !== undefined && v[f.key] !== "").length;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const err = await post({ action: "saveSection", scopeKey, section, values: v });
    setBusy(false);
    setMsg(err ? { ok: false, text: err } : { ok: true, text: "Saved." });
    if (!err) router.refresh();
  }
  return (
    <form onSubmit={save}>
      <p className="small-note" style={{ marginTop: 0 }}>{filled} of {fields.filter((f) => f.type !== "checkbox").length} filled.</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        {fields.map((f) => <Labelled key={f.key} f={f}><FieldInput f={f} value={v[f.key]} disabled={!canEdit} onChange={(x) => setV((p) => ({ ...p, [f.key]: x }))} /></Labelled>)}
      </div>
      {canEdit && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
          <button type="submit" className="btn btn-brass btn-sm" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          {msg && <span className="small-note" style={{ color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</span>}
        </div>
      )}
    </form>
  );
}

type Row = { id: string; departmentId: string | null; title: string; recordDate: string | null; year: string | null; data: Record<string, Val>; fileName: string | null; mine: boolean };
type KindLite = Pick<KindDef, "kind" | "label" | "sar" | "titleLabel" | "titleOptions" | "dateLabel" | "yearLabel" | "fields" | "file" | "hint" | "confidential">;

const show = (f: Field, v: Val) => (v === null || v === undefined || v === "" ? "—" : f.type === "checkbox" ? (v ? "Yes" : "No") : typeof v === "number" ? v.toLocaleString("en-US") : String(v));

/** A register of records of one kind: the list, and a form to add or edit one (with an optional file). */
export function SarRegister({ def, rows, departments, defaultDepartment, canEdit, canAddOwn, canPickInstitute }: {
  def: KindLite; rows: Row[]; departments: { id: string; name: string }[]; defaultDepartment: string | null; canEdit: boolean; canAddOwn: boolean; canPickInstitute: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [form, setForm] = useState<{ title: string; recordDate: string; year: string; departmentId: string; data: Record<string, Val> }>({ title: "", recordDate: "", year: "", departmentId: defaultDepartment || "", data: {} });
  const [file, setFile] = useState<{ name: string; type: string; data: string } | null>(null);
  const [removeFile, setRemoveFile] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const cols = def.fields.filter((f) => f.type !== "textarea").slice(0, 4);
  const deptName = (id: string | null) => (id ? departments.find((d) => d.id === id)?.name || "—" : "Whole institute");
  const open = (r: Row | "new") => {
    setEditing(r); setMsg(""); setFile(null); setRemoveFile(false);
    setForm(r === "new" ? { title: def.titleOptions ? "" : "", recordDate: "", year: "", departmentId: defaultDepartment || "", data: {} } : { title: r.title, recordDate: r.recordDate || "", year: r.year || "", departmentId: r.departmentId || "", data: { ...r.data } });
  };
  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const data = await new Promise<string>((resolve) => { const rd = new FileReader(); rd.onload = () => resolve(String(rd.result).split(",")[1] || ""); rd.readAsDataURL(f); });
    setFile({ name: f.name, type: f.type || "application/octet-stream", data });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg("");
    const err = await post({ action: "saveRecord", kind: def.kind, id: editing !== "new" && editing ? editing.id : undefined, ...form, file: file || undefined, removeFile });
    setBusy(false);
    if (err) { setMsg(err); return; }
    setEditing(null); router.refresh();
  }
  async function remove(r: Row) {
    if (!confirm(`Remove "${r.title}"?`)) return;
    const err = await post({ action: "deleteRecord", id: r.id });
    if (err) { alert(err); return; }
    router.refresh();
  }
  const mayEdit = (r: Row) => canEdit || (canAddOwn && r.mine);
  return (
    <div>
      {def.hint && <p className="small-note" style={{ marginTop: 0 }}>{def.hint}</p>}
      {rows.length === 0 ? <p className="small-note">Nothing recorded yet.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>{def.titleLabel.replace(/\s*\(.*\)$/, "")}</th>{(def.dateLabel || def.yearLabel) && <th>{def.dateLabel ? "Date" : "Period"}</th>}{cols.map((f) => <th key={f.key}>{f.label.replace(/\s*\(.*\)$/, "")}</th>)}{departments.length > 1 && <th>Department</th>}<th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}>
                <td><b>{r.title}</b>{def.fields.filter((f) => f.type === "textarea" && r.data[f.key]).slice(0, 1).map((f) => <div key={f.key} className="small-note" style={{ whiteSpace: "pre-wrap" }}>{String(r.data[f.key]).slice(0, 160)}</div>)}
                  {r.fileName && <div><a href={`/api/accreditation?file=${r.id}`} className="small-note">📎 {r.fileName}</a></div>}</td>
                {(def.dateLabel || def.yearLabel) && <td className="small-note" style={{ whiteSpace: "nowrap" }}>{[r.recordDate, r.year].filter(Boolean).join(" · ") || "—"}</td>}
                {cols.map((f) => <td key={f.key} className="small-note">{show(f, r.data[f.key])}</td>)}
                {departments.length > 1 && <td className="small-note">{deptName(r.departmentId)}</td>}
                <td style={{ whiteSpace: "nowrap" }}>{mayEdit(r) && <><button type="button" className="act act-neutral" onClick={() => open(r)}>Edit</button> <button type="button" className="act act-danger" onClick={() => remove(r)}>Remove</button></>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {(canEdit || canAddOwn) && !editing && <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => open("new")}>Add</button>}
      {editing && (
        <form onSubmit={save} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", padding: 12, border: "1px dashed var(--line)", borderRadius: 8, marginTop: 10 }}>
          <label style={{ fontSize: 12, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 3, flex: "1 1 260px", maxWidth: "100%" }}>{def.titleLabel} *
            {def.titleOptions
              ? <select value={form.title} onChange={(e) => setForm((x) => ({ ...x, title: e.target.value }))} aria-label={def.titleLabel}><option value="">—</option>{def.titleOptions.map((o) => <option key={o} value={o}>{o}</option>)}</select>
              : <input value={form.title} onChange={(e) => setForm((x) => ({ ...x, title: e.target.value }))} aria-label={def.titleLabel} />}
          </label>
          {def.dateLabel && <label style={{ fontSize: 12, display: "grid", gap: 3 }}>{def.dateLabel}<input type="date" value={form.recordDate} onChange={(e) => setForm((x) => ({ ...x, recordDate: e.target.value }))} /></label>}
          {def.yearLabel && <label style={{ fontSize: 12, display: "grid", gap: 3 }}>{def.yearLabel}<input value={form.year} onChange={(e) => setForm((x) => ({ ...x, year: e.target.value }))} style={{ width: 150 }} /></label>}
          {canEdit && (departments.length > 1 || canPickInstitute) && (
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Department
              <select value={form.departmentId} onChange={(e) => setForm((x) => ({ ...x, departmentId: e.target.value }))}>
                {canPickInstitute && <option value="">Whole institute</option>}
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          )}
          {def.fields.map((f) => <Labelled key={f.key} f={f}><FieldInput f={f} value={form.data[f.key]} onChange={(x) => setForm((p) => ({ ...p, data: { ...p.data, [f.key]: x } }))} /></Labelled>)}
          {def.file && (
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Document (PDF, Word, Excel, image — up to 3 MB)
              <input type="file" onChange={pick} />
              {editing !== "new" && editing.fileName && !file && <span className="small-note">Attached: {editing.fileName} <label style={{ display: "inline-flex", gap: 4 }}><input type="checkbox" checked={removeFile} onChange={(e) => setRemoveFile(e.target.checked)} /> remove</label></span>}
            </label>
          )}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexBasis: "100%" }}>
            <button type="submit" className="btn btn-brass btn-sm" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
            {msg && <span className="small-note" style={{ color: "var(--rust)" }}>{msg}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
