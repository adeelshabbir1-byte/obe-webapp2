"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Person = { id: string; name: string; department: string | null };
type Society = { id: string; name: string; category: string; advisorId: string | null; departmentId: string | null; description: string | null; foundedYear: number | null; isActive: boolean };
type Member = { id: string; name: string; rollNumber: string | null; position: string; term: string };
type Event = { id: string; title: string; category: string; eventDate: string; venue: string | null; participants: number | null; guests: string | null; description: string | null; outcome: string | null; budget: number | null };

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/student-activities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  return res.ok ? null : (data.error as string) || "Could not save.";
}
async function del(entity: string, id: string) {
  const res = await fetch(`/api/student-activities?entity=${entity}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
  const data = await res.json().catch(() => ({}));
  return res.ok ? null : (data.error as string) || "Could not remove.";
}

/** Add or edit a society (Student Affairs / Institute Head). */
export function SocietyForm({ society, people, categories, departments }: { society?: Society; people: Person[]; categories: Record<string, string>; departments: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Partial<Society>>(society || { category: "TECHNICAL", isActive: true });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return <button type="button" className={society ? "act act-primary" : "btn btn-brass btn-sm"} onClick={() => setOpen(true)}>{society ? "Edit society" : "Add a society"}</button>;
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", padding: 12, border: "1px dashed var(--line)", borderRadius: 8, margin: "8px 0" }}>
      <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Name<input value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ width: 220 }} /></label>
      <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Type<select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Faculty advisor<select value={f.advisorId || ""} onChange={(e) => setF({ ...f, advisorId: e.target.value || null })} style={{ maxWidth: 240 }}><option value="">— none yet —</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.department ? ` (${p.department})` : ""}</option>)}</select></label>
      <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Department<select value={f.departmentId || ""} onChange={(e) => setF({ ...f, departmentId: e.target.value || null })}><option value="">Institute-wide</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Founded<input type="number" value={f.foundedYear ?? ""} onChange={(e) => setF({ ...f, foundedYear: e.target.value ? Number(e.target.value) : null })} style={{ width: 90 }} /></label>
      <label style={{ fontSize: 12, display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" checked={f.isActive !== false} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Active</label>
      <label style={{ fontSize: 12, display: "grid", gap: 3, flex: "1 1 280px" }}>About<textarea rows={2} value={f.description || ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={async () => { setBusy(true); const e = await post({ entity: "society", ...f }); setBusy(false); if (e) setErr(e); else { setOpen(false); router.refresh(); } }}>Save</button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      {society && <button type="button" className="act act-danger" onClick={async () => { if (!confirm(`Remove ${society.name}?`)) return; const e = await del("society", society.id); if (e) setErr(e); else router.push("/student-activities"); }}>Remove</button>}
      {err && <div className="err" style={{ flexBasis: "100%" }}>{err}</div>}
    </div>
  );
}

/** Office bearers and events of one society (its advisor or Student Affairs). */
export function SocietyRecords({ societyId, canEdit, members, events, positions, eventCategories, session }: { societyId: string; canEdit: boolean; members: Member[]; events: Event[]; positions: string[]; eventCategories: string[]; session: string }) {
  const router = useRouter();
  const [m, setM] = useState<Partial<Member> | null>(null);
  const [ev, setEv] = useState<Partial<Event> | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(entity: string, data: Record<string, unknown>, done: () => void) {
    setBusy(true); setErr("");
    const e = await post({ entity, societyId, ...data });
    setBusy(false);
    if (e) { setErr(e); return; }
    done(); router.refresh();
  }
  async function remove(entity: string, id: string) {
    if (!confirm("Remove this record?")) return;
    const e = await del(entity, id);
    if (e) setErr(e); else router.refresh();
  }
  const terms = Array.from(new Set(members.map((x) => x.term))).sort().reverse();
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {err && <div className="err">{err}</div>}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Office bearers and members</h3>
          {canEdit && !m && <button type="button" className="btn btn-brass btn-sm" onClick={() => setM({ position: "President", term: session })}>Add a person</button>}
        </div>
        {m && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", padding: 12, border: "1px dashed var(--line)", borderRadius: 8, margin: "10px 0" }}>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Roll number<input value={m.rollNumber || ""} onChange={(e) => setM({ ...m, rollNumber: e.target.value })} style={{ width: 140 }} placeholder="links the student" /></label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Name<input value={m.name || ""} onChange={(e) => setM({ ...m, name: e.target.value })} style={{ width: 190 }} placeholder="filled from the roll number" /></label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Position<select value={m.position} onChange={(e) => setM({ ...m, position: e.target.value })}>{positions.map((p) => <option key={p}>{p}</option>)}</select></label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Session<input value={m.term || ""} onChange={(e) => setM({ ...m, term: e.target.value })} style={{ width: 90 }} /></label>
            <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={() => save("member", m, () => setM(null))}>Save</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setM(null)}>Cancel</button>
          </div>
        )}
        {members.length === 0 ? <p className="small-note">No one recorded yet.</p> : terms.map((t) => (
          <div key={t} style={{ marginTop: 8 }}>
            <h4 style={{ margin: "6px 0" }}>Session {t}</h4>
            <table>
              <thead><tr><th>Position</th><th>Name</th><th>Roll #</th><th></th></tr></thead>
              <tbody>
                {members.filter((x) => x.term === t).sort((a, b) => positions.indexOf(a.position) - positions.indexOf(b.position)).map((x) => (
                  <tr key={x.id}><td>{x.position}</td><td>{x.name}</td><td>{x.rollNumber || "—"}</td><td style={{ whiteSpace: "nowrap" }}>{canEdit && <><button type="button" className="act act-primary" onClick={() => setM(x)}>Edit</button>{" "}<button type="button" className="act act-danger" onClick={() => remove("member", x.id)}>Remove</button></>}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Events</h3>
          {canEdit && !ev && <button type="button" className="btn btn-brass btn-sm" onClick={() => setEv({ category: eventCategories[0], eventDate: new Date().toISOString().slice(0, 10) })}>Add an event</button>}
        </div>
        {ev && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", padding: 12, border: "1px dashed var(--line)", borderRadius: 8, margin: "10px 0" }}>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Title<input value={ev.title || ""} onChange={(e) => setEv({ ...ev, title: e.target.value })} style={{ width: 230 }} /></label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Type<select value={ev.category} onChange={(e) => setEv({ ...ev, category: e.target.value })}>{eventCategories.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Date<input type="date" value={ev.eventDate || ""} onChange={(e) => setEv({ ...ev, eventDate: e.target.value })} /></label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Venue<input value={ev.venue || ""} onChange={(e) => setEv({ ...ev, venue: e.target.value })} style={{ width: 150 }} /></label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Participants<input type="number" min={0} value={ev.participants ?? ""} onChange={(e) => setEv({ ...ev, participants: e.target.value ? Number(e.target.value) : null })} style={{ width: 100 }} /></label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Budget (PKR)<input type="number" min={0} value={ev.budget ?? ""} onChange={(e) => setEv({ ...ev, budget: e.target.value ? Number(e.target.value) : null })} style={{ width: 110 }} /></label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Guests / speakers<input value={ev.guests || ""} onChange={(e) => setEv({ ...ev, guests: e.target.value })} style={{ width: 200 }} /></label>
            <label style={{ fontSize: 12, display: "grid", gap: 3, flex: "1 1 260px" }}>What happened<textarea rows={2} value={ev.description || ""} onChange={(e) => setEv({ ...ev, description: e.target.value })} /></label>
            <label style={{ fontSize: 12, display: "grid", gap: 3, flex: "1 1 260px" }}>Outcome<textarea rows={2} value={ev.outcome || ""} onChange={(e) => setEv({ ...ev, outcome: e.target.value })} /></label>
            <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={() => save("event", ev, () => setEv(null))}>Save</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEv(null)}>Cancel</button>
          </div>
        )}
        {events.length === 0 ? <p className="small-note">No events recorded yet.</p> : (
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Date</th><th>Event</th><th>Participants</th><th>Outcome</th><th></th></tr></thead>
            <tbody>
              {events.map((x) => (
                <tr key={x.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{x.eventDate}</td>
                  <td><b>{x.title}</b><div className="small-note">{x.category}{x.venue ? ` · ${x.venue}` : ""}{x.guests ? ` · ${x.guests}` : ""}{x.budget ? ` · PKR ${x.budget.toLocaleString("en-US")}` : ""}</div>{x.description && <div style={{ fontSize: 12 }}>{x.description}</div>}</td>
                  <td>{x.participants ?? "—"}</td>
                  <td style={{ fontSize: 12, maxWidth: 300 }}>{x.outcome || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{canEdit && <><button type="button" className="act act-primary" onClick={() => setEv(x)}>Edit</button>{" "}<button type="button" className="act act-danger" onClick={() => remove("event", x.id)}>Remove</button></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
