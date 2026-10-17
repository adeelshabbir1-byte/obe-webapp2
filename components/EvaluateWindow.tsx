"use client";
import { useMemo, useState } from "react";

type Level = { label: string; points: number; descriptor: string };
type Criterion = { id: string; title: string; cloId: string | null; weight: number; levels: Level[] };
type Student = { id: string; name: string; rollNumber: string };
type Group = { id: string; name: string; title: string | null; studentIds: string[] };
type Levels = Record<string, number>;

const pctOf = (criteria: Criterion[], lv: Levels | undefined) => {
  if (!lv || criteria.some((c) => lv[c.id] === undefined)) return null;
  const w = criteria.reduce((s, c) => s + c.weight, 0) || 1;
  return Math.round((criteria.reduce((s, c) => s + ((c.levels[lv[c.id]]?.points || 0) / (Math.max(...c.levels.map((l) => l.points)) || 1)) * c.weight, 0) / w) * 1000) / 10;
};
const same = (a?: Levels, b?: Levels) => !!a && !!b && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);

// Evaluate a project / lab session by group: pick rubric levels once for the group, then change any member if needed.
export default function EvaluateWindow({ courseId, criteria, students, groups: initialGroups, levels: initialLevels, saveUrl, extra, cloCodes }: {
  courseId: string; criteria: Criterion[]; students: Student[]; groups: Group[] | null; levels: Record<string, Levels>;
  saveUrl: string; extra?: Record<string, unknown>; cloCodes?: Record<string, string>;
}) {
  const [groups, setGroups] = useState<Group[]>(initialGroups || []);
  const [levels, setLevels] = useState<Record<string, Levels>>(initialLevels);
  const [draft, setDraft] = useState<Record<string, Levels>>({}); // group drafts
  const [open, setOpen] = useState<string | null>(null); // student opened for individual change
  const [editGroups, setEditGroups] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const grouped = new Set(groups.flatMap((g) => g.studentIds));
  const loose = students.filter((s) => !grouped.has(s.id));

  async function saveOne(studentId: string, lv: Levels) {
    const r = await fetch(saveUrl, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...extra, studentId, levels: lv }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Could not save.");
    setLevels((x) => ({ ...x, [studentId]: lv }));
  }
  async function saveGroup(g: Group) {
    const lv = draft[g.id]; if (!lv) return;
    setBusy(true); setMsg("");
    try { for (const s of g.studentIds) await saveOne(s, lv); setMsg(`${g.name}: saved for ${g.studentIds.length} students.`); } catch (e) { setMsg(String((e as Error).message)); }
    setBusy(false);
  }
  async function saveStudent(id: string, lv: Levels) {
    setBusy(true); setMsg("");
    try { await saveOne(id, lv); setMsg(`${byId.get(id)?.name}: saved.`); setOpen(null); } catch (e) { setMsg(String((e as Error).message)); }
    setBusy(false);
  }
  async function groupsCall(body: Record<string, unknown>) {
    setBusy(true); setMsg("");
    const r = await fetch("/api/groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId, ...body }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(d.error || "Could not save groups."); return; }
    setGroups(d.groups || []); setEditGroups(false);
  }

  const Grid = ({ value, onPick }: { value?: Levels; onPick: (c: string, i: number) => void }) => (
    <table style={{ fontSize: 12, margin: "6px 0" }}>
      <tbody>{criteria.map((c) => (
        <tr key={c.id}>
          <td style={{ minWidth: 160 }}><b>{c.title}</b> <span style={{ color: "var(--slate)" }}>{c.weight}%{c.cloId && cloCodes?.[c.cloId] ? ` · ${cloCodes[c.cloId]}` : ""}</span></td>
          {c.levels.map((l, i) => (
            <td key={i} onClick={() => onPick(c.id, i)} title={l.descriptor} style={{ cursor: "pointer", padding: "3px 6px", borderRadius: 6, background: value?.[c.id] === i ? "#3A1218" : "#F7F4F3", color: value?.[c.id] === i ? "#fff" : undefined, whiteSpace: "nowrap" }}>{l.label} ({l.points})</td>
          ))}
        </tr>))}</tbody>
    </table>
  );
  const Person = ({ s, groupLv }: { s: Student; groupLv?: Levels }) => {
    const mine = levels[s.id]; const p = pctOf(criteria, mine);
    const [lv, setLv] = useState<Levels>(mine || groupLv || {});
    return (
      <div style={{ padding: "4px 0", borderTop: "1px solid #F0EAEA" }}>
        <span style={{ fontSize: 12.5 }}>{s.rollNumber} — {s.name}</span>{" "}
        <span style={{ fontSize: 12, color: p == null ? "var(--slate)" : "#1F5E36", fontWeight: 600 }}>{p == null ? "not marked" : `${p}%`}</span>
        {groupLv && mine && !same(mine, groupLv) && <span style={{ fontSize: 11, color: "#7A520C", marginLeft: 6 }}>changed from group</span>}
        <button className="act" style={{ marginLeft: 8 }} onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Close" : groupLv ? "Change for this student" : "Mark"}</button>
        {open === s.id && <div><Grid value={lv} onPick={(c, i) => setLv({ ...lv, [c]: i })} /><button className="btn btn-sm" disabled={busy || criteria.some((c) => lv[c.id] === undefined)} onClick={() => saveStudent(s.id, lv)}>Save {s.name}</button></div>}
      </div>
    );
  };

  return (
    <div>
      {msg && <div className="card" style={{ padding: "6px 12px", fontSize: 13 }}>{msg}</div>}
      <div className="card">
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b>Groups</b> <span style={{ fontSize: 12, color: "var(--slate)" }}>{groups.length} group{groups.length === 1 ? "" : "s"}, {loose.length} student{loose.length === 1 ? "" : "s"} without a group</span>
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setEditGroups(!editGroups)}>{editGroups ? "Cancel" : "Edit groups"}</button>
          {[3, 4, 5].map((n) => <button key={n} className="act" disabled={busy} onClick={() => confirm(`Replace the groups with automatic groups of about ${n}?`) && groupsCall({ action: "auto", size: n })}>Auto groups of {n}</button>)}
        </div>
        {editGroups && <GroupEditor students={students} groups={groups} onSave={(gs) => groupsCall({ action: "save", groups: gs })} busy={busy} />}
        {initialGroups === null && <p style={{ fontSize: 12, color: "#95650F" }}>Groups need prisma/migration_groups_labs.sql — until then mark students one by one.</p>}
      </div>
      {groups.map((g) => {
        const dv = draft[g.id] || levels[g.studentIds[0]] || {};
        return (
          <div className="card" key={g.id}>
            <b>{g.name}</b>{g.title && <span style={{ color: "var(--slate)" }}> — {g.title}</span>} <span style={{ fontSize: 12, color: "var(--slate)" }}>· {g.studentIds.length} students · group mark {pctOf(criteria, dv) ?? "—"}%</span>
            <Grid value={dv} onPick={(c, i) => setDraft({ ...draft, [g.id]: { ...dv, [c]: i } })} />
            <button className="btn btn-sm" disabled={busy || criteria.some((c) => dv[c.id] === undefined) || !draft[g.id]} onClick={() => saveGroup(g)}>Save for all {g.studentIds.length} members</button>
            <div style={{ marginTop: 6 }}>{g.studentIds.map((id) => byId.get(id)).filter((s): s is Student => !!s).map((s) => <Person key={s.id} s={s} groupLv={draft[g.id] || levels[g.studentIds[0]]} />)}</div>
          </div>
        );
      })}
      {loose.length > 0 && <div className="card"><b>Students without a group</b>{loose.map((s) => <Person key={s.id} s={s} />)}</div>}
    </div>
  );
}

function GroupEditor({ students, groups, onSave, busy }: { students: Student[]; groups: Group[]; onSave: (g: { name: string; title: string; studentIds: string[] }[]) => void; busy: boolean }) {
  const [names, setNames] = useState<{ name: string; title: string }[]>(groups.length ? groups.map((g) => ({ name: g.name, title: g.title || "" })) : [{ name: "Group 1", title: "" }]);
  const [of, setOf] = useState<Record<string, number>>(Object.fromEntries(groups.flatMap((g, i) => g.studentIds.map((s) => [s, i]))));
  return (
    <div style={{ marginTop: 8 }}>
      {names.map((n, i) => <div key={i} style={{ display: "flex", gap: 6, marginBottom: 4 }}><input value={n.name} onChange={(e) => setNames(names.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} style={{ width: 140 }} /><input value={n.title} placeholder="Project title (optional)" onChange={(e) => setNames(names.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} style={{ flex: 1 }} /></div>)}
      <button className="act" onClick={() => setNames([...names, { name: `Group ${names.length + 1}`, title: "" }])}>+ Group</button>
      <div style={{ maxHeight: 300, overflow: "auto", marginTop: 6 }}>
        {students.map((s) => <div key={s.id} style={{ fontSize: 12.5 }}>{s.rollNumber} — {s.name} <select value={of[s.id] ?? ""} onChange={(e) => setOf({ ...of, [s.id]: e.target.value === "" ? (undefined as unknown as number) : Number(e.target.value) })}><option value="">no group</option>{names.map((n, i) => <option key={i} value={i}>{n.name}</option>)}</select></div>)}
      </div>
      <button className="btn btn-sm" style={{ marginTop: 6 }} disabled={busy} onClick={() => onSave(names.map((n, i) => ({ ...n, studentIds: students.filter((s) => of[s.id] === i).map((s) => s.id) })))}>Save groups</button>
    </div>
  );
}
