"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Person = { id: string; name: string; role: string; departmentId: string | null; facultyId: string | null };
const post = (b: unknown) => fetch("/api/cmt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json()).catch(() => ({ error: "Could not save." }));
const STEPS = ["Type", "Scope", "Convener & Secretary", "Members", "Rules", "Review"];
const NOTE: Record<string, string> = { DEAN: "Dean", HEAD_OF_DEPARTMENT: "HOD", PROGRAM_COORDINATOR: "Program Lead", SUBJECT_EXPERT: "Subject Expert", INSTRUCTOR: "Faculty", CHAIRMAN: "Institute Head" };

export default function NewCommitteeWizard({ types, departments, faculties, people, start, isHead }: { types: [string, string][]; departments: { id: string; name: string; facultyId: string | null }[]; faculties: { id: string; name: string }[]; people: Person[]; start: { scope: string; scopeId: string }; isHead: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [f, setF] = useState({ type: "BOS", name: "", scope: start.scope, scopeId: start.scopeId, convenerId: "", secretaryId: "", mode: "FULL", quorumPct: 50, majorityPct: 50, councilStep: false });
  const [members, setMembers] = useState<Set<string>>(new Set()); const [q, setQ] = useState(""); const [showAll, setShowAll] = useState(false);
  const scopeName = f.scope === "DEPARTMENT" ? departments.find((d) => d.id === f.scopeId)?.name : f.scope === "FACULTY" ? faculties.find((x) => x.id === f.scopeId)?.name : "the institute";
  const deptIds = useMemo(() => new Set(f.scope === "FACULTY" ? departments.filter((d) => d.facultyId === f.scopeId).map((d) => d.id) : f.scope === "DEPARTMENT" ? [f.scopeId] : []), [f.scope, f.scopeId, departments]);
  const inScope = (p: Person) => f.scope === "INSTITUTE" ? ["DEAN", "HEAD_OF_DEPARTMENT", "CHAIRMAN"].includes(p.role) : (p.departmentId && deptIds.has(p.departmentId)) || (f.scope === "FACULTY" && p.facultyId === f.scopeId);
  const list = people.filter((p) => (showAll || inScope(p)) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const typeLabel = types.find(([k]) => k === f.type)?.[1] || f.type;
  const ok = [!!f.type && !!f.name.trim(), f.scope === "INSTITUTE" || !!f.scopeId, !!f.convenerId, true, true, true];
  const toggle = (id: string) => { const n = new Set(members); if (n.has(id)) n.delete(id); else n.add(id); setMembers(n); };
  async function create() {
    setBusy(true); setErr("");
    const r = await post({ action: "save", ...f, scopeId: f.scope === "INSTITUTE" ? null : f.scopeId });
    if (r.error || !r.id) { setErr(r.error || "Could not create."); setBusy(false); return; }
    if (f.secretaryId) await post({ action: "secretary", committeeId: r.id, userId: f.secretaryId });
    const ids = Array.from(members).filter((x) => x !== f.convenerId && x !== f.secretaryId);
    if (ids.length) await post({ action: "bulkAdd", committeeId: r.id, userIds: ids });
    router.push(`/boards/${r.id}`);
  }
  const box = { border: "1px solid var(--line, #ddd)", borderRadius: 10, padding: 14 } as const;
  const sel = (v: string, on: (x: string) => void, opts: [string, string][], ph = "choose…") => <select value={v} onChange={(e) => on(e.target.value)} style={{ minWidth: 240 }}><option value="">{ph}</option>{opts.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>;
  return (
    <div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>New committee</h1>
      <ol style={{ display: "flex", gap: 6, listStyle: "none", padding: 0, flexWrap: "wrap", margin: "8px 0 12px" }}>
        {STEPS.map((s, i) => <li key={s}><button type="button" onClick={() => i <= step || ok.slice(0, i).every(Boolean) ? setStep(i) : null} style={{ border: 0, cursor: "pointer", padding: "4px 10px", borderRadius: 14, fontSize: 12.5, background: i === step ? "#1B5FAA" : i < step ? "#E6F4EA" : "rgba(127,127,127,.12)", color: i === step ? "#fff" : "inherit" }}>{i < step ? "✓ " : `${i + 1}. `}{s}</button></li>)}
      </ol>
      <div style={box}>
        {step === 0 && <><label style={{ display: "block", fontSize: 13 }}>What kind of committee?<br />{sel(f.type, (x) => setF({ ...f, type: x }), types, "choose…")}</label>
          <label style={{ display: "block", fontSize: 13, marginTop: 10 }}>Name<br /><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={`e.g. ${typeLabel} — Computer Science`} style={{ width: 360 }} /></label></>}
        {step === 1 && <><p style={{ fontSize: 13, marginTop: 0 }}>Whose committee is it?</p>
          {(isHead ? ["INSTITUTE", "FACULTY", "DEPARTMENT"] : f.scope === "FACULTY" ? ["FACULTY", "DEPARTMENT"] : ["DEPARTMENT"]).map((s) => <label key={s} style={{ display: "block", fontSize: 13, margin: "4px 0" }}><input type="radio" checked={f.scope === s} onChange={() => setF({ ...f, scope: s, scopeId: s === "INSTITUTE" ? "" : f.scopeId })} /> {s === "INSTITUTE" ? "The whole institute" : s === "FACULTY" ? "A faculty (Dean)" : "A department (HOD)"}</label>)}
          {f.scope === "FACULTY" && sel(f.scopeId, (x) => setF({ ...f, scopeId: x }), faculties.map((x) => [x.id, x.name]), "which faculty?")}
          {f.scope === "DEPARTMENT" && sel(f.scopeId, (x) => setF({ ...f, scopeId: x }), departments.map((x) => [x.id, x.name]), "which department?")}</>}
        {step === 2 && <><label style={{ display: "block", fontSize: 13 }}>Convener (chairs it and finalises decisions)<br />{sel(f.convenerId, (x) => setF({ ...f, convenerId: x }), people.filter((p) => inScope(p) || p.role === "CHAIRMAN" || p.role === "DEAN").map((p) => [p.id, `${p.name}${NOTE[p.role] ? ` — ${NOTE[p.role]}` : ""}`]))}</label>
          <label style={{ display: "block", fontSize: 13, marginTop: 10 }}>Secretary (optional — manages members, meetings and minutes)<br />{sel(f.secretaryId, (x) => setF({ ...f, secretaryId: x }), people.map((p) => [p.id, p.name]), "— none —")}</label></>}
        {step === 3 && <><p style={{ fontSize: 13, marginTop: 0 }}>Tick the members. People of {scopeName || "this scope"} are listed first. External experts are added on the committee page (they get a guest link).</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 6 }}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person…" /><label style={{ fontSize: 12.5 }}><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> show everyone in the institute</label>
            <button type="button" className="btn-link" onClick={() => setMembers(new Set([...Array.from(members), ...list.map((p) => p.id)]))}>tick all shown</button></div>
          <div style={{ columns: "2 240px", fontSize: 13 }}>{list.map((p) => <label key={p.id} style={{ display: "block", breakInside: "avoid", padding: "2px 0" }}><input type="checkbox" checked={members.has(p.id) || p.id === f.convenerId || p.id === f.secretaryId} disabled={p.id === f.convenerId || p.id === f.secretaryId} onChange={() => toggle(p.id)} /> {p.name}{NOTE[p.role] ? <span className="small-note"> · {NOTE[p.role]}</span> : null}</label>)}</div>
          {!list.length && <p className="small-note">Nobody here — tick “show everyone”.</p>}</>}
        {step === 4 && <><label style={{ display: "block", fontSize: 13 }}><input type="radio" checked={f.mode === "FULL"} onChange={() => setF({ ...f, mode: "FULL" })} /> Full committee — members vote, the Convener finalises</label>
          <label style={{ display: "block", fontSize: 13 }}><input type="radio" checked={f.mode === "CONVENER_ONLY"} onChange={() => setF({ ...f, mode: "CONVENER_ONLY" })} /> Convener only — the Convener decides</label>
          {f.mode === "FULL" && <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 13 }}><label>Quorum (% of members)<br /><input type="number" value={f.quorumPct} onChange={(e) => setF({ ...f, quorumPct: Number(e.target.value) })} style={{ width: 70 }} /></label><label>Approve with more than (% of votes)<br /><input type="number" value={f.majorityPct} onChange={(e) => setF({ ...f, majorityPct: Number(e.target.value) })} style={{ width: 70 }} /></label></div>}
          <label style={{ display: "block", fontSize: 13, marginTop: 8 }}><input type="checkbox" checked={f.councilStep} onChange={(e) => setF({ ...f, councilStep: e.target.checked })} /> Decisions then go to the Academic Council</label></>}
        {step === 5 && <div style={{ fontSize: 13.5, lineHeight: 1.7 }}><b>{f.name}</b> — {typeLabel}<br />For {scopeName}<br />Convener: {people.find((p) => p.id === f.convenerId)?.name || "—"}{f.secretaryId ? ` · Secretary: ${people.find((p) => p.id === f.secretaryId)?.name}` : ""}<br />{new Set([...Array.from(members), f.convenerId, f.secretaryId].filter(Boolean)).size} members · {f.mode === "FULL" ? `quorum ${f.quorumPct}%, approve over ${f.majorityPct}%` : "Convener decides"}{f.councilStep ? " · then Academic Council" : ""}
          <p className="small-note">After creating: add external experts, set each member&apos;s term, and enter your statute&apos;s composition rule on the committee page.</p></div>}
        {err && <p style={{ color: "#B3261E", fontSize: 13 }}>{err}</p>}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
          {step > 0 ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(step - 1)}>← Back</button> : <span />}
          {step < STEPS.length - 1 ? <button type="button" className="btn btn-sm" disabled={!ok[step]} onClick={() => setStep(step + 1)}>Next: {STEPS[step + 1]} →</button> : <button type="button" className="btn btn-sm" disabled={busy} onClick={create}>{busy ? "Creating…" : "Create committee"}</button>}
        </div>
      </div>
    </div>
  );
}
