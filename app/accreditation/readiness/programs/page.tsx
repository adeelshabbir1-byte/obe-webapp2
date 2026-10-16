import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import { navForRole } from "../../../../components/reportNav";
import { roleLabel } from "../../../../lib/reportScope";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import { BODIES, BODY_KEYS, DEFAULT_STANDARDS, STANDARD_FIELDS, programBindings, standardsFor } from "../../../../lib/accreditation/bodies";
import { govScope } from "../../../../lib/accreditation/governance";
import { BindProgram, StandardsForm } from "../../../../components/accreditation/GovernanceParts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Programs and councils" };

// Which council governs each program, and the thresholds used for each council's programs.
export default async function ProgramsCouncilsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const s = await govScope(user);
  if (!s) redirect("/dashboard");
  const [bindings, departments, standards] = await Promise.all([
    programBindings(s.chairmanId).catch(() => []),
    prisma.department.findMany({ where: { chairmanId: s.chairmanId }, select: { id: true, name: true } }),
    Promise.all(BODY_KEYS.map(async (b) => [b, await standardsFor(s.chairmanId, b)] as const)),
  ]);
  const deptName = new Map(departments.map((d) => [d.id, d.name]));
  const visible = s.departmentIds === null ? bindings : bindings.filter((b) => b.departmentId && s.departmentIds!.includes(b.departmentId));

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Programs, councils and standards</h1>
          <p style={{ color: "var(--slate)", fontSize: 13, margin: 0, maxWidth: 900 }}>
            Every program is governed by one council, and only that council&apos;s forms, rules and thresholds apply to it: a BBA never shows NCEAC computing forms, and a BS Computer Science never shows NBEAC&apos;s.
            {s.canBind ? " Confirm each program's council here; an inferred council is only a guess from the name." : " The Institute Head sets each program's council."}
          </p>
        </div>
        <Link href="/accreditation/readiness" className="btn btn-secondary btn-sm">Visit readiness</Link>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>Programs ({visible.length})</h3>
        {visible.length === 0 ? <p className="small-note" style={{ margin: 0 }}>No programs yet. Add them to a department on the Departments page.</p> : (
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Program</th><th>Department</th><th>Council</th></tr></thead>
            <tbody>{visible.map((b) => (
              <tr key={b.program}><td><b>{b.program}</b></td><td>{b.departmentId ? deptName.get(b.departmentId) || "—" : <span className="small-note">not in a department</span>}</td>
                <td><BindProgram program={b.program} body={b.body} explicit={b.explicit} canBind={s.canBind && !!b.departmentId} /></td></tr>
            ))}</tbody>
          </table>
        )}
        <div className="small-note" style={{ marginTop: 8 }}>{BODY_KEYS.map((k) => `${k}: ${BODIES[k].scope}`).join(" · ")}</div>
      </div>

      {standards.map(([b, st]) => (
        <div key={b} className="card">
          <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>{BODIES[b].name} ({b}) — standards</h3>
          <p className="small-note" style={{ margin: "0 0 10px" }}>
            Used for the readiness of every {b} program{b === "NCEAC" ? " (Accreditation Overview too)" : ""}. The defaults are starting points: enter the figures in the council&apos;s current manual. CLO / PLO passing marks left empty follow the institute&apos;s Passing Criteria.
          </p>
          <StandardsForm body={b} fields={STANDARD_FIELDS} values={st as unknown as Record<string, number | null>} defaults={DEFAULT_STANDARDS[b] as unknown as Record<string, number | null>} customised={st.customised} canEdit={s.canSetStandards} />
        </div>
      ))}
    </Shell>
  );
}
