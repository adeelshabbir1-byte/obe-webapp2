"use client";

import { useState, useEffect } from "react";
import ContentSyncSuggestions from "./ContentSyncSuggestions";

type Batch = { id: string; degreeProgram: string; batchName: string; startYear: number; startTerm: string; courseCount: number };
type Course = {
  id: string; code: string; shortName: string | null; title: string; degreeProgram: string; batchName: string; batchId: string;
  semesterNumber: number | null; courseType: string; groupId: string | null; isBase: boolean | null;
};
type GroupMember = {
  courseId: string; isBase: boolean; code: string; shortName: string | null; title: string; batchId: string;
  degreeProgram: string; batchName: string; semesterNumber: number | null; courseType: string;
};
type Group = { id: string; name: string; needsSync: boolean; createdByName?: string | null; masterCourse: { id: string; code: string; title: string } | null; members: GroupMember[] };
type MasterCourseOption = { id: string; code: string; title: string; degreeProgram: string; hasPloSuggestions: boolean };

const TYPE_ORDER = ["Core", "Elective", "Lab", "IDS", "General Education", "Capstone Project", "Field Experience", "Certification"];
function typeRank(t: string): number {
  const i = TYPE_ORDER.indexOf(t);
  return i === -1 ? TYPE_ORDER.length : i;
}

export default function ContentSyncManager() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchesLoaded, setBatchesLoaded] = useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [coursesLoaded, setCoursesLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedCourseIds, setSelectedCourseIds] = useState<Set<string>>(new Set());
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
      try { data = JSON.parse(text); } catch {
        setError(`The server returned an unreadable response (status ${res.status}). Try selecting fewer batches at once.`);
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

  function selectBatches(ids: string[]) {
    setSelectedBatchIds(new Set(ids));
    setCoursesLoaded(false);
  }

  // Click accumulates a selection instead of immediately pairing on the
  // second click — pick as many courses as you want across any number
  // of columns/rows, then submit them ALL at once (button or "S" key),
  // which links every one of them into a single group in one request
  // instead of one round-trip per pair.
  function handleClick(courseId: string) {
    setSelectedCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) next.delete(courseId); else next.add(courseId);
      return next;
    });
  }

  async function handleSubmitGroup() {
    if (selectedCourseIds.size < 2) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/omc/content-sync/group-multiple", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseIds: Array.from(selectedCourseIds) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      const parts = [`Linked ${selectedCourseIds.size} courses — ${data.baseCourseCode || "one"} is the base. Content hasn't been copied yet — use "Sync All Content" when you're ready.`];
      if (data.equivalencePairsMade > 0) parts.push(`${data.equivalencePairsMade} pair(s) among them are also offered in the same term, so were combined for teaching too.`);
      setNotice(parts.join(" "));
      setSelectedCourseIds(new Set());
      setBusy(false); await loadCoursesAndGroups();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  async function handleDetachSelected() {
    if (selectedCourseIds.size < 1) return;
    setBusy(true); setError(""); setNotice("");
    // One at a time, not in parallel — same reasoning as everywhere
    // else in this feature: the DB connection pool here is small, so
    // concurrent requests risk contention rather than saving time.
    const failures: string[] = [];
    let detachedCount = 0;
    for (const courseId of selectedCourseIds) {
      const course = courses.find((c) => c.id === courseId);
      if (!course?.groupId) continue; // not actually linked to anything — nothing to detach
      try {
        const res = await fetch(`/api/omc/content-sync/${course.groupId}/members/${courseId}`, { method: "DELETE" });
        if (res.ok) detachedCount++;
        else { const data = await res.json().catch(() => ({})); failures.push(`${course.code}: ${data.error || "unknown error"}`); }
      } catch (err: any) {
        failures.push(`${course.code}: ${err.message}`);
      }
    }
    setNotice(`Detached ${detachedCount} course(s).` + (failures.length > 0 ? ` Issues: ${failures.join("; ")}` : ""));
    setSelectedCourseIds(new Set());
    setBusy(false);
    await loadCoursesAndGroups();
  }

  // "S" groups the current selection, "D" detaches it — same selection,
  // two different actions, so there's no separate "mode" to enter or
  // exit; just click courses, then press whichever key does what you want.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (busy) return;
      if (e.key.toLowerCase() === "s" && selectedCourseIds.size >= 2) handleSubmitGroup();
      if (e.key.toLowerCase() === "d" && selectedCourseIds.size >= 1) handleDetachSelected();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedCourseIds, busy]);

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

  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null);

  async function handleFixAllBases() {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/omc/content-sync/fix-all-bases", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      if (data.groupsFixed === 0) { setNotice(`Checked ${data.groupsChecked} group(s) — all bases were already correct.`); setBusy(false); return; }
      setNotice(`Corrected ${data.groupsFixed} of ${data.groupsChecked} group(s): ${data.corrections.join("; ")}. Run "Sync All Content" to propagate from the corrected bases.`);
      setBusy(false); await loadCoursesAndGroups();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  async function handleFixMissingEquivalence() {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/omc/content-sync/fix-missing-equivalence", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      if (data.pairsCreated === 0) { setNotice(`Checked ${data.pairsChecked} same-term pair(s) — all were already marked equivalent.`); setBusy(false); return; }
      setNotice(`Created ${data.pairsCreated} missing equivalence link(s): ${data.created.join(", ")}.`);
      setBusy(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); }
  }

  async function handleSyncAll() {
    setBusy(true); setError(""); setNotice(""); setSyncProgress(null);
    let totalGroupsSynced = 0, totalCoursesSynced = 0, totalSkippedGraded = 0, totalSkippedOlderBatch = 0, totalPending = 0;
    const allFailures: string[] = [];
    try {
      // Loop, processing one group per request, until nothing's left
      // pending — a single request trying to sync several groups at
      // once was exactly what could silently exceed a serverless
      // function's execution time limit whenever one of them had many
      // members (some have 20+), leaving the pending count looking
      // completely unchanged or the request hanging indefinitely.
      let consecutiveTimeouts = 0;
      while (true) {
        // A hard client-side timeout on top of the smaller batch size:
        // if a single group's sync still somehow takes very long, this
        // aborts it after 60s. Rather than stopping the whole process
        // over one slow group, it's counted as a failure and the loop
        // moves on — since the server always retries the OLDEST
        // pending group first, stopping entirely here would mean
        // getting stuck retrying that exact same group forever.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        let res: Response;
        try {
          res = await fetch("/api/omc/content-sync/sync-all", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ batchSize: 1 }),
            signal: controller.signal,
          });
        } catch (fetchErr: any) {
          clearTimeout(timeoutId);
          if (fetchErr.name === "AbortError") {
            consecutiveTimeouts++;
            allFailures.push(`One group's sync exceeded 60s and was skipped for this run (attempt ${consecutiveTimeouts}).`);
            if (consecutiveTimeouts >= 5) {
              setError(`Stopped after 5 groups in a row took too long. Synced ${totalGroupsSynced} so far — try again, or check if one specific group has an unusually large number of members.`);
              setBusy(false); setSyncProgress(null); return;
            }
            // Aborting the client's fetch doesn't necessarily cancel
            // the server-side work — it may still be running. A short
            // pause before retrying reduces the chance of a new
            // request picking up the exact same still-processing group.
            await new Promise((resolve) => setTimeout(resolve, 5000));
            continue;
          }
          setError(`Synced ${totalGroupsSynced} of ${totalPending || "?"} so far, then hit a network error: ${fetchErr.message}`);
          setBusy(false); setSyncProgress(null); return;
        }
        clearTimeout(timeoutId);
        consecutiveTimeouts = 0;
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); setSyncProgress(null); return; }

        totalPending = data.totalPending;
        totalGroupsSynced += data.groupsSynced;
        totalCoursesSynced += data.coursesSynced;
        totalSkippedGraded += data.coursesSkippedGraded;
        totalSkippedOlderBatch += data.coursesSkippedOlderBatch || 0;
        if (data.failures?.length > 0) allFailures.push(...data.failures);
        setSyncProgress({ done: totalGroupsSynced + allFailures.length, total: totalPending });

        if (data.remainingPending <= 0) break;
        // Safety valve: if a batch made no progress at all (0 synced, 0
        // failed), stop rather than looping forever.
        if (data.groupsSynced === 0 && data.failures.length === 0) break;
      }

      if (totalPending === 0) { setNotice("Nothing pending — everything's already synced."); setBusy(false); setSyncProgress(null); return; }
      const parts = [`Synced ${totalGroupsSynced} of ${totalPending} group(s), copying content to ${totalCoursesSynced} course(s).`];
      if (totalSkippedGraded > 0) parts.push(`${totalSkippedGraded} course(s) skipped — already have entered grades.`);
      if (totalSkippedOlderBatch > 0) parts.push(`${totalSkippedOlderBatch} course(s) in older, already-completed batches were left untouched, as intended.`);
      if (allFailures.length > 0) parts.push(`Issues: ${allFailures.join(" | ")}`);
      setNotice(parts.join(" "));
      setBusy(false); setSyncProgress(null); await loadCoursesAndGroups();
    } catch (err: any) { setError("Unexpected error: " + err.message); setBusy(false); setSyncProgress(null); }
  }

  const [editingCodeCourseId, setEditingCodeCourseId] = useState<string | null>(null);
  const [editCodeValue, setEditCodeValue] = useState("");
  const [editCodeApplyAll, setEditCodeApplyAll] = useState(true);
  const [showOnlyUnlinked, setShowOnlyUnlinked] = useState(false);
  const [masterOptions, setMasterOptions] = useState<MasterCourseOption[]>([]);
  const [pickerOpenForGroup, setPickerOpenForGroup] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  // Selecting an HEC course no longer saves immediately — it just
  // records the choice here. Nothing hits the database (or re-fetches
  // this whole batch's data) until "Save HEC Links" is clicked, which
  // commits everything pending in one request.
  const [pendingLinks, setPendingLinks] = useState<Map<string, string | null>>(new Map());
  const [savingLinks, setSavingLinks] = useState(false);

  useEffect(() => {
    fetch("/api/omc/equivalence/master-course-options").then((r) => r.json()).then((d) => { if (d.options) setMasterOptions(d.options); });
  }, []);

  function selectPendingMasterCourse(contentSyncGroupId: string, masterCourseId: string | null) {
    setPendingLinks((prev) => new Map(prev).set(contentSyncGroupId, masterCourseId));
    setPickerOpenForGroup(null); setPickerSearch("");
  }

  async function saveHecLinks() {
    if (pendingLinks.size === 0) return;
    setSavingLinks(true); setError(""); setNotice("");
    try {
      const links = Array.from(pendingLinks.entries()).map(([contentSyncGroupId, masterCourseId]) => ({ contentSyncGroupId, masterCourseId }));
      const res = await fetch("/api/omc/equivalence/set-master-course-batch", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ links }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setSavingLinks(false); return; }
      const updates: Map<string, any> = new Map((data.updated || []).map((u: any) => [u.groupId, u.masterCourse]));
      setGroups((prev) => prev.map((g) => updates.has(g.id) ? { ...g, masterCourse: updates.get(g.id) as any } : g));
      setPendingLinks(new Map());
      setNotice(`Saved ${links.length} HEC course link(s).`);
      setSavingLinks(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setSavingLinks(false); }
  }

  function startEditCode(courseId: string, currentCode: string, courseType: string) {
    setEditingCodeCourseId(courseId); setEditCodeValue(currentCode);
    // Electives are inherently program-specific — defaulting to
    // "same program only" means you don't have to remember to uncheck
    // this every single time for what's usually the common case.
    setEditCodeApplyAll(courseType !== "Elective");
  }

  async function saveEditCode() {
    if (!editingCodeCourseId || !editCodeValue.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/omc/content-sync/courses/change-code", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: editingCodeCourseId, newCode: editCodeValue.trim(), applyToAllPrograms: editCodeApplyAll }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setBusy(false); return; }
      setNotice(`Code updated on ${data.updatedCount} course(s) — earlier batches were left untouched.`);
      setEditingCodeCourseId(null); setBusy(false); await loadCoursesAndGroups();
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

  // Row layout: existing groups first (sorted by their base's semester +
  // type), then ungrouped courses clustered by (semester, type, title)
  // so same-named courses from different batches naturally land in the
  // same row, side by side, ready to click and pair — same visual style
  // as the Course Equivalence grid.
  // Same rule that decides which course becomes a group's BASE
  // (lib/contentSync.ts's determineBaseCourseId) — sorting columns this
  // way means the base tends to land toward the left for most rows,
  // without needing to reorder columns differently per row (which isn't
  // possible anyway, since a group's base can be a different batch than
  // another group's).
  const DEGREE_PRIORITY = ["computer science", "software engineering", "artificial intelligence", "cyber", "data science"];
  function degreePriorityRank(degreeProgram: string): number {
    const lower = degreeProgram.toLowerCase();
    const i = DEGREE_PRIORITY.findIndex((d) => lower.includes(d));
    return i === -1 ? DEGREE_PRIORITY.length : i;
  }
  function batchTermIndex(b: Batch): number {
    return b.startTerm === "Spring" ? b.startYear * 2 - 1 : b.startYear * 2;
  }
  const batchColumns = batches
    .filter((b) => selectedBatchIds.has(b.id))
    .sort((a, b) => batchTermIndex(b) - batchTermIndex(a) || degreePriorityRank(a.degreeProgram) - degreePriorityRank(b.degreeProgram));

  type Row = { key: string; label: string; kind: "group" | "ungrouped"; groupId?: string; semesterNumber: number | null; courseType: string; courses: (Course | GroupMember)[] };

  const groupRows: Row[] = groups.map((g) => {
    const base = g.members.find((m) => m.isBase) || g.members[0];
    return { key: `group:${g.id}`, label: g.name, kind: "group", groupId: g.id, semesterNumber: base?.semesterNumber ?? null, courseType: base?.courseType ?? "Core", courses: g.members };
  });

  const ungroupedCourses = courses.filter((c) => !c.groupId);
  const ungroupedClusters = new Map<string, Course[]>();
  for (const c of ungroupedCourses) {
    // Cluster by (semester, type, short name if set, else title) — two
    // courses across different batches with slightly different exact
    // titles but the same short name you've assigned are still the same
    // real course, so they should line up in the same row too.
    const nameKey = (c.shortName || c.title).trim().toLowerCase();
    const clusterKey = `${c.semesterNumber}|${c.courseType}|${nameKey}`;
    if (!ungroupedClusters.has(clusterKey)) ungroupedClusters.set(clusterKey, []);
    ungroupedClusters.get(clusterKey)!.push(c);
  }
  const ungroupedRows: Row[] = Array.from(ungroupedClusters.entries()).map(([key, cs]) => ({
    key: `ungrouped:${key}`, label: cs[0].title, kind: "ungrouped", semesterNumber: cs[0].semesterNumber, courseType: cs[0].courseType, courses: cs,
  }));

  const allRows = [...groupRows, ...ungroupedRows].sort((a, b) =>
    (a.semesterNumber ?? 999) - (b.semesterNumber ?? 999) || typeRank(a.courseType) - typeRank(b.courseType) || a.label.localeCompare(b.label)
  );
  // Only group rows can actually be "linked" or not — an ungrouped row
  // has no group to attach a HEC link to at all, so it's excluded from
  // this filter too rather than shown as a false positive.
  const visibleRows = showOnlyUnlinked
    ? allRows.filter((row) => row.kind === "group" && !groups.find((g) => g.id === row.groupId)?.masterCourse)
    : allRows;

  function coursesInCell(row: Row, batchId: string): (Course | GroupMember)[] {
    return row.courses.filter((c) => c.batchId === batchId);
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      {notice && <div style={{ fontSize: 12.5, background: "#ECFBF4", border: "1px solid var(--sage)", padding: 8, marginBottom: 10 }}>{notice}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 8 }}>
          Check which batches to work with — only the last 4 admission years are listed, and only what you check
          gets loaded below.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--slate)" }}>Quick select:</span>
          <button onClick={() => selectBatches(batches.map((b) => b.id))} style={{ fontSize: 10.5, padding: "2px 7px", border: "1px solid var(--line)", background: "#fff" }}>
            All
          </button>
          {Array.from(new Set(batches.map((b) => b.degreeProgram))).map((program) => (
            <button key={program} onClick={() => selectBatches(batches.filter((b) => b.degreeProgram === program).map((b) => b.id))} style={{ fontSize: 10.5, padding: "2px 7px", border: "1px solid var(--line)", background: "#fff" }}>
              {program}
            </button>
          ))}
          {Array.from(new Set(batches.map((b) => b.startYear))).sort((a, b) => b - a).map((year) => (
            <button key={year} onClick={() => selectBatches(batches.filter((b) => b.startYear === year).map((b) => b.id))} style={{ fontSize: 10.5, padding: "2px 7px", border: "1px solid var(--line)", background: "#fff" }}>
              {year}
            </button>
          ))}
          <button onClick={() => selectBatches([])} style={{ fontSize: 10.5, padding: "2px 7px", border: "1px solid var(--line)", background: "#fff" }}>
            None
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
          {batches.map((b) => (
            <label key={b.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, border: "1px solid var(--line)", padding: "4px 8px" }}>
              <input type="checkbox" checked={selectedBatchIds.has(b.id)} onChange={() => toggleBatch(b.id)} />
              {b.degreeProgram} — {b.batchName} ({b.courseCount})
            </label>
          ))}
          {batches.length === 0 && <p style={{ fontSize: 12.5, color: "var(--slate)" }}>No batches yet.</p>}
        </div>
        <button onClick={loadCoursesAndGroups} disabled={selectedBatchIds.size === 0} className="btn btn-brass" style={{ fontSize: 12.5 }}>
          Load courses for checked batches
        </button>
        <button onClick={handleFixAllBases} disabled={busy} style={{ fontSize: 12.5, padding: "5px 10px", border: "1px solid var(--line)", background: "#fff", marginLeft: 8 }}>
          Fix All Bases (one-time correction for older links)
        </button>
        <button onClick={handleFixMissingEquivalence} disabled={busy} style={{ fontSize: 12.5, padding: "5px 10px", border: "1px solid var(--line)", background: "#fff", marginLeft: 8 }}>
          Fix Missing Equivalence (link same-term pairs for teaching too)
        </button>
      </div>

      {coursesLoaded && (
        <>
          <ContentSyncSuggestions batchIds={Array.from(selectedBatchIds)} onLinked={loadCoursesAndGroups} />

          {pendingLinks.size > 0 && (
            <div className="card" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, background: "#FFF7ED", position: "sticky", top: 0, zIndex: 5 }}>
              <span style={{ fontSize: 12.5 }}>
                <b>{pendingLinks.size}</b> HEC course link(s) selected but not saved yet.
              </span>
              <button onClick={saveHecLinks} disabled={savingLinks} className="btn btn-brass" style={{ fontSize: 12, padding: "5px 12px", whiteSpace: "nowrap" }}>
                {savingLinks ? "Saving…" : `Save HEC Links (${pendingLinks.size})`}
              </button>
              <button onClick={() => setPendingLinks(new Map())} disabled={savingLinks} style={{ fontSize: 11.5, padding: "5px 10px", border: "1px solid var(--line)", background: "#fff" }}>
                Discard
              </button>
            </div>
          )}

          {groups.some((g) => g.needsSync) && (
            <div className="card" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 12, background: "#FFFBEB" }}>
              <span style={{ fontSize: 12.5 }}>
                <b>{groups.filter((g) => g.needsSync).length}</b> group(s) linked but not yet synced — their base's content hasn't been copied to followers yet.
              </span>
              <button onClick={handleSyncAll} disabled={busy} className="btn btn-ai" style={{ fontSize: 12, padding: "5px 12px", whiteSpace: "nowrap" }}>
                {syncProgress ? `Syncing… ${syncProgress.done}/${syncProgress.total}` : busy ? "Syncing…" : "Sync All Content"}
              </button>
            </div>
          )}

          <div className="card" style={{ overflowX: "auto" }}>
            <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 10 }}>
              Click any number of courses to select them (any batch, any semester, even several from the same
              batch), then click "Group Selected" or press <b>S</b> to link them all at once into one group, or
              click "Detach Selected" / press <b>D</b> to unlink whichever of the selected courses are
              currently linked — whichever is from the most RECENT batch becomes the editable <b>base</b> (tie
              broken by Computer Science &gt; Software Engineering &gt; Artificial Intelligence &gt; Cyber
              Security &gt; Data Science). Changes to the base only ever propagate to same-term-or-later
              members — an older, already-completed batch's course is never rewritten, so it stays an accurate
              historical record of what that batch was actually taught. If any selected course is already a
              group's base, that group is reused and the rest merge into it. Rows are sorted by semester, then course type, so related courses line up
              together. (Double-click a single linked course to unlink just that one, without selecting first.)
            </p>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 10 }}>
              <input type="checkbox" checked={showOnlyUnlinked} onChange={(e) => setShowOnlyUnlinked(e.target.checked)} />
              Show only groups not yet linked to a HEC course
            </label>
            {selectedCourseIds.size > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, background: "#EFF1FF", padding: 8, border: "1px solid var(--brass)" }}>
                <span style={{ fontSize: 12, color: "var(--brass-dark)" }}>{selectedCourseIds.size} course(s) selected.</span>
                <button onClick={handleSubmitGroup} disabled={selectedCourseIds.size < 2 || busy} className="btn btn-brass" style={{ fontSize: 11.5, padding: "4px 10px" }}>
                  Group Selected ({selectedCourseIds.size}) — or press S
                </button>
                <button onClick={handleDetachSelected} disabled={selectedCourseIds.size < 1 || busy} style={{ fontSize: 11.5, padding: "4px 10px", border: "1px solid var(--rust)", background: "#fff", color: "var(--rust)" }}>
                  Detach Selected — or press D
                </button>
                <button onClick={() => setSelectedCourseIds(new Set())} style={{ fontSize: 11.5, padding: "4px 10px", border: "1px solid var(--line)", background: "#fff" }}>
                  Clear
                </button>
              </div>
            )}
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 140, textAlign: "left", fontSize: 11, padding: 4 }}>Course</th>
                  <th style={{ minWidth: 200, textAlign: "left", fontSize: 11, padding: 4 }}>HEC Course</th>
                  {batchColumns.map((b) => (
                    <th key={b.id} style={{ minWidth: 170, textAlign: "left", fontSize: 11, padding: 4 }}>{b.degreeProgram} — {b.batchName}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, idx) => {
                  const prevRow = visibleRows[idx - 1];
                  const newSemester = idx > 0 && prevRow.semesterNumber !== row.semesterNumber;
                  return (
                    <tr key={row.key} style={{ borderTop: newSemester ? "2px solid var(--line)" : undefined }}>
                      <td style={{ fontSize: 10.5, color: "var(--slate)", padding: 4, verticalAlign: "top" }}>
                        {idx === 0 || newSemester ? <b style={{ color: "var(--ink)" }}>Sem {row.semesterNumber ?? "?"}</b> : null}
                        <div>{row.courseType}</div>
                        <div style={{ fontStyle: "italic" }}>{row.label}</div>
                      </td>
                      <td style={{ padding: 4, verticalAlign: "top", background: row.kind === "group" && !groups.find((g) => g.id === row.groupId)?.masterCourse && !pendingLinks.has(row.groupId || "") ? "#FFE8ED" : undefined }}>
                        {row.kind === "group" && row.groupId && (() => {
                          const group = groups.find((g) => g.id === row.groupId);
                          if (!group) return null;
                          const hasPending = pendingLinks.has(group.id);
                          const pendingId = pendingLinks.get(group.id);
                          const pendingOption = pendingId ? masterOptions.find((o) => o.id === pendingId) : null;
                          const isOpen = pickerOpenForGroup === group.id;
                          if (!isOpen) {
                            return (
                              <div onClick={() => setPickerOpenForGroup(group.id)} style={{ cursor: "pointer", fontSize: 11, ...(hasPending ? { boxShadow: "inset 3px 0 0 0 #D97706" } : {}) }} title={hasPending ? "Not saved yet — click Save HEC Links" : undefined}>
                                {hasPending ? (
                                  pendingOption ? (
                                    <>
                                      <div style={{ fontWeight: 600 }}>{pendingOption.code} <span style={{ fontSize: 9.5, color: "#D97706", fontWeight: 400 }}>(unsaved)</span></div>
                                      <div style={{ color: "var(--slate)" }}>{pendingOption.title}</div>
                                    </>
                                  ) : (
                                    <span style={{ color: "#D97706", fontWeight: 600 }}>Cleared (unsaved)</span>
                                  )
                                ) : group.masterCourse ? (
                                  <>
                                    <div style={{ fontWeight: 600 }}>{group.masterCourse.code}</div>
                                    <div style={{ color: "var(--slate)" }}>{group.masterCourse.title}</div>
                                  </>
                                ) : (
                                  <span style={{ color: "var(--rust)", fontWeight: 600 }}>Not linked — click to set</span>
                                )}
                              </div>
                            );
                          }
                          const filtered = masterOptions.filter((o) =>
                            !pickerSearch || o.code.toLowerCase().includes(pickerSearch.toLowerCase()) || o.title.toLowerCase().includes(pickerSearch.toLowerCase())
                          ).slice(0, 30);
                          return (
                            <div style={{ background: "#EFF1FF", border: "1px solid var(--brass)", padding: 6, minWidth: 240 }}>
                              <input
                                autoFocus value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)}
                                placeholder="Search HEC course code or title…"
                                style={{ width: "100%", fontSize: 11, padding: 3, border: "1px solid var(--line)", marginBottom: 4 }}
                              />
                              <div style={{ maxHeight: 180, overflowY: "auto" }}>
                                {(group.masterCourse || hasPending) && (
                                  <div onClick={() => selectPendingMasterCourse(group.id, null)} style={{ fontSize: 11, padding: "3px 4px", cursor: "pointer", color: "var(--rust)" }}>
                                    ✕ Clear link
                                  </div>
                                )}
                                {filtered.map((o) => (
                                  <div key={o.id} onClick={() => selectPendingMasterCourse(group.id, o.id)} style={{ fontSize: 11, padding: "3px 4px", cursor: "pointer", borderBottom: "1px solid var(--line)" }}>
                                    <b>{o.code}</b> — {o.title}
                                    {o.hasPloSuggestions && <span style={{ fontSize: 9, background: "#FFF3DC", padding: "0 4px", marginLeft: 4 }}>HEC PLOs</span>}
                                    <div style={{ fontSize: 9.5, color: "var(--slate)" }}>{o.degreeProgram}</div>
                                  </div>
                                ))}
                                {filtered.length === 0 && <div style={{ fontSize: 11, color: "var(--slate)", padding: 4 }}>No matches.</div>}
                              </div>
                              <button onClick={() => { setPickerOpenForGroup(null); setPickerSearch(""); }} style={{ fontSize: 10.5, padding: "2px 6px", marginTop: 4, border: "1px solid var(--line)", background: "#fff" }}>
                                Cancel
                              </button>
                            </div>
                          );
                        })()}
                      </td>
                      {batchColumns.map((b) => {
                        const cellCourses = coursesInCell(row, b.id);
                        return (
                          <td key={b.id} style={{ padding: 4, verticalAlign: "top" }}>
                            {cellCourses.map((c) => {
                              const cId = (c as Course).id || (c as GroupMember).courseId;
                              const isSelected = selectedCourseIds.has(cId);
                              const cIsBase = (c as Course).isBase ?? (c as GroupMember).isBase;
                              return (
                                <div key={cId}>
                                  <div
                                    onClick={() => !busy && handleClick(cId)}
                                    onDoubleClick={() => row.kind === "group" && row.groupId && !busy && handleRemove(row.groupId, cId)}
                                    title={`${c.code} — ${c.title}`}
                                    style={{
                                      cursor: "pointer", padding: "3px 6px", marginBottom: 2, fontSize: 11.5,
                                      background: isSelected ? "#E7F5EF" : row.kind === "group" ? "#FEF3C7" : undefined,
                                      border: isSelected ? "1px solid var(--brass)" : "1px solid var(--line)",
                                      display: "flex", alignItems: "center", gap: 4,
                                    }}
                                  >
                                    {cIsBase && <span style={{ fontSize: 8.5, background: "var(--sage)", color: "#fff", padding: "0 4px", borderRadius: 6 }}>BASE</span>}
                                    <span style={{ flex: 1 }}>{c.shortName || c.code}</span>
                                    <span
                                      onClick={(e) => { e.stopPropagation(); startEditCode(cId, c.code, row.courseType); }}
                                      title="Edit course code"
                                      style={{ fontSize: 9, color: "var(--slate)", cursor: "pointer" }}
                                    >
                                      ✎
                                    </span>
                                  </div>
                                  {editingCodeCourseId === cId && (
                                    <div style={{ fontSize: 10.5, background: "#EFF1FF", border: "1px solid var(--brass)", padding: 6, marginTop: 2, marginBottom: 4 }}>
                                      <input
                                        value={editCodeValue} onChange={(e) => setEditCodeValue(e.target.value)}
                                        style={{ width: "100%", fontSize: 11, padding: 3, border: "1px solid var(--line)", marginBottom: 4 }}
                                        placeholder="New code"
                                      />
                                      {row.kind === "group" && (
                                        <label style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                                          <input type="checkbox" checked={editCodeApplyAll} onChange={(e) => setEditCodeApplyAll(e.target.checked)} />
                                          Apply to all programs {row.courseType === "Elective" ? "(unchecked by default for electives)" : "(checked by default for non-electives)"}
                                        </label>
                                      )}
                                      <div style={{ color: "var(--slate)", marginBottom: 4 }}>Only this batch and later ones are changed — earlier batches keep their code.</div>
                                      <div style={{ display: "flex", gap: 4 }}>
                                        <button onClick={saveEditCode} disabled={busy} className="btn btn-brass" style={{ fontSize: 10.5, padding: "2px 8px" }}>Save</button>
                                        <button onClick={() => setEditingCodeCourseId(null)} style={{ fontSize: 10.5, padding: "2px 8px", border: "1px solid var(--line)", background: "#fff" }}>Cancel</button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
