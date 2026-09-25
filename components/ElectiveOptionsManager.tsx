"use client";

import { useState, useEffect } from "react";

type Course = { id: string; code: string; title: string; courseType: string; semesterNumber: number | null };
type Option = { id: string; courseId: string; courseCode: string; courseTitle: string; capacity: number | null; choiceCount: number };
type Choice = { id: string; studentName: string; rollNumber: string; optionId: string; applied: boolean };
type Group = { id: string; label: string; semesterNumber: number; registrationOpen: boolean; finalized: boolean; options: Option[]; choices: Choice[] };

export default function ElectiveOptionsManager({ batchId, electiveCourses }: { batchId: string; electiveCourses: Course[] }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [label, setLabel] = useState("");
  const [semesterNumber, setSemesterNumber] = useState("");
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());
  const [capacities, setCapacities] = useState<Record<string, string>>({});
  const [finalizeResult, setFinalizeResult] = useState<Record<string, any>>({});

  async function load() {
    try {
      const res = await fetch(`/api/coordinator/elective-groups?batchId=${batchId}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setGroups(data.groups); setLoaded(true);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }

  useEffect(() => { load(); setOrigin(window.location.origin); }, [batchId]);

  const usedCourseIds = new Set(groups.flatMap((g) => g.options.map((o) => o.courseId)));
  const availableCourses = electiveCourses.filter((c) => !usedCourseIds.has(c.id));

  function toggleCourse(id: string) {
    setSelectedCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function createGroup() {
    if (!label.trim() || !semesterNumber || selectedCourseIds.size < 2) {
      setError("Label, semester, and at least 2 courses are required."); return;
    }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/coordinator/elective-groups", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId, label, semesterNumber, courseIds: Array.from(selectedCourseIds),
          capacities: Object.fromEntries(Array.from(selectedCourseIds).map((id) => [id, capacities[id] || null])),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      setLabel(""); setSemesterNumber(""); setSelectedCourseIds(new Set()); setCapacities({}); setShowCreate(false);
      setBusy(false);
      await load();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  async function toggleRegistration(group: Group) {
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/coordinator/elective-groups/${group.id}/toggle-registration`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ open: !group.registrationOpen }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      setGroups((prev) => prev.map((g) => g.id === group.id ? { ...g, registrationOpen: data.registrationOpen } : g));
      setBusy(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  async function finalizeGroup(group: Group) {
    if (!confirm(`Finalize "${group.label}"? This turns every submitted choice into a real enrollment and closes registration — it can't be undone.`)) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/coordinator/elective-groups/${group.id}/finalize`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      setFinalizeResult((prev) => ({ ...prev, [group.id]: data }));
      setBusy(false);
      await load();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  async function removeGroup(group: Group) {
    if (!confirm(`Delete "${group.label}"? This removes every collected choice too — nothing has been enrolled yet, so this is safe, but it can't be undone.`)) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/coordinator/elective-groups/${group.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      setGroups((prev) => prev.filter((g) => g.id !== group.id));
      setBusy(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  function copyLink(groupId: string) {
    const link = `${origin}/elective-choice/${groupId}`;
    navigator.clipboard.writeText(link);
    alert("Link copied:\n" + link);
  }

  if (!loaded) return <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>Loading…</p></div>;

  return (
    <>
      {error && <div className="err">{error}</div>}

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontSize: 14 }}>Elective Option Groups</h3>
          <button onClick={() => setShowCreate((v) => !v)} className="btn btn-brass" style={{ fontSize: 12, padding: "5px 10px" }}>
            {showCreate ? "Cancel" : "+ New Group"}
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 6 }}>
          Offer several real courses as alternatives for the same elective slot (e.g. "Elective-I: choose one of
          Computer Vision, NLP, Robotics") and let students choose by signing in at <code>/student/login</code>
          with their roll number (activate their logins first, under Students) — their dashboard shows every
          open choice for their own batch automatically, no per-group link needed. The public link below still
          works too, for anyone who hasn't been activated yet or prefers not to sign in. Each course must
          already exist in this batch (import it via Course Repositioning first if it doesn't yet) and can only
          be an option in one group.
        </p>

        {showCreate && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label, e.g. Elective-I" style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }} />
              <input value={semesterNumber} onChange={(e) => setSemesterNumber(e.target.value)} placeholder="Semester #" type="number" min={1} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5, width: 100 }} />
            </div>
            <p style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>Pick 2 or more courses to offer as options:</p>
            {availableCourses.length === 0 && <p style={{ fontSize: 12, color: "var(--slate)" }}>No available Elective-type courses in this batch — import one via Course Repositioning first.</p>}
            <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 10 }}>
              {availableCourses.map((c) => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                  <input type="checkbox" checked={selectedCourseIds.has(c.id)} onChange={() => toggleCourse(c.id)} />
                  <span style={{ fontSize: 12.5, flex: 1 }}>{c.code} — {c.title}</span>
                  {selectedCourseIds.has(c.id) && (
                    <input
                      value={capacities[c.id] || ""} onChange={(e) => setCapacities((prev) => ({ ...prev, [c.id]: e.target.value }))}
                      placeholder="Capacity (optional)" type="number" min={1}
                      style={{ padding: "3px 6px", border: "1px solid var(--line)", fontSize: 11.5, width: 130 }}
                    />
                  )}
                </div>
              ))}
            </div>
            <button onClick={createGroup} disabled={busy} className="btn btn-brass" style={{ fontSize: 12.5, padding: "6px 14px" }}>
              {busy ? "Creating…" : "Create Group"}
            </button>
          </div>
        )}
      </div>

      {groups.length === 0 && !showCreate && (
        <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>No elective option groups yet for this batch.</p></div>
      )}

      {groups.map((g) => {
        const result = finalizeResult[g.id];
        return (
          <div key={g.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <h3 style={{ fontSize: 14 }}>{g.label} <span style={{ fontWeight: 400, fontSize: 12, color: "var(--slate)" }}>· Semester {g.semesterNumber}</span></h3>
                {g.finalized ? (
                  <span className="badge badge-neutral" style={{ marginTop: 4, display: "inline-block" }}>Finalized</span>
                ) : (
                  <span className={g.registrationOpen ? "badge badge-ok" : "badge badge-warn"} style={{ marginTop: 4, display: "inline-block" }}>
                    {g.registrationOpen ? "Registration open" : "Registration closed"}
                  </span>
                )}
              </div>
              {!g.finalized && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => copyLink(g.id)} className="btn" style={{ fontSize: 11.5, padding: "5px 10px" }}>Copy Public Link (no login)</button>
                  <button onClick={() => toggleRegistration(g)} disabled={busy} className="btn" style={{ fontSize: 11.5, padding: "5px 10px" }}>
                    {g.registrationOpen ? "Close Registration" : "Open Registration"}
                  </button>
                  <button onClick={() => finalizeGroup(g)} disabled={busy} className="btn btn-approve" style={{ fontSize: 11.5, padding: "5px 10px" }}>Finalize</button>
                  <button onClick={() => removeGroup(g)} disabled={busy} className="btn btn-danger" style={{ fontSize: 11.5, padding: "5px 10px", color: "var(--rust)" }}>Delete</button>
                </div>
              )}
            </div>

            <table style={{ marginTop: 12 }}>
              <thead><tr><th>Option</th><th>Choices so far</th><th>Capacity</th></tr></thead>
              <tbody>
                {g.options.map((o) => (
                  <tr key={o.id}>
                    <td>{o.courseCode} — {o.courseTitle}</td>
                    <td>{o.choiceCount}</td>
                    <td>{o.capacity ?? "Unlimited"}{o.capacity !== null && o.choiceCount >= o.capacity && <span style={{ color: "var(--rust)", marginLeft: 6, fontSize: 11 }}>FULL</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {result && (
              <div style={{ fontSize: 12, background: "#ECFBF4", border: "1px solid var(--sage)", padding: 8, marginTop: 10 }}>
                Applied {result.applied} new enrollment(s).
                {result.waitlisted.length > 0 && <> {result.waitlisted.length} couldn't be placed (their choice was full by the time it was processed): {result.waitlisted.map((w: any) => `${w.name} (${w.rollNumber}) → ${w.courseTitle}`).join(", ")}.</>}
                {result.alreadyEnrolled.length > 0 && <> {result.alreadyEnrolled.length} were already enrolled in their chosen course.</>}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
