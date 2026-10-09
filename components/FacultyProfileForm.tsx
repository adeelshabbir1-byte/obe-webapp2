"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TabbedCards from "./TabbedCards";
import { BLOOD_GROUPS, DESIGNATIONS, EMPLOYMENT_TYPES, KINDS, type KindDef } from "../lib/facultyProfile";

type Profile = { photo?: string | null; designation?: string | null; employmentType?: string | null; dateOfJoining?: string | null; dateOfBirth?: string | null; gender?: string | null; bloodGroup?: string | null; phone?: string | null; address?: string | null; nextOfKinName?: string | null; nextOfKinRelation?: string | null; nextOfKinPhone?: string | null; nextOfKinAddress?: string | null };
type Rec = { id: string; kind: string; title: string; organisation?: string | null; role?: string | null; startYear?: number | null; endYear?: number | null; amount?: string | null; status?: string | null; link?: string | null; details?: string | null; photo?: string | null };

// Shrinks a picture in the browser so it stays small enough to keep with the profile.
function shrink(file: File, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = () => reject(new Error("could not read that picture"));
    img.src = url;
  });
}
const day = (v?: string | null) => (v ? String(v).slice(0, 10) : "");

export default function FacultyProfileForm({ profile, records, name }: { profile: Profile | null; records: Rec[]; name: string }) {
  const router = useRouter();
  const [photo, setPhoto] = useState<string | null>(profile?.photo || null);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState(false);

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg("");
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries(Array.from(fd.entries()).filter(([, v]) => typeof v === "string"));
    body.photo = photo;
    const res = await fetch("/api/faculty-profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setOk(res.ok); setMsg(res.ok ? "Saved." : d.error || "Something went wrong");
    if (res.ok) router.refresh();
  }
  async function pickPhoto(f: File | undefined) {
    if (!f) return;
    try { setPhoto(await shrink(f, 360)); } catch (err) { setOk(false); setMsg((err as Error).message); }
  }

  const input = { padding: "6px 8px", border: "1px solid var(--line)", width: "100%" } as const;
  const f = (label: string, el: React.ReactNode) => <div className="field"><label>{label}</label>{el}</div>;

  return (
    <>
      {msg && <div className="card" style={{ color: ok ? "var(--sage)" : "#b3261e" }}>{msg}</div>}
      <TabbedCards>
        <div className="card" data-tab="Personal & employment">
          <form onSubmit={saveProfile}>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ width: 130, height: 160, border: "1px solid var(--line)", background: "#f4f1ea", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {photo ? <img src={photo} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ color: "var(--slate)", fontSize: 12 }}>No picture</span>}
                </div>
                <label className="btn" style={{ display: "inline-block", marginTop: 8, fontSize: 12, cursor: "pointer" }}>Choose picture
                  <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => pickPhoto(e.target.files?.[0])} />
                </label>
                {photo && <div><button type="button" className="btn" style={{ fontSize: 11, marginTop: 4 }} onClick={() => setPhoto(null)}>Remove</button></div>}
              </div>
              <div style={{ flex: 1, minWidth: 280, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                {f("Name", <input value={name} readOnly style={{ ...input, background: "#f4f1ea" }} />)}
                {f("Designation", <select name="designation" defaultValue={profile?.designation || ""} style={input}><option value="">— choose —</option>{DESIGNATIONS.map((d) => <option key={d}>{d}</option>)}</select>)}
                {f("Employment type", <select name="employmentType" defaultValue={profile?.employmentType || ""} style={input}><option value="">— choose —</option>{EMPLOYMENT_TYPES.map((d) => <option key={d}>{d}</option>)}</select>)}
                {f("Date of joining", <input type="date" name="dateOfJoining" defaultValue={day(profile?.dateOfJoining)} style={input} />)}
                {f("Date of birth", <input type="date" name="dateOfBirth" defaultValue={day(profile?.dateOfBirth)} style={input} />)}
                {f("Gender", <select name="gender" defaultValue={profile?.gender || ""} style={input}><option value="">— choose —</option><option>Male</option><option>Female</option><option>Other</option></select>)}
                {f("Blood group", <select name="bloodGroup" defaultValue={profile?.bloodGroup || ""} style={input}><option value="">— choose —</option>{BLOOD_GROUPS.map((d) => <option key={d}>{d}</option>)}</select>)}
                {f("Phone", <input name="phone" defaultValue={profile?.phone || ""} style={input} />)}
                {f("Address", <input name="address" defaultValue={profile?.address || ""} style={input} />)}
              </div>
            </div>
            <button className="btn btn-brass" type="submit" style={{ marginTop: 14 }}>Save</button>
          </form>
        </div>

        <div className="card" data-tab="Next of kin">
          <h3 style={{ marginTop: 0 }}>Next of kin</h3>
          <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>The person to contact in an emergency.</p>
          <form onSubmit={saveProfile}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, maxWidth: 760 }}>
              {f("Full name", <input name="nextOfKinName" defaultValue={profile?.nextOfKinName || ""} style={input} />)}
              {f("Relationship", <input name="nextOfKinRelation" defaultValue={profile?.nextOfKinRelation || ""} placeholder="e.g. Spouse, Father" style={input} />)}
              {f("Phone", <input name="nextOfKinPhone" defaultValue={profile?.nextOfKinPhone || ""} style={input} />)}
              {f("Address", <input name="nextOfKinAddress" defaultValue={profile?.nextOfKinAddress || ""} style={input} />)}
            </div>
            <button className="btn btn-brass" type="submit" style={{ marginTop: 14 }}>Save</button>
          </form>
        </div>

        {KINDS.map((k) => <RecordSection key={k.kind} data-tab={k.tab} def={k} items={records.filter((r) => r.kind === k.kind)} onDone={(m, good) => { setMsg(m); setOk(good); if (good) router.refresh(); }} />)}
      </TabbedCards>
    </>
  );
}

function RecordSection({ def, items, onDone }: { def: KindDef; items: Rec[]; onDone: (msg: string, ok: boolean) => void; "data-tab"?: string }) {
  const [editing, setEditing] = useState<Rec | "new" | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const start = (r: Rec | "new") => { setEditing(r); setPhoto(r === "new" ? null : r.photo || null); };

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { kind: def.kind, id: editing !== "new" && editing ? editing.id : undefined };
    def.fields.forEach((fl) => { body[fl.key] = fd.get(fl.key); });
    if (def.photo) body.photo = photo;
    const res = await fetch("/api/faculty-profile/records", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) setEditing(null);
    onDone(res.ok ? "Saved." : d.error || "Something went wrong", res.ok);
  }
  async function remove(id: string) {
    if (!window.confirm("Delete this entry?")) return;
    const res = await fetch(`/api/faculty-profile/records?id=${id}`, { method: "DELETE" });
    onDone(res.ok ? "Deleted." : "Could not delete", res.ok);
  }
  const cur = editing && editing !== "new" ? (editing as unknown as Record<string, unknown>) : {};

  return (
    <div className="card" data-tab={def.tab}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>{def.heading} ({items.length})</h3>
        {!editing && <button className="btn btn-brass" onClick={() => start("new")}>{def.addLabel}</button>}
      </div>
      {editing && (
        <form onSubmit={submit} style={{ margin: "14px 0", padding: 12, border: "1px solid var(--line)", background: "#faf8f3" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {def.fields.map((fl) => (
              <div className="field" key={fl.key} style={fl.type === "area" ? { gridColumn: "1 / -1" } : undefined}>
                <label>{fl.label}{fl.required ? " *" : ""}</label>
                {fl.type === "area" ? <textarea name={fl.key} rows={3} defaultValue={String(cur[fl.key] ?? "")} style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--line)" }} />
                  : fl.type === "select" ? <select name={fl.key} defaultValue={String(cur[fl.key] ?? "")} style={{ padding: "6px 8px", border: "1px solid var(--line)", width: "100%" }}><option value="">— choose —</option>{fl.options!.map((o) => <option key={o}>{o}</option>)}</select>
                  : <input name={fl.key} type={fl.type === "year" ? "number" : "text"} min={fl.type === "year" ? 1950 : undefined} max={fl.type === "year" ? 2100 : undefined} required={fl.required} defaultValue={String(cur[fl.key] ?? "")} style={{ padding: "6px 8px", border: "1px solid var(--line)", width: "100%" }} />}
              </div>
            ))}
            {def.photo && (
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Picture from the event</label>
                {photo && <img src={photo} alt="Event" style={{ maxWidth: 220, maxHeight: 150, display: "block", marginBottom: 6, border: "1px solid var(--line)" }} />}
                <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { try { setPhoto(await shrink(f, 900)); } catch { onDone("could not read that picture", false); } } }} />
                {photo && <button type="button" className="btn" style={{ fontSize: 11, marginLeft: 8 }} onClick={() => setPhoto(null)}>Remove picture</button>}
              </div>
            )}
          </div>
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <button className="btn btn-brass" type="submit">Save</button>
            <button className="btn" type="button" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}
      {items.length === 0 && !editing && <p style={{ color: "var(--slate)", fontSize: 13 }}>Nothing added yet.</p>}
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        {items.map((r) => (
          <div key={r.id} style={{ display: "flex", gap: 12, padding: "10px 12px", border: "1px solid var(--line)", alignItems: "flex-start" }}>
            {r.photo && <img src={r.photo} alt="" style={{ width: 90, height: 64, objectFit: "cover", border: "1px solid var(--line)" }} />}
            <div style={{ flex: 1, fontSize: 13 }}>
              <b>{r.title}</b>
              <div style={{ color: "var(--slate)" }}>
                {[r.organisation, r.role, r.startYear ? `${r.startYear}${r.endYear ? `–${r.endYear}` : ""}` : null, r.amount, r.status].filter(Boolean).join(" · ")}
              </div>
              {r.details && <div style={{ marginTop: 3 }}>{r.details}</div>}
              {r.link && <div style={{ marginTop: 3, wordBreak: "break-all" }}>{r.link}</div>}
            </div>
            <div style={{ whiteSpace: "nowrap" }}>
              <button className="btn" style={{ fontSize: 12 }} onClick={() => start(r)}>Edit</button>{" "}
              <button className="btn" style={{ fontSize: 12 }} onClick={() => remove(r.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
