"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Tpl = { key: string; program: string; council: string; version: string; types: number; note: string };
type Src = { id: string; label: string; program: string };

const PROGRAMS = ["BS Computer Science", "BS Software Engineering", "BS Artificial Intelligence", "BS Data Science", "BS Cyber Security", "BS Information Technology", "BBA (Hons)"];

/** Three short questions: which program, which council version to start from, confirm. */
export default function StartCurriculum({ templates, sources }: { templates: Tpl[]; sources: Src[] }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [program, setProgram] = useState("");
  const [other, setOther] = useState("");
  const [base, setBase] = useState<{ kind: "tpl" | "src" | "blank"; key?: string; id?: string; council: string; version: string } | null>(null);
  const [version, setVersion] = useState(String(new Date().getFullYear()));
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const prog = program === "__other" ? other.trim() : program;
  const tpls = templates.filter((t) => t.program === prog || t.program === "Any undergraduate program");
  const srcs = sources.filter((s) => !prog || s.program.toLowerCase().includes(prog.replace(/^BS\s+/i, "").toLowerCase().slice(0, 8)));
  async function go() {
    if (!base) return;
    setBusy(true); setMsg("");
    const r = await fetch("/api/curriculum-builder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", program: prog, council: base.council, version, templateKey: base.kind === "tpl" ? base.key : undefined, sourceId: base.kind === "src" ? base.id : undefined }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setBusy(false); setMsg(d.error || "Could not start."); return; }
    router.push(`/curricula/builder/${d.id}`);
  }
  const card = (on: boolean) => ({ textAlign: "left" as const, padding: "12px 14px", borderRadius: 10, border: `2px solid ${on ? "var(--brand, #0D2A4A)" : "#E1E5EA"}`, background: on ? "#EEF4FB" : "#fff", cursor: "pointer", font: "inherit", color: "inherit" });
  const head = (n: number, t: string) => <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "4px 0 10px" }}><span style={{ width: 26, height: 26, borderRadius: "50%", background: step >= n ? "#0D2A4A" : "#D5DBE2", color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 13 }}>{n}</span><b style={{ fontSize: 16 }}>{t}</b></div>;
  return (
    <div className="card" style={{ display: "grid", gap: 14 }}>
      <div>
        {head(1, "Which degree program?")}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 8 }}>
          {PROGRAMS.map((p) => <button key={p} type="button" style={card(program === p)} onClick={() => { setProgram(p); setBase(null); setStep(2); }}><b>{p}</b></button>)}
          <button type="button" style={card(program === "__other")} onClick={() => { setProgram("__other"); setBase(null); setStep(2); }}><b>Another program…</b></button>
        </div>
        {program === "__other" && <input autoFocus placeholder="e.g. BS Mathematics" value={other} onChange={(e) => setOther(e.target.value)} style={{ marginTop: 8, width: 320 }} aria-label="Program name" />}
      </div>
      {step >= 2 && prog && (
        <div>
          {head(2, "Start from which council curriculum?")}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 8 }}>
            {tpls.map((t) => <button key={t.key} type="button" style={card(base?.key === t.key)} onClick={() => { setBase({ kind: "tpl", key: t.key, council: t.council, version: t.version }); setVersion(t.version.match(/\d{4}/)?.[0] || version); setStep(3); }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1565C0" }}>{t.council} · {t.version}</div><b>{t.program}</b><div className="small-note">{t.types} course types ready · {t.note}</div></button>)}
            {srcs.slice(0, 6).map((s) => <button key={s.id} type="button" style={card(base?.id === s.id)} onClick={() => { setBase({ kind: "src", id: s.id, council: s.label.split(" ")[0], version }); setStep(3); }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#2E7D32" }}>Copy an existing curriculum</div><b>{s.label}</b><div className="small-note">Its courses come along; you then set the types</div></button>)}
            <button type="button" style={card(base?.kind === "blank")} onClick={() => { setBase({ kind: "blank", council: "HEC", version }); setStep(3); }}><div style={{ fontSize: 12, fontWeight: 700, color: "#6B7177" }}>Blank</div><b>Start empty</b><div className="small-note">Define every type and course yourself</div></button>
          </div>
        </div>
      )}
      {step >= 3 && base && (
        <div>
          {head(3, "Name the version and start")}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
            <label>Council<br /><select value={base.council} onChange={(e) => setBase({ ...base, council: e.target.value })}>{Array.from(new Set(["NCEAC", "NBEAC", "PEC", "HEC", base.council, "Other"])).map((c) => <option key={c}>{c}</option>)}</select></label>
            <label>Version<br /><input value={version} onChange={(e) => setVersion(e.target.value)} style={{ width: 120 }} /></label>
            <button type="button" className="btn" disabled={busy || !prog} onClick={go}>{busy ? "Setting up…" : `Open the builder for ${prog}`}</button>
          </div>
          {base.kind === "tpl" && <p className="small-note">The course types, courses, semesters and (where the document gives them) CLOs and outlines are filled from the curriculum document — check them on the first step.</p>}
          {msg && <p style={{ color: "#C62828", fontWeight: 600 }}>{msg}</p>}
        </div>
      )}
    </div>
  );
}
