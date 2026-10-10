"use client";

const lab = { fontSize: 11, color: "var(--slate)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: ".05em" } as const;
const ctl = { padding: "6px 8px", border: "1px solid var(--line)", fontSize: 12.5 } as const;

/** Filter bar of the OMC activity log. It is a client component because the controls submit the form when changed. */
export default function OmcActivityFilters({ omcMembers, omcId, from, to, terms, selectedTermKey, degreeProgram, termName, termYear }: {
  omcMembers: { id: string; name: string }[]; omcId: string; from: string; to: string;
  terms: { degreeProgram: string; termName: string; termYear: number | string }[]; selectedTermKey: string;
  degreeProgram: string; termName: string; termYear: string;
}) {
  return (
    <form method="GET" className="card no-print" style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div>
        <label style={lab}>OMC Member</label>
        <select name="omcId" defaultValue={omcId} onChange={(e) => e.currentTarget.form?.submit()} style={ctl}>
          <option value="">Every OMC Member</option>
          {omcMembers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <div>
        <label style={lab}>From</label>
        <input type="date" name="from" defaultValue={from} onChange={(e) => e.currentTarget.form?.submit()} style={ctl} />
      </div>
      <div>
        <label style={lab}>To</label>
        <input type="date" name="to" defaultValue={to} onChange={(e) => e.currentTarget.form?.submit()} style={ctl} />
      </div>
      <div>
        <label style={lab}>Semester (for Word minutes)</label>
        <select
          name="term" defaultValue={selectedTermKey}
          onChange={(e) => {
            const form = e.currentTarget.form; if (!form) return;
            const [dp, tn, ty] = e.currentTarget.value.split("|");
            (form.elements.namedItem("degreeProgram") as HTMLInputElement).value = dp || "";
            (form.elements.namedItem("termName") as HTMLInputElement).value = tn || "";
            (form.elements.namedItem("termYear") as HTMLInputElement).value = ty || "";
            form.submit();
          }}
          style={ctl}
        >
          <option value="">No semester selected</option>
          {terms.map((t) => { const k = `${t.degreeProgram}|${t.termName}|${t.termYear}`; return <option key={k} value={k}>{t.degreeProgram} — {t.termName} {t.termYear}</option>; })}
        </select>
        <input type="hidden" name="degreeProgram" defaultValue={degreeProgram} />
        <input type="hidden" name="termName" defaultValue={termName} />
        <input type="hidden" name="termYear" defaultValue={termYear} />
      </div>
    </form>
  );
}
