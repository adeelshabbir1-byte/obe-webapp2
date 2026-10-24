"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Upload PDFs / screenshots straight to storage (a one-time link from the server), then register them on the document. */
export default function FileUpload({ docId }: { docId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [caption, setCaption] = useState("");
  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/regulations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || "Failed."); return d;
  }
  async function go(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setMsg("");
    try {
      for (const f of Array.from(files)) {
        if (!/^(application\/pdf|image\/(png|jpeg|webp|gif))$/.test(f.type)) throw new Error(`${f.name}: PDF or image files only.`);
        if (f.size > 30 * 1024 * 1024) throw new Error(`${f.name}: larger than 30 MB.`);
        setMsg(`Uploading ${f.name}…`);
        const l = await post({ action: "uploadLink", docId, name: f.name });
        const up = await fetch(l.uploadUrl, { method: "PUT", headers: { "Content-Type": f.type, "x-upsert": "false" }, body: f });
        if (!up.ok) throw new Error(`${f.name}: storage refused it (${up.status}).`);
        await post({ action: "attach", docId, path: l.path, name: f.name, mime: f.type, size: f.size, caption });
      }
      setMsg("Added."); setCaption(""); router.refresh();
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: 10, border: "1px dashed var(--line, #ccc)", borderRadius: 8 }}>
      <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (e.g. Notification, page 1)" style={{ width: 240 }} aria-label="Caption" />
      <label className="btn btn-secondary btn-sm" style={{ cursor: busy ? "wait" : "pointer" }}>{busy ? "Uploading…" : "Add PDF or screenshots"}<input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple hidden disabled={busy} onChange={(e) => go(e.target.files)} /></label>
      {msg && <span className="small-note">{msg}</span>}
    </div>
  );
}
