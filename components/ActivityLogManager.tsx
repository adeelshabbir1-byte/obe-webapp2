"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TabbedCards from "./TabbedCards";

type Item = { id: string; title: string; category: string; activityDate: string; organizer: string | null; venue: string | null; participants: number | null; description: string | null; outcome: string | null; photo: string | null; batchId: string | null; batchLabel: string };

function shrink(file: File, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); resolve(c.toDataURL("image/jpeg", 0.75)); };
    img.onerror = () => reject(new Error("could not read that picture")); img.src = url;
  });
}

export default function ActivityLogManager({ items, categories, batches }: { items: Item[]; categories: string[]; batches: { id: string; label: string }[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState(""); const [ok, setOk] = useState(false);
  const cur = editing && editing !== "new" ? editing : null;
  const shown = items.filter((i) => !filter || i.category === filter);
  const counts = categories.map((c) => ({ c, n: items.filter((i) => i.category === c).length }));
  const maxN = Math.max(1, ...counts.map((x) => x.n));
  const inp = { padding: "6px 8px", border: "1px solid var(--line)", width: "100%" } as const;
  const f = (label: string, el: React.ReactNode, wide?: boolean) => <div className="field" style={wide ? { gridColumn: "1 / -1" } : undefined}><label>{label}</label>{el}</div>;

  function open(i: Item | "new") { setEditing(i); setPhoto(i === "new" ? null : i.photo); }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body: Record<string, unknown> = Object.fromEntries(Array.from(new FormData(e.currentTarget).entries()));
    body.photo = photo; if (cur) body.id = cur.id;
    const res = await fetch("/api/coordinator/activities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setOk(res.ok); setMsg(res.ok ? "Saved." : d.error || "Something went wrong");
    if (res.ok) { setEditing(null); router.refresh(); }
  }
  async function remove(i: Item) {
    if (!window.confirm(`Delete "${i.title}"?`)) return;
    const res = await fetch(`/api/coordinator/activities?id=${i.id}`, { method: "DELETE" });
    setOk(res.ok); setMsg(res.ok ? "Deleted." : "Could not delete"); if (res.ok) router.refresh();
  }

  return (
    <>
      {msg && <div className="card" style={{ color: ok ? "var(--sage)" : "#b3261e" }}>{msg}</div>}
      <TabbedCards>
        <div data-tab="Activities">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
            {!editing && <button className="btn btn-brass" onClick={() => open("new")}>Log an activity</button>}
            <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: "5px 8px" }}><option value="">All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
          </div>
          {editing && (
            <form className="card" onSubmit={submit}>
              <h3 style={{ marginTop: 0 }}>{cur ? "Change activity" : "Log an activity"}</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
                {f("Title *", <input name="title" required defaultValue={cur?.title || ""} style={inp} />)}
                {f("Category *", <select name="category" required defaultValue={cur?.category || ""} style={inp}><option value="" disabled>— choose —</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>)}
                {f("Date *", <input name="activityDate" type="date" required defaultValue={cur?.activityDate.slice(0, 10) || ""} style={inp} />)}
                {f("Batch (optional)", <select name="batchId" defaultValue={cur?.batchId || ""} style={inp}><option value="">All students</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select>)}
                {f("Organised by", <input name="organizer" defaultValue={cur?.organizer || ""} style={inp} />)}
                {f("Venue", <input name="venue" defaultValue={cur?.venue || ""} style={inp} />)}
                {f("Students who took part", <input name="participants" type="number" min={0} defaultValue={cur?.participants ?? ""} style={inp} />)}
                {f("What happened", <textarea name="description" rows={3} defaultValue={cur?.description || ""} style={inp} />, true)}
                {f("Result / awards", <textarea name="outcome" rows={2} defaultValue={cur?.outcome || ""} style={inp} />, true)}
                {f("Picture", <>
                  {photo && <img src={photo} alt="" style={{ maxWidth: 220, maxHeight: 150, display: "block", marginBottom: 6, border: "1px solid var(--line)" }} />}
                  <input type="file" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (file) { try { setPhoto(await shrink(file, 900)); } catch { setOk(false); setMsg("could not read that picture"); } } }} />
                  {photo && <button type="button" className="btn" style={{ fontSize: 11, marginLeft: 8 }} onClick={() => setPhoto(null)}>Remove picture</button>}
                </>, true)}
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}><button className="btn btn-brass" type="submit">Save</button><button className="btn" type="button" onClick={() => setEditing(null)}>Cancel</button></div>
            </form>
          )}
          <div style={{ display: "grid", gap: 8 }}>
            {shown.length === 0 && <div className="card" style={{ color: "var(--slate)" }}>Nothing logged yet.</div>}
            {shown.map((i) => (
              <div key={i.id} className="card" style={{ display: "flex", gap: 14, alignItems: "flex-start", margin: 0 }}>
                {i.photo && <img src={i.photo} alt="" style={{ width: 120, height: 84, objectFit: "cover", border: "1px solid var(--line)" }} />}
                <div style={{ flex: 1, fontSize: 13 }}>
                  <b>{i.title}</b> <span className="badge badge-neutral" style={{ marginLeft: 6 }}>{i.category}</span>
                  <div style={{ color: "var(--slate)" }}>{[i.activityDate.slice(0, 10), i.venue, i.organizer && `by ${i.organizer}`, i.participants !== null && `${i.participants} students`, i.batchLabel].filter(Boolean).join(" · ")}</div>
                  {i.description && <div style={{ marginTop: 3 }}>{i.description}</div>}
                  {i.outcome && <div style={{ marginTop: 3 }}><b>Result:</b> {i.outcome}</div>}
                </div>
                <div style={{ whiteSpace: "nowrap" }}><button className="btn" style={{ fontSize: 12 }} onClick={() => open(i)}>Edit</button>{" "}<button className="btn" style={{ fontSize: 12 }} onClick={() => remove(i)}>Delete</button></div>
              </div>
            ))}
          </div>
        </div>
        <div className="card" data-tab="Summary">
          <h3 style={{ marginTop: 0 }}>Activities by category ({items.length} in total)</h3>
          {counts.map(({ c, n }) => (
            <div key={c} style={{ display: "grid", gridTemplateColumns: "210px 1fr 40px", gap: 10, alignItems: "center", fontSize: 13, padding: "3px 0" }}>
              <span>{c}</span><div style={{ background: "#ECE8E0", borderRadius: 6, height: 10 }}><div style={{ width: `${(n / maxN) * 100}%`, height: "100%", background: "#3d6b8f", borderRadius: 6 }} /></div><b style={{ textAlign: "right" }}>{n}</b>
            </div>
          ))}
          <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 0 }}>Students who took part (all entries): <b>{items.reduce((n, i) => n + (i.participants || 0), 0)}</b></p>
        </div>
      </TabbedCards>
    </>
  );
}
