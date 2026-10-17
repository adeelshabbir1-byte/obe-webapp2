"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PortfolioForm({ kinds, plos }: { kinds: [string, string][]; plos: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMsg("");
    const fd = new FormData(e.currentTarget); fd.set("ploCodes", sel.join(","));
    const r = await fetch("/api/student/portfolio", { method: "POST", body: fd });
    const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) { setMsg(d.error || "Could not save."); return; }
    (e.target as HTMLFormElement).reset(); setSel([]); setOpen(false); router.refresh();
  }
  if (!open) return <button className="btn btn-sm" type="button" onClick={() => setOpen(true)}>Add to my portfolio</button>;
  const lab = { display: "block", fontSize: 13, marginBottom: 8 } as const;
  return (
    <form onSubmit={submit} className="card">
      <label style={lab}>Title<input name="title" required style={{ width: "100%" }} /></label>
      <label style={lab}>Type<select name="kind">{kinds.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label style={lab}>What you did and what you learned<textarea name="description" rows={3} style={{ width: "100%" }} /></label>
      <label style={lab}>Link (GitHub, demo, certificate)<input name="link" type="url" style={{ width: "100%" }} /></label>
      <label style={lab}>File (PDF or image, up to 8 MB)<input name="file" type="file" accept=".pdf,image/*" /></label>
      {plos.length > 0 && <div style={lab}>Graduate attributes this shows: {plos.map((p) => <label key={p} style={{ marginRight: 10 }}><input type="checkbox" checked={sel.includes(p)} onChange={(e) => setSel(e.target.checked ? [...sel, p] : sel.filter((x) => x !== p))} /> {p}</label>)}</div>}
      {msg && <div className="err">{msg}</div>}
      <button className="btn btn-sm" disabled={busy}>{busy ? "Saving…" : "Save"}</button> <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
    </form>
  );
}
