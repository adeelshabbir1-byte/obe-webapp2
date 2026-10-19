"use client";

import { useState, useEffect } from "react";
import SortableTable from "./SortableTable";

type Course = { code: string; title: string; courseType: string; domain: string | null; priority: number | null; timesTaught: number | null };
type Wish = { maxSections: number | null; remarks: string; updatedAt: string } | null;

const PRIORITY_COLORS: Record<number, string> = {
  1: "#2E7D32", // top priority - dark green
  2: "#8BC34A", // good - light green
  3: "#FFF176", // fifty-fifty - yellow
};
const PRIORITY_LABELS: Record<number, string> = { 1: "1 — Top priority", 2: "2 — Good, yes", 3: "3 — Fifty-fifty" };

export default function CoursePreferencesManager() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [mySpecialization, setMySpecialization] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [wish, setWish] = useState<{ maxSections: string; remarks: string; updatedAt: string }>({ maxSections: "", remarks: "", updatedAt: "" });
  const [wishState, setWishState] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/faculty/course-preferences");
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); return; }
      setCourses(data.courses); setMySpecialization(data.mySpecialization); setLoaded(true);
      const w = data.wish as Wish;
      if (w) setWish({ maxSections: w.maxSections == null ? "" : String(w.maxSections), remarks: w.remarks || "", updatedAt: w.updatedAt });
    } catch (err: any) { setError("Unexpected error: " + err.message); }
  }
  useEffect(() => { load(); }, []);

  async function setPriority(code: string, priority: number | null) {
    setSavingCode(code); setError("");
    try {
      const res = await fetch("/api/faculty/course-preferences", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseCode: code, priority }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Something went wrong."); setSavingCode(null); return; }
      setCourses((prev) => prev.map((c) => (c.code === code ? { ...c, priority } : c)));
      setSavingCode(null);
    } catch (err: any) { setError("Unexpected error: " + err.message); setSavingCode(null); }
  }

  async function put(body: Record<string, unknown>) {
    const res = await fetch("/api/faculty/course-preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
  }
  async function setTimes(code: string, raw: string) {
    const n = raw === "" ? null : parseInt(raw, 10);
    const cur = courses.find((c) => c.code === code)?.timesTaught ?? null;
    if (n === cur) return;
    setSavingCode(code); setError("");
    try { await put({ courseCode: code, timesTaught: n }); setCourses((prev) => prev.map((c) => (c.code === code ? { ...c, timesTaught: n } : c))); }
    catch (e) { setError((e as Error).message); }
    setSavingCode(null);
  }
  async function saveWish() {
    setWishState("saving"); setError("");
    try { await put({ wish: { maxSections: wish.maxSections, remarks: wish.remarks } }); setWishState("saved"); setWish({ ...wish, updatedAt: new Date().toISOString().slice(0, 10) }); }
    catch (e) { setError((e as Error).message); setWishState(""); }
  }

  return (
    <>
    <div className="card">
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>This semester</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        The Course Assigner&apos;s suggested allocation keeps you within this number of sections (never above your normal load), and shows your remarks.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 12.5 }}>Sections I&apos;d like to teach<br />
          <input type="number" min={0} max={20} value={wish.maxSections} onChange={(e) => { setWish({ ...wish, maxSections: e.target.value }); setWishState(""); }} style={{ width: 90 }} placeholder="normal load" />
        </label>
        <label style={{ fontSize: 12.5, flex: 1, minWidth: 260 }}>Remarks for the Course Assigner<br />
          <input type="text" value={wish.remarks} maxLength={1000} onChange={(e) => { setWish({ ...wish, remarks: e.target.value }); setWishState(""); }} style={{ width: "100%" }} placeholder="e.g. on study leave from week 8; prefer labs; teaching an MS course outside" />
        </label>
        <button type="button" className="btn btn-brass btn-sm" disabled={wishState === "saving"} onClick={saveWish}>{wishState === "saving" ? "Saving…" : wishState === "saved" ? "Saved" : "Save"}</button>
      </div>
      {wish.updatedAt && <p className="small-note" style={{ margin: "6px 0 0" }}>Last updated {wish.updatedAt}.</p>}
    </div>
    <div className="card" style={{ overflowX: "auto" }}>
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>My Course Preferences</h3>
      <p style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 10 }}>
        Rank how interested you are in teaching each course — this is visible to the Course Assigner as a hint
        when they're deciding assignments. Leave unset if you're not interested. Also say how many times you have taught each course before (here or at another university) — it counts towards who gets the course.
        {mySpecialization && <> Courses in your specialization (<b>{mySpecialization}</b>) are listed first below.</>}
      </p>
      {error && <div className="err">{error}</div>}
      {!loaded ? (
        <p style={{ fontSize: 12.5, color: "var(--slate)" }}>Loading…</p>
      ) : (
        <SortableTable>
          <thead><tr><th>Code</th><th>Title</th><th>Type</th><th>Preference</th><th title="Including at other universities">Times taught before</th></tr></thead>
          <tbody>
            {courses.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>No courses on record yet.</td></tr>}
            {courses.map((c) => (
              <tr key={c.code} style={{ background: c.priority ? PRIORITY_COLORS[c.priority] + "33" : undefined }}>
                <td><b>{c.code}</b></td>
                <td>
                  {c.title}
                  {c.domain === mySpecialization && <span className="badge badge-ok" style={{ marginLeft: 6, fontSize: 9.5 }}>Your specialization</span>}
                </td>
                <td>{c.courseType}</td>
                <td>
                  <select
                    value={c.priority ?? ""} disabled={savingCode === c.code}
                    onChange={(e) => setPriority(c.code, e.target.value ? parseInt(e.target.value, 10) : null)}
                    style={{ padding: "5px 7px", border: "1px solid var(--line)", fontSize: 12.5, background: c.priority ? PRIORITY_COLORS[c.priority] : undefined }}
                  >
                    <option value="">Not interested</option>
                    <option value="1">1 — Top priority</option>
                    <option value="2">2 — Good, yes</option>
                    <option value="3">3 — Fifty-fifty</option>
                  </select>
                </td>
                <td>
                  <input type="number" min={0} max={99} defaultValue={c.timesTaught ?? ""} disabled={savingCode === c.code} placeholder="—"
                    onBlur={(e) => setTimes(c.code, e.target.value)} aria-label={`Times taught ${c.code}`}
                    style={{ width: 64, padding: "4px 6px", border: "1px solid var(--line)", fontSize: 12.5 }} />
                </td>
              </tr>
            ))}
          </tbody>
        </SortableTable>
      )}
    </div>
    </>
  );
}
