"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Mod = { key: string; label: string; group: string; about: string };
type Inst = { id: string; name: string; email: string; programs: string[]; existing: string[]; locked: string[]; packageKey: string | null; note: string | null; validUntil: string | null; updatedAt: string | null };
type Pkg = { key: string; label: string; modules: string[] };

/** Super User: switch modules on or off for each institute, one card per institute. */
export default function ModuleMatrix({ modules, institutes, packages }: { modules: Mod[]; institutes: Inst[]; packages: Pkg[] }) {
  const router = useRouter();
  const all = modules.map((m) => m.key);
  const [state, setState] = useState<Record<string, { on: Set<string>; pkg: string; note: string; until: string; progs: string }>>(Object.fromEntries(institutes.map((i) => [i.id, { on: new Set(all.filter((k) => !i.locked.includes(k))), pkg: i.packageKey || "", note: i.note || "", until: i.validUntil || "", progs: i.programs.join("\n") }])));
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const groups = Array.from(new Set(modules.map((m) => m.group)));
  const set = (id: string, patch: Partial<{ on: Set<string>; pkg: string; note: string; until: string; progs: string }>) => setState({ ...state, [id]: { ...state[id], ...patch } });
  const toggle = (id: string, k: string) => { const on = new Set(state[id].on); if (on.has(k)) on.delete(k); else on.add(k); set(id, { on, pkg: "" }); };
  async function save(id: string) {
    const st = state[id];
    setMsg({ ...msg, [id]: "Saving…" });
    const r = await fetch("/api/admin/modules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chairmanId: id, on: Array.from(st.on), packageKey: st.pkg || null, note: st.note, validUntil: st.until || null, programs: st.progs.split("\n").map((x) => x.trim()).filter(Boolean) }) });
    const d = await r.json().catch(() => ({}));
    setMsg({ ...msg, [id]: r.ok ? `Saved — ${all.length - d.locked} of ${all.length} modules on. Takes effect within a minute.` : d.error || "Could not save" });
    if (r.ok) router.refresh();
  }
  const shown = institutes.filter((i) => !filter || `${i.name} ${i.email}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div>
      <input placeholder="Find an institute" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", marginBottom: 10, width: 280 }} />
      {shown.map((i) => { const st = state[i.id]; return (
        <div key={i.id} className="card">
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
            <h3 style={{ margin: 0 }}>{i.name} <span className="small-note">{i.email}</span></h3>
            <span className="small-note">{st.on.size} of {all.length} modules on{i.updatedAt ? ` · last changed ${i.updatedAt}` : " · never set (everything on)"}</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0", alignItems: "center" }}>
            <span style={{ fontSize: 12.5 }}>Apply a package:</span>
            {packages.map((p) => <button key={p.key} type="button" className={`btn btn-sm ${st.pkg === p.key ? "btn-brass" : "btn-secondary"}`} onClick={() => set(i.id, { on: new Set(p.modules), pkg: p.key })}>{p.label}</button>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 10 }}>
            {groups.map((g) => (
              <div key={g}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--slate)", marginBottom: 4 }}>{g}</div>
                {modules.filter((m) => m.group === g).map((m) => (
                  <label key={m.key} title={m.about} style={{ display: "block", fontSize: 13, padding: "2px 0" }}><input type="checkbox" checked={st.on.has(m.key)} onChange={() => toggle(i.id, m.key)} /> {m.label}</label>
                ))}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 12, display: "block" }}>Licensed programs — one per line; empty = any program<br />
              <textarea rows={3} value={st.progs} onChange={(e) => set(i.id, { progs: e.target.value })} placeholder="BBA" style={{ padding: "5px 7px", border: "1px solid var(--line)", width: "100%", maxWidth: 520, fontFamily: "inherit" }} /></label>
            {i.existing.length > 0 && <div style={{ fontSize: 12, color: "var(--slate)" }}>Programs this institute already has: {i.existing.map((x) => <button key={x} type="button" className="act" style={{ marginRight: 4 }} onClick={() => { const cur = st.progs.split("\n").map((y) => y.trim()).filter(Boolean); if (!cur.includes(x)) set(i.id, { progs: [...cur, x].join("\n") }); }}>+ {x}</button>)}</div>}
            <div style={{ fontSize: 12, color: "var(--slate)", marginTop: 2 }}>{st.progs.trim() ? `Only these programs; unlimited batches of each.` : "No program limit."}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
            <label style={{ fontSize: 12 }}>Paid until<br /><input type="date" value={st.until} onChange={(e) => set(i.id, { until: e.target.value })} style={{ padding: "5px 7px", border: "1px solid var(--line)" }} /></label>
            <label style={{ fontSize: 12 }}>Note (invoice, contract)<br /><input value={st.note} onChange={(e) => set(i.id, { note: e.target.value })} style={{ padding: "5px 7px", border: "1px solid var(--line)", width: 260 }} /></label>
            <button type="button" className="btn btn-brass" onClick={() => save(i.id)}>Save</button>
            <span style={{ fontSize: 12.5, color: "var(--slate)" }}>{msg[i.id]}</span>
          </div>
        </div>
      ); })}
    </div>
  );
}
