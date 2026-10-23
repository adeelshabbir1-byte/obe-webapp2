import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import QualityShell from "../../components/QualityShell";
import { ActionForm } from "../../components/fyp/FypClient";
import { programsFor, policyRules, checkScheme, POLICY_LABELS, instituteOf } from "../../lib/quality";
import { bodyOfProgram } from "../../lib/accreditation/bodies";
import { GE_REQS, GE_TOTAL, UG_HINT, checkGenEd, genEdSummary, geMarks } from "../../lib/ugPolicy";
import { canEditProgram } from "../../lib/quality";
import GeMapper from "../../components/GeMapper";
import HowCalculated from "../../components/HowCalculated";

export const dynamic = "force-dynamic";

// HEC Undergraduate Education Policy check: each program's scheme of studies (its latest batch) against the credit rules.
export default async function PolicyCheckPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const programs = await programsFor(user);
  if (!programs.length) redirect("/dashboard");
  const cid = await instituteOf(user);
  const rules = await policyRules(cid || "none");
  const checks = await Promise.all(programs.map(async (p) => {
    const batch = await prisma.batch.findFirst({ where: { coordinatorId: p.coordinatorId, degreeProgram: p.degreeProgram }, orderBy: { startYear: "desc" }, select: { id: true, batchName: true } });
    const courses = batch ? await prisma.course.findMany({ where: { batchId: batch.id }, select: { code: true, title: true, creditHours: true, courseType: true, semesterNumber: true, isNonCredit: true, trackName: true } }) : [];
    const { body } = await bodyOfProgram(cid, p.degreeProgram);
    const marks = await geMarks(cid || "none", p.degreeProgram);
    const ge = body === "PEC" ? null : checkGenEd(courses, marks || new Map(), rules);
    const suggested = new Map((ge || []).flatMap((l) => l.courses.filter((c) => !c.marked).map((c) => [c.code, l.req.key] as [string, string])));
    const mapRows = Array.from(new Map(courses.filter((c) => !c.isNonCredit && !c.trackName).map((c) => [c.code, c])).values()).sort((a, b) => (a.semesterNumber || 99) - (b.semesterNumber || 99) || a.code.localeCompare(b.code)).map((c) => ({ code: c.code, title: c.title, credits: c.creditHours, type: c.courseType, mark: marks?.get(c.code) || "", suggested: suggested.get(c.code) || "" }));
    return { p, batch, body, lines: checkScheme(courses, rules, body), n: courses.length, ge, migrated: marks !== null, mapRows, canMap: canEditProgram(user, p.coordinatorId) };
  }));
  return (
    <QualityShell user={user} title="HEC Policy Check" intro="Each program's scheme of studies (the courses of its newest batch) checked against the HEC Undergraduate Education Policy: total credits, General Education, interdisciplinary and major credits, capstone, internship and semester load. Engineering programs bound to PEC are checked against PEC's limits instead. The limits below are the policy as we know it; the Institute Head can change them to match the current policy. Course types come from each course's Type (General Education, IDS, Core, Elective, Capstone Project, Field Experience).">
      <HowCalculated shows="Each program's newest scheme of studies against the HEC Undergraduate Education Policy 2023.">
        <ul style={{ margin: "0 0 4px 18px", padding: 0 }}>
          <li>Credit totals add up the credit hours of each course type (General Education, IDS, Core / Elective / Lab / Capstone, Field Experience); non-credit and track courses are left out.</li>
          <li>General Education by name: the policy&apos;s 11 requirements (12 courses, 30 credit hours). A requirement is met when the course(s) marked for it — or, if none is marked, the course OBEHUB suggests from its title — give at least the credit hours asked.</li>
          <li>&quot;What to do&quot; lists exactly what to add, retype or rename. Suggestions must be confirmed by the Program Lead.</li>
        </ul>
      </HowCalculated>
      <div style={{ display: "grid", gap: 12 }}>
        {checks.map(({ p, batch, body, lines, n, ge, migrated, mapRows, canMap }) => {
          const bad = lines.filter((l) => l.ok === false).length;
          return (
            <div key={p.key} className="card" style={{ borderLeft: `4px solid ${!n ? "#6B7177" : bad ? "#B3261E" : "#2E7D4F"}`, margin: 0 }}>
              <h3 style={{ marginTop: 0 }}>{p.degreeProgram} <span className="small-note">{body} · {batch ? `batch ${batch.batchName}, ${n} courses` : "no batch"} · {p.lead}</span></h3>
              {!n ? <p className="small-note">No courses yet.</p> : (
                <table style={{ fontSize: 13 }}><tbody>{lines.map((l) => (
                  <tr key={l.label}><td>{l.label}</td><td style={{ fontWeight: 700 }}>{l.value}</td><td style={{ color: l.ok === null ? "var(--slate)" : l.ok ? "#2E7D4F" : "#B3261E" }}>{l.ok === null ? "—" : l.ok ? "✓ meets" : "✗ does not meet"}</td><td className="small-note">{l.note}</td></tr>
                ))}</tbody></table>
              )}
              {ge && n > 0 && (() => { const sm = genEdSummary(ge); return (
                <div style={{ marginTop: 10, overflowX: "auto" }}>
                  <h4 style={{ margin: "6px 0" }}>General Education by name (HEC UG Policy 2023) — <span style={{ color: sm.ok ? "#1E6B3A" : "#B3261E" }}>{sm.met} of {sm.total} met, {sm.credits} of {GE_TOTAL.credits} credit hours</span></h4>
                  <table className="table" style={{ fontSize: 13 }}><thead><tr><th>Requirement</th><th>Needed</th><th>Your course(s)</th><th>Credits</th><th></th><th>What to do</th></tr></thead>
                    <tbody>{ge.map((l) => (
                      <tr key={l.req.key}><td><b>{l.req.label}</b></td><td>{l.req.courses > 1 ? `${l.req.courses} courses, ` : ""}{l.needed} cr</td>
                        <td>{l.courses.length ? l.courses.map((c) => <div key={c.code}>{c.code} {c.title}{!c.marked && <span className="small-note"> (suggested)</span>}</div>) : <span style={{ color: "#B3261E" }}>none</span>}</td>
                        <td>{l.credits}</td>
                        <td style={{ fontWeight: 700, color: l.ok ? "#1E6B3A" : "#B3261E", whiteSpace: "nowrap" }}>{l.ok ? "✓ met" : "✗ not met"}</td>
                        <td style={{ fontSize: 12.5 }}>{l.todo.length ? <ul style={{ margin: 0, paddingLeft: 16 }}>{l.todo.map((t, i) => <li key={i}>{t}</li>)}</ul> : "—"}</td></tr>
                    ))}</tbody></table>
                  {canMap && (migrated ? <details className="no-print" style={{ marginTop: 6 }}><summary style={{ cursor: "pointer", fontWeight: 700 }}>Mark which course meets which requirement</summary><GeMapper program={`${p.coordinatorId}|${p.degreeProgram}`} courses={mapRows} reqs={GE_REQS.map((r) => ({ key: r.key, label: r.label }))} /></details> : <div className="err">{UG_HINT}</div>)}
                </div>); })()}
            </div>
          );
        })}
      </div>
      {user.role === "CHAIRMAN" && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 style={{ marginTop: 0 }}>Policy limits used</h3>
          <ActionForm url="/api/quality" fixed={{ action: "policyRules" }} submit="Save limits" collapsed openLabel="Change the limits" initial={rules as unknown as Record<string, unknown>} fields={POLICY_LABELS.map(([k, l]) => ({ name: k, label: l, type: "number" as const, width: 90 }))} />
          <p className="small-note">{POLICY_LABELS.map(([k, l]) => `${l}: ${rules[k]}`).join(" · ")}</p>
        </div>
      )}
    </QualityShell>
  );
}
