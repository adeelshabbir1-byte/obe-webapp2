import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import { navForRole } from "../../../../components/reportNav";
import { roleLabel } from "../../../../lib/reportScope";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import TaskForm from "../../../../components/accreditation/TaskForm";
import { AssignControl } from "../../../../components/accreditation/GovernanceParts";
import { StatusChip, heat } from "../../../../components/accreditation/Visuals";
import { BODIES, type BodyKey } from "../../../../lib/accreditation/bodies";
import { groupOf } from "../../../../lib/accreditation/catalogue";
import { assignablePeople, canWorkOn, def as taskDefOf, govScope, inScope, parseData, taskProgress } from "../../../../lib/accreditation/governance";
import { SourceLoader, dataScore, sourcesForTask } from "../../../../lib/accreditation/sources";
import { KINDS, SECTIONS } from "../../../../lib/sarRegistry";
import { approverFor } from "../../../../lib/approvers";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accreditation task" };

const ACTION: Record<string, string> = { ASSIGNED: "assigned it to", REASSIGNED: "reassigned it to", REVOKED: "withdrew it from", SUBMITTED: "signed it off", APPROVED: "approved it", RETURNED: "returned it to", OVERRIDDEN: "overrode", REOPENED: "reopened it", FILE_ADDED: "attached", FILE_REMOVED: "removed" };

export default async function TaskPage({ params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const t = await prisma.accreditationTask.findUnique({ where: { id: params.id } }).catch(() => null);
  if (!t) notFound();
  const cycle = await prisma.accreditationCycle.findUnique({ where: { id: t.cycleId } });
  if (!cycle) notFound();
  const s = await govScope(user);
  const managing = (!!s?.canManage && inScope(s, cycle)) || (await approverFor(cycle.chairmanId, "HEAD_OF_DEPARTMENT", { departmentId: cycle.departmentId })).ids.includes(user.id);
  const viewing = managing || (!!s && inScope(s, cycle)) || t.assigneeId === user.id;
  const d = taskDefOf(cycle.body, t.code);
  if (!viewing || !d) notFound();
  const body = cycle.body as BodyKey;
  const loader = await new SourceLoader({ chairmanId: cycle.chairmanId, leadId: cycle.leadId, program: cycle.program, departmentId: cycle.departmentId, body }).init();
  const results = await sourcesForTask(loader, d);
  const dataPct = dataScore(results);
  const progress = taskProgress(d, t, dataPct);
  // The parts of the % shown under "How is this % worked out?".
  const checks = results.flatMap((r) => r.checks).filter((c) => c.total > 0);
  const tickedNow = d.checklist.filter((c) => parseData(t).checked?.[c]).length;
  const dataPts = Math.round(70 * (dataPct === null ? (d.checklist.length ? tickedNow / d.checklist.length : 0) : dataPct / 100));
  const working = canWorkOn(user.id, t, cycle);
  const [files, events, people] = await Promise.all([
    prisma.accreditationTaskFile.findMany({ where: { taskId: t.id }, select: { id: true, title: true, fileName: true, size: true, uploadedById: true }, orderBy: { createdAt: "asc" } }),
    prisma.accreditationTaskEvent.findMany({ where: { taskId: t.id }, orderBy: { createdAt: "desc" }, take: 40 }),
    managing && s ? assignablePeople(s) : Promise.resolve([]),
  ]);
  const ids = Array.from(new Set([t.assigneeId, ...files.map((f) => f.uploadedById), ...events.flatMap((e) => [e.byId, e.toId])].filter((x): x is string => !!x)));
  const names = new Map((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const teachers = d.sources.includes("faculty") ? (await loader.faculty()).map((f) => ({ id: f.id, name: f.name, verified: f.verified, changed: f.changedSinceCheck, highest: f.highest })) : null;
  const data = parseData(t);
  const day = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "—");
  const grantLinks = body === "NBEAC" && working && cycle.departmentId ? [
    ...(d.sarKinds || []).map((k) => KINDS.find((x) => x.kind === k)).filter((x): x is (typeof KINDS)[number] => !!x).map((k) => ({ href: `/accreditation/${k.area}?dept=${cycle.departmentId}`, label: k.label })),
    ...(d.sarSections || []).map((k) => SECTIONS.find((x) => x.key === k)).filter((x): x is (typeof SECTIONS)[number] => !!x).map((k) => ({ href: `/accreditation/${k.area}?dept=${cycle.departmentId}`, label: k.label })),
  ] : [];

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>{d.code} {d.title}</h1>
          <p style={{ color: "var(--slate)", fontSize: 13, margin: 0 }}>{cycle.program} · {BODIES[body].name} · {BODIES[body].groupLabel} {d.group}: {groupOf(body, d.group)?.title}</p>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(managing || (s && inScope(s, cycle))) && <Link href={`/accreditation/readiness/${cycle.id}`} className="btn btn-secondary btn-sm">The visit</Link>}
          <Link href="/accreditation/tasks" className="btn btn-secondary btn-sm">My tasks</Link>
        </div>
      </div>

      <div className="card">
        <p style={{ fontSize: 13.5, margin: "0 0 10px" }}>{d.purpose}</p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, alignItems: "center" }}>
          <span><StatusChip status={t.status} /></span>
          <span>Progress <b style={{ color: heat(progress) }}>{progress}%</b></span>
          <span>Held by <b>{t.assigneeId ? names.get(t.assigneeId) || "—" : "nobody yet"}</b></span>
          <span>Due {day(t.dueDate)}</span>
          {t.assigneeId && <span>Access until {day(t.accessUntil)}{t.accessUntil && t.accessUntil < new Date() ? " (ended)" : ""}</span>}
          {managing && <AssignControl taskId={t.id} assigneeId={t.assigneeId} status={t.status} canManage={cycle.status === "OPEN"} people={people.map((p) => ({ id: p.id, name: p.name, label: p.label, suggested: p.roles.some((r) => d.suggested.includes(r)) }))} />}
        </div>
        <details style={{ marginTop: 10, fontSize: 13 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, color: "#1F4E8C" }}>How is this {progress}% worked out?</summary>
          <table style={{ fontSize: 12.5, marginTop: 6 }}><tbody>
            <tr><td>Data in the system{dataPct === null ? " (no automatic checks for this task — the confirmations below count instead)" : ""}</td><td style={{ textAlign: "right" }}><b>{dataPts}</b> of 70</td></tr>
            <tr><td>Signed off by the person working on it</td><td style={{ textAlign: "right" }}><b>{t.status === "SUBMITTED" || t.status === "APPROVED" ? 15 : 0}</b> of 15</td></tr>
            <tr><td>Approved by the Institute Head, Dean or Chairman</td><td style={{ textAlign: "right" }}><b>{t.status === "APPROVED" ? 15 : 0}</b> of 15</td></tr>
          </tbody></table>
          {t.status === "APPROVED" && <p className="small-note" style={{ margin: "4px 0" }}>An approved task counts as 100%: the approver has confirmed it is complete.</p>}
          {dataPct !== null ? (
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {checks.map((c) => <li key={c.label} style={{ color: c.done >= c.total ? "#1E7B45" : "#C62828" }}>{c.label}: {c.done} of {c.total}{c.done < c.total && c.href ? <> — <Link href={c.href} style={{ color: "inherit", fontWeight: 600 }}>{c.hint || "fix it"}</Link></> : " ✓"}</li>)}
            </ul>
          ) : <p className="small-note" style={{ margin: "4px 0 0" }}>Confirmations ticked: {tickedNow} of {d.checklist.length}.</p>}
        </details>
        {t.status === "RETURNED" && t.reviewNote && <div className="err" style={{ marginTop: 10 }}>Returned: {t.reviewNote}</div>}
        {t.assigneeId === user.id && !working && t.status !== "APPROVED" && t.status !== "SUBMITTED" && <div className="err" style={{ marginTop: 10 }}>Your access to this task has ended. Ask your Chairman or Dean to extend it.</div>}
        <div className="small-note" style={{ marginTop: 10 }}>Where the data is kept: {d.pages.map((p, i) => <span key={p.href}>{i ? " · " : ""}<Link href={p.href}>{p.label}</Link></span>)}</div>
        {grantLinks.length > 0 && <div className="small-note" style={{ marginTop: 4 }}>While this task is yours you may also keep: {grantLinks.map((g, i) => <span key={g.label}>{i ? " · " : ""}<Link href={g.href}>{g.label}</Link></span>)}</div>}
      </div>

      <h2 style={{ fontSize: 16, margin: "6px 0 10px" }}>What the system holds — filled in for you</h2>
      {results.map((r) => (
        <div key={r.key + r.title} className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ fontSize: 14.5, margin: "0 0 6px" }}>{r.title}</h3>
          {r.note && <p className="small-note" style={{ margin: "0 0 8px" }}>{r.note}</p>}
          {r.rows.length > 0 && (
            <table style={{ fontSize: 12.5, marginBottom: r.checks.length ? 10 : 0 }}>
              <thead><tr>{r.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{r.rows.slice(0, 200).map((row, i) => <tr key={i}>{row.map((c, j) => <td key={j}>{String(c)}</td>)}</tr>)}</tbody>
            </table>
          )}
          {r.rows.length === 0 && !r.checks.length && <p className="small-note" style={{ margin: 0 }}>Nothing recorded yet.</p>}
          {r.checks.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              {r.checks.map((c) => <li key={c.label} style={{ color: c.done >= c.total ? "var(--sage)" : "#B3261E" }}>{c.label}: {c.done} of {c.total}{c.done < c.total && c.href ? <> — <Link href={c.href} style={{ color: "inherit" }}>{c.hint}</Link></> : ""}</li>)}
            </ul>
          )}
        </div>
      ))}

      <TaskForm taskId={t.id} status={t.status} checklist={d.checklist} fields={d.fields || []} initial={{ checked: data.checked || {}, fields: data.fields || {} }}
        canEdit={working} canSubmit={working} managing={managing && cycle.status === "OPEN"} teachers={working || managing ? teachers : null}
        files={files.map((f) => ({ id: f.id, title: f.title, fileName: f.fileName, size: f.size, by: names.get(f.uploadedById) || "—", mine: f.uploadedById === user.id }))} />

      {events.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h3 style={{ fontSize: 14.5, margin: "0 0 6px" }}>History</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>
            {events.map((e) => <li key={e.id}>{e.createdAt.toISOString().slice(0, 16).replace("T", " ")} — {names.get(e.byId) || "—"} {ACTION[e.action] || e.action.toLowerCase()}{e.toId ? ` ${names.get(e.toId) || ""}` : ""}{e.note ? `: ${e.note}` : ""}</li>)}
          </ul>
        </div>
      )}
    </Shell>
  );
}
