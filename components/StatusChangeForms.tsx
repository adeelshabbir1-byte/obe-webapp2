"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const post = async (body: unknown) => {
  const r = await fetch("/api/status-changes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, error: d.error as string | undefined, id: d.id as string | undefined };
};
const toB64 = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] || ""); r.onerror = rej; r.readAsDataURL(f); });

type Student = { id: string; label: string; status: string };
type Batch = { id: string; label: string };

/** Raise a status change for a student. */
export function RaiseForm({ students, batches, types, initialStudent, initialType }: { students: Student[]; batches: Batch[]; types: [string, string, string][]; initialStudent?: string; initialType?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [studentId, setStudentId] = useState(initialStudent || "");
  const [type, setType] = useState(initialType || "LEFT");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [freeze, setFreeze] = useState(1);
  const [target, setTarget] = useState("");
  const [other, setOther] = useState("");
  const [caseRef, setCaseRef] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [credits, setCredits] = useState<{ code: string; title: string; creditHours: number; grade: string; toCode: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const shown = students.filter((s) => !q || s.label.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  const what = types.find((t) => t[0] === type)?.[2];

  async function submit() {
    setBusy(true); setMsg("");
    if (file && file.size > 3 * 1024 * 1024) { setMsg("The document is larger than 3 MB."); setBusy(false); return; }
    const doc = file ? { name: file.name, type: file.type, data: await toB64(file) } : null;
    const r = await post({ action: "raise", studentId, type, effectiveDate: date, reason, freezeSemesters: freeze, targetBatchId: target || null, otherInstitute: other, caseReference: caseRef, doc, credits });
    setBusy(false);
    if (!r.ok) { setMsg(r.error || "Could not raise it."); return; }
    router.push(`/status-changes?id=${r.id}`); router.refresh();
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 17, margin: "0 0 8px" }}>Raise a status change</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
        <label style={{ fontSize: 12.5 }}>Student<input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or roll number" style={{ width: "100%" }} />
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)} style={{ width: "100%", marginTop: 4 }}><option value="">Choose…</option>{shown.map((s) => <option key={s.id} value={s.id}>{s.label}{s.status !== "ACTIVE" ? ` (${s.status.toLowerCase()})` : ""}</option>)}</select></label>
        <label style={{ fontSize: 12.5 }}>Change<select value={type} onChange={(e) => setType(e.target.value)} style={{ width: "100%" }}>{types.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>{what && <span className="small-note">{what}</span>}</label>
        <label style={{ fontSize: 12.5 }}>Effective date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "100%" }} /></label>
        {type === "FREEZE" && <label style={{ fontSize: 12.5 }}>Semesters<select value={freeze} onChange={(e) => setFreeze(Number(e.target.value))} style={{ width: "100%" }}><option value={1}>One semester</option><option value={2}>Two semesters</option></select></label>}
        {(type === "TRANSFER_INTERNAL" || type === "READMISSION") && <label style={{ fontSize: 12.5 }}>{type === "READMISSION" ? "Rejoin batch (leave empty to return to the same batch)" : "Move to program and batch"}<select value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: "100%" }}><option value="">—</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label>}
        {(type === "TRANSFER_OUT" || type === "TRANSFER_IN") && <label style={{ fontSize: 12.5 }}>{type === "TRANSFER_OUT" ? "Moving to (university)" : "Coming from (university)"}<input value={other} onChange={(e) => setOther(e.target.value)} style={{ width: "100%" }} /></label>}
        {type === "RUSTICATED" && <label style={{ fontSize: 12.5 }}>Disciplinary case reference<input value={caseRef} onChange={(e) => setCaseRef(e.target.value)} placeholder="e.g. DC-2026-014" style={{ width: "100%" }} /></label>}
        <label style={{ fontSize: 12.5 }}>Supporting document (PDF / image, optional)<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ width: "100%" }} /></label>
      </div>
      <label style={{ fontSize: 12.5, display: "block", marginTop: 8 }}>Reason<textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: "100%" }} placeholder="e.g. Financial reasons; applying to NUST; medical" /></label>
      {type === "TRANSFER_IN" && (
        <div style={{ marginTop: 8 }}>
          <b style={{ fontSize: 13 }}>Courses passed at the other university</b> <span className="small-note">— the Program Lead accepts each under the credit-transfer rules (grade, share of the program)</span>
          {credits.map((c, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 1fr 60px 60px 110px 30px", gap: 4, marginTop: 4 }}>
              {(["code", "title"] as const).map((k) => <input key={k} value={c[k]} placeholder={k === "code" ? "Code" : "Title"} onChange={(e) => setCredits(credits.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />)}
              <input type="number" min={0} max={6} value={c.creditHours} onChange={(e) => setCredits(credits.map((x, j) => (j === i ? { ...x, creditHours: Number(e.target.value) } : x)))} aria-label="Credit hours" />
              <input value={c.grade} placeholder="Grade" onChange={(e) => setCredits(credits.map((x, j) => (j === i ? { ...x, grade: e.target.value } : x)))} />
              <input value={c.toCode} placeholder="Counts as (our code)" onChange={(e) => setCredits(credits.map((x, j) => (j === i ? { ...x, toCode: e.target.value } : x)))} />
              <button className="act act-danger" onClick={() => setCredits(credits.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
            </div>
          ))}
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 4 }} onClick={() => setCredits([...credits, { code: "", title: "", creditHours: 3, grade: "", toCode: "" }])}>+ Course</button>
        </div>
      )}
      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
        <button className="btn btn-brass" disabled={busy || !studentId || !reason.trim()} onClick={submit}>Send for approval</button>
        {msg && <span className="err">{msg}</span>}
      </div>
    </div>
  );
}

/** Approve or not approve the request at the stage waiting for this person. */
export function DecideForm({ id, leftWithFees }: { id: string; leftWithFees: number }) {
  const router = useRouter();
  const [remarks, setRemarks] = useState("");
  const [cleared, setCleared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function go(approve: boolean) {
    setBusy(true); setMsg("");
    const r = await post({ action: "decide", id, approve, remarks, feeCleared: cleared });
    setBusy(false);
    if (!r.ok) setMsg(r.error || "Could not save."); else router.refresh();
  }
  return (
    <div style={{ marginTop: 8 }}>
      <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks (needed when not approving)" style={{ width: "100%" }} aria-label="Remarks" />
      {leftWithFees > 0 && <label style={{ fontSize: 12.5, display: "block" }}><input type="checkbox" checked={cleared} onChange={(e) => setCleared(e.target.checked)} /> Finance has cleared the outstanding Rs {leftWithFees.toLocaleString("en-PK")}</label>}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button className="btn btn-sm" disabled={busy} onClick={() => go(true)}>Approve</button>
        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => go(false)}>Not approved</button>
        {msg && <span className="err">{msg}</span>}
      </div>
    </div>
  );
}

/** Accept or reject one carried-over / transferred-in course. */
export function CreditForm({ creditId, toCode }: { creditId: string; toCode: string | null }) {
  const router = useRouter();
  const [code, setCode] = useState(toCode || "");
  const [msg, setMsg] = useState("");
  async function go(accept: boolean) {
    const r = await post({ action: "credit", creditId, accept, toCode: code });
    if (!r.ok) setMsg(r.error || "Could not save."); else router.refresh();
  }
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Counts as" style={{ width: 90 }} aria-label="Counts as course code" />
      <button className="act" onClick={() => go(true)}>Accept</button><button className="act act-danger" onClick={() => go(false)}>Reject</button>
      {msg && <span className="err" style={{ fontSize: 11.5 }}>{msg}</span>}
    </span>
  );
}

export function CancelButton({ id }: { id: string }) {
  const router = useRouter();
  return <button className="btn btn-secondary btn-sm" onClick={async () => { if (!confirm("Withdraw this request?")) return; const r = await post({ action: "cancel", id }); if (r.ok) router.refresh(); else alert(r.error); }}>Withdraw request</button>;
}

export function PolicyForm({ p, grades }: { p: { transferMinGrade: string; transferMaxPct: number; dropDeadlineWeek: number; readOnlyDays: number }; grades: string[] }) {
  const router = useRouter();
  const [v, setV] = useState(p);
  const [msg, setMsg] = useState("");
  return (
    <details className="card">
      <summary style={{ cursor: "pointer" }}><b>Rules for status changes</b> <span className="small-note">— credit transfer, drop deadline, portal access after leaving</span></summary>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginTop: 8 }}>
        <label style={{ fontSize: 12.5 }}>Transfer credit: grade at least<select value={v.transferMinGrade} onChange={(e) => setV({ ...v, transferMinGrade: e.target.value })} style={{ display: "block" }}>{grades.map((g) => <option key={g}>{g}</option>)}</select></label>
        <label style={{ fontSize: 12.5 }}>…up to % of the program&apos;s credits<input type="number" min={0} max={100} value={v.transferMaxPct} onChange={(e) => setV({ ...v, transferMaxPct: Number(e.target.value) })} style={{ display: "block", width: 90 }} /></label>
        <label style={{ fontSize: 12.5 }}>Drop deadline (week of semester) — after it, W<input type="number" min={1} max={20} value={v.dropDeadlineWeek} onChange={(e) => setV({ ...v, dropDeadlineWeek: Number(e.target.value) })} style={{ display: "block", width: 90 }} /></label>
        <label style={{ fontSize: 12.5 }}>Read-only portal access after leaving (days)<input type="number" min={0} max={3650} value={v.readOnlyDays} onChange={(e) => setV({ ...v, readOnlyDays: Number(e.target.value) })} style={{ display: "block", width: 90 }} /></label>
        <button className="btn btn-sm" onClick={async () => { const r = await post({ action: "policy", ...v }); setMsg(r.ok ? "Saved." : r.error || "Could not save."); if (r.ok) router.refresh(); }}>Save</button>
        {msg && <span style={{ fontSize: 13, color: msg === "Saved." ? "#1E7B45" : "#C62828" }}>{msg}</span>}
      </div>
    </details>
  );
}
