import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import HowCalculated from "../../components/HowCalculated";
import { navForRole } from "../../components/reportNav";
import { roleLabel } from "../../lib/reportScope";
import { REVIEW_ROLES } from "../../lib/reviewScope";
import { whoIs, programsOf } from "../../lib/registers";
import { sufficiency, RULE_LABELS, FS_HINT } from "../../lib/facultySufficiency";
import { ActionForm } from "../../components/fyp/FypClient";

export const dynamic = "force-dynamic";
const TONE: Record<string, string> = { AQ: "#1E6B3A", PQ: "#1F4E8C", OTHER: "#9A3412" };

// NBEAC Standard 4: faculty qualification (AQ / PQ) and sufficiency, per program.
export default async function FacultySufficiencyPage({ searchParams }: { searchParams: { program?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const w = await whoIs(user as never);
  if (!w || !(REVIEW_ROLES.includes(user.role) || w.qec)) redirect("/dashboard");
  const all = await programsOf(w.chairmanId);
  const nbeac = (await prisma.departmentProgram.findMany({ where: { chairmanId: w.chairmanId, accreditationBody: "NBEAC" }, select: { degreeProgram: true } }).catch(() => [])).map((p) => p.degreeProgram);
  const programs = [...all.filter((p) => nbeac.includes(p)), ...all.filter((p) => !nbeac.includes(p))];
  const program = programs.find((p) => p === searchParams.program) || programs[0];
  const canEdit = w.leader || w.qec;
  const s = program ? await sufficiency(w.chairmanId, program) : null;
  let ready = true; try { await (prisma as unknown as Record<string, any>).facultyQualification.count(); } catch { ready = false; }
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Faculty Qualification &amp; Sufficiency</h1>
      <p className="small-note" style={{ marginBottom: 10 }}>NBEAC Standard 4: who is academically qualified (AQ) or professionally qualified (PQ), each teacher&apos;s full-time equivalent, and the ratios per program. Programs bound to NBEAC are listed first.</p>
      <HowCalculated shows="Worked out from each teacher's profile (degrees, experience, publications) and this term's offered courses.">
        <ul style={{ margin: "0 0 4px 18px", padding: 0 }}>
          <li><b>AQ</b>: a doctorate (PhD / DBA), kept current by at least one publication in the last {s?.rules.aqPubYears ?? 5} years (or a doctorate finished in that time).</li>
          <li><b>PQ</b>: a master&apos;s degree and at least {s?.rules.pqIndustryYears ?? 5} years of professional (industry) experience.</li>
          <li><b>FTE</b>: a full-time teacher counts the share of their teaching done in this program; a visiting teacher counts their credit hours here ÷ a full load of {s?.rules.fullLoad ?? 12}.</li>
          <li>Shares are of the program&apos;s credit hours taught this term. A reviewer can change a teacher&apos;s classification with a reason (shown in the table and the SAR). The limits are the institute&apos;s and can be changed below to match the current manual.</li>
        </ul>
      </HowCalculated>
      {!ready && <div className="err">{FS_HINT}</div>}
      <form className="card no-print" style={{ display: "flex", gap: 8, alignItems: "flex-end" }}><label style={{ fontSize: 12 }}>Program<br /><select name="program" defaultValue={program}>{programs.map((p) => <option key={p} value={p}>{p}{nbeac.includes(p) ? " (NBEAC)" : ""}</option>)}</select></label><button className="btn btn-secondary btn-sm">Show</button></form>
      {s && <>
        <div className="card" style={{ borderLeft: `5px solid ${s.ok ? "#1E6B3A" : "#B3261E"}` }}>
          <h3 style={{ marginTop: 0 }}>{s.program}: {s.ok ? "meets every limit" : "below the requirement"}</h3>
          <p className="small-note" style={{ marginTop: 0 }}>{s.students} current students · {s.teachers.length} teachers · {s.fte} FTE · {s.totalCredits} credit hours taught this term</p>
          <table className="table" style={{ fontSize: 13 }}><tbody>{s.checks.map((c) => <tr key={c.label}><td>{c.label}</td><td style={{ fontWeight: 800 }}>{c.value}</td><td className="small-note">{c.limit}</td><td style={{ fontWeight: 700, color: c.ok ? "#1E6B3A" : "#B3261E" }}>{c.ok ? "✓ meets" : "✗ below"}</td></tr>)}</tbody></table>
        </div>
        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Teacher</th><th>Highest degree</th><th>Industry experience</th><th>Publications (recent)</th><th>Classification</th><th>Full time</th><th>Credit hours here</th><th>FTE</th>{canEdit && <th />}</tr></thead>
            <tbody>{s.teachers.map((t) => <tr key={t.id}><td><b>{t.name}</b><div className="small-note" style={{ margin: 0 }}>{t.designation}</div></td><td>{t.degree}</td><td>{t.industryYears} yrs</td><td>{t.pubs}</td>
              <td><span style={{ fontWeight: 800, color: TONE[t.status] }}>{t.status}</span>{t.overridden ? <div className="small-note" style={{ margin: 0 }}>set by a reviewer (profile says {t.auto}): {t.note}</div> : <div className="small-note" style={{ margin: 0 }}>{t.reason}</div>}</td>
              <td>{t.fullTime ? "Yes" : `No (${t.employment})`}</td><td>{t.credits}</td><td>{t.fte}</td>
              {canEdit && <td><ActionForm url="/api/faculty-sufficiency" fixed={{ action: "override", userId: t.id }} submit="Save" collapsed openLabel="Change" initial={{ status: t.overridden ? t.status : "", note: t.note || "" }} fields={[{ name: "status", label: "Classification", type: "select", options: [["", "As the profile says"], ["AQ", "AQ"], ["PQ", "PQ"], ["OTHER", "Neither"]] }, { name: "note", label: "Reason", width: 220 }]} /></td>}</tr>)}
              {!s.teachers.length && <tr><td colSpan={9}>No offered course with a teacher in this program this term.</td></tr>}</tbody></table>
        </div>
        {canEdit && <div className="card"><h3 style={{ marginTop: 0 }}>Limits used</h3><ActionForm url="/api/faculty-sufficiency" fixed={{ action: "rules" }} submit="Save limits" collapsed openLabel="Change the limits" initial={s.rules as unknown as Record<string, unknown>} fields={RULE_LABELS.map(([k, l]) => ({ name: k, label: l, type: "number" as const, width: 90 }))} /><p className="small-note">{RULE_LABELS.map(([k, l]) => `${l}: ${s.rules[k]}`).join(" · ")}</p></div>}
      </>}
    </Shell>
  );
}
