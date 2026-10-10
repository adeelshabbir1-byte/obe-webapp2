"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Report = { id: string; href: string; title: string; param: string };
type Batch = { id: string; degreeProgram: string; batchName: string };
type Course = { id: string; code: string; title: string; batchId: string; semesterNumber: number | null; isOffered: boolean };
type Student = { id: string; label: string; batchId: string };
type CourseMode = "offered" | "all" | "pick";
type Saved = { batchId: string; courseMode: CourseMode; picked: string[]; withStudents: boolean };
type Job = { key: string; title: string; sub: string; url: string; path: string };
type JobState = "waiting" | "loading" | "done" | "skipped";

const C = { ink: "#241A1D", wine: "#7E2435", line: "#E4DFCE", slate: "#574C50" };
const btn = (primary = false): React.CSSProperties => ({ padding: "7px 14px", background: primary ? C.wine : "transparent", color: primary ? "#fff" : "inherit", border: primary ? "none" : "1px solid currentColor", cursor: "pointer", fontSize: 13, textDecoration: "none", display: "inline-block" });

export default function PrintBundleClient({ bundleId, bundleName, reports, backHref, batches, courses, students }: {
  bundleId: string; bundleName: string; reports: Report[]; backHref: string; batches: Batch[]; courses: Course[]; students: Student[];
}) {
  const storeKey = `bundle-defaults-${bundleId}`;
  // Default batch: the one with the most courses being taught right now, else the first one.
  const defaultBatch = useMemo(() => {
    let best = batches[0]?.id || "", n = 0;
    for (const b of batches) { const k = courses.filter((c) => c.batchId === b.id && c.isOffered).length; if (k > n) { n = k; best = b.id; } }
    return best;
  }, [batches, courses]);
  const [cfg, setCfg] = useState<Saved>({ batchId: defaultBatch, courseMode: "offered", picked: [], withStudents: true });
  const [mode, setMode] = useState<"menu" | "combined">("menu");

  // Remember this person's choices for this bundle on this computer.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(storeKey) || "null") as Saved | null;
      if (s && batches.some((b) => b.id === s.batchId)) setCfg({ ...s, picked: s.picked || [] });
    } catch { /* storage unavailable */ }
  }, [storeKey, batches]);
  useEffect(() => { try { localStorage.setItem(storeKey, JSON.stringify(cfg)); } catch { /* ignore */ } }, [cfg, storeKey]);

  const batch = batches.find((b) => b.id === cfg.batchId);
  const batchCourses = courses.filter((c) => c.batchId === cfg.batchId);
  const offered = batchCourses.filter((c) => c.isOffered);
  const chosenCourses = useMemo(() => (cfg.courseMode === "all" ? courses.filter((c) => c.batchId === cfg.batchId) : cfg.courseMode === "offered" ? courses.filter((c) => c.batchId === cfg.batchId && c.isOffered) : courses.filter((c) => c.batchId === cfg.batchId && cfg.picked.includes(c.id))), [courses, cfg.batchId, cfg.courseMode, cfg.picked]);
  const batchStudents = useMemo(() => students.filter((s) => s.batchId === cfg.batchId), [students, cfg.batchId]);
  const has = (p: string) => reports.some((r) => r.param === p);
  const needsCourses = has("course") || has("courseOnly") || has("code");

  const jobs: Job[] = useMemo(() => {
    const out: Job[] = [];
    const q = (o: Record<string, string>) => new URLSearchParams(o).toString();
    const base = batch ? { degree: batch.degreeProgram, batchId: batch.id } : {};
    const push = (r: Report, extra: Record<string, string>, sub: string, key: string) => out.push({ key: `${r.id}|${key}`, title: r.title, sub, url: `${r.href}?${q(extra)}`, path: r.href });
    for (const r of reports) {
      if (r.param === "batch") push(r, base as Record<string, string>, batch ? `${batch.degreeProgram} — ${batch.batchName}` : "", "b");
      else if (r.param === "course") chosenCourses.forEach((c) => push(r, { ...(base as Record<string, string>), courseId: c.id }, `${c.code} — ${c.title}`, c.id));
      else if (r.param === "courseOnly") chosenCourses.forEach((c) => push(r, { courseId: c.id }, `${c.code} — ${c.title}`, c.id));
      else if (r.param === "code") Array.from(new Set(chosenCourses.map((c) => c.code))).forEach((code) => push(r, { code }, code, code));
      else if (r.param === "student") { if (cfg.withStudents) batchStudents.forEach((s) => push(r, { studentId: s.id }, s.label, s.id)); }
      else push(r, {}, "", "n");
    }
    return out;
  }, [reports, batch, chosenCourses, batchStudents, cfg.withStudents]);

  const topBar = (extra?: React.ReactNode) => (
    <div className="no-print" style={{ padding: "12px 20px", background: C.ink, color: "#fff", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <a href="/dashboard" style={{ ...btn(), color: "#fff" }}>⌂ Home</a>
      <a href={backHref} style={{ ...btn(), color: "#fff" }}>← Report bundles</a>
      <b style={{ marginLeft: 8 }}>{bundleName}</b>
      <span style={{ flex: 1 }} />
      {extra}
    </div>
  );

  if (reports.length === 0) {
    return <div>{topBar()}<p style={{ padding: 40, color: C.slate, fontFamily: "system-ui" }}>No reports in this bundle are available to you right now.</p></div>;
  }

  if (mode === "combined") return <Combined jobs={jobs} topBar={topBar} onBack={() => setMode("menu")} />;

  const set = (p: Partial<Saved>) => setCfg((c) => ({ ...c, ...p }));
  const degrees = Array.from(new Set(batches.map((b) => b.degreeProgram)));
  return (
    <div style={{ fontFamily: "system-ui", minHeight: "100vh", background: "#FAF8F3" }}>
      {topBar()}
      <div style={{ padding: "24px 20px", maxWidth: 860, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, margin: "0 0 4px" }}>{bundleName}</h1>
        <p style={{ color: C.slate, fontSize: 13, margin: "0 0 18px" }}>{reports.length} report(s). Choose once below and every report is filled in for you. Your choices are remembered for this bundle on this computer.</p>

        <div style={{ background: "#fff", border: `1px solid ${C.line}`, padding: 16, marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Default selections</h3>
          <label style={{ fontSize: 13, display: "block", marginBottom: 12 }}>Program and batch{" "}
            <select value={cfg.batchId} onChange={(e) => set({ batchId: e.target.value, picked: [] })} style={{ padding: "5px 8px", marginLeft: 6 }}>
              {degrees.map((d) => <optgroup key={d} label={d}>{batches.filter((b) => b.degreeProgram === d).map((b) => <option key={b.id} value={b.id}>{d} — {b.batchName}</option>)}</optgroup>)}
            </select>
          </label>

          {needsCourses && (
            <div style={{ fontSize: 13, marginBottom: 12 }}>
              <div style={{ marginBottom: 6 }}>Courses for the course-level reports</div>
              {([["offered", `Courses being taught this semester (${offered.length})`], ["all", `All courses of this batch (${batchCourses.length})`], ["pick", "Let me choose"]] as [CourseMode, string][]).map(([v, l]) => (
                <label key={v} style={{ display: "block", marginLeft: 8 }}><input type="radio" checked={cfg.courseMode === v} onChange={() => set({ courseMode: v, picked: v === "pick" && cfg.picked.length === 0 ? offered.map((c) => c.id) : cfg.picked })} /> {l}</label>
              ))}
              {cfg.courseMode === "offered" && offered.length === 0 && <div style={{ color: "#b3261e", marginLeft: 8, marginTop: 4 }}>No course of this batch is being taught this semester. Choose "All courses" or pick some.</div>}
              {cfg.courseMode === "pick" && (
                <div style={{ marginTop: 8, border: `1px solid ${C.line}`, padding: 10, maxHeight: 240, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 4 }}>
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, marginBottom: 4 }}>
                    <button type="button" style={btn()} onClick={() => set({ picked: batchCourses.map((c) => c.id) })}>Select all</button>
                    <button type="button" style={btn()} onClick={() => set({ picked: [] })}>Clear</button>
                  </div>
                  {batchCourses.map((c) => (
                    <label key={c.id} style={{ fontSize: 12.5 }}>
                      <input type="checkbox" checked={cfg.picked.includes(c.id)} onChange={() => set({ picked: cfg.picked.includes(c.id) ? cfg.picked.filter((x) => x !== c.id) : [...cfg.picked, c.id] })} />{" "}
                      {c.semesterNumber ? `S${c.semesterNumber} · ` : ""}{c.code} — {c.title}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {has("student") && (
            <label style={{ fontSize: 13, display: "block", marginBottom: 12 }}>
              <input type="checkbox" checked={cfg.withStudents} onChange={(e) => set({ withStudents: e.target.checked })} /> Include a transcript for every student of this batch ({batchStudents.length})
            </label>
          )}

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
            <button style={btn(true)} disabled={jobs.length === 0} onClick={() => setMode("combined")}>Build one combined document ({jobs.length} section{jobs.length === 1 ? "" : "s"})</button>
            {jobs.length > 60 && <span style={{ fontSize: 12, color: C.slate }}>That is a lot of pages and may take a few minutes to prepare.</span>}
          </div>
        </div>

        <div style={{ background: "#fff", border: `1px solid ${C.line}`, padding: 16 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Or open reports one by one</h3>
          <p style={{ fontSize: 12, color: C.slate, margin: "0 0 10px" }}>Each opens in a new tab already filled in with the choices above.</p>
          {reports.map((r) => {
            const mine = jobs.filter((j) => j.key.startsWith(`${r.id}|`));
            return (
              <div key={r.id} style={{ marginBottom: 10, fontSize: 13.5 }}>
                {mine.length <= 1
                  ? <a href={mine[0]?.url || r.href} target="_blank" rel="noopener noreferrer" style={{ color: "#5A1923" }}>{r.title}</a>
                  : <><span>{r.title}</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", fontSize: 12, marginTop: 3 }}>
                      {mine.map((j) => <a key={j.key} href={j.url} target="_blank" rel="noopener noreferrer" style={{ color: "#5A1923" }}>{j.sub.split(" — ")[0]}</a>)}
                    </div></>}
                {mine.length === 0 && <span style={{ fontSize: 12, color: C.slate }}> (nothing selected for this report)</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Loads each report in a hidden frame one at a time, copies the finished page (without sidebar or filters)
// into this document, so the whole bundle prints as normal pages with clean page breaks.
function Combined({ jobs: initialJobs, topBar, onBack }: { jobs: Job[]; topBar: (extra?: React.ReactNode) => React.ReactNode; onBack: () => void }) {
  const [jobs] = useState(initialJobs); // fixed for this run, so a re-render never restarts the loading
  const [state, setState] = useState<Record<string, JobState>>({});
  const [current, setCurrent] = useState(0);
  const holder = useRef<HTMLDivElement>(null);
  const out = useRef<HTMLDivElement>(null);
  const done = current >= jobs.length;

  useEffect(() => {
    if (done || !holder.current) return;
    const job = jobs[current];
    let cancelled = false;
    setState((s) => ({ ...s, [job.key]: "loading" }));
    const frame = document.createElement("iframe");
    frame.style.cssText = "width:1050px;height:1400px;border:0;";
    frame.src = job.url;
    const finish = (ok: boolean) => {
      if (cancelled) return;
      cancelled = true;
      clearTimeout(timer);
      if (ok) {
        try {
          const doc = frame.contentDocument!;
          const main = (doc.querySelector(".main") || doc.body) as HTMLElement;
          const canvases = Array.from(main.querySelectorAll("canvas")).map((c) => { try { return (c as HTMLCanvasElement).toDataURL("image/png"); } catch { return ""; } });
          const clone = main.cloneNode(true) as HTMLElement;
          clone.querySelectorAll("canvas").forEach((c, i) => { const img = document.createElement("img"); img.src = canvases[i] || ""; img.style.maxWidth = "100%"; c.replaceWith(img); });
          clone.querySelectorAll(".no-print, .print-header button, script").forEach((el) => el.remove());
          const section = document.createElement("section");
          section.className = "bundle-section";
          section.innerHTML = clone.innerHTML;
          out.current?.appendChild(section);
          setState((s) => ({ ...s, [job.key]: "done" }));
        } catch { setState((s) => ({ ...s, [job.key]: "skipped" })); }
      } else setState((s) => ({ ...s, [job.key]: "skipped" }));
      frame.remove();
      setCurrent((n) => n + 1);
    };
    const timer = setTimeout(() => finish(true), 30000);
    frame.onload = () => {
      // A report that is not available sends the person to the dashboard; leave it out.
      try { if (frame.contentWindow!.location.pathname !== job.path) return finish(false); } catch { return finish(false); }
      // Wait until the page stops changing (charts and logos load after the page itself).
      let last = -1, still = 0;
      const poll = () => {
        if (cancelled) return;
        const len = frame.contentDocument?.body?.innerHTML.length ?? 0;
        still = len === last ? still + 1 : 0; last = len;
        if (still >= 3) finish(true); else setTimeout(poll, 400);
      };
      setTimeout(poll, 400);
    };
    holder.current.appendChild(frame);
    return () => { if (!cancelled) { cancelled = true; clearTimeout(timer); frame.remove(); } };
  }, [current, done, jobs]);

  const skipped = jobs.filter((j) => state[j.key] === "skipped");
  return (
    <div style={{ background: "#fff", minHeight: "100vh" }}>
      <style>{`
        @media print { .no-print { display: none !important; } body { background: #fff !important; } .bundle-section { padding: 0 !important; } }
        .bundle-section { padding: 16px 24px; border-bottom: 1px dashed ${C.line}; }
        .bundle-section + .bundle-section { break-before: page; page-break-before: always; }
      `}</style>
      {topBar(<>
        <span style={{ fontSize: 12.5, opacity: 0.85 }}>{done ? `Ready: ${jobs.length - skipped.length} of ${jobs.length} section(s)` : `Preparing ${Math.min(current + 1, jobs.length)} of ${jobs.length}: ${jobs[current]?.title}${jobs[current]?.sub ? ` (${jobs[current].sub})` : ""}…`}</span>
        <button onClick={onBack} style={{ ...btn(), color: "#fff" }}>Change selections</button>
        <button onClick={() => window.print()} disabled={!done} style={{ ...btn(true), opacity: done ? 1 : 0.5 }}>Print all</button>
      </>)}
      {done && skipped.length > 0 && (
        <div className="no-print" style={{ padding: "10px 20px", background: "#FFF6E5", fontSize: 12.5 }}>
          Left out because they are not available to you or have nothing to show: {skipped.map((j) => `${j.title}${j.sub ? ` (${j.sub})` : ""}`).join("; ")}
        </div>
      )}
      <div ref={out} />
      <div ref={holder} aria-hidden style={{ position: "absolute", left: -20000, top: 0, width: 1050, overflow: "hidden" }} />
    </div>
  );
}
