"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_TEMPLATE, FIELD_LABEL, type TemplateConfig } from "../lib/paperTemplateCore";
import { TYPES } from "../lib/qbankCore";

// The Controller's paper templates: the institute's, department / program variants, per exam type.
type Row = { id: string; scope: string; scopeId: string | null; examType: string; config: TemplateConfig };
async function call(body: Record<string, unknown>) {
  const r = await fetch("/api/paper", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `Failed (${r.status})`);
  return d;
}

export default function PaperTemplateEditor({ rows, departments, programs, readOnly }: { rows: Row[]; departments: { id: string; name: string }[]; programs: string[]; readOnly: boolean }) {
  const router = useRouter();
  const [scope, setScope] = useState("INSTITUTE"); const [scopeId, setScopeId] = useState(""); const [examType, setExamType] = useState("ALL");
  const [c, setC] = useState<TemplateConfig>(DEFAULT_TEMPLATE);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = (r: Row) => { setScope(r.scope); setScopeId(r.scopeId || ""); setExamType(r.examType); setC(r.config); };
  const name = (r: Row) => r.scope === "INSTITUTE" ? "Institute" : r.scope === "DEPARTMENT" ? `Department: ${departments.find((d) => d.id === r.scopeId)?.name || r.scopeId}` : `Program: ${r.scopeId}`;
  const f = (k: keyof TemplateConfig["fields"], v: unknown) => setC({ ...c, fields: { ...c.fields, [k]: v } });
  return (
    <div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>Templates</h3>
        {!rows.length ? <p className="small-note">None yet — the default layout is used until the institute&apos;s template is saved.</p> :
          <table style={{ fontSize: 12.5 }}><tbody>{rows.map((r) => <tr key={r.id} data-template={`${r.scope}:${r.scopeId || ""}:${r.examType}`}><td>{name(r)}</td><td>{r.examType === "ALL" ? "every exam" : r.examType}</td><td>{r.config.sections.map((s) => s.title).join(" · ") || "no sections"}</td><td>{!readOnly && <><button className="btn btn-secondary btn-sm" onClick={() => load(r)}>Edit</button> <button className="btn btn-secondary btn-sm" onClick={async () => { if (confirm("Delete this template?")) { await call({ action: "deleteTemplate", id: r.id }).catch(() => null); router.refresh(); } }}>Delete</button></>}</td></tr>)}</tbody></table>}
      </div>
      {!readOnly && <div className="card" data-template-form>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ fontSize: 12 }}>For<br /><select value={scope} onChange={(e) => { setScope(e.target.value); setScopeId(""); }} data-t="scope"><option value="INSTITUTE">the institute</option><option value="DEPARTMENT">a department</option><option value="PROGRAM">a program</option></select></label>
          {scope === "DEPARTMENT" && <label style={{ fontSize: 12 }}>Department<br /><select value={scopeId} onChange={(e) => setScopeId(e.target.value)} data-t="dept"><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
          {scope === "PROGRAM" && <label style={{ fontSize: 12 }}>Program<br /><select value={scopeId} onChange={(e) => setScopeId(e.target.value)}><option value="">—</option>{programs.map((p) => <option key={p}>{p}</option>)}</select></label>}
          <label style={{ fontSize: 12 }}>Exam<br /><select value={examType} onChange={(e) => setExamType(e.target.value)} data-t="exam"><option value="ALL">every exam</option><option>Quiz</option><option>Midterm</option><option>Final</option></select></label>
          <label style={{ fontSize: 12 }}>Numbering<br /><select value={c.numbering} onChange={(e) => setC({ ...c, numbering: e.target.value as "Q1" | "1.1" })}><option value="Q1">Q1 a/b/c</option><option value="1.1">1.1, 1.2</option></select></label>
          <label style={{ fontSize: 12 }}>Page<br /><select value={c.page} onChange={(e) => setC({ ...c, page: e.target.value as "A4" | "Letter" })}><option>A4</option><option>Letter</option></select></label>
          <label style={{ fontSize: 12 }}>Margins (inch)<br /><input type="number" step="0.1" value={c.margins} onChange={(e) => setC({ ...c, margins: Number(e.target.value) })} style={{ width: 60 }} /></label>
          <label style={{ fontSize: 12 }}>Font size<br /><input type="number" value={c.fontSize} onChange={(e) => setC({ ...c, fontSize: Number(e.target.value) })} style={{ width: 50 }} /></label>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, fontSize: 12 }}>
          <b>Fields filled for each course:</b>
          {Object.keys(FIELD_LABEL).filter((k) => k !== "teacher").map((k) => <label key={k}><input type="checkbox" checked={!!(c.fields as Record<string, unknown>)[k]} onChange={(e) => f(k as keyof TemplateConfig["fields"], e.target.checked)} /> {FIELD_LABEL[k]}</label>)}
          <label>Teacher <select value={c.fields.teacher} onChange={(e) => f("teacher", e.target.value)}><option value="SHOW">name</option><option value="HIDDEN">"Paper setter: hidden"</option><option value="OFF">not shown</option></select></label>
          <label><input type="checkbox" checked={c.fields.rollBoxes} onChange={(e) => f("rollBoxes", e.target.checked)} /> Roll-number and name boxes</label>
          <label><input type="checkbox" checked={c.fields.logo} onChange={(e) => f("logo", e.target.checked)} /> Logo</label>
        </div>
        <label style={{ fontSize: 12, display: "block", marginTop: 8 }}>Instructions (editable per paper)<textarea rows={3} value={c.instructions} onChange={(e) => setC({ ...c, instructions: e.target.value })} style={{ width: "100%" }} data-t="instructions" /></label>
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <b>Sections</b> <button className="btn btn-secondary btn-sm" onClick={() => setC({ ...c, sections: c.sections.concat({ title: `Section ${String.fromCharCode(65 + c.sections.length)}`, types: [], attemptAny: null }) })} data-add-section>+ Section</button>
          {c.sections.map((s, i) => <div key={i} style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
            <input value={s.title} onChange={(e) => setC({ ...c, sections: c.sections.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} data-section-title={i} />
            {TYPES.map(([k, t]) => <label key={k}><input type="checkbox" checked={s.types.includes(k)} onChange={(e) => setC({ ...c, sections: c.sections.map((x, j) => j === i ? { ...x, types: e.target.checked ? x.types.concat(k) : x.types.filter((y) => y !== k) } : x) })} /> {t}</label>)}
            <label>attempt any <input type="number" value={s.attemptAny ?? ""} onChange={(e) => setC({ ...c, sections: c.sections.map((x, j) => j === i ? { ...x, attemptAny: e.target.value ? Number(e.target.value) : null } : x) })} style={{ width: 45 }} /></label>
            <button className="btn btn-secondary btn-sm" onClick={() => setC({ ...c, sections: c.sections.filter((_, j) => j !== i) })}>×</button></div>)}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, fontSize: 12, alignItems: "end" }}>
          <label><input type="checkbox" checked={c.showMarks} onChange={(e) => setC({ ...c, showMarks: e.target.checked })} /> Marks next to questions</label>
          <label><input type="checkbox" checked={c.showClo} onChange={(e) => setC({ ...c, showClo: e.target.checked })} /> CLO next to questions</label>
          <label><input type="checkbox" checked={c.turnOver} onChange={(e) => setC({ ...c, turnOver: e.target.checked })} /> &quot;Turn over&quot;</label>
          <label><input type="checkbox" checked={c.answerSheet} onChange={(e) => setC({ ...c, answerSheet: e.target.checked })} /> Separate MCQ answer sheet</label>
          <label>Footer<br /><input value={c.footer} onChange={(e) => setC({ ...c, footer: e.target.value })} data-t="footer" /></label>
          <label>Watermark<br /><input value={c.watermark} onChange={(e) => setC({ ...c, watermark: e.target.value })} /></label>
        </div>
        <button className="btn" style={{ marginTop: 10 }} data-template-save onClick={async () => { setMsg(null); try { await call({ action: "template", scope, scopeId, examType, config: c }); setMsg({ ok: true, text: "Saved." }); router.refresh(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } }}>Save template</button>
        {msg && <div className={msg.ok ? "ok" : "err"} data-msg>{msg.text}</div>}
      </div>}
    </div>
  );
}

export function PaperValueEditorInline() { return null; }
