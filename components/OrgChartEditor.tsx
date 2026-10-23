"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "./Meaning";

type Position = { id: string; parentId: string | null; title: string; role: string; facultyId: string | null; departmentId: string | null; program: string | null; holderId: string | null; covers: string[]; offAt?: string | null };
type Person = { id: string; name: string; email: string; role: string; departmentId: string | null; designation: string | null; employmentType: string | null };
type Duty = { duty: string; scope: string; coveredBy: string | null; vacant: boolean; suggest: { positionId: string; role: string; title: string } | null };
type Acting = { id: string; positionId: string; userId: string; fromDate: string; toDate: string; reason: string | null };
type TitleRow = { key: string; label: string; default: string; examples: string; canSwitchOff: boolean; title: string; enabled: boolean };
type Effect = { kind: string; text: string };
type Props = {
  chairmanId: string; positions: Position[]; people: Person[]; duties: Duty[];
  faculties: { id: string; name: string }[]; departments: { id: string; name: string }[]; programs: { name: string; departmentId: string | null }[];
  roles: { value: string; label: string; scope: string }[]; history: { at: string; title: string; who: string; action: string; reason?: string | null }[];
  acting: Acting[]; since: Record<string, string>; coverage: Record<string, string>; lastMove: { id: string; title: string; at: string } | null;
  titles: TitleRow[]; titlesMissing: boolean;
};

const post = async (url: string, body: unknown) => {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, error: d.error as string | undefined, data: d };
};
const today = () => new Date().toISOString().slice(0, 10);

const CSS = `
.otree, .otree ul { list-style: none; margin: 0; padding: 0; }
.otree { width: max-content; min-width: 100%; padding: 4px 0 14px; }
.otree ul { display: flex; justify-content: center; padding-top: 20px; position: relative; }
.otree li { position: relative; padding: 20px 6px 0; display: flex; flex-direction: column; align-items: center; }
.otree > li { padding-top: 0; }
.otree li::before, .otree li::after { content: ""; position: absolute; top: 0; right: 50%; width: 50%; height: 20px; border-top: 2px solid #C9B9BC; }
.otree li::after { right: auto; left: 50%; border-left: 2px solid #C9B9BC; }
.otree li:only-child::before, .otree li:only-child::after { display: none; }
.otree li:only-child { padding-top: 0; }
.otree li:first-child::before, .otree li:last-child::after { border: 0 none; }
.otree li:last-child::before { border-right: 2px solid #C9B9BC; border-radius: 0 6px 0 0; }
.otree li:first-child::after { border-radius: 6px 0 0 0; }
.otree ul ul::before { content: ""; position: absolute; top: 0; left: 50%; border-left: 2px solid #C9B9BC; height: 20px; }
.obox { width: 178px; border: 2px solid #7E2435; border-radius: 10px; padding: 7px 9px; background: #fff; text-align: left; font-size: 12px; cursor: pointer; position: relative; }
.obox:hover { box-shadow: 0 3px 12px rgba(126,36,53,.25); }
.obox.vacant { border-color: #C62828; background: #FFF4F3; }
.obox.off { border-style: dashed; border-color: #8A8A8A; background: #F4F4F4; color: #555; }
.obox.drop { outline: 3px solid #1F4E8C; outline-offset: 2px; }
.obox .t { font-weight: 700; font-size: 12.5px; color: #241A1D; line-height: 1.25; }
.obox .r { font-size: 10.5px; color: #5E5457; margin-top: 1px; }
.obox .h { margin-top: 4px; font-weight: 600; color: #241A1D; }
.obox .v { margin-top: 4px; font-weight: 800; color: #C62828; }
.obox .c { margin-top: 3px; font-size: 10.5px; color: #8A4B00; font-weight: 600; }
.obox .more { display: inline-block; background: #1F4E8C; color: #fff; border-radius: 8px; padding: 0 5px; font-size: 10px; margin-left: 4px; }
.obox .add { position: absolute; bottom: -11px; left: 50%; transform: translateX(-50%); width: 20px; height: 20px; border-radius: 50%; border: 0; background: #7E2435; color: #fff; font-weight: 800; line-height: 18px; cursor: pointer; padding: 0; }
`;

export default function OrgChartEditor(p: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [edit, setEdit] = useState<Partial<Position> & { isNew?: boolean } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [drag, setDrag] = useState<{ kind: "person" | "position"; id: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [move, setMove] = useState<{ id: string; parentId: string | null; effects: Effect[] } | null>(null);
  const [view, setView] = useState<"tree" | "list">("tree");
  // Chart zoom: a wide institute does not fit the screen, so it can be zoomed out or fitted, and opens centred on the top box.
  const [zoom, setZoom] = useState(1);
  const treeBox = useRef<HTMLDivElement>(null);
  const centre = () => { const el = treeBox.current; if (el) el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2); };
  const fit = () => { const el = treeBox.current; const ul = el?.querySelector("ul.otree") as HTMLElement | null; if (!el || !ul) return; const natural = ul.getBoundingClientRect().width / zoom; setZoom(Math.max(0.4, Math.min(1, Math.floor((el.clientWidth / natural) * 20) / 20))); };
  useEffect(() => { if (view === "tree") requestAnimationFrame(centre); }, [view, zoom]);
  const [titles, setTitles] = useState(p.titles);
  const byId = useMemo(() => new Map(p.positions.map((x) => [x.id, x])), [p.positions]);
  const person = useMemo(() => new Map(p.people.map((x) => [x.id, x])), [p.people]);
  const kids = (id: string | null) => p.positions.filter((x) => x.parentId === id);
  const roleLabel = (r: string) => p.roles.find((x) => x.value === r)?.label || r;
  const scopeText = (x: Partial<Position>) => x.program || p.departments.find((d) => d.id === x.departmentId)?.name || p.faculties.find((f) => f.id === x.facultyId)?.name || "";
  const holds = (uid: string) => p.positions.filter((x) => x.holderId === uid);
  const actingOf = (id: string) => p.acting.filter((a) => a.positionId === id);
  const actingNow = (id: string) => actingOf(id).filter((a) => a.fromDate <= today());

  // Give / take the system role(s) a position carries, through the existing role endpoints.
  async function roleCall(pos: Position, role: string, userId: string, revoke: boolean) {
    if (userId === p.chairmanId || role === "NONE") return { ok: true } as { ok: boolean; error?: string };
    let r;
    if (role === "OMC") r = await post("/api/chairman/omc-hat", { userId, ...(revoke ? { action: "REVOKE" } : {}) });
    else if (role === "COURSE_ASSIGNER") r = await post("/api/chairman/assigner-hat", { userId, ...(revoke ? { action: "REVOKE" } : { term: "ALWAYS" }) });
    else if (role === "EXAM_CONTROLLER" || role === "QEC_INCHARGE") r = await post("/api/org/duty", { duty: role, userId, revoke });
    else if (revoke) r = await post("/api/chairman/give-role", { userId, action: "REVOKE", role: role === "PROGRAM_LEAD" ? "PROGRAM_COORDINATOR" : role });
    else r = await post("/api/chairman/give-role", { userId, role, facultyId: pos.facultyId, departmentId: pos.departmentId, program: pos.program });
    if (!r.ok && /already holds|already/i.test(r.error || "")) return { ok: true };
    return r;
  }
  async function assign(pos: Position, userId: string) {
    setBusy(true); setMsg("");
    if (pos.holderId && pos.holderId !== userId) { const out = await unassignInner(pos, "Replaced"); if (!out) { setBusy(false); return; } }
    for (const role of [pos.role, ...pos.covers]) {
      const r = await roleCall(pos, role, userId, false);
      if (!r.ok) { setMsg(`${person.get(userId)?.name}: ${r.error || "could not give the role"}`); setBusy(false); return; }
    }
    const r = await post("/api/org/positions", { action: "assign", id: pos.id, userId });
    setBusy(false);
    if (!r.ok) setMsg(r.error || "Could not save."); else router.refresh();
  }
  async function unassignInner(pos: Position, reason?: string) {
    if (!pos.holderId) return true;
    for (const role of [pos.role, ...pos.covers]) {
      // Keep the role if the same person holds it through another position.
      if (p.positions.some((x) => x.id !== pos.id && x.holderId === pos.holderId && (x.role === role || x.covers.includes(role)))) continue;
      const r = await roleCall(pos, role, pos.holderId, true);
      if (!r.ok) { setMsg(`${person.get(pos.holderId)?.name}: ${r.error || "could not remove the role"}`); return false; }
    }
    const r = await post("/api/org/positions", { action: "unassign", id: pos.id, reason });
    if (!r.ok) { setMsg(r.error || "Could not save."); return false; }
    return true;
  }
  async function vacate(pos: Position, reason: string) {
    if (!reason.trim()) { setMsg("Give a reason for vacating the position."); return; }
    setBusy(true); setMsg("");
    const ok = await unassignInner(pos, reason.trim());
    setBusy(false); if (ok) { setOpen(null); router.refresh(); }
  }
  async function save() {
    if (!edit) return;
    setBusy(true); setMsg("");
    const r = await post("/api/org/positions", { action: edit.isNew ? "create" : "update", ...edit });
    setBusy(false);
    if (!r.ok) setMsg(r.error || "Could not save."); else { setEdit(null); router.refresh(); }
  }
  async function act(body: Record<string, unknown>, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return false;
    setBusy(true); setMsg("");
    const r = await post("/api/org/positions", body);
    setBusy(false);
    if (!r.ok) { setMsg(r.error || "Could not save."); return false; }
    router.refresh(); return true;
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
  async function askMove(id: string, parentId: string | null) {
    if (id === parentId || byId.get(id)?.parentId === parentId) return;
    setBusy(true); setMsg("");
    const r = await post("/api/org/positions", { action: "move", id, parentId, preview: true });
    setBusy(false);
    if (!r.ok) { setMsg(r.error || "This move is not possible."); return; }
    setMove({ id, parentId, effects: r.data.effects || [] });
  }
  async function saveTitles() {
    setBusy(true); setMsg("");
    const r = await post("/api/org/titles", { titles: titles.map((t) => ({ key: t.key, title: t.title, enabled: t.enabled })) });
    setBusy(false);
    if (!r.ok) setMsg(r.error || "Could not save the titles."); else { setMsg(""); router.refresh(); }
  }

  const shownPeople = p.people.filter((x) => (!dept || x.departmentId === dept) && (!q || `${x.name} ${x.email} ${x.designation || ""}`.toLowerCase().includes(q.toLowerCase())));
  const badge = (t: string | null) => t && t !== "Permanent" ? <span style={{ fontSize: 10, background: t === "Visiting" ? "#FBF3E4" : "#EEF2F8", color: t === "Visiting" ? "#7A520C" : "#1B4F8A", borderRadius: 4, padding: "0 5px", marginLeft: 4 }}>{t}</span> : null;

  function Box({ pos }: { pos: Position }) {
    const h = pos.holderId ? person.get(pos.holderId) : null;
    const actingP = actingNow(pos.id)[0];
    const others = h ? holds(h.id).length - 1 : 0;
    const cls = `obox${pos.offAt ? " off" : !h && !actingP ? " vacant" : ""}${over === pos.id ? " drop" : ""}`;
    return (
      <div className={cls} role="button" tabIndex={0} draggable={!busy}
        onClick={() => setOpen(pos.id)} onKeyDown={(e) => { if (e.key === "Enter") setOpen(pos.id); }}
        onDragStart={(e) => { e.stopPropagation(); setDrag({ kind: "position", id: pos.id }); }} onDragEnd={() => { setDrag(null); setOver(null); }}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (over !== pos.id) setOver(pos.id); }} onDragLeave={() => setOver(null)}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(null); const d = drag; setDrag(null); if (!d) return; if (d.kind === "person") assign(pos, d.id); else askMove(d.id, pos.id); }}>
        <div className="t">{pos.title}</div>
        <div className="r">{pos.role === "NONE" ? "title only" : roleLabel(pos.role)}{scopeText(pos) ? ` · ${scopeText(pos)}` : ""}</div>
        {pos.offAt ? <div className="v" style={{ color: "#555" }}>Switched off</div>
          : actingP ? <div className="h">{person.get(actingP.userId)?.name || "—"} <StatusBadge status="ACTING" meaning={`Acting until ${actingP.toDate}${actingP.reason ? ` — ${actingP.reason}` : ""}.`} /></div>
            : h ? <div className="h">{h.name}{others > 0 && <span className="more" title={holds(h.id).filter((x) => x.id !== pos.id).map((x) => x.title).join(", ")}>+{others} more</span>}</div>
              : <div className="v">Vacant</div>}
        {p.coverage[pos.id] && <div className="c">{p.coverage[pos.id]}</div>}
        <button type="button" className="add" title="Add a position below" onClick={(e) => { e.stopPropagation(); setEdit({ isNew: true, parentId: pos.id, title: "", role: "NONE" }); }}>+</button>
      </div>
    );
  }
  function Tree({ pos }: { pos: Position }) {
    const ks = kids(pos.id);
    return <li><Box pos={pos} />{ks.length > 0 && <ul>{ks.map((k) => <Tree key={k.id} pos={k} />)}</ul>}</li>;
  }
  function ListNode({ pos, depth }: { pos: Position; depth: number }) {
    const h = pos.holderId ? person.get(pos.holderId) : null;
    return (
      <div style={{ marginLeft: depth ? 22 : 0, borderLeft: depth ? "2px solid #E6DADC" : undefined, paddingLeft: depth ? 10 : 0 }}>
        <div onClick={() => setOpen(pos.id)} style={{ background: "#fff", border: `1px solid ${pos.holderId ? "#E6DADC" : "#F0B9B0"}`, borderRadius: 10, padding: "8px 12px", margin: "6px 0", cursor: "pointer" }}>
          <b>{pos.title}</b> <span style={{ fontSize: 11.5, color: "var(--slate)" }}>{pos.role === "NONE" ? "title only" : roleLabel(pos.role)}{scopeText(pos) ? ` · ${scopeText(pos)}` : ""}</span>
          <span style={{ marginLeft: 10 }}>{pos.offAt ? "Switched off" : h ? h.name : <b style={{ color: "#C62828" }}>Vacant</b>}</span>
          {p.coverage[pos.id] && <span style={{ fontSize: 11.5, color: "#8A4B00", marginLeft: 8 }}>{p.coverage[pos.id]}</span>}
        </div>
        {kids(pos.id).map((k) => <ListNode key={k.id} pos={k} depth={depth + 1} />)}
      </div>
    );
  }

  const scopeOf = (role?: string) => p.roles.find((r) => r.value === role)?.scope || "none";
  const openDuties = p.duties.filter((d) => !d.coveredBy || d.vacant);
  const sel = open ? byId.get(open) : null;

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {msg && <div className="err">{msg}</div>}
      {p.positions.length === 0 ? (
        <div className="card">
          <p style={{ marginTop: 0 }}>No chart yet. Start from what the app already knows (departments, programs, current Chairmen, Program Leads, OMC and Course Assigners) — you can rename and rearrange everything afterwards.</p>
          <button className="btn" disabled={busy} onClick={() => act({ action: "seed" })}>Fill from current assignments</button>{" "}
          <button className="btn btn-secondary" disabled={busy} onClick={() => act({ action: "create", title: "Institute Head", role: "NONE" })}>Start empty</button>
        </div>
      ) : (
        <>
          <div className="card" style={{ borderLeft: `4px solid ${openDuties.length ? "#B7791F" : "#2E7D4F"}` }}>
            <b>{openDuties.length ? `${openDuties.length} dut${openDuties.length > 1 ? "ies" : "y"} not covered` : "Every duty is covered ✓"}</b>
            {openDuties.map((d, i) => (
              <div key={i} style={{ fontSize: 12.5, marginTop: 4 }}>
                <b>{d.duty}</b> — {d.scope}: {d.vacant ? <span style={{ color: "#B3261E" }}>position {d.coveredBy} is vacant</span> : <span style={{ color: "#B3261E" }}>no position</span>}
                {d.suggest && <> · suggestion: <b>{d.suggest.title}</b> also covers it <button className="act" disabled={busy} onClick={() => acceptCover(d)}>Accept</button> <span style={{ color: "var(--slate)" }}>(or add a position for it)</span></>}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
            <div role="tablist" className="tabs" style={{ margin: 0 }}>
              <button role="tab" className="tab" aria-selected={view === "tree"} onClick={() => setView("tree")}>Chart</button>
              <button role="tab" className="tab" aria-selected={view === "list"} onClick={() => setView("list")}>List</button>
            </div>
            <span className="small-note">Click a box to assign or change. Drag a box onto another to move it (with its branch). Drag a person from the list onto a box to give them the position.</span>
            {p.lastMove && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act({ action: "undo", moveId: p.lastMove!.id }, `Undo the last move (${p.lastMove!.title}, ${p.lastMove!.at})?`)}>↶ Undo last move</button>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 260px", gap: 14, alignItems: "start" }} className="org-grid">
            <div className="card" style={{ minWidth: 0 }}
              onDragOver={(e) => { if (drag?.kind === "position") e.preventDefault(); }}
              onDrop={(e) => { if (drag?.kind === "position" && e.target === e.currentTarget) { e.preventDefault(); const d = drag; setDrag(null); askMove(d.id, null); } }}>
              {view === "tree" ? (
                <>
                  <div className="no-print" style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end", marginBottom: 6 }}>
                    <span className="small-note">Zoom {Math.round(zoom * 100)}%</span>
                    <button className="act" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}>−</button>
                    <button className="act" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(1.2, +(z + 0.1).toFixed(2)))}>+</button>
                    <button className="act" onClick={fit}>Fit to screen</button>
                  </div>
                  <div ref={treeBox} style={{ overflowX: "auto" }}>
                    <ul className="otree" style={{ zoom }}>{kids(null).map((r) => <Tree key={r.id} pos={r} />)}</ul>
                  </div>
                </>
              ) : kids(null).map((r) => <ListNode key={r.id} pos={r} depth={0} />)}
              <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => setEdit({ isNew: true, parentId: null, title: "", role: "NONE" })}>+ Add a top-level position</button>
              <div className="small-note" style={{ marginTop: 8 }}>
                <span style={{ color: "#C62828", fontWeight: 700 }}>Red</span> = vacant · dashed grey = switched off · <b style={{ color: "#8A4B00" }}>brown note</b> = who is covering its approvals.
              </div>
            </div>
            <div className="card" style={{ position: "sticky", top: 10, maxHeight: "80vh", overflow: "auto" }}>
              <b>People</b> <span style={{ fontSize: 11.5, color: "var(--slate)" }}>drag onto a box</span>
              <input type="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", margin: "6px 0" }} />
              <select value={dept} onChange={(e) => setDept(e.target.value)} style={{ width: "100%", marginBottom: 6 }}><option value="">All departments</option>{p.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
              {shownPeople.map((x) => (
                <div key={x.id} draggable onDragStart={() => setDrag({ kind: "person", id: x.id })} onDragEnd={() => setDrag(null)} style={{ padding: "6px 8px", border: "1px solid #EEE7E8", borderRadius: 8, marginBottom: 5, cursor: "grab", fontSize: 12.5, background: "#fff" }}>
                  <b>{x.name}</b>{badge(x.employmentType)}
                  <div style={{ fontSize: 11, color: "var(--slate)" }}>{x.designation || x.email}{holds(x.id).length ? ` · ${holds(x.id).length} position${holds(x.id).length > 1 ? "s" : ""}` : ""}</div>
                </div>
              ))}
              {shownPeople.length === 0 && <div style={{ fontSize: 12, color: "var(--slate)" }}>No one matches.</div>}
            </div>
          </div>
        </>
      )}

      <details className="card" open={false}>
        <summary style={{ cursor: "pointer" }}><b>Position titles</b> <span className="small-note">— your institute&apos;s own names (shown in menus, notifications, reports and signatures), and positions you don&apos;t have</span></summary>
        {p.titlesMissing && <div className="err" style={{ marginTop: 8 }}>Titles need prisma/migration_org_titles.sql — run it in Supabase.</div>}
        <table style={{ fontSize: 13, marginTop: 8 }}>
          <thead><tr><th>Position</th><th>Your title</th><th>The institute has it</th></tr></thead>
          <tbody>{titles.map((t, i) => (
            <tr key={t.key}>
              <td>{t.label}<div className="small-note">default: {t.default}</div></td>
              <td><input value={t.title} onChange={(e) => setTitles(titles.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder={t.examples} aria-label={`Title for ${t.label}`} style={{ width: "100%", minWidth: 180 }} /><div className="small-note">e.g. {t.examples}</div></td>
              <td>{t.canSwitchOff ? <label style={{ fontSize: 12.5 }}><input type="checkbox" checked={t.enabled} onChange={(e) => setTitles(titles.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))} /> yes</label> : <span className="small-note">always</span>}</td>
            </tr>
          ))}</tbody>
        </table>
        <p className="small-note">Switching a position off passes its powers to the nearest position above: no Dean → the department&apos;s Chairman / HoD, else the Institute Head; no Chairman / HoD → Dean, then Institute Head; no Controller of Examinations or QEC In-charge → whoever it sits under on the chart.</p>
        <button className="btn btn-sm" disabled={busy} onClick={saveTitles}>Save titles</button>
      </details>

      {p.history.length > 0 && (
        <details className="card"><summary style={{ cursor: "pointer" }}><b>History</b> (latest {p.history.length})</summary>
          <table style={{ marginTop: 6 }}><tbody>{p.history.map((h, i) => <tr key={i}><td style={{ whiteSpace: "nowrap" }}>{h.at}</td><td>{h.who}</td><td>{h.action === "ASSIGNED" ? "took" : h.action === "ACTING" ? "acting in" : "left"}</td><td>{h.title}</td><td className="small-note">{h.reason || ""}</td></tr>)}</tbody></table>
        </details>
      )}

      {sel && <PositionDialog key={sel.id} pos={sel} />}

      {move && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setMove(null)}>
          <div className="card" style={{ width: "min(560px, 94vw)", margin: 0 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Move {byId.get(move.id)?.title}?</h3>
            <p style={{ fontSize: 13 }}>It moves with everything under it. This is what changes:</p>
            <ul style={{ fontSize: 13 }}>{move.effects.map((e, i) => <li key={i} style={{ marginBottom: 4 }}>{e.text}</li>)}</ul>
            <p className="small-note">The move is recorded and can be undone with “Undo last move”.</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => setMove(null)}>Cancel</button>
              <button className="btn" disabled={busy} onClick={async () => { const m = move; setMove(null); await act({ action: "move", id: m.id, parentId: m.parentId }); }}>Move</button>
            </div>
          </div>
        </div>
      )}

      {edit && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 101, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setEdit(null)}>
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

  function PositionDialog({ pos }: { pos: Position }) {
    const [search, setSearch] = useState("");
    const [reason, setReason] = useState("");
    const [actUser, setActUser] = useState("");
    const [from, setFrom] = useState(today());
    const [to, setTo] = useState("");
    const [actReason, setActReason] = useState("");
    const h = pos.holderId ? person.get(pos.holderId) : null;
    const candidates = p.people.filter((x) => (!pos.departmentId || !x.departmentId || x.departmentId === pos.departmentId || pos.role === "NONE") && (!search || `${x.name} ${x.email} ${x.designation || ""}`.toLowerCase().includes(search.toLowerCase()))).slice(0, 12);
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setOpen(null)}>
        <div className="card" style={{ width: "min(560px, 94vw)", maxHeight: "90vh", overflow: "auto", margin: 0 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={pos.title}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <div><h3 style={{ margin: 0 }}>{pos.title}</h3><div className="small-note">{pos.role === "NONE" ? "title only" : roleLabel(pos.role)}{scopeText(pos) ? ` · ${scopeText(pos)}` : ""}{pos.parentId ? ` · reports to ${byId.get(pos.parentId)?.title}` : " · top level"}</div></div>
            <button className="btn btn-secondary btn-sm" onClick={() => setOpen(null)} aria-label="Close">✕</button>
          </div>
          {p.coverage[pos.id] && <div style={{ background: "#FFF3DC", color: "#7A4A00", borderRadius: 8, padding: "6px 10px", fontSize: 12.5, marginTop: 8 }}><StatusBadge status="COVERING" /> {p.coverage[pos.id]}</div>}

          <h4 style={{ margin: "12px 0 4px" }}>Holder</h4>
          {pos.offAt ? <p style={{ fontSize: 13 }}>Switched off since {pos.offAt}. Its approvals go to the position above.</p>
            : h ? <p style={{ fontSize: 13, margin: 0 }}><b>{h.name}</b>{badge(h.employmentType)} <span className="small-note">{h.designation || h.email}{p.since[pos.id] ? ` · since ${p.since[pos.id]}` : ""}</span>{holds(h.id).length > 1 && <span className="small-note"> · also holds {holds(h.id).filter((x) => x.id !== pos.id).map((x) => x.title).join(", ")}</span>}</p>
              : <p style={{ fontSize: 13, margin: 0, color: "#C62828", fontWeight: 700 }}>Vacant</p>}
          {!pos.offAt && (
            <>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={h ? "Search someone to replace them…" : "Search a person to assign…"} style={{ width: "100%", marginTop: 8 }} aria-label="Search a person" />
              <div style={{ maxHeight: 180, overflow: "auto", marginTop: 4 }}>
                {candidates.map((x) => (
                  <div key={x.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid #F1EBEC", fontSize: 12.5 }}>
                    <span><b>{x.name}</b> <span className="small-note">{x.designation || x.email}</span></span>
                    <button className="act" disabled={busy || x.id === pos.holderId} onClick={async () => { await assign(pos, x.id); setOpen(null); }}>{h ? "Replace with" : "Assign"}</button>
                  </div>
                ))}
              </div>
              {h && pos.holderId !== p.chairmanId && (
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for vacating (e.g. term ended)" style={{ flex: 1 }} aria-label="Reason for vacating" />
                  <button className="act act-danger" disabled={busy} onClick={() => vacate(pos, reason)}>Vacate</button>
                </div>
              )}
            </>
          )}

          {!pos.offAt && (
            <>
              <h4 style={{ margin: "14px 0 4px" }}>Acting holder <span className="small-note" style={{ fontWeight: 400 }}>— during leave; gets the approvals until the end date</span></h4>
              {actingOf(pos.id).map((a) => (
                <div key={a.id} style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between", gap: 6 }}>
                  <span><b>{person.get(a.userId)?.name || "—"}</b> {a.fromDate} → {a.toDate}{a.reason ? ` — ${a.reason}` : ""}</span>
                  <button className="act" disabled={busy} onClick={() => act({ action: "endActing", actingId: a.id })}>End now</button>
                </div>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                <select value={actUser} onChange={(e) => setActUser(e.target.value)} aria-label="Acting holder" style={{ gridColumn: "1 / -1" }}><option value="">Choose who acts…</option>{p.people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                <label style={{ fontSize: 12 }}>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: "100%" }} /></label>
                <label style={{ fontSize: 12 }}>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: "100%" }} /></label>
                <input value={actReason} onChange={(e) => setActReason(e.target.value)} placeholder="Reason (e.g. Dean on Hajj leave)" style={{ gridColumn: "1 / -1" }} aria-label="Reason for acting" />
              </div>
              <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} disabled={busy || !actUser || !to} onClick={async () => { if (await act({ action: "acting", id: pos.id, userId: actUser, fromDate: from, toDate: to, reason: actReason })) setOpen(null); }}>Set acting holder</button>
            </>
          )}

          <h4 style={{ margin: "14px 0 4px" }}>Position</h4>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="act" disabled={busy} onClick={() => { setOpen(null); setEdit({ ...pos }); }}>Edit title / role</button>
            <button className="act" disabled={busy} onClick={() => { setOpen(null); setEdit({ isNew: true, parentId: pos.id, title: "", role: "NONE" }); }}>+ Position below</button>
            {pos.offAt ? <button className="act" disabled={busy} onClick={() => act({ action: "off", id: pos.id, on: true })}>Switch on</button>
              : <button className="act" disabled={busy || !!pos.holderId} title={pos.holderId ? "Vacate it first" : ""} onClick={() => act({ action: "off", id: pos.id, on: false }, `Switch off "${pos.title}"? Its approvals pass to the position above.`)}>Switch off</button>}
            {pos.covers.map((c) => <button key={c} className="act" disabled={busy} title="Stop covering this duty" onClick={() => act({ action: "cover", id: pos.id, role: c, on: false })}>✕ also covers {roleLabel(c)}</button>)}
            {!pos.holderId && kids(pos.id).length === 0 && <button className="act act-danger" disabled={busy} onClick={async () => { if (await act({ action: "delete", id: pos.id }, `Delete "${pos.title}"?`)) setOpen(null); }}>Delete</button>}
          </div>
          {msg && <div className="err" style={{ marginTop: 8 }}>{msg}</div>}
        </div>
      </div>
    );
  }
}
