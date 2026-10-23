import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import OrgChartEditor from "../../../components/OrgChartEditor";
import HowCalculated from "../../../components/HowCalculated";
import { loadChart, dutyCheck, ORG_ROLES } from "../../../lib/orgChart";
import { coverageNotes } from "../../../lib/approvers";
import { TITLE_KEYS, titlesFor } from "../../../lib/titles";

export const dynamic = "force-dynamic";

export default async function OrgChartPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "CHAIRMAN") redirect("/chairman/hierarchy");
  const chart = await loadChart(user.id);
  const logs = chart.missing ? [] : ((await (prisma as unknown as Record<string, any>).orgPositionLog.findMany({ where: { positionId: { in: chart.positions.map((p) => p.id) } }, orderBy: { at: "desc" }, take: 60 }).catch(() => [])) as { at: Date; title: string; userId: string; action: string; reason?: string | null }[]);
  const names = new Map(chart.people.map((p) => [p.id, p.name]));
  const [coverage, titles, titlesMissing] = await Promise.all([
    chart.missing ? Promise.resolve({}) : coverageNotes(user.id).catch(() => ({})),
    titlesFor(user.id),
    (prisma as unknown as Record<string, any>).instituteTitle.count({ where: { chairmanId: user.id } }).then(() => false).catch(() => true),
  ]);
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Organisation Chart</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12 }}>
        Your institute&apos;s structure in its own words. Click a box to assign someone, replace or vacate them, or set an acting holder during leave;
        drag a box onto another to move it with its branch; switch off a position the institute does not have. A person gets the menu and permissions of every position they hold.
      </p>
      <HowCalculated shows="Who approves what, as decided by this chart.">
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          <li>Approvals (leave, results, student status changes, degree-plan requests, assessment-rule exceptions, accreditation tasks) go to the holder of the matching position — or to the <b>acting</b> holder while their dates last.</li>
          <li>A <b>vacant</b> or <b>switched-off</b> position passes its powers on: no Dean → the department&apos;s Chairman / HoD, else the Institute Head; no Chairman / HoD → Dean, then Institute Head; no Program Lead → Chairman / HoD; no Controller of Examinations or QEC In-charge → whoever it sits under. The brown note on a box says who is covering. When the position is filled, approvals move back by themselves.</li>
          <li>Moving a Chairman&apos;s box under another Dean moves the department to that faculty; moving a Program Lead&apos;s box under another Chairman moves the program to that department. The confirmation lists every change, and the last move can be undone.</li>
        </ul>
      </HowCalculated>
      {chart.missing ? <div className="err">The organisation chart is not set up yet — the Super User needs to run <code>prisma/migration_org_chart.sql</code> (then <code>migration_org_titles.sql</code>) in Supabase.</div> : (
        <OrgChartEditor chairmanId={user.id} positions={chart.positions as never} people={chart.people} duties={dutyCheck(chart)} faculties={chart.faculties} departments={chart.departments} programs={chart.programs} roles={ORG_ROLES}
          acting={chart.acting} since={chart.since} coverage={coverage} lastMove={chart.lastMove}
          titles={TITLE_KEYS.map((t) => ({ key: t.key, label: t.label, default: t.default, examples: t.examples, canSwitchOff: t.canSwitchOff, title: titles[t.key].title, enabled: titles[t.key].enabled }))} titlesMissing={titlesMissing}
          history={logs.map((l) => ({ at: new Date(l.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), title: l.title, who: names.get(l.userId) || "—", action: l.action, reason: l.reason || null }))} />
      )}
    </Shell>
  );
}
