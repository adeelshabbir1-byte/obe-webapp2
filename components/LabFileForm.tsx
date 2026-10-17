"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LabFileForm({ labs, kinds, courses }: { labs: string[]; kinds: [string, string][]; courses: string[] }) {
  const router = useRouter(); const [open, setOpen] = useState(false); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  async function send(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); const r = await fetch("/api/lab-file", { method: "POST", body: new FormData(e.currentTarget) }); const d = await r.json().catch(() => ({})); setBusy(false); if (r.ok) { setOpen(false); router.refresh(); } else setMsg(d.error || "Failed."); }
  if (!open) return <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>Add a record</button>;
  const l = { display: "grid", gap: 3, fontSize: 12 } as const;
  return (
    <form onSubmit={send} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      <label style={l}>Lab<input name="lab" list="labs" required style={{ width: 160 }} /><datalist id="labs">{labs.map((x) => <option key={x} value={x} />)}</datalist></label>
      <label style={l}>Type<select name="kind">{kinds.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label style={l}>Title<input name="title" required style={{ width: 220 }} /></label>
      <label style={l}>Lab course (for manuals)<input name="courseCode" list="lcourses" style={{ width: 120 }} /><datalist id="lcourses">{courses.map((x) => <option key={x} value={x} />)}</datalist></label>
      <label style={l}>Date<input name="entryDate" type="date" /></label>
      <label style={l}>Note<input name="note" style={{ width: 200 }} /></label>
      <label style={l}>Document (optional)<input name="file" type="file" accept=".pdf,.doc,.docx,image/*" /></label>
      <button className="btn btn-sm" disabled={busy}>{busy ? "Saving…" : "Save"}</button><button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>{msg && <span className="err">{msg}</span>}
    </form>
  );
}
