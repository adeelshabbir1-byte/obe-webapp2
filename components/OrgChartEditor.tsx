"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Position = { id: string; parentId: string | null; title: string; role: string; facultyId: string | null; departmentId: string | null; program: string | null; holderId: string | null; covers: string[] };
type Person = { id: string; name: string; email: string; role: string; departmentId: string | null; designation: string | null; employmentType: string | null };
type Duty = { duty: string; scope: string; coveredBy: string | null; vacant: boolean; suggest: { positionId: string; role: string; title: string } | null };
type Props = {
  chairmanId: string; positions: Position[]; people: Person[]; duties: Duty[];
  faculties: { id: string; name: string }[]; departments: { id: string; name: string }[]; programs: { name: string; departmentId: string | null }[];
  roles: { value: string; label: string; scope: string }[]; history: { at: string; title: string; who: string; action: string }[];
};

const post = async (url: string, body: unknown) => {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, error: d.error as string | undefined };
};

export default function OrgChartEditor(p: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [edit, setEdit] = useState<Partial<Position> & { isNew?: boolean } | null>(null);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const byId = useMemo(() => new Map(p.positions.map((x) => [x.id, x])), [p.positions]);
  const person = useMemo(() => new Map(p.people.map((x) => [x.id, x])), [p.people]);
  const kids = (id: string | null) => p.positions.filter((x) => x.parentId === id);
  const roleLabel = (r: string) => p.roles.find((x) => x.value === r)?.label || r;
  const scopeText = (x: Partial<Position>) => x.program || p.departments.find((d) => d.id === x.departmentId)?.name || p.faculties.find((f) => f.id === x.facultyId)?.name || "";
  const holdsCount = (uid: string) => p.positions.filter((x) => x.holderId === uid).length;

  // Give / take the system role(s) a position carries, through the existing role endpoints.
  async function roleCall(pos: Position, role: string, userId: string, revoke: boolean) {
    if (userId === p.chairmanId || role === "NONE") return { ok: true } as { ok: boolean; error?: string };
    let r;
    if (role === "OMC") r = await post("/api/chairman/omc-hat", { userId, ...(revoke ? { action: "REVOKE" } : {}) });
    else if (role === "COURSE_ASSIGNER") r = await post("/api/chairman/assigner-hat", { userId, ...(revoke ? { action: "REVOKE" } : { term: "ALWAYS" }) });
    else if (revoke) r = await post("/api/chairman/give-role", { userId, action: "REVOKE", role: role === "PROGRAM_LEAD" ? "PROGRAM_COORDINATOR" : role });
    else r = await post("/api/chairman/give-role", { userId, role, facultyId: pos.facultyId, departmentId: pos.departmentId, program: pos.program });
    if (!r.ok && /already holds|already/i.test(r.error || "")) return { ok: true };
    return r;
  }
  async function assign(pos: Position, userId: string) {
    setBusy(true); setMsg("");
    if (pos.holderId && pos.holderId !== userId) { const out = await unassignInner(pos); if (!out) { setBusy(false); return; } }
    for (const role of [pos.role, ...pos.covers]) {
      const r = await roleCall(pos, role, userId, false);
      if (!r.ok) { setMsg(`${person.get(userId)?.name}: ${r.error || "could not give the role"}`); setBusy(false); return; }
    }
    const r = await post("/api/org/positions", { action: "assign", id: pos.id, userId });
    setBusy(false);
    if (!r.ok) setMsg(r.error || "Could not save."); else router.refresh();
  }
  async function unassignInner(pos: Position) {
    if (!pos.holderId) return true;
    for (const role of [pos.role, ...pos.covers]) {
      // Keep the role if the same person holds it through another position.
      if (p.positions.some((x) => x.id !== pos.id && x.holderId === pos.holderId && (x.role === role || x.covers.includes(role)))) continue;
      const r = await roleCall(pos, role, pos.holderId, true);
      if (!r.ok) { setMsg(`${person.get(pos.holderId)?.name}: ${r.error || "could not remove the role"}`); return false; }
    }
    const r = await post("/api/org/positions", { action: "unassign", id: pos.id });
    if (!r.ok) { setMsg(r.error || "Could not save."); return false; }
    return true;
  }
  async function unassign(pos: Position) {
    if (!confirm(`Remove ${person.get(pos.holderId || "")?.name} from "${pos.title}"? Their system role from this position is removed too.`)) return;
    setBusy(true); setMsg("");
    const ok = await unassignInner(pos);
    setBusy(false); if (ok) router.refresh();
  }
  async function save() {
    if (!edit) return;
    setBusy(true); setMsg("");
    const r = await post("/api/org/positions", { action: edit.isNew ? "create" : "update", ...edit });
    setBusy(false);
    if (!r.ok) setMsg(r.error || "Could not save."); else { setEdit(null); router.refresh(); }
  }
  async function act(body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true); setMsg("");
    const r = await post("/api/org/positions", body);
    setBusy(false);
    if (!r.ok) setMsg(r.error || "Could not save."); else router.refresh();
  }
  async function acceptCover(d: Duty) {
    const pos = d.suggest && byId.get(d.suggest.positionId); if (!pos || !d.suggest) return;
    const dep = p.departments.find((x) => x.name === d.scope)?.id, prog = p.programs.find((x) => x.name === d.scope)?.name;
    if (!confirm(`"${pos.title}" will also cover: ${d.duty} (${d.scope}).`)) return;
    setBusy(true); setMsg("");
    const scoped = { ...pos, departmentId: pos.departmentId || dep || null, program: pos.program || prog || null };
    if (pos.holderId) { const r = await roleCall(scoped, d.suggest.role, pos.holderId, false); if (!r.ok) { setMsg(r.error || "Could not give the role."); setBusy(false); return; } }
    const r = await post("/api/org/positions", { action: "cover", id: pos.id, role: d.suggest.role, on: true, departmentId: dep, program: prog });
    setBusy(false); if (!r.ok) setMsg(r.error || "Could not save."); else router.refresh();
  }

  const shownPeople = p.people.filter((x) => (!dept || x.departmentId === dept) && (!q || `${x.name} ${x.email} ${x.designation || ""}`.toLowerCase().includes(q.toLowerCase())));
  const badge = (t: string | null) => t && t !== "Permanent" ? <span style={{ fontSize: 10, background: t === "Visiting" ? "#FBF3E4" : "#EEF2F8", color: t === "Visiting" ? "#7A520C" : "#1B4F8A", borderRadius: 4, padding: "0 5px", marginLeft: 4 }}>{t}</span> : null;

  function Node({ pos, depth }: { pos: Position; depth: number }) {
    const h = pos.holderId ? person.get(pos.holderId) : null;
    return (
      <div style={{ marginLeft: depth ? 22 : 0, borderLeft: depth ? "2px solid #E6DADC" : undefined, paddingLeft: depth ? 10 : 0 }}>
        <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (drag) assign(pos, drag); setDrag(null); }}
          style={{ background: "#fff", border: `1px solid ${pos.holderId ? "#E6DADC" : "#F0B9B0"}`, borderRadius: 10, padding: "8px 12px", margin: "6px 0", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ minWidth: 200, flex: 1 }}>
            <b>{pos.title}</b>
            <div style={{ fontSize: 11.5, color: "var(--slate)" }}>{pos.role === "NONE" ? "title only" : roleLabel(pos.role)}{scopeText(pos) ? ` · ${scopeText(pos)}` : ""}</div>
            {pos.covers.length > 0 && <div style={{ fontSize: 11.5, color: "#6B3F8A" }}>also covers: {pos.covers.map(roleLabel).join(", ")}</div>}
          </div>
          <div style={{ minWidth: 180 }}>
            {h ? <span style={{ fontWeight: 600 }}>{h.name}{badge(h.employmentType)}<div style={{ fontSize: 11, color: "var(--slate)", fontWeight: 400 }}>{h.designation || h.email}</div></span>
              : <span style={{ color: "#B3261E", fontWeight: 700 }}>Vacant <span style={{ fontWeight: 400, fontSize: 11 }}>— drag a person here</span></span>}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <select disabled={busy} value="" onChange={(e) => e.target.value && assign(pos, e.target.value)} style={{ maxWidth: 160, fontSize: 12 }}>
              <option value="">{h ? "Change person…" : "Assign person…"}</option>
              {p.people.filter((x) => !pos.departmentId || !x.departmentId || x.departmentId === pos.departmentId || pos.role === "NONE").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            {h && pos.holderId !== p.chairmanId && <button className="act act-danger" disabled={busy} onClick={() => unassign(pos)}>Remove</button>}
            <button className="act" disabled={busy} onClick={() => setEdit({ isNew: true, parentId: pos.id, title: "", role: "NONE" })}>+ Below</button>
            <button className="act" disabled={busy} onClick={() => setEdit({ ...pos })}>Edit</button>
            {!h && <button className="act act-danger" disabled={busy} onClick={() => act({ action: "delete", id: pos.id }, `Delete "${pos.title}"?`)}>Delete</button>}
            {pos.covers.map((c) => <button key={c} className="act" disabled={busy} title="Stop covering this duty" onClick={() => act({ action: "cover", id: pos.id, role: c, on: false })}>✕ {roleLabel(c)}</button>)}
          </div>
        </div>
        {kids(pos.id).map((k) => <Node key={k.id} pos={k} depth={depth + 1} />)}
      </div>
    );
  }

  const scopeOf = (role?: string) => p.roles.find((r) => r.value === role)?.scope || "none";
  const open = p.duties.filter((d) => !d.coveredBy || d.vacant);

  return (
    <div>
      {msg && <div className="err">{msg}</div>}
      {p.positions.length === 0 ? (
        <div className="card">
          <p style={{ marginTop: 0 }}>No chart yet. Start from what the app already knows (departments, programs, current Chairmen, Program Leads, OMC and Course Assigners) — you can rename and rearrange everything afterwards.</p>
          <button className="btn" disabled={busy} onClick={() => act({ action: "seed" })}>Fill from current assignments</button>{" "}
          <button className="btn btn-secondary" disabled={busy} onClick={() => act({ action: "create", title: "Institute Head", role: "NONE" })}>Start empty</button>
        </div>
      ) : (
        <>
          <div className="card" style={{ borderLeft: `4px solid ${open.length ? "#B7791F" : "#2E7D4F"}` }}>
            <b>{open.length ? `${open.length} dut${open.length > 1 ? "ies" : "y"} not covered` : "Every duty is covered ✓"}</b>
            {open.map((d, i) => (
              <div key={i} style={{ fontSize: 12.5, marginTop: 4 }}>
                <b>{d.duty}</b> — {d.scope}: {d.vacant ? <span style={{ color: "#B3261E" }}>position {d.coveredBy} is vacant</span> : <span style={{ color: "#B3261E" }}>no position</span>}
                {d.suggest && <> · suggestion: <b>{d.suggest.title}</b> also covers it <button className="act" disabled={busy} onClick={() => acceptCover(d)}>Accept</button> <span style={{ color: "var(--slate)" }}>(or add a position for it)</span></>}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 280px", gap: 14, alignItems: "start" }}>
            <div className="card" style={{ overflowX: "auto" }}>
              {kids(null).map((r) => <Node key={r.id} pos={r} depth={0} />)}
              <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setEdit({ isNew: true, parentId: null, title: "", role: "NONE" })}>+ Add a top-level position</button>
            </div>
            <div className="card" style={{ position: "sticky", top: 10, maxHeight: "80vh", overflow: "auto" }}>
              <b>People</b> <span style={{ fontSize: 11.5, color: "var(--slate)" }}>drag onto a position</span>
              <input type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", margin: "6px 0" }} />
              <select value={dept} onChange={(e) => setDept(e.target.value)} style={{ width: "100%", marginBottom: 6 }}><option value="">All departments</option>{p.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
              {shownPeople.map((x) => (
                <div key={x.id} draggable onDragStart={() => setDrag(x.id)} onDragEnd={() => setDrag(null)} style={{ padding: "6px 8px", border: "1px solid #EEE7E8", borderRadius: 8, marginBottom: 5, cursor: "grab", fontSize: 12.5, background: "#fff" }}>
                  <b>{x.name}</b>{badge(x.employmentType)}
                  <div style={{ fontSize: 11, color: "var(--slate)" }}>{x.designation || x.email}{holdsCount(x.id) ? ` · ${holdsCount(x.id)} position${holdsCount(x.id) > 1 ? "s" : ""}` : ""}</div>
                </div>
              ))}
              {shownPeople.length === 0 && <div style={{ fontSize: 12, color: "var(--slate)" }}>No one matches. Add people with Upload Employees.</div>}
            </div>
          </div>
          {p.history.length > 0 && (
            <details className="card"><summary style={{ cursor: "pointer" }}><b>History</b> (latest {p.history.length})</summary>
              <table style={{ marginTop: 6 }}><tbody>{p.history.map((h, i) => <tr key={i}><td style={{ whiteSpace: "nowrap" }}>{h.at}</td><td>{h.who}</td><td>{h.action === "ASSIGNED" ? "took" : "left"}</td><td>{h.title}</td></tr>)}</tbody></table>
            </details>
          )}
        </>
      )}

      {edit && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setEdit(null)}>
          <div className="card" style={{ width: "min(480px, 92vw)", margin: 0 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{edit.isNew ? "New position" : "Edit position"}</h3>
            <label style={{ fontSize: 12.5, display: "block" }}>Designation (your institute&apos;s own title)<input value={edit.title || ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="e.g. HoD Computer Science, QEC In-charge" style={{ width: "100%" }} /></label>
            <label style={{ fontSize: 12.5, display: "block", marginTop: 8 }}>System role it gives<select value={edit.role || "NONE"} onChange={(e) => setEdit({ ...edit, role: e.target.value })} style={{ width: "100%" }}>{p.roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
            {scopeOf(edit.role) === "faculty" && <label style={{ fontSize: 12.5, display: "block", marginTop: 8 }}>Faculty<select value={edit.facultyId || ""} onChange={(e) => setEdit({ ...edit, facultyId: e.target.value })} style={{ width: "100%" }}><option value="">—</option>{p.faculties.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
            {(scopeOf(edit.role) === "department" || scopeOf(edit.role) === "program" || edit.role === "NONE") && <label style={{ fontSize: 12.5, display: "block", marginTop: 8 }}>Department{edit.role === "NONE" ? " (optional)" : ""}<select value={edit.departmentId || ""} onChange={(e) => setEdit({ ...edit, departmentId: e.target.value })} style={{ width: "100%" }}><option value="">—</option>{p.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
            {scopeOf(edit.role) === "program" && <label style={{ fontSize: 12.5, display: "block", marginTop: 8 }}>Program<select value={edit.program || ""} onChange={(e) => setEdit({ ...edit, program: e.target.value })} style={{ width: "100%" }}><option value="">—</option>{p.programs.filter((x) => !edit.departmentId || x.departmentId === edit.departmentId).map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}</select></label>}
            <label style={{ fontSize: 12.5, display: "block", marginTop: 8 }}>Reports to<select value={edit.parentId || ""} onChange={(e) => setEdit({ ...edit, parentId: e.target.value || null })} style={{ width: "100%" }}><option value="">— top level —</option>{p.positions.filter((x) => x.id !== edit.id).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
            {!edit.isNew && edit.holderId && <p style={{ fontSize: 11.5, color: "#95650F" }}>Changing the role or scope here does not move the current holder&apos;s role — remove them, save, then assign again.</p>}
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}><button className="btn btn-secondary" onClick={() => setEdit(null)}>Cancel</button><button className="btn" disabled={busy || !edit.title?.trim()} onClick={save}>Save</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
