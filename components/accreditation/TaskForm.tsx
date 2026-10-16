"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Field = { key: string; label: string; type: "textarea" | "text" | "date" };
type FileRow = { id: string; title: string; fileName: string; size: number; by: string; mine: boolean };
type Teacher = { id: string; name: string; verified: boolean; changed: boolean; highest: string };

async function patch(taskId: string, body: Record<string, unknown>) {
  const r = await fetch(`/api/accreditation/tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const d = r ? await r.json().catch(() => ({})) : {};
  return r && r.ok ? { ok: true as const } : { ok: false as const, error: (d as { error?: string }).error || "That didn't work." };
}
const toBase64 = (f: File) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(",")[1] || ""); r.onerror = reject; r.readAsDataURL(f); });

/** The part of a task its assignee works on — and the Chairman's / Dean's review. */
export default function TaskForm({ taskId, status, checklist, fields, initial, canEdit, canSubmit, managing, files, teachers }: {
  taskId: string; status: string; checklist: string[]; fields: Field[]; initial: { checked: Record<string, boolean>; fields: Record<string, string> };
  canEdit: boolean; canSubmit: boolean; managing: boolean; files: FileRow[]; teachers: Teacher[] | null;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(initial.checked);
  const [vals, setVals] = useState(initial.fields);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [note, setNote] = useState("");
  const [upload, setUpload] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");

  async function run(body: Record<string, unknown>, done?: string) {
    setBusy(true); setMsg(null);
    const r = await patch(taskId, body);
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: done || "Saved." } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
    return r.ok;
  }
  const save = () => run({ action: "save", checked, fields: vals });
  async function submit() {
    if (!(await run({ action: "save", checked, fields: vals }))) return;
    if (!window.confirm("Sign off this task? You confirm the data is correct, and your access to it ends.")) return;
    await run({ action: "submit" }, "Signed off — the Chairman or Dean has been told.");
  }
  async function attach() {
    if (!upload) return;
    if (upload.size > 3 * 1024 * 1024) { setMsg({ ok: false, text: "The file is larger than 3 MB." }); return; }
    const data = await toBase64(upload);
    if (await run({ action: "uploadFile", title: uploadTitle || upload.name, file: { name: upload.name, type: upload.type, data } }, "File attached.")) { setUpload(null); setUploadTitle(""); }
  }
  const editable = canEdit && status !== "APPROVED";
  const allTicked = checklist.every((c) => checked[c]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {teachers && (
        <div className="card" style={{ margin: 0, overflowX: "auto" }}>
          <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>Check each profile against the documents</h3>
          <p className="small-note" style={{ margin: "0 0 8px" }}>Open the teacher&apos;s degrees and appointment letter, then mark the profile as verified. A profile changed after it was verified needs checking again.</p>
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Teacher</th><th>Highest degree</th><th>Checked</th>{(editable || managing) && <th></th>}</tr></thead>
            <tbody>{teachers.map((t) => (
              <tr key={t.id}><td>{t.name}</td><td>{t.highest || "—"}</td>
                <td>{t.verified ? <span className="badge badge-ok">Verified</span> : t.changed ? <span className="badge badge-no">Changed since</span> : <span className="badge badge-no">Not yet</span>}</td>
                {(editable || managing) && <td><button type="button" className="act" disabled={busy} onClick={() => run({ action: "verifyProfile", userId: t.id, verified: !t.verified }, t.verified ? "Marked as not verified." : `${t.name}'s profile verified.`)}>{t.verified ? "Undo" : "Mark verified"}</button></td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ margin: 0 }}>
        <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>Your confirmation</h3>
        <div style={{ display: "grid", gap: 6, fontSize: 13.5, marginBottom: 10 }}>
          {checklist.map((c) => (
            <label key={c} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <input type="checkbox" checked={!!checked[c]} disabled={!editable && !managing} onChange={(e) => setChecked({ ...checked, [c]: e.target.checked })} style={{ marginTop: 3 }} /> {c}
            </label>
          ))}
        </div>
        {fields.map((f) => (
          <label key={f.key} style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--slate)", marginBottom: 8 }}>{f.label}
            {f.type === "textarea"
              ? <textarea rows={4} value={vals[f.key] || ""} disabled={!editable && !managing} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} style={{ width: "100%" }} />
              : <input type={f.type} value={vals[f.key] || ""} disabled={!editable && !managing} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} style={{ padding: "6px 8px" }} />}
          </label>
        ))}
        {(editable || managing) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={save}>Save</button>
            {canSubmit && <button type="button" className="btn btn-brass btn-sm" disabled={busy || !allTicked} onClick={submit} title={allTicked ? "" : "Tick every point first"}>Verify and sign off</button>}
            {canSubmit && !allTicked && <span className="small-note">Tick every point to sign off (explain anything that isn&apos;t so in the notes).</span>}
          </div>
        )}
      </div>

      <div className="card" style={{ margin: 0 }}>
        <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>Evidence ({files.length})</h3>
        {files.length === 0 ? <p className="small-note" style={{ margin: "0 0 8px" }}>No documents attached to this task yet.</p> : (
          <ul style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: 13 }}>
            {files.map((f) => (
              <li key={f.id}><a href={`/api/accreditation/tasks/${taskId}?file=${f.id}`}>{f.title}</a> <span className="small-note">{f.fileName} · {Math.round(f.size / 1024)} KB · {f.by}</span>
                {(managing || (editable && f.mine)) && <> <button type="button" className="act act-danger" disabled={busy} onClick={() => { if (window.confirm(`Remove ${f.fileName}?`)) run({ action: "deleteFile", fileId: f.id }, "Removed."); }}>Remove</button></>}
              </li>
            ))}
          </ul>
        )}
        {(editable || managing) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <input type="file" onChange={(e) => setUpload(e.target.files?.[0] || null)} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.txt" aria-label="Choose a file" />
            <input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="What it is (optional)" style={{ padding: "5px 8px", flex: "1 1 200px" }} />
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !upload} onClick={attach}>Attach</button>
            <span className="small-note">PDF, Word, Excel, PowerPoint, image or text; up to 3 MB.</span>
          </div>
        )}
      </div>

      {managing && (
        <div className="card" style={{ margin: 0 }}>
          <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>Review</h3>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note to the assignee (needed to return the work)" aria-label="Review note" style={{ width: "100%", marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {status === "SUBMITTED" && <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={() => run({ action: "approve", note }, "Approved.")}>Approve</button>}
            {status === "SUBMITTED" && <button type="button" className="btn btn-secondary btn-sm" disabled={busy || note.trim().length < 3} onClick={() => run({ action: "return", note }, "Returned to the assignee.")}>Return for changes</button>}
            {status !== "SUBMITTED" && status !== "APPROVED" && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => { if (window.confirm("Approve without the assignee's sign-off? This is recorded as an override.")) run({ action: "approve", note }, "Approved (override)."); }}>Override and approve</button>}
            {status === "APPROVED" && <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run({ action: "reopen" }, "Reopened.")}>Reopen</button>}
          </div>
        </div>
      )}
      {msg && <p role="status" style={{ fontSize: 13, margin: 0, color: msg.ok ? "var(--sage)" : "var(--rust)" }}>{msg.text}</p>}
    </div>
  );
}
