import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import QualityShell from "../../components/QualityShell";
import { ActionForm } from "../../components/fyp/FypClient";
import { programsFor, policyRules, checkScheme, POLICY_LABELS, instituteOf } from "../../lib/quality";
import { bodyOfProgram } from "../../lib/accreditation/bodies";

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
    return { p, batch, body, lines: checkScheme(courses, rules, body), n: courses.length };
  }));
  return (
    <QualityShell user={user} title="HEC Policy Check" intro="Each program's scheme of studies (the courses of its newest batch) checked against the HEC Undergraduate Education Policy: total credits, General Education, interdisciplinary and major credits, capstone, internship and semester load. Engineering programs bound to PEC are checked against PEC's limits instead. The limits below are the policy as we know it; the Institute Head can change them to match the current policy. Course types come from each course's Type (General Education, IDS, Core, Elective, Capstone Project, Field Experience).">
      <div style={{ display: "grid", gap: 12 }}>
        {checks.map(({ p, batch, body, lines, n }) => {
          const bad = lines.filter((l) => l.ok === false).length;
          return (
            <div key={p.key} className="card" style={{ borderLeft: `4px solid ${!n ? "#6B7177" : bad ? "#B3261E" : "#2E7D4F"}`, margin: 0 }}>
              <h3 style={{ marginTop: 0 }}>{p.degreeProgram} <span className="small-note">{body} · {batch ? `batch ${batch.batchName}, ${n} courses` : "no batch"} · {p.lead}</span></h3>
              {!n ? <p className="small-note">No courses yet.</p> : (
                <table style={{ fontSize: 13 }}><tbody>{lines.map((l) => (
                  <tr key={l.label}><td>{l.label}</td><td style={{ fontWeight: 700 }}>{l.value}</td><td style={{ color: l.ok === null ? "var(--slate)" : l.ok ? "#2E7D4F" : "#B3261E" }}>{l.ok === null ? "—" : l.ok ? "✓ meets" : "✗ does not meet"}</td><td className="small-note">{l.note}</td></tr>
                ))}</tbody></table>
              )}
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
