"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Fee = { id: string; degreeProgram: string; session: string; admissionFee: number; tuitionPerSemester: number; perCreditHour: number | null; labFee: number; examFee: number; otherFee: number; notes: string | null };
type Sch = { id: string; fiscalYear: string; scheme: string; degreeProgram: string | null; students: number; amount: number; notes: string | null };

const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-US")}`;
async function call(method: "POST" | "DELETE", body: Record<string, unknown> | null, q = "") {
  const res = await fetch(`/api/chairman/finance/accounts${q}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return res.ok ? null : (data.error as string) || "Could not save.";
}

/** Fee structure per program and intake session, and scholarships given in the chosen fiscal year. */
export default function FeesScholarships({ canEdit, programs, sessions, fees, scholarships, year, schemes, students }: {
  canEdit: boolean; programs: string[]; sessions: string[]; fees: Fee[]; scholarships: Sch[]; year: string; schemes: string[]; students: number;
}) {
  const router = useRouter();
  const [fee, setFee] = useState<Partial<Fee> | null>(null);
  const [sch, setSch] = useState<Partial<Sch> | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(entity: string, data: Record<string, unknown>, done: () => void) {
    setBusy(true); setErr("");
    const e = await call("POST", { entity, ...data });
    setBusy(false);
    if (e) { setErr(e); return; }
    done(); router.refresh();
  }
  async function remove(entity: string, id: string) {
    if (!confirm("Remove this record?")) return;
    const e = await call("DELETE", null, `?entity=${entity}&id=${encodeURIComponent(id)}`);
    if (e) setErr(e); else router.refresh();
  }
  const num = (label: string, v: number | null | undefined, on: (n: number | null) => void, w = 120) => (
    <label style={{ fontSize: 12, display: "grid", gap: 3 }}>{label}<input type="number" min={0} step="any" value={v ?? ""} onChange={(e) => on(e.target.value === "" ? null : Number(e.target.value))} style={{ width: w }} /></label>
  );
  const totalStudents = scholarships.reduce((n, s) => n + s.students, 0), totalAmount = scholarships.reduce((n, s) => n + s.amount, 0);

  return (
    <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
      {err && <div className="err">{err}</div>}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Fee structure</h3>
          {canEdit && !fee && <button type="button" className="btn btn-brass btn-sm" onClick={() => setFee({ degreeProgram: programs[0] || "", session: sessions[0], admissionFee: 0, tuitionPerSemester: 0, labFee: 0, examFee: 0, otherFee: 0 })}>Add / update fees</button>}
        </div>
        <p className="small-note">Per program and intake session. A session&apos;s fees stay as they were charged, so older batches keep their own row.</p>
        {fee && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", padding: 12, border: "1px dashed var(--line)", borderRadius: 8, margin: "8px 0" }}>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Program<select value={fee.degreeProgram} onChange={(e) => setFee({ ...fee, degreeProgram: e.target.value })}>{programs.map((p) => <option key={p}>{p}</option>)}</select></label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Intake session<select value={fee.session} onChange={(e) => setFee({ ...fee, session: e.target.value })}>{sessions.map((x) => <option key={x}>{x}</option>)}</select></label>
            {num("Admission fee", fee.admissionFee, (n) => setFee({ ...fee, admissionFee: n || 0 }))}
            {num("Tuition per semester", fee.tuitionPerSemester, (n) => setFee({ ...fee, tuitionPerSemester: n || 0 }))}
            {num("Per credit hour (if charged)", fee.perCreditHour, (n) => setFee({ ...fee, perCreditHour: n }))}
            {num("Lab fee / semester", fee.labFee, (n) => setFee({ ...fee, labFee: n || 0 }))}
            {num("Exam fee / semester", fee.examFee, (n) => setFee({ ...fee, examFee: n || 0 }))}
            {num("Other charges / semester", fee.otherFee, (n) => setFee({ ...fee, otherFee: n || 0 }))}
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Notes<input value={fee.notes || ""} onChange={(e) => setFee({ ...fee, notes: e.target.value })} style={{ width: 220 }} /></label>
            <button type="button" className="btn btn-brass btn-sm" disabled={busy || !fee.degreeProgram} onClick={() => save("fee", fee, () => setFee(null))}>Save</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFee(null)}>Cancel</button>
          </div>
        )}
        {programs.length === 0 && <p className="small-note">No programs yet.</p>}
        {fees.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Program</th><th>Session</th><th>Admission</th><th>Tuition / semester</th><th>Lab + exam + other / semester</th><th>8-semester total</th><th></th></tr></thead>
              <tbody>
                {fees.map((f) => (
                  <tr key={f.id}>
                    <td><b>{f.degreeProgram}</b>{f.notes && <div className="small-note">{f.notes}</div>}</td><td>{f.session}</td>
                    <td>{pkr(f.admissionFee)}</td><td>{pkr(f.tuitionPerSemester)}{f.perCreditHour ? <div className="small-note">{pkr(f.perCreditHour)} per credit hour</div> : null}</td>
                    <td>{pkr(f.labFee + f.examFee + f.otherFee)}</td>
                    <td>{pkr(f.admissionFee + 8 * (f.tuitionPerSemester + f.labFee + f.examFee + f.otherFee))}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{canEdit && <><button type="button" className="act act-primary" onClick={() => setFee(f)}>Edit</button>{" "}<button type="button" className="act act-danger" onClick={() => remove("fee", f.id)}>Remove</button></>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Scholarships and financial aid — {year}</h3>
          {canEdit && !sch && <button type="button" className="btn btn-brass btn-sm" onClick={() => setSch({ fiscalYear: year, scheme: schemes[0], students: 0, amount: 0 })}>Add scholarship</button>}
        </div>
        <p className="small-note">
          {totalStudents} award{totalStudents === 1 ? "" : "s"} worth {pkr(totalAmount)} this year{students ? ` · ${Math.round((totalStudents / students) * 1000) / 10}% of the ${students.toLocaleString("en-US")} students on record` : ""}.
        </p>
        {sch && (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", padding: 12, border: "1px dashed var(--line)", borderRadius: 8, margin: "8px 0" }}>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Scheme<select value={sch.scheme} onChange={(e) => setSch({ ...sch, scheme: e.target.value })}>{schemes.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Program<select value={sch.degreeProgram || ""} onChange={(e) => setSch({ ...sch, degreeProgram: e.target.value || null })}><option value="">All programs</option>{programs.map((p) => <option key={p}>{p}</option>)}</select></label>
            {num("Students", sch.students, (n) => setSch({ ...sch, students: n || 0 }), 90)}
            {num("Amount (PKR)", sch.amount, (n) => setSch({ ...sch, amount: n || 0 }), 140)}
            <label style={{ fontSize: 12, display: "grid", gap: 3 }}>Notes<input value={sch.notes || ""} onChange={(e) => setSch({ ...sch, notes: e.target.value })} style={{ width: 220 }} /></label>
            <button type="button" className="btn btn-brass btn-sm" disabled={busy} onClick={() => save("scholarship", sch, () => setSch(null))}>Save</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSch(null)}>Cancel</button>
          </div>
        )}
        {scholarships.length === 0 ? <p className="small-note">No scholarships recorded for {year}.</p> : (
          <table>
            <thead><tr><th>Scheme</th><th>Program</th><th>Students</th><th>Amount</th><th>Average</th><th></th></tr></thead>
            <tbody>
              {scholarships.map((x) => (
                <tr key={x.id}>
                  <td><b>{x.scheme}</b>{x.notes && <div className="small-note">{x.notes}</div>}</td><td>{x.degreeProgram || "All"}</td><td>{x.students}</td><td>{pkr(x.amount)}</td>
                  <td>{x.students ? pkr(x.amount / x.students) : "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{canEdit && <><button type="button" className="act act-primary" onClick={() => setSch(x)}>Edit</button>{" "}<button type="button" className="act act-danger" onClick={() => remove("scholarship", x.id)}>Remove</button></>}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 700 }}><td colSpan={2}>Total</td><td>{totalStudents}</td><td>{pkr(totalAmount)}</td><td colSpan={2} /></tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
