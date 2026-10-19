"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Source = { id: string; name: string; batches: { id: string; label: string; degree: string; idx: number }[] };
type Summary = { createdAt: string; batches: string[]; courses: number; students: number; marks: number; transcripts: number };

const LOGINS = ["dream.head — Institute Head (Vice Chancellor)", "dream.dean — Dean", "dream.hod.cs / dream.hod.bba — HODs", "dream.omc — OMC", "dream.lead.cs / dream.lead.ai — Program Leads (NCEAC)", "dream.lead.bba — Program Lead BBA (NBEAC)", "dream.sa / dream.facilities / dream.finance / dream.librarian — Student Affairs, Facilities, Finance, Library", "dream.b1 … dream.b6 — Business School teachers", "dream.assigner — Course Assigner", "dream.se — Subject Expert (also teaches)", "dream.instructor — Instructor", "Students: DRM-CS-24-001 … 030, DRM-AI-24-001 … 030, DRM-BB-24-001 … 030"];

export default function DemoInstituteRunner({ summary, sources, password }: { summary: Summary | null; sources: Source[]; password: string }) {
  const router = useRouter();
  const guessInst = sources.find((s) => /case/i.test(s.name)) || sources[0];
  const [instId, setInstId] = useState(guessInst?.id || "");
  const inst = sources.find((s) => s.id === instId);
  const pick = (re: RegExp, year: RegExp) => inst?.batches.find((b) => re.test(b.label) && year.test(b.label))?.id || inst?.batches.find((b) => re.test(b.label))?.id || "";
  const [cs, setCs] = useState(() => pick(/\bBS ?CS|Computer Science/i, /Fall 2024/));
  const [ai, setAi] = useState(() => pick(/\bBS ?AI|Artificial Intelligence/i, /Fall 2025/));
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const batches = useMemo(() => inst?.batches || [], [inst]);

  async function call(body: Record<string, unknown>) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await fetch("/api/admin/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      if (r.ok) return j;
      if (attempt === 1 || r.status < 500) throw new Error(j.error || `HTTP ${r.status}`);
    }
  }

  async function build() {
    setBusy(true); setErr(""); setPct(0);
    try {
      setMsg("Creating the institute, people and students…");
      const { batches: made } = await call({ step: "setup", csBatchId: cs, aiBatchId: ai });
      const steps: Record<string, unknown>[] = [];
      for (const b of made) for (let s = 1; s <= 8; s++) steps.push({ step: "courses", demoBatchId: b.demoBatchId, sourceBatchId: b.sourceBatchId, semester: s, label: `Courses, semester ${s}` });
      for (const b of made) for (let s = 1; s <= 5; s++) steps.push({ step: "activity", demoBatchId: b.demoBatchId, semester: s, label: s < 5 ? `Marks and results, semester ${s}` : "Semester 5 in progress" });
      steps.push({ step: "finish", label: "Outcome Flow weights and CQI notes" });
      await runSteps(steps, false);
      await complete();
    } catch (e) { setErr(`${e instanceof Error ? e.message : e}. You can delete and build again.`); }
    setBusy(false);
  }

  async function runSteps(steps: Record<string, unknown>[], keepBusy = true) {
      for (let i = 0; i < steps.length; i++) {
        setMsg(`${steps[i].label} (${i + 1}/${steps.length})`);
        await call(steps[i]);
        setPct(Math.round(((i + 1) / steps.length) * 100));
      }
      if (keepBusy) setMsg("Done.");
  }

  /** The business school (BBA, NBEAC) and the campus / accreditation data — also adds them to a demo built earlier. */
  async function complete() {
    setMsg("Adding the business school (BBA, NBEAC)…");
    const { batch } = await call({ step: "business" });
    const steps: Record<string, unknown>[] = [];
    for (let s = 1; s <= 8; s++) steps.push({ step: "courses", demoBatchId: batch.demoBatchId, sourceBatchId: batch.sourceBatchId, semester: s, label: `BBA courses, semester ${s}` });
    for (let s = 1; s <= 5; s++) steps.push({ step: "activity", demoBatchId: batch.demoBatchId, semester: s, label: s < 5 ? `BBA marks and results, semester ${s}` : "BBA semester 5 in progress" });
    steps.push({ step: "finishBatch", demoBatchId: batch.demoBatchId, label: "BBA outcome weights" });
    for (const [part, label] of [["people", "Faculty profiles, rooms, labs, library, budget"], ["students", "Admissions, surveys, alumni, societies, evaluations, CQI"], ["accreditation", "NBEAC registers, SAR profile, NCEAC and NBEAC visits"], ["activity", "Meetings, FDP, leave, bookings, meals"]]) steps.push({ step: "campus", part, label });
    await runSteps(steps);
    setMsg("Done — Dream University is ready for NCEAC and NBEAC.");
    router.refresh();
  }

  async function completeOnly() {
    setBusy(true); setErr(""); setPct(0);
    try { await complete(); } catch (e) { setErr(String(e instanceof Error ? e.message : e)); }
    setBusy(false);
  }

  async function remove(rebuild: boolean) {
    if (!confirm(rebuild ? "Delete the demo institute and build it again?" : "Delete the demo institute and everything in it?")) return;
    setBusy(true); setErr(""); setPct(0);
    try {
      for (let i = 1; i <= 60; i++) {
        setMsg(`Deleting… pass ${i}`);
        const r = await call({ step: "delete" });
        setPct(Math.min(95, i * 8));
        if (!r.left) break;
      }
      setPct(100); setMsg("Deleted.");
      if (rebuild) { setBusy(false); return build(); }
      router.refresh();
    } catch (e) { setErr(String(e instanceof Error ? e.message : e)); }
    setBusy(false);
  }

  return (
    <div className="card">
      {summary ? (
        <>
          <b>The demo institute exists</b> <span style={{ color: "var(--slate)", fontSize: 13 }}>(built {new Date(summary.createdAt).toLocaleString()})</span>
          <div style={{ fontSize: 13, margin: "8px 0" }}>{summary.batches.join(" · ")} — {summary.courses} courses, {summary.students} students, {summary.marks.toLocaleString()} marks, {summary.transcripts.toLocaleString()} transcript lines.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-brass" disabled={busy} onClick={completeOnly}>Complete for NCEAC + NBEAC (add BBA and campus data)</button>
            <button className="btn" disabled={busy} onClick={() => remove(true)}>Reset (delete and build again)</button>
            <button className="btn" disabled={busy} style={{ background: "#B42318" }} onClick={() => remove(false)}>Delete</button>
          </div>
        </>
      ) : (
        <>
          <b>Copy the curriculum from</b>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, margin: "8px 0" }}>
            <label style={{ fontSize: 13 }}>Institute<select value={instId} onChange={(e) => { setInstId(e.target.value); setCs(""); setAi(""); }} style={{ width: "100%" }}>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label style={{ fontSize: 13 }}>For the BS CS batch<select value={cs} onChange={(e) => setCs(e.target.value)} style={{ width: "100%" }}><option value="">—</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label>
            <label style={{ fontSize: 13 }}>For the BS AI batch<select value={ai} onChange={(e) => setAi(e.target.value)} style={{ width: "100%" }}><option value="">—</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label>
          </div>
          <button className="btn" disabled={busy || !cs || !ai} onClick={build}>Build the demo institute</button>
          <span style={{ fontSize: 12, color: "var(--slate)", marginLeft: 8 }}>Takes a few minutes; keep this page open.</span>
        </>
      )}
      {(busy || msg) && (
        <div style={{ marginTop: 12 }}>
          <div style={{ height: 8, background: "#E6E9EF", borderRadius: 4 }}><div style={{ width: `${pct}%`, height: 8, background: "var(--accent, #2F6FB0)", borderRadius: 4, transition: "width .3s" }} /></div>
          <div style={{ fontSize: 13, marginTop: 4 }}>{msg}</div>
        </div>
      )}
      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
      <div style={{ marginTop: 14, fontSize: 13 }}>
        <b>Logins</b> (password <code>{password}</code>):
        <ul style={{ margin: "4px 0 0 18px" }}>{LOGINS.map((l) => <li key={l}>{l}</li>)}</ul>
        <p style={{ marginTop: 8 }}>For a presentation, sign in as <b>dream.lead.cs</b> and open <a href="/tour">/tour</a> for a guided walk through the key screens.</p>
      </div>
    </div>
  );
}
