import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { navForRole } from "../../../components/reportNav";
import { roleLabel } from "../../../lib/reportScope";
import Shell from "../../../components/Shell";
import { BODIES, BODY_KEYS, type BodyKey } from "../../../lib/accreditation/bodies";
import { CATALOGUE } from "../../../lib/accreditation/catalogue";
import { cycleView, cyclesInScope, govScope, programsInScope, type CycleView } from "../../../lib/accreditation/governance";
import { PlanVisit } from "../../../components/accreditation/GovernanceParts";
import { Bar, heat } from "../../../components/accreditation/Visuals";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visit readiness" };

const GAP_LABEL: Record<string, string> = { "course-file": "Missing course files", "unverified-profile": "Unverified faculty profiles", plo: "PLOs below the benchmark", result: "Results not approved", fsr: "Student–faculty ratio", lab: "Lab capacity", overload: "Overloaded teachers", cqi: "CQI findings without action", data: "Missing data" };

// The Dean's and Chairman's view of every accreditation visit being prepared: how ready each program is for its own
// council, where the gaps are, and the dossier.
export default async function ReadinessDashboard() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const s = await govScope(user);
  if (!s) redirect("/dashboard");

  let missing = false;
  const [programs, cycles] = await Promise.all([programsInScope(s), cyclesInScope(s).catch(() => { missing = true; return []; })]);
  // Each visit is worked out from the live records; a dozen at a time keeps the page quick.
  const views: CycleView[] = [];
  for (const c of cycles.slice(0, 12)) { const v = await cycleView(c.id).catch(() => null); if (v) views.push(v); }
  const withVisit = new Set(cycles.map((c) => c.leadId));
  const noVisit = programs.filter((p) => !withVisit.has(p.leadId));
  const inferred = programs.filter((p) => !p.explicit);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>Accreditation visit readiness</h1>
          <p style={{ color: "var(--slate)", fontSize: 13, margin: 0, maxWidth: 900 }}>
            Each program is prepared for its own council — NCEAC for computing, NBEAC for business, HEC for the rest — with that council&apos;s forms only.
            Readiness counts the data the system holds behind every task and whether it has been verified and approved.
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Link href="/accreditation/readiness/programs" className="btn btn-secondary btn-sm">Programs, councils &amp; standards</Link>
          <Link href="/accreditation/tasks" className="btn btn-secondary btn-sm">My accreditation tasks</Link>
        </div>
      </div>
      {missing && <div className="err">Run prisma/migration_accreditation_governance.sql in Supabase to start planning visits.</div>}
      {inferred.length > 0 && (
        <div className="card" style={{ borderLeft: "4px solid var(--rust)" }}>
          <b>{inferred.length} program{inferred.length > 1 ? "s are" : " is"} not yet bound to a council</b> — the council is only inferred from the name ({inferred.slice(0, 4).map((p) => `${p.program}: ${p.body}`).join(", ")}{inferred.length > 4 ? "…" : ""}).
          {" "}<Link href="/accreditation/readiness/programs">{s.canBind ? "Confirm them" : "See them"}</Link>
        </div>
      )}

      {views.length === 0 && !missing && <div className="card"><p className="small-note" style={{ margin: 0 }}>No visit is being prepared yet.{s.canManage ? " Plan one below." : ""}</p></div>}
      {views.map((v) => {
        const body = v.cycle.body as BodyKey;
        const counts = new Map<string, number>();
        for (const g of v.gaps) counts.set(g.kind, (counts.get(g.kind) || 0) + 1);
        const days = v.cycle.visitDate ? Math.ceil((v.cycle.visitDate.getTime() - Date.now()) / 864e5) : null;
        return (
          <div key={v.cycle.id} className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <div>
                <h2 style={{ fontSize: 17, margin: 0 }}>{v.cycle.program} – {body} Visit Readiness: <span style={{ color: heat(v.overall) }}>{v.overall}%</span></h2>
                <div className="small-note">{v.cycle.title}{v.cycle.visitDate ? ` · visit on ${v.cycle.visitDate.toISOString().slice(0, 10)}${days !== null ? (days >= 0 ? ` (in ${days} days)` : " (date passed)") : ""}` : " · no date set"} · {v.tasks.filter((t) => t.status === "APPROVED").length} of {v.tasks.length} tasks approved</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <Link href={`/accreditation/readiness/${v.cycle.id}`} className="btn btn-brass btn-sm">Open</Link>
                <a href={`/api/accreditation/cycles/${v.cycle.id}/dossier`} className="btn btn-secondary btn-sm">Export dossier</a>
              </div>
            </div>
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table style={{ fontSize: 12 }}>
                <thead><tr>{v.groups.map((g) => <th key={g.key} title={g.title} style={{ textAlign: "center" }}>{body === "NCEAC" ? "Crit." : BODIES[body].groupLabel} {g.key}</th>)}</tr></thead>
                <tbody><tr>{v.groups.map((g) => (
                  <td key={g.key} title={`${g.key}. ${g.title}: ${g.pct}%`} style={{ textAlign: "center", background: heat(g.pct), color: "#fff", fontWeight: 700, minWidth: 54 }}>{g.pct}%</td>
                ))}</tr></tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
              {v.unassigned > 0 && <span className="badge badge-no">{v.unassigned} task{v.unassigned > 1 ? "s" : ""} not assigned</span>}
              {v.overdue > 0 && <span className="badge badge-no">{v.overdue} overdue</span>}
              {Array.from(counts.entries()).map(([k, n]) => <span key={k} className="badge badge-no">{GAP_LABEL[k] || k}: {n}</span>)}
              {!v.unassigned && !v.overdue && !counts.size && <span className="badge badge-ok">No gaps found</span>}
            </div>
          </div>
        );
      })}

      {BODY_KEYS.map((b) => {
        const rows = views.filter((v) => v.cycle.body === b);
        if (rows.length < 2) return null;
        return (
          <div key={b} className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>{b} programs side by side</h3>
            <table style={{ fontSize: 12 }}>
              <thead><tr><th>Program</th><th>Overall</th>{CATALOGUE[b].groups.map((g) => <th key={g.key} title={g.title} style={{ textAlign: "center" }}>{g.key}</th>)}</tr></thead>
              <tbody>{rows.map((v) => (
                <tr key={v.cycle.id}><td><Link href={`/accreditation/readiness/${v.cycle.id}`}>{v.cycle.program}</Link></td><td style={{ minWidth: 90 }}><b style={{ color: heat(v.overall) }}>{v.overall}%</b><Bar pct={v.overall} /></td>
                  {v.groups.map((g) => <td key={g.key} style={{ textAlign: "center", background: heat(g.pct), color: "#fff", fontWeight: 700 }}>{g.pct}</td>)}</tr>
              ))}</tbody>
            </table>
            <div className="small-note" style={{ marginTop: 6 }}>{CATALOGUE[b].groups.map((g) => `${g.key} ${g.title}`).join(" · ")}</div>
          </div>
        );
      })}

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>Programs without a visit being prepared ({noVisit.length})</h3>
        {noVisit.length === 0 ? <p className="small-note" style={{ margin: 0 }}>Every program has a visit in preparation.</p> : (
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Program</th><th>Department</th><th>Council</th><th>Program Lead</th></tr></thead>
            <tbody>{noVisit.map((p) => <tr key={p.leadId}><td>{p.program}</td><td>{p.department}</td><td>{p.body}{!p.explicit && <span className="hp-tag">inferred</span>}</td><td>{p.leadName}</td></tr>)}</tbody>
          </table>
        )}
        {s.canManage && !missing && (
          <div style={{ marginTop: 12 }}>
            <PlanVisit programs={noVisit.map((p) => ({ leadId: p.leadId, label: `${p.program} (${p.body})` }))} />
          </div>
        )}
      </div>
    </Shell>
  );
}
