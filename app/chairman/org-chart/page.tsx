import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import OrgChartEditor from "../../../components/OrgChartEditor";
import { loadChart, dutyCheck, ORG_ROLES } from "../../../lib/orgChart";

export const dynamic = "force-dynamic";

export default async function OrgChartPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.role !== "CHAIRMAN") redirect("/chairman/hierarchy");
  const chart = await loadChart(user.id);
  const logs = chart.missing ? [] : ((await (prisma as unknown as Record<string, any>).orgPositionLog.findMany({ where: { positionId: { in: chart.positions.map((p) => p.id) } }, orderBy: { at: "desc" }, take: 40 }).catch(() => [])) as { at: Date; title: string; userId: string; action: string }[]);
  const names = new Map(chart.people.map((p) => [p.id, p.name]));
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Organisation Chart</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 12 }}>
        Draw your institute&apos;s structure in its own words (any levels — with or without Deans and Faculties), map each position to the app&apos;s roles,
        and place people by dragging them from the list. A person gets the menu and permissions of every position they hold. Where a level is missing,
        the app suggests who covers its duties and you decide.
      </p>
      {chart.missing ? <div className="err">The organisation chart is not set up yet — the Super User needs to run <code>prisma/migration_org_chart.sql</code> in Supabase.</div> : (
        <OrgChartEditor chairmanId={user.id} positions={chart.positions} people={chart.people} duties={dutyCheck(chart)} faculties={chart.faculties} departments={chart.departments} programs={chart.programs} roles={ORG_ROLES}
          history={logs.map((l) => ({ at: new Date(l.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }), title: l.title, who: names.get(l.userId) || "—", action: l.action }))} />
      )}
    </Shell>
  );
}
