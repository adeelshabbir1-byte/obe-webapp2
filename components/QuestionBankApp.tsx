"use client";
import { useCallback, useEffect, useState } from "react";
import MathText, { EquationButton } from "./MathText";
import { TYPES } from "../lib/qbankCore";

// The question bank (Part 6, build A): the PIN gate, one search over every type (the MCQ bank included), adding a
// question (types, parts, equations, answers), review by the SE / Program Lead, who sees what (private, course
// teachers, chosen colleagues, an access code), drafting a paper (+ version B) that becomes the mid / final paper,
// Excel import, past papers and a past paper's PDF into the bank.

type Plan = { lectures: { lectureNumber: number; week: number; topic: string; clo: string | null }[]; clos: { code: string; statement: string; bloomLevel: string }[] };
type QItem = { id: string; type: string; text: string; marks: number; cloCodes: string[]; bloom: string; difficulty: string; measuredDifficulty: string | null; lectureNumber: number | null; topic: string; author: string; authorId: string; status: string; visibility: string; parts: { label: string; text: string; marks: number; cloCode: string | null }[]; lockedUntil: number | null; usedCount: number; flags: string[]; mcq: boolean; options: string[]; correct: number[]; modelAnswer: string | null; source: string; reviewNote: string | null; aiDraft: boolean };
const API = "/api/qbank";
const FLAG: Record<string, string> = { TOO_EASY: "Too easy", TOO_HARD: "Too hard", AMBIGUOUS: "Ambiguous", FAULTY: "Faulty" };
const VIS: Record<string, string> = { PRIVATE: "Private (only me)", COURSE: "Course teachers", CHOSEN: "Chosen teachers" };
const termName = (i: number | null) => (i === null ? "" : `${i % 2 ? "Fall" : "Spring"} ${Math.floor(i / 2)}`);
async function call(body: Record<string, unknown>) {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || `Failed (${r.status})`), { pin: d.pin });
  return d;
}

export default function QuestionBankApp({ courseId, plan, userId, colleagues }: { courseId: string; plan: Plan; userId: string; colleagues: { id: string; name: string }[] }) {
  const [pin, setPin] = useState<{ set: boolean; unlocked: boolean; blocked?: boolean } | null>(null);
  const [tab, setTab] = useState("bank");
  const [items, setItems] = useState<QItem[]>([]);
  const [reviewer, setReviewer] = useState(false);
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const loadPin = useCallback(async () => setPin(await fetch(`${API}?pin=1`).then((r) => r.json()).catch(() => ({ set: false, unlocked: false }))), []);
  const load = useCallback(async () => {
    const r = await fetch(`${API}?courseId=${encodeURIComponent(courseId)}&q=${encodeURIComponent(q)}`);
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && d.pin) { setPin((p) => ({ ...(p || { set: true }), unlocked: false })); return; }
    if (!r.ok) { setMsg({ ok: false, text: d.error || "Could not open the bank." }); return; }
    setItems(d.items || []); setReviewer(!!d.reviewer);
  }, [courseId, q]);
  useEffect(() => { loadPin(); }, [loadPin]);
  useEffect(() => { if (pin?.unlocked) load(); }, [pin?.unlocked, load]);
  // 15 minutes without a bank action: the PIN is asked again.
  useEffect(() => { if (!pin?.unlocked) return; let t = setTimeout(() => setPin((p) => p && { ...p, unlocked: false }), 15 * 60000); const reset = () => { clearTimeout(t); t = setTimeout(() => setPin((p) => p && { ...p, unlocked: false }), 15 * 60000); }; window.addEventListener("click", reset); return () => { clearTimeout(t); window.removeEventListener("click", reset); }; }, [pin?.unlocked]);

  const act = async (body: Record<string, unknown>, ok: (d: Record<string, any>) => string) => {
    setMsg(null);
    try { const d = await call(body); setMsg({ ok: true, text: ok(d) }); await load(); return d; }
    catch (e) { if ((e as { pin?: boolean }).pin) setPin((p) => p && { ...p, unlocked: false }); setMsg({ ok: false, text: (e as Error).message }); return null; }
  };

  if (!pin) return <p className="small-note">Loading…</p>;
  if (!pin.unlocked) return <PinGate state={pin} onDone={() => { setPin({ set: true, unlocked: true }); }} />;

  const drafts = items.filter((x) => x.status === "DRAFT" && x.visibility !== "PRIVATE" && x.authorId !== userId);
  return (
    <div>
      <nav className="tabs" style={{ marginBottom: 10 }}>
        {[["bank", `Bank (${items.length})`], ["add", "Add a question"], ...(reviewer ? [["review", `Review (${drafts.length})`]] : []), ["draft", "Draft a paper"], ["import", "Import"], ["sharing", "Sharing"]].map(([k, t]) => (
          <button key={k} className="tab" aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)} data-tab={k} style={{ background: "none", border: 0, cursor: "pointer" }}>{t}</button>))}
      </nav>
      {msg && <div className={msg.ok ? "ok" : "err"} role="status" data-msg>{msg.text}</div>}
      {tab === "bank" && (
        <div className="card" style={{ overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}><input placeholder="Search text, topic, CLO, type…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") load(); }} style={{ minWidth: 300 }} data-search /><button className="btn btn-secondary btn-sm" onClick={load}>Search</button></div>
          <table style={{ fontSize: 12.5 }}><thead><tr><th /><th>Question</th><th>Type</th><th>CLO</th><th>Bloom</th><th>Difficulty</th><th>Marks</th><th>Topic</th><th>Status</th><th>Who sees it</th><th>Author</th><th /></tr></thead>
            <tbody>{items.map((x) => (
              <tr key={x.id} data-q={x.id} data-status={x.status}>
                <td>{x.authorId === userId && !x.mcq && <input type="checkbox" checked={sel.has(x.id)} onChange={(e) => { const n = new Set(sel); if (e.target.checked) n.add(x.id); else n.delete(x.id); setSel(n); }} />}</td>
                <td style={{ maxWidth: 460 }}><MathText text={x.text} />{x.options.length > 0 && <div className="small-note">{x.options.map((o, i) => <div key={i}>({String.fromCharCode(97 + i)}) <MathText text={o} />{x.correct.includes(i) ? " ✓" : ""}</div>)}</div>}
                  {x.parts.length > 0 && <div className="small-note">{x.parts.map((p) => <div key={p.label}>({p.label}) <MathText text={p.text} /> [{p.marks} · {p.cloCode}]</div>)}</div>}
                  {x.flags.length > 0 && <div style={{ color: "#B3261E", fontSize: 11.5 }} data-flags>{x.flags.map((f) => FLAG[f] || f).join(" · ")}</div>}
                  {x.source && <div className="small-note">Source: {x.source}</div>}</td>
                <td>{(TYPES.find(([k]) => k === x.type) || [x.type, x.type])[1]}</td><td>{x.cloCodes.join(", ")}</td><td>{x.bloom}</td>
                <td>{x.difficulty.toLowerCase()}{x.measuredDifficulty && x.measuredDifficulty !== x.difficulty ? <span className="small-note"> (results: {x.measuredDifficulty.toLowerCase()})</span> : null}</td><td>{x.marks}</td>
                <td>{x.lectureNumber ? `L${x.lectureNumber} ${x.topic}` : x.topic || "—"}</td>
                <td>{x.status === "DRAFT" ? "Draft" : x.status === "REJECTED" ? `Rejected${x.reviewNote ? `: ${x.reviewNote}` : ""}` : "Approved"}{x.lockedUntil ? <div style={{ color: "#8a5a00" }} data-locked>Locked through {termName(x.lockedUntil)}</div> : null}</td>
                <td>{x.mcq ? "MCQ bank" : VIS[x.visibility]}</td><td>{x.author}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {x.authorId === userId && !x.mcq && <select value={x.visibility} onChange={(e) => act({ action: "share", id: x.id, visibility: e.target.value, sharedWith: e.target.value === "CHOSEN" ? colleagues.filter((c) => confirm(`Share with ${c.name}?`)).map((c) => c.id) : [] }, () => "Saved.")} data-share={x.id}>{Object.entries(VIS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>}
                  {reviewer && x.lockedUntil && <button className="btn btn-secondary btn-sm" onClick={() => { const r = prompt("Why unlock it early? (logged)"); if (r) act({ action: "unlock", id: x.id, reason: r }, () => "Unlocked."); }}>Unlock</button>}
                </td>
              </tr>))}</tbody></table>
        </div>
      )}
      {tab === "add" && <QuestionEditor plan={plan} onSave={(b) => act({ action: "add", courseId, ...b }, (d) => d.duplicates ? `Similar question(s) already in the bank: ${d.duplicates.map((x: { text: string }) => x.text.slice(0, 60)).join(" · ")} — tick "add anyway" to keep yours.` : d.status === "APPROVED" ? "Added to the bank." : "Saved as a Draft — the Subject Expert or the Program Lead reviews it.")} />}
      {tab === "review" && reviewer && (
        <div className="card">
          {!drafts.length ? <p className="small-note">Nothing to review.</p> : drafts.map((x) => (
            <div key={x.id} style={{ borderBottom: "1px solid var(--line, #eee)", padding: "8px 0" }} data-review={x.id}>
              <MathText text={x.text} block /><div className="small-note">{x.author} · {x.type} · {x.cloCodes.join(", ")} · {x.bloom} · {x.marks} marks{x.aiDraft ? " · from a PDF / AI (check it)" : ""}{x.modelAnswer ? ` · answer: ${x.modelAnswer.slice(0, 120)}` : ""}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <button className="btn btn-sm" onClick={() => act({ action: "review", id: x.id, decision: "APPROVE" }, () => "Approved.")} data-approve={x.id}>Approve</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { const t = prompt("Edit the question", x.text); if (t) act({ action: "review", id: x.id, decision: "EDIT", edits: { text: t }, note: "Approved with edits" }, () => "Approved with edits."); }}>Approve with edits</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { const r = prompt("Reason for rejecting it"); if (r) act({ action: "review", id: x.id, decision: "REJECT", note: r }, () => "Rejected."); }}>Reject</button>
              </div>
            </div>))}
        </div>
      )}
      {tab === "draft" && <DraftPaper courseId={courseId} plan={plan} onMsg={setMsg} />}
      {tab === "import" && <ImportTab courseId={courseId} plan={plan} onMsg={setMsg} reload={load} />}
      {tab === "sharing" && <SharingTab selected={Array.from(sel)} onMsg={setMsg} />}
    </div>
  );
}

function PinGate({ state, onDone }: { state: { set: boolean; blocked?: boolean }; onDone: () => void }) {
  const [pin, setPin] = useState(""); const [pw, setPw] = useState(""); const [reset, setReset] = useState(!state.set); const [err, setErr] = useState("");
  const go = async () => { setErr(""); try { if (reset) await call({ action: "pinSet", pin, password: pw }); else await call({ action: "pinVerify", pin }); onDone(); } catch (e) { setErr((e as Error).message); } };
  return (
    <div className="card" style={{ maxWidth: 440 }} data-pin-gate>
      <h3 style={{ marginTop: 0 }}>{reset ? (state.set ? "Reset your question-bank PIN" : "Set a question-bank PIN") : "Enter your question-bank PIN"}</h3>
      <p className="small-note">The bank and locked papers ask for this second PIN (4–8 digits) on top of your sign-in. It times out after 15 minutes without use; 5 wrong PINs tell you and your HOD.</p>
      <div style={{ display: "grid", gap: 8 }}>
        <input type="password" inputMode="numeric" placeholder="PIN" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} data-pin-input />
        {reset && <input type="password" placeholder="Your account password (to confirm it is you)" value={pw} onChange={(e) => setPw(e.target.value)} data-pin-password />}
        <button className="btn" onClick={go} data-pin-go>{reset ? "Save PIN" : "Open the bank"}</button>
        {state.set && <button className="btn btn-secondary btn-sm" onClick={() => setReset(!reset)}>{reset ? "I know my PIN" : "Forgot PIN"}</button>}
        {err && <div className="err" data-pin-err>{err}</div>}
      </div>
    </div>
  );
}

function QuestionEditor({ plan, onSave }: { plan: Plan; onSave: (b: Record<string, unknown>) => Promise<unknown> }) {
  const blank = { type: "SHORT", text: "", marks: 5, cloCodes: [plan.clos[0]?.code].filter(Boolean) as string[], bloom: "C2", difficulty: "MEDIUM", lectureNumber: "", modelAnswer: "", options: "", correct: "", numericAnswer: "", tolerance: "", tolMode: "ABS", minutes: "", sourceKind: "OWN", sourceNote: "", visibility: "COURSE", lab: false, force: false, testCases: "" };
  const [f, setF] = useState<Record<string, any>>(blank);
  const [parts, setParts] = useState<{ label: string; text: string; marks: number; cloCode: string }[]>([]);
  const set = (k: string, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const mcq = String(f.type).startsWith("MCQ");
  return (
    <div className="card" data-editor>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ fontSize: 12 }}>Type<br /><select value={f.type} onChange={(e) => set("type", e.target.value)} data-f="type">{TYPES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>Marks<br /><input type="number" value={f.marks} onChange={(e) => set("marks", e.target.value)} style={{ width: 70 }} data-f="marks" /></label>
        <label style={{ fontSize: 12 }}>CLO(s)<br /><select multiple value={f.cloCodes} onChange={(e) => set("cloCodes", Array.from(e.target.selectedOptions).map((o) => o.value))} style={{ height: 60 }} data-f="clo">{plan.clos.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>Bloom<br /><select value={f.bloom} onChange={(e) => set("bloom", e.target.value)} data-f="bloom">{["C1", "C2", "C3", "C4", "C5", "C6", "P1", "P2", "P3", "P4", "P5", "A1", "A2", "A3"].map((b) => <option key={b}>{b}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>Difficulty<br /><select value={f.difficulty} onChange={(e) => set("difficulty", e.target.value)} data-f="difficulty"><option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></label>
        <label style={{ fontSize: 12 }}>Topic<br /><select value={f.lectureNumber} onChange={(e) => set("lectureNumber", e.target.value)} data-f="topic"><option value="">—</option>{plan.lectures.map((l) => <option key={l.lectureNumber} value={l.lectureNumber}>L{l.lectureNumber} {l.topic.slice(0, 50)}</option>)}</select></label>
        <label style={{ fontSize: 12 }}>Minutes<br /><input type="number" value={f.minutes} onChange={(e) => set("minutes", e.target.value)} style={{ width: 60 }} /></label>
        <label style={{ fontSize: 12 }}>Who sees it<br /><select value={f.visibility} onChange={(e) => set("visibility", e.target.value)} data-f="visibility">{Object.entries(VIS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        <label style={{ fontSize: 12 }}><input type="checkbox" checked={f.lab} onChange={(e) => set("lab", e.target.checked)} /> Lab question</label>
      </div>
      <label style={{ fontSize: 12, display: "block", marginTop: 8 }}>Question (equations between $ signs; code between ``` lines)<textarea rows={4} value={f.text} onChange={(e) => set("text", e.target.value)} style={{ width: "100%" }} data-f="text" /></label>
      <EquationButton onInsert={(t) => set("text", `${f.text}${f.text && !f.text.endsWith(" ") ? " " : ""}${t}`)} />
      {f.text && <div className="small-note" style={{ marginTop: 4 }} data-preview>Preview: <MathText text={f.text} /></div>}
      {(mcq || f.type === "TRUE_FALSE") && (
        <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          {mcq && <label style={{ fontSize: 12 }}>Options (one per line)<br /><textarea rows={4} value={f.options} onChange={(e) => set("options", e.target.value)} style={{ minWidth: 300 }} data-f="options" /></label>}
          <label style={{ fontSize: 12 }}>Correct {mcq ? "option number(s), e.g. 2 or 1,3" : "(True / False)"}<br />{mcq ? <input value={f.correct} onChange={(e) => set("correct", e.target.value)} data-f="correct" /> : <select value={f.correct} onChange={(e) => set("correct", e.target.value)} data-f="correct"><option value="">—</option><option value="1">True</option><option value="2">False</option></select>}</label>
        </div>)}
      {f.type === "NUMERICAL" && <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <label style={{ fontSize: 12 }}>Answer<br /><input value={f.numericAnswer} onChange={(e) => set("numericAnswer", e.target.value)} data-f="numeric" /></label>
        <label style={{ fontSize: 12 }}>Tolerance ±<br /><input value={f.tolerance} onChange={(e) => set("tolerance", e.target.value)} style={{ width: 80 }} /></label>
        <label style={{ fontSize: 12 }}>as<br /><select value={f.tolMode} onChange={(e) => set("tolMode", e.target.value)}><option value="ABS">absolute</option><option value="PCT">% of the answer</option></select></label></div>}
      {f.type === "CODE" && <label style={{ fontSize: 12, display: "block", marginTop: 8 }}>Test cases (one per line: input =&gt; expected output)<textarea rows={3} value={f.testCases} onChange={(e) => set("testCases", e.target.value)} style={{ width: "100%" }} /></label>}
      <div style={{ marginTop: 8 }}>
        <b style={{ fontSize: 12 }}>Parts</b> <button type="button" className="btn btn-secondary btn-sm" onClick={() => setParts(parts.concat({ label: String.fromCharCode(97 + parts.length), text: "", marks: 0, cloCode: f.cloCodes[0] || "" }))} data-add-part>+ Part</button>
        {parts.map((p, i) => <div key={i} style={{ display: "flex", gap: 6, marginTop: 4 }}>({p.label}) <input value={p.text} onChange={(e) => setParts(parts.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} style={{ flex: 1 }} /><input type="number" value={p.marks} onChange={(e) => setParts(parts.map((x, j) => j === i ? { ...x, marks: Number(e.target.value) } : x))} style={{ width: 60 }} /><select value={p.cloCode} onChange={(e) => setParts(parts.map((x, j) => j === i ? { ...x, cloCode: e.target.value } : x))}>{plan.clos.map((c) => <option key={c.code}>{c.code}</option>)}</select></div>)}
      </div>
      {!mcq && f.type !== "TRUE_FALSE" && <label style={{ fontSize: 12, display: "block", marginTop: 8 }}>Model answer / marking scheme<textarea rows={3} value={f.modelAnswer} onChange={(e) => set("modelAnswer", e.target.value)} style={{ width: "100%" }} data-f="answer" /></label>}
      <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "end", flexWrap: "wrap" }}>
        <label style={{ fontSize: 12 }}>Source<br /><select value={f.sourceKind} onChange={(e) => set("sourceKind", e.target.value)}><option value="OWN">Own</option><option value="BOOK">Book (chapter)</option><option value="PAST">Past paper (term)</option></select></label>
        <label style={{ fontSize: 12 }}>Book + chapter / paper + term<br /><input value={f.sourceNote} onChange={(e) => set("sourceNote", e.target.value)} /></label>
        <label style={{ fontSize: 12 }}><input type="checkbox" checked={f.force} onChange={(e) => set("force", e.target.checked)} /> add anyway if similar</label>
        <button className="btn" data-save onClick={async () => {
          const opts = String(f.options || "").split("\n").map((x) => x.trim()).filter(Boolean);
          const correct = f.type === "TRUE_FALSE" ? [Number(f.correct) - 1] : String(f.correct || "").split(",").map((x) => Number(x.trim()) - 1).filter((x) => x >= 0);
          const r = await onSave({ ...f, options: opts, correct, lectureNumber: f.lectureNumber === "" ? null : Number(f.lectureNumber), parts, testCases: String(f.testCases || "").split("\n").filter((l) => l.includes("=>")).map((l) => { const [input, output] = l.split("=>"); return { input: input.trim(), output: output.trim() }; }) });
          if (r) { setF(blank); setParts([]); }
        }}>Save question</button>
      </div>
    </div>
  );
}

function DraftPaper({ courseId, plan, onMsg }: { courseId: string; plan: Plan; onMsg: (m: { ok: boolean; text: string } | null) => void }) {
  const [o, setO] = useState<Record<string, any>>({ examType: "Final", total: 50, minutes: 180, examDate: "", excludeTerms: 1, allTopics: false, shares: Object.fromEntries(plan.clos.map((c) => [c.code, 1])) });
  const [papers, setPapers] = useState<{ id: string; variant: string; chosen: QItem[]; check: { ok: boolean; fails: string[]; notes: string[]; cloPct: Record<string, number>; minutes: number; total: number }; gaps?: string[]; missing?: string[] }[]>([]);
  const run = async (body: Record<string, unknown>) => { onMsg(null); try { return await call(body); } catch (e) { onMsg({ ok: false, text: (e as Error).message }); return null; } };
  return (
    <div>
      <div className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ fontSize: 12 }}>Exam<br /><select value={o.examType} onChange={(e) => setO({ ...o, examType: e.target.value, total: e.target.value === "Midterm" ? 30 : 50, minutes: e.target.value === "Midterm" ? 90 : 180 })} data-d="exam"><option>Midterm</option><option>Final</option></select></label>
        <label style={{ fontSize: 12 }}>Total marks<br /><input type="number" value={o.total} onChange={(e) => setO({ ...o, total: e.target.value })} style={{ width: 70 }} data-d="total" /></label>
        <label style={{ fontSize: 12 }}>Minutes<br /><input type="number" value={o.minutes} onChange={(e) => setO({ ...o, minutes: e.target.value })} style={{ width: 70 }} /></label>
        <label style={{ fontSize: 12 }}>Exam date<br /><input type="date" value={o.examDate} onChange={(e) => setO({ ...o, examDate: e.target.value })} /></label>
        <label style={{ fontSize: 12 }}>Leave out questions used in the last<br /><input type="number" value={o.excludeTerms} onChange={(e) => setO({ ...o, excludeTerms: e.target.value })} style={{ width: 50 }} /> term(s)</label>
        <label style={{ fontSize: 12 }}><input type="checkbox" checked={o.allTopics} onChange={(e) => setO({ ...o, allTopics: e.target.checked })} /> every topic (not only those taught before the exam)</label>
        {plan.clos.map((c) => <label key={c.code} style={{ fontSize: 12 }}>{c.code} share<br /><input type="number" value={o.shares[c.code]} onChange={(e) => setO({ ...o, shares: { ...o.shares, [c.code]: Number(e.target.value) } })} style={{ width: 50 }} /></label>)}
        <button className="btn" data-draft onClick={async () => { const d = await run({ action: "draft", courseId, examType: o.examType, total: Number(o.total), minutes: Number(o.minutes), examDate: o.examDate || null, excludeTerms: Number(o.excludeTerms), allTopics: o.allTopics, cloShares: o.shares }); if (d) setPapers([{ id: d.id, variant: "A", chosen: d.chosen, check: d.check, gaps: d.gaps }]); }}>Draft the paper</button>
      </div>
      {papers.map((p) => (
        <div key={p.id} className="card" data-paper={p.variant}>
          <b>Version {p.variant}: {p.check.total} marks, about {p.check.minutes} minutes</b> <span style={{ color: p.check.ok ? "#1F5E36" : "#B3261E" }} data-check>{p.check.ok ? "✓ passes the checks" : `✗ ${p.check.fails.join(" ")}`}</span>
          <div className="small-note">CLO shares: {Object.entries(p.check.cloPct).map(([k, v]) => `${k} ${v}%`).join(" · ")} · {p.check.notes.join(" ")}{p.gaps?.length ? ` · ${p.gaps.join(" · ")}` : ""}{p.missing?.length ? ` · no equivalent for ${p.missing.join(", ")}` : ""}</div>
          <ol style={{ fontSize: 13 }}>{p.chosen.map((q) => <li key={q.id}><MathText text={q.text} /> <span className="small-note">[{q.marks} · {q.cloCodes.join(", ")} · {q.bloom} · {q.lectureNumber ? `L${q.lectureNumber}` : ""}]</span></li>)}</ol>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="btn btn-secondary btn-sm" data-variant onClick={async () => { const d = await run({ action: "variant", paperId: papers[0].id }); if (d) setPapers(papers.concat({ id: d.id, variant: d.variant, chosen: d.chosen, check: d.check, missing: d.missing })); }}>Make version {String.fromCharCode(65 + papers.length)}</button>
            <button className="btn btn-sm" disabled={!p.check.ok} data-adopt onClick={async () => { const d = await run({ action: "adopt", paperId: p.id }); if (d) onMsg({ ok: true, text: `Version ${p.variant} is now the course's ${o.examType.toLowerCase()} paper (${d.questions} questions in the question plan and in paper vetting).` }); }}>Use as the {o.examType.toLowerCase()} paper</button>
            <a className="btn btn-secondary btn-sm" href={`/papers/${p.id}`} target="_blank" rel="noreferrer" data-open-paper>Open in the paper template</a>
            <a className="btn btn-secondary btn-sm" href={`${API}?paper=${p.id}&format=pdf`} target="_blank" rel="noreferrer">PDF</a>
            <a className="btn btn-secondary btn-sm" href={`${API}?paper=${p.id}&format=docx`}>Word</a>
          </div>
        </div>))}
    </div>
  );
}

function ImportTab({ courseId, plan, onMsg, reload }: { courseId: string; plan: Plan; onMsg: (m: { ok: boolean; text: string } | null) => void; reload: () => void }) {
  const [sheet, setSheet] = useState<File | null>(null);
  const [pv, setPv] = useState<{ rows: unknown[]; errors: string[] } | null>(null);
  const [pdf, setPdf] = useState<{ scanned: boolean; warning: string | null; rows: Record<string, any>[]; ai: { model: string; costUsd: number } | null } | null>(null);
  const up = async (kind: string, file: File, apply = false) => {
    const fd = new FormData(); fd.set("kind", kind); fd.set("courseId", courseId); fd.set("file", file); if (apply) fd.set("apply", "1");
    const r = await fetch(API, { method: "POST", body: fd }); const d = await r.json().catch(() => ({}));
    if (!r.ok) { onMsg({ ok: false, text: d.error || "Failed." }); return null; } return d;
  };
  return (
    <div>
      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>From Excel</h3>
        <a href={`${API}?template=1`} className="btn btn-secondary btn-sm">Download the template</a>{" "}
        <input type="file" accept=".xlsx,.csv" data-sheet onChange={async (e) => { const f = e.target.files?.[0] || null; setSheet(f); if (f) setPv(await up("sheet", f)); }} />
        {pv && <div style={{ marginTop: 6 }} data-sheet-preview>{pv.rows.length} question(s) ready.{pv.errors.length > 0 && <div className="err">{pv.errors.map((x) => <div key={x}>{x}</div>)}</div>}
          {sheet && !pv.errors.length && pv.rows.length > 0 && <button className="btn btn-sm" onClick={async () => { const d = await up("sheet", sheet, true); if (d) { onMsg({ ok: true, text: `${d.added} added${d.duplicates ? `, ${d.duplicates} skipped as similar to questions already in the bank` : ""}.` }); setPv(null); reload(); } }} data-sheet-import>Import</button>}</div>}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Past papers already in the system</h3>
        <p className="small-note">The mid and final questions of this course&apos;s offerings (question plan + paper vetting texts) become bank questions with their CLO, marks and results.</p>
        <button className="btn btn-secondary btn-sm" data-past onClick={async () => { try { const d = await call({ action: "past", courseId }); onMsg({ ok: true, text: `${d.added} question(s) added from past papers${d.skipped ? `, ${d.skipped} skipped (already in the bank or no text)` : ""}.` }); reload(); } catch (e) { onMsg({ ok: false, text: (e as Error).message }); } }}>Add past papers to the bank</button>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Upload a paper (PDF)</h3>
        <p className="small-note">Typed or scanned. It is split into questions; each gets a suggested type, topic, CLO, Bloom level and difficulty; check them, then save — everything is a Draft for the Subject Expert or the Program Lead.</p>
        <input type="file" accept="application/pdf" data-pdf onChange={async (e) => { const f = e.target.files?.[0]; if (f) setPdf(await up("pdf", f)); }} />
        {pdf && <div style={{ marginTop: 8, overflowX: "auto" }} data-pdf-review>
          {pdf.warning && <div className="err" data-scanned>{pdf.warning}</div>}
          {pdf.ai && <p className="small-note">Read by {pdf.ai.model} — US$ {pdf.ai.costUsd.toFixed(4)}.</p>}
          <table style={{ fontSize: 12 }}><thead><tr><th>From the paper</th><th>Question</th><th>Type</th><th>Topic</th><th>CLO</th><th>Bloom</th><th>Difficulty</th><th>Marks</th><th /></tr></thead>
            <tbody>{pdf.rows.map((r, i) => (
              <tr key={i} data-pdf-row={i}>
                <td style={{ maxWidth: 220, color: "var(--slate)" }}>{r.snippet}</td>
                <td><textarea rows={3} value={r.text} onChange={(e) => setPdf({ ...pdf, rows: pdf.rows.map((x, j) => j === i ? { ...x, text: e.target.value } : x) })} />{r.duplicates?.length ? <div style={{ color: "#B3261E" }}>Similar in the bank: {r.duplicates[0].text?.slice(0, 50)}</div> : null}</td>
                <td><select value={r.type} onChange={(e) => setPdf({ ...pdf, rows: pdf.rows.map((x, j) => j === i ? { ...x, type: e.target.value } : x) })}>{TYPES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></td>
                <td><select value={r.lectureNumber ?? ""} onChange={(e) => setPdf({ ...pdf, rows: pdf.rows.map((x, j) => j === i ? { ...x, lectureNumber: e.target.value ? Number(e.target.value) : null } : x) })}><option value="">—</option>{plan.lectures.map((l) => <option key={l.lectureNumber} value={l.lectureNumber}>L{l.lectureNumber} {l.topic.slice(0, 30)}</option>)}</select></td>
                <td><select value={r.cloCode || ""} onChange={(e) => setPdf({ ...pdf, rows: pdf.rows.map((x, j) => j === i ? { ...x, cloCode: e.target.value } : x) })}>{plan.clos.map((c) => <option key={c.code}>{c.code}</option>)}</select></td>
                <td><input value={r.bloom} onChange={(e) => setPdf({ ...pdf, rows: pdf.rows.map((x, j) => j === i ? { ...x, bloom: e.target.value } : x) })} style={{ width: 40 }} /></td>
                <td><select value={r.difficulty} onChange={(e) => setPdf({ ...pdf, rows: pdf.rows.map((x, j) => j === i ? { ...x, difficulty: e.target.value } : x) })}><option>EASY</option><option>MEDIUM</option><option>HARD</option></select></td>
                <td><input type="number" value={r.marks ?? ""} onChange={(e) => setPdf({ ...pdf, rows: pdf.rows.map((x, j) => j === i ? { ...x, marks: Number(e.target.value) } : x) })} style={{ width: 50 }} /></td>
                <td><button className="btn btn-secondary btn-sm" onClick={() => setPdf({ ...pdf, rows: pdf.rows.filter((_, j) => j !== i) })}>Delete</button>{i > 0 && <button className="btn btn-secondary btn-sm" onClick={() => { const prev = pdf.rows[i - 1]; setPdf({ ...pdf, rows: pdf.rows.filter((_, j) => j !== i).map((x, j) => j === i - 1 ? { ...prev, text: `${prev.text}\n${r.text}`, marks: (prev.marks || 0) + (r.marks || 0) } : x) }); }}>Merge up</button>}</td>
              </tr>))}</tbody></table>
          <button className="btn btn-sm" data-pdf-save onClick={async () => { try { const d = await call({ action: "saveAnalysed", courseId, rows: pdf.rows.map((r) => ({ ...r, cloCodes: [r.cloCode], marks: r.marks || r.parts?.reduce((a: number, p: { marks: number }) => a + (p.marks || 0), 0) || 1, parts: r.parts?.length && r.parts.every((p: { marks: number }) => p.marks) ? r.parts : [] })) }); onMsg({ ok: true, text: `${d.added} draft(s) saved for review.${d.problems?.length ? ` Not saved: ${d.problems.join("; ")}` : ""}` }); setPdf(null); reload(); } catch (e) { onMsg({ ok: false, text: (e as Error).message }); } }}>Save as drafts</button>
        </div>}
      </div>
    </div>
  );
}

function SharingTab({ selected, onMsg }: { selected: string[]; onMsg: (m: { ok: boolean; text: string } | null) => void }) {
  const [mine, setMine] = useState<{ logs: { who: string; action: string; detail: string; at: string }[]; grants: { id: string; count: number; expiresAt: string | null; revokedAt: string | null; usedBy: string | null; purpose: string | null }[] } | null>(null);
  const [code, setCode] = useState(""); const [made, setMade] = useState<string | null>(null);
  const load = useCallback(async () => setMine(await fetch(`${API}?mine=1`).then((r) => r.json()).catch(() => null)), []);
  useEffect(() => { load(); }, [load]);
  return (
    <div>
      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Give a colleague an access code</h3>
        <p className="small-note">Tick your questions on the Bank tab ({selected.length} ticked). The code works for one colleague until it expires or you revoke it.</p>
        <button className="btn btn-sm" disabled={!selected.length} data-make-code onClick={async () => { const days = Number(prompt("Valid for how many days?", "7")) || 7; const purpose = prompt("For one quiz or assignment? (optional)") || ""; try { const d = await call({ action: "code", itemIds: selected, days, purpose }); setMade(d.code); load(); } catch (e) { onMsg({ ok: false, text: (e as Error).message }); } }}>Create a code</button>
        {made && <p data-code>Code: <b>{made}</b> — give it to your colleague (shown once).</p>}
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Use a colleague&apos;s code</h3>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Access code" data-redeem-input /> <button className="btn btn-sm" data-redeem onClick={async () => { try { const d = await call({ action: "redeem", code }); onMsg({ ok: true, text: `${d.count} question(s) are now available to you.` }); setCode(""); } catch (e) { onMsg({ ok: false, text: (e as Error).message }); } }}>Use it</button>
      </div>
      {mine && <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>My codes</h3>
        <table style={{ fontSize: 12 }}><tbody>{mine.grants.map((g) => <tr key={g.id}><td>{g.count} question(s)</td><td>{g.purpose || ""}</td><td>{g.revokedAt ? "Revoked" : g.expiresAt && new Date(g.expiresAt) < new Date() ? "Expired" : `Until ${String(g.expiresAt).slice(0, 10)}`}</td><td>{g.usedBy ? `Used by ${g.usedBy}` : "Not used yet"}</td><td>{!g.revokedAt && <button className="btn btn-secondary btn-sm" onClick={async () => { await call({ action: "revoke", id: g.id }).catch(() => null); load(); }}>Revoke</button>}</td></tr>)}</tbody></table>
        <h3 style={{ fontSize: 15 }}>Who used my questions</h3>
        <table style={{ fontSize: 12 }}><tbody>{mine.logs.map((l, i) => <tr key={i}><td>{String(l.at).slice(0, 16).replace("T", " ")}</td><td>{l.who}</td><td>{l.action.toLowerCase().replace(/_/g, " ")}</td><td>{l.detail}</td></tr>)}</tbody></table>
      </div>}
    </div>
  );
}
