"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Search } from "lucide-react";
import SortableTable from "./SortableTable";
import Pager from "./Pager";
import { useRouter } from "next/navigation";

type Course = {
  id: string; code: string; title: string; creditHours: number; courseType: string; semesterNumber: number | null;
  fromHec: boolean; subjectExpertId: string | null; batchName: string | null; fromBenchmark: boolean;
  prerequisiteCourseId: string | null; batchId: string | null; hasLab: boolean;
};
type SubjectExpert = { id: string; name: string };
type Batch = { id: string; degreeProgram: string; batchName: string };
type Curriculum = { id: string; authority: string; title: string; version: string };

const COURSE_TYPES = ["Core", "Elective", "Lab", "IDS", "General Education", "Capstone Project", "Field Experience"];
const PAGE_SIZES = [10, 25, 50, 100];

export default function CoursesManager({ courses: initialCourses, subjectExperts, batches, curricula, selectedBatchId }: {
  courses: Course[]; subjectExperts: SubjectExpert[]; batches: Batch[]; curricula: Curriculum[]; selectedBatchId: string;
}) {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>(initialCourses);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState("");
  const [importBatchId, setImportBatchId] = useState(selectedBatchId || batches[0]?.id || "");
  const [importCurriculumId, setImportCurriculumId] = useState(curricula[0]?.id || "");
  const [curriculumCourses, setCurriculumCourses] = useState<{ id: string; code: string; title: string; category: string; domain: string | null }[]>([]);
  const [selectedImportIds, setSelectedImportIds] = useState<Set<string>>(new Set());
  const [loadingCourseList, setLoadingCourseList] = useState(false);
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  const [addBatchId, setAddBatchId] = useState(selectedBatchId || batches[0]?.id || "");
  const [copySourceBatchId, setCopySourceBatchId] = useState("");
  const replaceCheckboxRef = useRef<HTMLInputElement>(null);
  const [copyResult, setCopyResult] = useState("");

  // The course table can hold every course of every batch; each row carries two
  // dropdowns (Subject Expert, and every course of its batch as a prerequisite),
  // so only the current page is rendered. Filter/sort work on the full list.
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<{ col: number; asc: boolean } | null>(null);
  const seNameById = useMemo(() => new Map(subjectExperts.map((se) => [se.id, se.name])), [subjectExperts]);
  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const coursesByBatch = useMemo(() => {
    const m = new Map<string | null, Course[]>();
    for (const c of courses) { const list = m.get(c.batchId) || []; list.push(c); m.set(c.batchId, list); }
    return m;
  }, [courses]);
  const visibleCourses = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = !needle ? courses : courses.filter((c) =>
      [c.code, c.title, c.courseType, c.batchName || "", seNameById.get(c.subjectExpertId || "") || ""].some((v) => v.toLowerCase().includes(needle)));
    if (sort) {
      const key = (c: Course): string | number => {
        switch (sort.col) {
          case 0: return c.batchName || "";
          case 1: return c.code;
          case 2: return c.title;
          case 3: return c.creditHours;
          case 4: return c.courseType;
          case 5: return c.semesterNumber ?? 99;
          case 6: return c.fromHec ? "Imported" : "Manual";
          case 7: return seNameById.get(c.subjectExpertId || "") || "";
          case 8: return courseById.get(c.prerequisiteCourseId || "")?.code || "";
          default: return 0;
        }
      };
      list = [...list].sort((a, b) => {
        const ka = key(a), kb = key(b);
        const cmp = typeof ka === "number" && typeof kb === "number" ? ka - kb : String(ka).localeCompare(String(kb), undefined, { numeric: true, sensitivity: "base" });
        return sort.asc ? cmp : -cmp;
      });
    }
    return list;
  }, [courses, query, sort, seNameById, courseById]);
  const pageCount = Math.max(1, Math.ceil(visibleCourses.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageCourses = visibleCourses.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function switchBatch(batchId: string) {
    const url = batchId ? `/coordinator/courses?batchId=${batchId}` : "/coordinator/courses";
    router.push(url);
  }

  useEffect(() => {
    if (!importCurriculumId) return;
    setLoadingCourseList(true);
    fetch(`/api/coordinator/curricula/${importCurriculumId}/courses`)
      .then((r) => r.json())
      .then((data) => {
        const list = data.courses || [];
        setCurriculumCourses(list);
        // pre-select everything except Domain Electives — those are optional, picked explicitly
        setSelectedImportIds(new Set(list.filter((c: any) => c.category !== "Domain Elective").map((c: any) => c.id)));
        setLoadingCourseList(false);
      });
  }, [importCurriculumId]);

  function toggleImportCourse(id: string) {
    setSelectedImportIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleImportDomain(domain: string, select: boolean) {
    const ids = curriculumCourses.filter((c) => (c.domain || "Uncategorized") === domain).map((c) => c.id);
    setSelectedImportIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) select ? next.add(id) : next.delete(id);
      return next;
    });
  }

  async function copyFromBatch() {
    if (!copySourceBatchId || !selectedBatchId) { setError("View a specific batch first (that's the target), and pick a source batch to copy from."); return; }
    const replaceExisting = replaceCheckboxRef.current?.checked || false;
    if (replaceExisting) {
      const proceed = confirm(
        "This will permanently DELETE every existing course in this batch (and their CLOs, lecture plans, assessments, marks, enrollments) before copying fresh from the source batch. This cannot be undone.\n\nContinue?"
      );
      if (!proceed) return;
    }
    setLoading(true); setError(""); setCopyResult("");
    try {
      const res = await fetch("/api/coordinator/courses/copy-from-batch", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceBatchId: copySourceBatchId, targetBatchId: selectedBatchId, replaceExisting }),
      });
      let data: any = {};
      try { data = await res.json(); } catch { setError("No response from server — check Runtime Logs, or try again."); setLoading(false); return; }
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      const errorNote = data.errors ? ` ${data.errors.length} failed: ${data.errors.slice(0, 3).join("; ")}` : "";
      setCopyResult(`${data.deleted ? `Deleted ${data.deleted} existing course(s), then copied` : "Copied"} ${data.created} course(s) from the source batch.${data.skippedAsExisting ? ` ${data.skippedAsExisting} already existed in the target and were left alone.` : ""}${errorNote}`);
      if (data.courses) setCourses(data.courses);
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function importHec() {
    if (!importBatchId || !importCurriculumId) { setError("Select both a batch and a curriculum first."); return; }
    if (selectedImportIds.size === 0) { setError("Select at least one course to import."); return; }
    setLoading(true); setError(""); setImportResult("");
    try {
      const res = await fetch("/api/coordinator/courses/import-hec", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: importBatchId, curriculumId: importCurriculumId, courseIds: Array.from(selectedImportIds) }),
      });
      let data: any = {};
      try { data = await res.json(); }
      catch {
        setError(res.ok
          ? "The import may have partly succeeded but the server didn't send a proper response — refresh the page to check what was actually imported."
          : `Server error (status ${res.status}) with no details — check Vercel's Runtime Logs, or try importing again.`);
        setLoading(false); router.refresh(); return;
      }
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      const errorNote = data.errors ? ` ${data.errors.length} course(s) failed: ${data.errors.slice(0, 3).join("; ")}${data.errors.length > 3 ? "…" : ""}` : "";
      setImportResult(`Imported ${data.created} new course(s) into this batch.${data.alreadyPresent ? ` (${data.alreadyPresent} were already imported into it.)` : ""}${data.benchmarksCopied ? ` ${data.benchmarksCopied} started pre-filled from a previous batch's template.` : ""}${errorNote}`);
      setLoading(false);
      if (importBatchId === selectedBatchId || !selectedBatchId) {
        // Already viewing the batch that was just imported into (or viewing "all batches") — update in place.
        if (data.courses) setCourses((prev) => {
          const otherBatches = prev.filter((c) => c.batchId !== importBatchId);
          return [...otherBatches, ...data.courses].sort((a, b) => (a.semesterNumber ?? 99) - (b.semesterNumber ?? 99) || a.code.localeCompare(b.code));
        });
      } else {
        // Imported into a different batch than the one being viewed — navigate to it, since that's a real view change.
        router.push(`/coordinator/courses?batchId=${importBatchId}`);
      }
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function addCourse(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!addBatchId) { setError("Select a batch first."); return; }
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/coordinator/courses", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: fd.get("code"), title: fd.get("title"), creditHours: fd.get("creditHours"), batchId: addBatchId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setCourses((prev) => [...prev, data.course]);
      (e.target as HTMLFormElement).reset(); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function saveEdit(e: React.FormEvent<HTMLFormElement>, courseId: string) {
    e.preventDefault();
    setLoading(true); setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/coordinator/courses/${courseId}/edit`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: fd.get("code"), title: fd.get("title"), creditHours: fd.get("creditHours"),
          courseType: fd.get("courseType"), semesterNumber: fd.get("semesterNumber") || null,
          hasLab: fd.get("hasLab") === "on",
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, ...data.course } : c));
      setEditingId(null); setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function assignSe(courseId: string, subjectExpertId: string, revertEl?: HTMLSelectElement, revertValue?: string) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/coordinator/courses/${courseId}/assign-se`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectExpertId: subjectExpertId || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't assign — the course still shows its previous Subject Expert.");
        if (revertEl) revertEl.value = revertValue || "";
        setLoading(false); return;
      }
      setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, subjectExpertId: subjectExpertId || null } : c));
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function setPrerequisite(courseId: string, prerequisiteCourseId: string, revertEl?: HTMLSelectElement, revertValue?: string) {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/coordinator/courses/${courseId}/prerequisite`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prerequisiteCourseId: prerequisiteCourseId || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't set the prerequisite — nothing changed.");
        if (revertEl) revertEl.value = revertValue || "";
        setLoading(false); return;
      }
      setCourses((prev) => prev.map((c) => c.id === courseId ? { ...c, prerequisiteCourseId: prerequisiteCourseId || null } : c));
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function splitIntoLab(courseId: string, currentCredit: number) {
    const input = prompt(`How many of the ${currentCredit} credit hours are the Lab component? (The rest stay as the theory course.)`, "1");
    if (input === null) return;
    const labCreditHours = parseInt(input, 10);
    if (isNaN(labCreditHours)) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/coordinator/courses/${courseId}/split-lab`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labCreditHours }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setCourses((prev) => [...prev.map((c) => c.id === courseId ? { ...c, ...data.theoryCourse } : c), data.labCourse]);
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  async function removeCourse(courseId: string, code: string) {
    const proceed = confirm(
      `Delete ${code} completely? This also permanently deletes its CLOs, lecture plan, assessments, marks, and enrollments. This cannot be undone.`
    );
    if (!proceed) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/coordinator/courses/${courseId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Something went wrong."); setLoading(false); return; }
      setCourses((prev) => prev.filter((c) => c.id !== courseId));
      setLoading(false);
    } catch (err: any) { setError("Unexpected error: " + err.message); setLoading(false); }
  }

  if (batches.length === 0) {
    return (
      <div className="card" style={{ borderColor: "var(--rust)" }}>
        <p style={{ fontSize: 12.5, color: "var(--slate)" }}>
          Create a Degree Program & Batch first (see the "Degree Programs & Batches" page) before adding courses —
          every course belongs to a specific batch/cohort.
        </p>
      </div>
    );
  }

  return (
    <>
      {error && <div className="err">{error}</div>}
      {importResult && <div style={{ background: "#E3F8EF", color: "var(--sage)", border: "1px solid #BDEBD6", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>{importResult}</div>}

      <div className="card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label style={{ fontSize: 11.5, color: "var(--slate)", textTransform: "uppercase", letterSpacing: ".05em" }}>Viewing batch</label>
        <select value={selectedBatchId} onChange={(e) => switchBatch(e.target.value)} style={{ padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 }}>
          <option value="">All batches</option>
          {batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}
        </select>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Copy From Another Batch</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 12 }}>
          Duplicates every course in the source batch into the batch you're currently viewing below (including
          each course's CLOs, weights, and lecture schedule) — useful when a program has no official curriculum
          to import from HEC.
        </p>
        {copyResult && <div style={{ background: "#E3F8EF", color: "var(--sage)", border: "1px solid #BDEBD6", padding: "8px 12px", fontSize: 12.5, marginBottom: 12 }}>{copyResult}</div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Copy From</label>
            <select value={copySourceBatchId} onChange={(e) => setCopySourceBatchId(e.target.value)}>
              <option value="">— Select source batch —</option>
              {batches.filter((b) => b.id !== selectedBatchId).map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}
            </select>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--slate)" }}>
            Into: <b style={{ color: "var(--ink)" }}>{batches.find((b) => b.id === selectedBatchId)?.batchName || "select a batch above to view first"}</b>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--rust)" }}>
            <input ref={replaceCheckboxRef} type="checkbox" /> Replace everything (delete existing courses in target batch first)
          </label>
          <button onClick={copyFromBatch} disabled={loading || !selectedBatchId} className="btn btn-brass">{loading ? "Copying…" : "Copy Courses"}</button>
        </div>
        {!selectedBatchId && <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 8 }}>Use "Viewing batch" above to pick the target batch first.</div>}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 4 }}>Import from a Master Curriculum</h3>
        <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 12 }}>
          Choose which curriculum and which batch — the same curriculum can be imported again for a different batch,
          and an updated curriculum version can be imported for a new batch without touching older ones.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Curriculum</label>
            <select value={importCurriculumId} onChange={(e) => setImportCurriculumId(e.target.value)}>
              {curricula.map((c) => <option key={c.id} value={c.id}>{c.authority} {c.title} ({c.version})</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Into Batch</label>
            <select value={importBatchId} onChange={(e) => setImportBatchId(e.target.value)}>
              {batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}
            </select>
          </div>
        </div>

        {loadingCourseList && <p style={{ fontSize: 12, color: "var(--slate)", marginTop: 10 }}>Loading course list…</p>}

        {!loadingCourseList && curriculumCourses.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>
              {selectedImportIds.size} of {curriculumCourses.length} courses selected — core/GE/IDS courses are pre-checked, electives are optional
            </div>
            {(() => {
              const core = curriculumCourses.filter((c) => c.category !== "Domain Elective");
              const domainMap = new Map<string, typeof curriculumCourses>();
              for (const c of curriculumCourses.filter((c) => c.category === "Domain Elective")) {
                const key = c.domain || "Uncategorized";
                if (!domainMap.has(key)) domainMap.set(key, []);
                domainMap.get(key)!.push(c);
              }
              return (
                <>
                  {core.length > 0 && (
                    <div style={{ border: "1px solid var(--line)", marginBottom: 6, padding: 8, background: "#F7F9FE" }}>
                      <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>Core / GE / IDS ({core.length})</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {core.map((c) => (
                          <label key={c.id} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, padding: "2px 6px", border: "1px solid var(--line)", background: selectedImportIds.has(c.id) ? "#EEF2FA" : "#fff" }}>
                            <input type="checkbox" checked={selectedImportIds.has(c.id)} onChange={() => toggleImportCourse(c.id)} />
                            {c.title}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  {[...domainMap.keys()].sort().map((domain) => {
                    const list = domainMap.get(domain)!;
                    const selectedCount = list.filter((c) => selectedImportIds.has(c.id)).length;
                    const isExpanded = expandedDomains.has(domain);
                    return (
                      <div key={domain} style={{ border: "1px solid var(--line)", marginBottom: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", background: "#F7F9FE", cursor: "pointer" }}
                          onClick={() => setExpandedDomains((prev) => { const next = new Set(prev); next.has(domain) ? next.delete(domain) : next.add(domain); return next; })}>
                          <span style={{ fontSize: 11.5 }}>{isExpanded ? "▾" : "▸"} {domain} ({list.length}, {selectedCount} selected)</span>
                          <span style={{ display: "flex", gap: 6 }}>
                            <button onClick={(e) => { e.stopPropagation(); toggleImportDomain(domain, true); }} style={{ fontSize: 10, padding: "1px 6px", border: "1px solid var(--line)", background: "#fff" }}>Select all</button>
                            <button onClick={(e) => { e.stopPropagation(); toggleImportDomain(domain, false); }} style={{ fontSize: 10, padding: "1px 6px", border: "1px solid var(--line)", background: "#fff" }}>Clear</button>
                          </span>
                        </div>
                        {isExpanded && (
                          <div style={{ padding: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {list.map((c) => (
                              <label key={c.id} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, padding: "2px 6px", border: "1px solid var(--line)", background: selectedImportIds.has(c.id) ? "#EEF2FA" : "#fff" }}>
                                <input type="checkbox" checked={selectedImportIds.has(c.id)} onChange={() => toggleImportCourse(c.id)} />
                                {c.title}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <button onClick={importHec} disabled={loading} className="btn btn-import">{loading ? "Importing…" : `Import ${selectedImportIds.size} Course(s)`}</button>
        </div>
      </div>

      <div className="card">
        {courses.length > 8 && (
          <div className="dt-toolbar">
            <label className="dt-search">
              <Search size={15} />
              <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search code, title, type, batch or Subject Expert…" aria-label="Search courses" />
            </label>
            <span className="dt-count">
              {query.trim() ? <><b>{visibleCourses.length}</b> of {courses.length} courses match</> : <><b>{courses.length}</b> courses</>}
            </span>
          </div>
        )}
        <SortableTable paginate={false} searchable={false} onSort={(col, asc) => { setSort({ col, asc }); setPage(1); }}>
          <thead><tr><th>Batch</th><th>Code</th><th>Title</th><th>Credits</th><th>Type</th><th>Semester</th><th>Source</th><th>Subject Expert</th><th>Prerequisite</th><th></th></tr></thead>
          <tbody>
            {courses.length === 0 && <tr><td colSpan={10} style={{ color: "var(--slate)" }}>No courses yet.</td></tr>}
            {courses.length > 0 && visibleCourses.length === 0 && <tr><td colSpan={10} style={{ color: "var(--slate)", textAlign: "center" }}>No courses match “{query}”.</td></tr>}
            {pageCourses.map((c) => editingId === c.id ? (
              <tr key={c.id}>
                <td colSpan={10}>
                  <form onSubmit={(e) => saveEdit(e, c.id)} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "6px 0" }}>
                    <input name="code" defaultValue={c.code} placeholder="Code" style={{ width: 90, padding: "6px 8px", border: "1px solid var(--line)" }} required />
                    <input name="title" defaultValue={c.title} placeholder="Title" style={{ flex: "1 1 200px", padding: "6px 8px", border: "1px solid var(--line)" }} required />
                    <input name="creditHours" type="number" defaultValue={c.creditHours} placeholder="Credits" style={{ width: 70, padding: "6px 8px", border: "1px solid var(--line)" }} required />
                    <select name="courseType" defaultValue={c.courseType} style={{ padding: "6px 8px", border: "1px solid var(--line)" }}>
                      {COURSE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input name="semesterNumber" type="number" min={1} max={8} defaultValue={c.semesterNumber ?? ""} placeholder="Sem" style={{ width: 60, padding: "6px 8px", border: "1px solid var(--line)" }} />
                    <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}>
                      <input type="checkbox" name="hasLab" defaultChecked={c.hasLab} /> Has Lab Component
                    </label>
                    <button type="submit" disabled={loading} className="btn btn-brass" style={{ padding: "5px 10px", fontSize: 11.5 }}>Save</button>
                    <button type="button" onClick={() => setEditingId(null)} className="btn" style={{ padding: "5px 10px", fontSize: 11.5, background: "transparent", color: "var(--ink)", border: "1px solid var(--line)" }}>Cancel</button>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={c.id}>
                <td style={{ fontSize: 11.5, color: "var(--slate)" }}>{c.batchName || "—"}</td>
                <td>{c.code}</td><td>{c.title}</td><td>{c.creditHours}</td><td>{c.courseType}</td>
                <td>{c.semesterNumber ?? "—"}</td>
                <td>{c.fromHec ? <span style={{ color: "var(--sage)" }}>Imported</span> : "Manual"}</td>
                <td>
                  {c.fromBenchmark && (
                    <span style={{ fontSize: 10, background: "#EEF2FF", color: "var(--brass-dark)", padding: "2px 7px", borderRadius: 6, marginRight: 6 }}>
                      Pre-filled from prior batch
                    </span>
                  )}
                  <select defaultValue={c.subjectExpertId || ""} onChange={(e) => assignSe(c.id, e.target.value, e.target, c.subjectExpertId || "")} disabled={loading} style={{ padding: "5px 7px", border: "1px solid var(--line)", fontSize: 12.5 }}>
                    <option value="">— Unassigned —</option>
                    {subjectExperts.map((se) => <option key={se.id} value={se.id}>{se.name}</option>)}
                  </select>
                </td>
                <td>
                  <select defaultValue={c.prerequisiteCourseId || ""} onChange={(e) => setPrerequisite(c.id, e.target.value, e.target, c.prerequisiteCourseId || "")} disabled={loading} style={{ padding: "5px 7px", border: "1px solid var(--line)", fontSize: 12.5 }}>
                    <option value="">— None —</option>
                    {(coursesByBatch.get(c.batchId) || []).filter((other) => other.id !== c.id).map((other) => <option key={other.id} value={other.id}>{other.code}</option>)}
                  </select>
                </td>
                <td>
                  <button onClick={() => setEditingId(c.id)} className="act act-primary" style={{ marginRight: 10 }}>Edit</button>
                  {c.courseType !== "Lab" && (
                    <button onClick={() => splitIntoLab(c.id, c.creditHours)} disabled={loading} className="act act-neutral" style={{ marginRight: 10 }}>Split into Lab</button>
                  )}
                  <button onClick={() => removeCourse(c.id, c.code)} disabled={loading} className="act act-danger">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
        {visibleCourses.length > pageSize || pageSize !== 25 ? (
          <Pager page={currentPage} pageSize={pageSize} total={visibleCourses.length} onPage={setPage}
            onPageSize={(n) => { setPageSize(n); setPage(1); }} pageSizes={PAGE_SIZES} noun="courses" />
        ) : null}
        {subjectExperts.length === 0 && (
          <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 10 }}>No Subject Experts onboarded yet — add one under Faculty Onboarding first.</div>
        )}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Add a Course Manually</h3>
        <form onSubmit={addCourse}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr", gap: 14 }}>
            <div className="field"><label>Course Code</label><input name="code" placeholder="MT 1103" required /></div>
            <div className="field"><label>Course Title</label><input name="title" placeholder="Discrete Structures" required /></div>
            <div className="field"><label>Credit Hours</label><input name="creditHours" type="number" placeholder="3" required /></div>
            <div className="field">
              <label>Batch</label>
              <select value={addBatchId} onChange={(e) => setAddBatchId(e.target.value)}>
                {batches.map((b) => <option key={b.id} value={b.id}>{b.degreeProgram} — {b.batchName}</option>)}
              </select>
            </div>
          </div>
          <button className="btn btn-brass" type="submit" disabled={loading}>{loading ? "Creating…" : "Create Course"}</button>
        </form>
      </div>
    </>
  );
}
