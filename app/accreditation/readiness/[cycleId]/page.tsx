import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import { navForRole } from "../../../../components/reportNav";
import { roleLabel } from "../../../../lib/reportScope";
import { prisma } from "../../../../lib/db";
import ProcessTracker from "../../../../components/ProcessTracker";
import Shell from "../../../../components/Shell";
import { BODIES, type BodyKey } from "../../../../lib/accreditation/bodies";
import { CATALOGUE } from "../../../../lib/accreditation/catalogue";
import { assignablePeople, cycleView, govScope, inScope } from "../../../../lib/accreditation/governance";
import { AssignControl, VisitSettings } from "../../../../components/accreditation/GovernanceParts";
import { Bar, StatusChip, heat } from "../../../../components/accreditation/Visuals";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accreditation visit" };

// One visit: its council's forms / criteria, every task with who holds it, the gaps, and the dossier.
export default async function CyclePage({ params }: { params: { cycleId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const s = await govScope(user);
  if (!s) redirect("/dashboard");
  const c = await prisma.accreditationCycle.findUnique({ where: { id: params.cycleId } }).catch(() => null);
  if (!c || !inScope(s, c)) notFound();
  const v = await cycleView(c.id);
  if (!v) notFound();
  const body = c.body as BodyKey;
  const cat = CATALOGUE[body];
  const managing = s.canManage;
  const people = managing ? await assignablePeople(s) : [];
  const ids = v.tasks.map((t) => t.assigneeId).filter((x): x is string => !!x);
  const names = new Map((ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>{c.program} – {body} Visit Readiness: <span style={{ color: heat(v.overall) }}>{v.overall}%</span></h1>
          <p style={{ color: "var(--slate)", fontSize: 13, margin: 0 }}>{c.title} · {BODIES[body].framework}{c.status !== "OPEN" ? " · closed" : ""}</p>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Link href="/accreditation/readiness" className="btn btn-secondary btn-sm">All visits</Link>
          <a href={`/accreditation/sar/${c.id}`} className="btn btn-brass btn-sm">Self-Assessment Report (one click)</a>
          <a href={`/accreditation/visit/${c.id}`} className="btn btn-secondary btn-sm">Visit plan: agenda, panel, findings</a>
          <a href={`/api/accreditation/cycles/${c.id}/dossier`} className="btn btn-brass btn-sm">Export dossier (ZIP)</a>
        </div>
      </div>
      {managing && <div className="card"><VisitSettings id={c.id} title={c.title} visitDate={day(c.visitDate)} status={c.status} /></div>}
      <p style={{ margin: "0 0 10px" }}><Link href={`/accreditation/visit-day/${c.id}`} className="btn btn-ghost btn-sm">Visit day plan, checklist and mock visit →</Link></p>
      {["NCEAC", "PEC", "NBEAC"].includes(body) && <ProcessTracker cycleId={c.id} canEdit={managing || c.leadId === user.id} />}

      <div className="card" style={{ overflowX: "auto" }}>
        <table style={{ fontSize: 12.5 }}>
          <thead><tr><th>{BODIES[body].groupLabel}</th><th style={{ width: "40%" }}>Readiness</th><th>Tasks</th></tr></thead>
          <tbody>{v.groups.map((g) => <tr key={g.key}><td>{g.key}. {g.title}</td><td><div style={{ display: "flex", gap: 8, alignItems: "center" }}><b style={{ color: heat(g.pct), minWidth: 40 }}>{g.pct}%</b><div style={{ flex: 1 }}><Bar pct={g.pct} /></div></div></td><td>{g.tasks}</td></tr>)}</tbody>
        </table>
      </div>

      {v.gaps.length > 0 && (
        <div className="card" style={{ borderLeft: "4px solid #B3261E" }}>
          <h3 style={{ fontSize: 15, margin: "0 0 8px", color: "#B3261E" }}>Gaps ({v.gaps.length})</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, columns: "2 320px" }}>
            {v.gaps.slice(0, 80).map((g, i) => <li key={i} style={{ color: "#B3261E", breakInside: "avoid" }}><Link href={g.href} style={{ color: "inherit" }}>{g.text}</Link></li>)}
          </ul>
          {v.gaps.length > 80 && <p className="small-note">and {v.gaps.length - 80} more — see the tasks.</p>}
        </div>
      )}

      {cat.groups.map((g) => {
        const rows = v.tasks.filter((t) => t.group === g.key);
        if (!rows.length) return null;
        return (
          <div key={g.key} className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>{BODIES[body].groupLabel} {g.key}: {g.title}</h3>
            <table style={{ fontSize: 12.5 }}>
              <thead><tr><th>Task</th><th>Status</th><th>Held by</th><th>Due</th><th style={{ minWidth: 110 }}>Progress</th>{managing && <th></th>}</tr></thead>
              <tbody>{rows.map((t) => {
                const d = cat.tasks.find((x) => x.code === t.code)!;
                return (
                  <tr key={t.id}>
                    <td><Link href={`/accreditation/tasks/${t.id}`}><b>{t.code}</b> {t.title}</Link>{t.gaps.length > 0 && <div className="small-note" style={{ color: "#B3261E" }}>{t.gaps.length} gap{t.gaps.length > 1 ? "s" : ""}</div>}</td>
                    <td><StatusChip status={t.status} /></td>
                    <td>{t.assigneeId ? names.get(t.assigneeId) || "—" : <span style={{ color: "#B3261E" }}>nobody</span>}
                      {t.assigneeId && (t.status === "ASSIGNED" || t.status === "RETURNED") && t.accessUntil && t.accessUntil < new Date() && <div style={{ fontSize: 11.5, color: "#B3261E" }}>access ended {day(t.accessUntil)} — reassign to extend</div>}</td>
                    <td style={{ color: t.dueDate && t.dueDate < new Date() && t.status !== "APPROVED" ? "#B3261E" : undefined }}>{day(t.dueDate)}</td>
                    <td><b style={{ color: heat(t.progress) }}>{t.progress}%</b><Bar pct={t.progress} /></td>
                    {managing && <td><AssignControl taskId={t.id} assigneeId={t.assigneeId} status={t.status} canManage={c.status === "OPEN"} people={people.map((p) => ({ id: p.id, name: p.name, label: p.label, suggested: p.roles.some((r) => d.suggested.includes(r)) }))} /></td>}
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        );
      })}
    </Shell>
  );
}
