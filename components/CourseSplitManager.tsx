"use client";
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SplitData } from "../lib/courseSplit";
import IncomingRequests from "./IncomingRequests";

export default function CourseSplitManager({ data, departmentId }: { data: SplitData; departmentId: string | null }) {
  const [owners, setOwners] = useState<Record<string, string>>(() => Object.fromEntries(data.rows.map((r) => [r.key, r.ownerId || ""])));
  const [saved, setSaved] = useState<Record<string, string>>(() => Object.fromEntries(data.rows.map((r) => [r.key, r.ownerId || ""])));
  const router = useRouter();
  const [onlyShared, setOnlyShared] = useState(true);
  const [bulkLead, setBulkLead] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const changed = useMemo(() => data.rows.filter((r) => (owners[r.key] || "") !== (saved[r.key] || "")), [data.rows, owners, saved]);
  const undecided = data.rows.filter((r) => r.shared && !owners[r.key]);
  const shown = data.rows.filter((r) => !onlyShared || r.shared);
  const [grouped, setGrouped] = useState(true);

  function giveAllUndecided() {
    if (!bulkLead) return;
    setOwners((o) => { const n = { ...o }; for (const r of undecided) n[r.key] = bulkLead; return n; });
  }

  async function save() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/course-split", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departmentId, assignments: changed.map((r) => ({ key: r.key, ownerId: owners[r.key] || null })) }),
    });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(j.error || "Could not save"); return; }
    setSaved({ ...owners });
    setMsg("Saved.");
    router.refresh();
  }

  async function answer(id: string, action: "ACCEPT" | "DECLINE") {
    setBusy(true); setMsg("");
    const res = await fetch("/api/course-split", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(j.error || "Could not save"); return; }
    router.refresh();
  }

  // Leads of this department first, then the other departments' leads.
  const groups = useMemo(() => {
    const by = new Map<string, typeof data.leads>();
    for (const l of data.leads) { const k = l.departmentName || "Other"; by.set(k, [...(by.get(k) || []), l]); }
    return Array.from(by.entries()).sort(([a], [b]) => (a === data.departmentName ? -1 : b === data.departmentName ? 1 : a.localeCompare(b)));
  }, [data.leads, data.departmentName]);
  const leadOptions = (
    groups.map(([dept, ls]) => (
      <optgroup key={dept} label={dept === data.departmentName ? `${dept} (this department)` : `${dept} (needs their Chairman's OK)`}>
        {ls.map((l) => <option key={l.id} value={l.id}>{l.name}{l.program ? ` (${l.program})` : ""}</option>)}
      </optgroup>
    ))
  );
  const leadName = (id: string) => data.leads.find((l) => l.id === id)?.name || "";

  // Courses sectioned by the department that handles them (by the SAVED choice, so a row moves only after Save).
  const sections = useMemo(() => {
    const deptOfLead = new Map(data.leads.map((l) => [l.id, l.departmentName]));
    const NOT_DECIDED = "Not decided yet";
    const OWN = `Stays with its own program lead (${data.departmentName})`;
    const by = new Map<string, typeof shown>();
    for (const r of shown) {
      const owner = saved[r.key];
      const label = owner ? deptOfLead.get(owner) || "Other" : r.shared ? NOT_DECIDED : OWN;
      by.set(label, [...(by.get(label) || []), r]);
    }
    const rank = (l: string) => (l === NOT_DECIDED ? 0 : l === data.departmentName ? 1 : l === OWN ? 2 : 3);
    return Array.from(by.entries())
      .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
      .map(([label, rows]) => ({
        label, rows: rows.slice().sort((x, y) => (leadName(saved[x.key] || "") || "").localeCompare(leadName(saved[y.key] || "") || "") || x.code.localeCompare(y.code)),
        outside: label !== data.departmentName && label !== NOT_DECIDED && label !== OWN,
      }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, saved, data.leads, data.departmentName]);

  if (data.leads.length === 0) return <div className="card"><p style={{ fontSize: 13 }}>This department has no Program Leads yet. Add them under Departments first.</p></div>;

  return (
    <div>
      {data.incoming.length > 0 && <IncomingRequests items={data.incoming} title="Courses other departments want you to take" />}
      <div className="card" style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 13, marginTop: 0 }}>
          <strong>{data.rows.filter((r) => r.shared).length}</strong> common courses (taught in two or more programs) and <strong>{data.rows.filter((r) => !r.shared).length}</strong> specialised courses.
          {undecided.length > 0 ? <> <strong>{undecided.length}</strong> common courses still have no handling lead.</> : " Every common course has a handling lead."}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 12.5 }}>Give all undecided common courses to</span>
          <select value={bulkLead} onChange={(e) => setBulkLead(e.target.value)}>
            <option value="">Choose a Program Lead</option>
            {leadOptions}
          </select>
          <button className="btn" onClick={giveAllUndecided} disabled={!bulkLead || undecided.length === 0}>Apply</button>
          <label style={{ fontSize: 12.5, marginLeft: "auto" }}><input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} /> Group by handling department</label>
          <label style={{ fontSize: 12.5 }}><input type="checkbox" checked={onlyShared} onChange={(e) => setOnlyShared(e.target.checked)} /> Show only common courses</label>
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Course</th><th>Taught in</th><th>Handled by</th></tr></thead>
          <tbody>
            {(grouped ? sections : [{ label: "", rows: shown, outside: false }]).map((sec) => (
              <Fragment key={sec.label || "all"}>
                {grouped && (
                  <tr>
                    <td colSpan={3} style={{ background: sec.outside ? "#F3EBD6" : "#EFEADC", fontWeight: 700, fontSize: 13, padding: "8px 10px", borderTop: "2px solid var(--brass, #B08D57)" }}>
                      {sec.outside ? "Handled by " : ""}{sec.label} <span style={{ fontWeight: 400, color: "var(--slate)" }}>· {sec.rows.length} course{sec.rows.length === 1 ? "" : "s"}</span>
                    </td>
                  </tr>
                )}
                {sec.rows.map((r) => (
              <tr key={r.key}>
                <td><strong>{r.code}</strong><div style={{ fontSize: 12, color: "var(--slate)" }}>{r.title}{r.semester ? ` · Sem ${r.semester}` : ""}</div></td>
                <td style={{ fontSize: 12 }}>{r.leads.map((l) => `${l.programs.join(", ") || "—"} (${l.name})`).join("; ")}{r.shared && <span style={{ color: "var(--brass-dark)" }}> · common</span>}{r.elective && <span style={{ color: "var(--slate)" }}> · elective, stays in its own program</span>}</td>
                <td>
                  <select value={owners[r.key] || ""} onChange={(e) => setOwners((o) => ({ ...o, [r.key]: e.target.value }))}>
                    <option value="">{r.shared ? "Not decided yet" : "The lead of its own program"}</option>
                    {leadOptions}
                  </select>
                  {r.ownerStatus === "PENDING" && owners[r.key] === (r.ownerId || "") && <div style={{ fontSize: 11.5, color: "var(--rust)" }}>Waiting for {leadName(r.ownerId || "")}, his Chairman or his Dean to accept. Until then the course stays as it was.</div>}
                </td>
              </tr>
                ))}
              </Fragment>
            ))}
            {shown.length === 0 && <tr><td colSpan={3} style={{ fontSize: 12.5, color: "var(--slate)" }}>No courses yet. Program Leads add courses under Degree Programs and Courses.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center" }}>
        <button className="btn btn-brass" onClick={save} disabled={busy || changed.length === 0}>{busy ? "Saving..." : `Save${changed.length ? ` (${changed.length} changed)` : ""}`}</button>
        {msg && <span style={{ fontSize: 12.5 }}>{msg}</span>}
      </div>
    </div>
  );
}
