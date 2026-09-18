"use client";

import { useState, useEffect } from "react";
import ContentSyncSuggestions from "./ContentSyncSuggestions";

type Batch = { id: string; degreeProgram: string; batchName: string; offeredCourseCount: number };
type Course = { id: string; code: string; title: string; degreeProgram: string; batchName: string; semesterNumber: number | null; groupId: string | null; isBase: boolean | null };
type GroupMember = { courseId: string; isBase: boolean; code: string; title: string; degreeProgram: string; batchName: string; semesterNumber: number | null };
type Group = { id: string; name: string; createdByName?: string | null; members: GroupMember[] };

export default function ContentSyncManager() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchesLoaded, setBatchesLoaded] = useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [coursesLoaded, setCoursesLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [courseIdA, setCourseIdA] = useState("");
  const [courseIdB, setCourseIdB] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/omc/content-sync/batches")
      .then((res) => res.json())
      .then((data) => { setBatches(data.batches || []); setBatchesLoaded(true); })
      .catch((err) => setError("Failed to load batches: " + err.message));
  }, []);

  async function loadCoursesAndGroups() {
    setCoursesLoaded(false); setError("");
    try {
      const ids = Array.from(selectedBatchIds).join(",");
      const res = await fetch(`/api/omc/content-sync?batchIds=${ids}`);
      const text = await res.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        setError(`The server returned an unreadable response (status ${res.status}). This usually means the request took too long or hit an unexpected error — try selecting fewer batches at once.`);
        return;
      }
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setCourses(data.courses); setGroups(data.groups); setCoursesLoaded(true);
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }

  function toggleBatch(batchId: string) {
    setSelectedBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId); else next.add(batchId);
      return next;
    });
    setCoursesLoaded(false);
  }

  const optionLabel = (c: Course) => `${c.code} — ${c.title} [${c.degreeProgram}, ${c.batchName}, Sem ${c.semesterNumber ?? "?"}]${c.groupId ? (c.isBase ? " (already BASE elsewhere)" : " (already linked elsewhere)") : ""}`;

  async function handlePair() {
    if (!courseIdA || !courseIdB || courseIdA === courseIdB) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/omc/content-sync/pair", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseIdA, courseIdB }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      const parts = [`Linked — ${data.baseCourseCode || "one course"} is the base; the other now inherits from it and is read-only for SE purposes.`];
      if (data.synced?.length > 0) parts.push(`Content copied to ${data.synced.length} course(s) right away.`);
      if (data.skippedGraded?.length > 0) parts.push(`${data.skippedGraded.length} course(s) skipped — they already have entered grades.`);
      if (data.alsoMadeEquivalent) parts.push(`They're offered in the same term, so they were also combined as one class in Course Equivalence.`);
      setNotice(parts.join(" "));
      setCourseIdA(""); setCourseIdB(""); setBusy(false); await loadCoursesAndGroups();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  async function handleMakeBase(groupId: string, courseId: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch(`/api/omc/content-sync/${groupId}/set-base`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      setNotice("Base changed — this course's content now propagates to the others. Any Subject Expert previously assigned to the old base was cleared.");
      setBusy(false); await loadCoursesAndGroups();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  async function handleRemove(groupId: string, courseId: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      await fetch(`/api/omc/content-sync/${groupId}/members/${courseId}`, { method: "DELETE" });
      setBusy(false); await loadCoursesAndGroups();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  if (!batchesLoaded) return <div className="card"><p style={{ color: "var(--slate)", fontSize: 12.5 }}>Loading batches…</p></div>;

  return (
    <>
      {error && <div className="err">{error}</div>}
      {notice && <div style={{ fontSize: 12.5, background: "#F0FBF4", border: "1px solid var(--sage)", padding: 8, marginBottom: 10 }}>{notice}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 8 }}>
          Check which batches to work with — with potentially hundreds of courses across every batch, only the
          ones you actually check get loaded below, instead of everything at once.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
          {batches.map((b) => (
            <label key={b.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, border: "1px solid var(--line)", padding: "4px 8px" }}>
              <input type="checkbox" checked={selectedBatchIds.has(b.id)} onChange={() => toggleBatch(b.id)} />
              {b.degreeProgram} — {b.batchName} ({b.offeredCourseCount})
            </label>
          ))}
          {batches.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No batches yet.</p>}
        </div>
        <button onClick={loadCoursesAndGroups} disabled={selectedBatchIds.size === 0} className="btn btn-brass" style={{ fontSize: 12.5 }}>
          Load courses for checked batches
        </button>
      </div>

      {coursesLoaded && (
        <>
          <ContentSyncSuggestions batchIds={Array.from(selectedBatchIds)} onLinked={loadCoursesAndGroups} />

          <div className="card" style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 12 }}>
              Pick any two courses to link for content sync — any semester, any batch, any program; there's no
              restriction, since the SE's saved content is what's shared, not the teaching schedule. One becomes the
              <b> base</b> (senior batch wins; if tied, Computer Science &gt; Software Engineering &gt; Artificial
              Intelligence &gt; Cyber Security &gt; Data Science) — only it can have a Subject Expert assigned and be
              edited; the other inherits automatically and is read-only for SE purposes. If they also happen to be
              offered in the same term, they're additionally combined as one class in Course Equivalence.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "end" }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Course A</label>
                <select value={courseIdA} onChange={(e) => setCourseIdA(e.target.value)} style={{ width: "100%", padding: 6, border: "1px solid var(--line)", fontSize: 13 }}>
                  <option value="">Select a course…</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{optionLabel(c)}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Course B</label>
                <select value={courseIdB} onChange={(e) => setCourseIdB(e.target.value)} style={{ width: "100%", padding: 6, border: "1px solid var(--line)", fontSize: 13 }}>
                  <option value="">Select a course…</option>
                  {courses.filter((c) => c.id !== courseIdA).map((c) => <option key={c.id} value={c.id}>{optionLabel(c)}</option>)}
                </select>
              </div>
              <button onClick={handlePair} disabled={!courseIdA || !courseIdB || busy} className="btn btn-brass">
                {busy ? "Linking…" : "Link"}
              </button>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 14, marginBottom: 10 }}>Existing links (for the checked batches)</h3>
            {groups.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No content-sync links yet for these batches.</p>}
            {groups.map((g) => (
              <div key={g.id} style={{ marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid var(--line)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  {g.name}{g.createdByName && <span style={{ fontSize: 10, color: "var(--slate)", fontWeight: 400 }}> — by {g.createdByName}</span>}
                </div>
                {g.members.map((m) => (
                  <div key={m.courseId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 0" }}>
                    {m.isBase && <span style={{ fontSize: 9, background: "var(--sage)", color: "#fff", padding: "1px 5px", borderRadius: 2 }}>BASE</span>}
                    <span style={{ fontWeight: m.isBase ? 600 : 400 }}>{m.code} — {m.title}</span>
                    <span style={{ color: "var(--slate)", fontSize: 10.5 }}>[{m.degreeProgram}, {m.batchName}, Sem {m.semesterNumber ?? "?"}]</span>
                    <span style={{ flex: 1 }} />
                    {!m.isBase && (
                      <button onClick={() => !busy && handleMakeBase(g.id, m.courseId)} style={{ fontSize: 10, padding: "2px 6px", border: "1px solid var(--line)", background: "#fff" }}>
                        Make base
                      </button>
                    )}
                    <button onClick={() => !busy && handleRemove(g.id, m.courseId)} style={{ fontSize: 10, padding: "2px 6px", border: "1px solid var(--line)", background: "#fff" }}>
                      Unlink
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
