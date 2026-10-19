import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../../lib/session";
import { navForRole } from "../../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../../lib/reportScope";
import { prisma } from "../../../../lib/db";
import Shell from "../../../../components/Shell";
import { govScope, inScope, assignablePeople } from "../../../../lib/accreditation/governance";
import { itemsOf, findingsOf, STATUSES, CATEGORIES, VISIT_HINT } from "../../../../lib/visitDay";
import { ActionForm, ActionButton } from "../../../../components/fyp/FypClient";
import { ItemStatus, ItemOwner, LiveRefresh } from "../../../../components/VisitDayControls";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visit day" };
const COLOR: Record<string, string> = { PENDING: "var(--slate)", IN_PROGRESS: "#1d6fb8", DONE: "#2E7D4F", DELAYED: "#B3261E", SKIPPED: "#888" };

export default async function VisitDayPage({ params }: { params: { cycleId: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const c = await prisma.accreditationCycle.findUnique({ where: { id: params.cycleId } }).catch(() => null);
  if (!c || (await chairmanIdFor(user)) !== c.chairmanId) notFound();
  const s = await govScope(user);
  const manage = !!s && inScope(s, c) && (s.canManage || c.leadId === user.id);
  const [items, findings] = await Promise.all([itemsOf(c.id), findingsOf(c.id)]);
  const people = manage && s ? (await assignablePeople(s)).map((p) => [p.id, p.name] as [string, string]).sort((a, b) => a[1].localeCompare(b[1])) : [];
  const ids = Array.from(new Set([...(items || []).map((i) => i.ownerId), ...findings.map((f) => f.ownerId)].filter((x): x is string => !!x)));
  const names = new Map((ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  const plan = (items || []).filter((i) => i.kind === "PLAN").sort((a, b) => (a.startTime || "").localeCompare(b.startTime || "") || a.orderNo - b.orderNo);
  const checks = (items || []).filter((i) => i.kind === "CHECK");
  const opts = Object.entries(STATUSES) as [string, string][];
  const nowHM = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });
  const isToday = c.visitDate && c.visitDate.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10);
  const pct = (xs: { status: string }[]) => (xs.length ? Math.round((100 * xs.filter((x) => x.status === "DONE").length) / xs.length) : 0);
  const url = "/api/accreditation/visit-day";

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <p className="small-note" style={{ margin: 0 }}><Link href={`/accreditation/readiness/${c.id}`}>← {c.title}</Link></p>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
        <h1 style={{ fontSize: 22, margin: "4px 0" }}>Visit day — {c.program} ({c.body})</h1>
        <LiveRefresh />
      </div>
      <p style={{ color: "var(--slate)", fontSize: 13, marginTop: 0 }}>
        {c.visitDate ? `Visit on ${c.visitDate.toDateString()}. ` : "Set the visit date on the cycle page. "}
        Whoever is in charge updates each step as it happens; every faculty member is notified. Plan {pct(plan)}% done · arrangements {pct(checks)}% done ·
        mock-visit tasks {findings.filter((f) => f.status === "DONE").length}/{findings.length} closed.
      </p>
      {items === null && <div className="err">{VISIT_HINT}</div>}
      {items !== null && manage && items.length === 0 && (
        <div className="card"><p style={{ marginTop: 0 }}>Start from the standard plan (reception to exit meeting) and the arrangements checklist, then edit.</p>
          <ActionButton url={url} body={{ cycleId: c.id, action: "seed" }} label="Load the standard plan and checklist" /></div>
      )}

      {items !== null && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Hour-by-hour plan</h3>
          <table style={{ fontSize: 12.5 }}>
            <thead><tr><th>Time</th><th>What</th><th>Where</th><th>In charge</th><th>Status</th><th>Note</th>{manage && <th></th>}</tr></thead>
            <tbody>{plan.map((i) => {
              const now = isToday && (i.startTime || "") <= nowHM && nowHM < (i.endTime || "99");
              return (
                <tr key={i.id} style={{ background: now ? "rgba(29,111,184,.08)" : undefined }}>
                  <td style={{ whiteSpace: "nowrap" }}>{i.startTime}{i.endTime ? `–${i.endTime}` : ""}{now ? <b style={{ color: "#1d6fb8" }}> now</b> : null}</td>
                  <td><b>{i.title}</b></td>
                  <td className="small-note">{i.place || "—"}</td>
                  <td>{manage ? <ItemOwner cycleId={c.id} id={i.id} ownerId={i.ownerId} people={people} /> : names.get(i.ownerId || "") || "—"}</td>
                  <td>{manage || i.ownerId === user.id ? <ItemStatus cycleId={c.id} id={i.id} status={i.status} options={opts} /> : <b style={{ color: COLOR[i.status] }}>{STATUSES[i.status]}</b>}</td>
                  <td className="small-note">{i.note || ""}</td>
                  {manage && <td><ActionButton url={url} body={{ cycleId: c.id, action: "delete", id: i.id }} label="Remove" className="btn btn-ghost btn-sm" confirmText="Remove this step?" /></td>}
                </tr>
              );
            })}</tbody>
          </table>
          {manage && <div style={{ marginTop: 8 }}><ActionForm url={url} fixed={{ cycleId: c.id, action: "add", kind: "PLAN" }} collapsed openLabel="+ Add a step" submit="Add" fields={[{ name: "startTime", label: "From", placeholder: "09:00", width: 80 }, { name: "endTime", label: "To", placeholder: "09:30", width: 80 }, { name: "title", label: "What", width: 260 }, { name: "place", label: "Where", width: 160 }]} /></div>}
        </div>
      )}

      {items !== null && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Arrangements checklist</h3>
          {Object.entries(CATEGORIES).map(([k, label]) => {
            const xs = checks.filter((i) => (i.category || "OTHER") === k);
            if (!xs.length) return null;
            return (
              <div key={k} style={{ marginBottom: 10 }}>
                <b style={{ fontSize: 13 }}>{label}</b> <span className="small-note">{xs.filter((x) => x.status === "DONE").length}/{xs.length}</span>
                <table style={{ fontSize: 12.5, marginTop: 4 }}><tbody>{xs.map((i) => (
                  <tr key={i.id}>
                    <td style={{ width: "45%" }}>{i.status === "DONE" ? "✓ " : ""}{i.title}</td>
                    <td>{manage ? <ItemOwner cycleId={c.id} id={i.id} ownerId={i.ownerId} people={people} /> : names.get(i.ownerId || "") || "—"}</td>
                    <td>{manage || i.ownerId === user.id ? <ItemStatus cycleId={c.id} id={i.id} status={i.status} options={opts} /> : <b style={{ color: COLOR[i.status] }}>{STATUSES[i.status]}</b>}</td>
                    <td className="small-note">{i.note || ""}</td>
                  </tr>
                ))}</tbody></table>
              </div>
            );
          })}
          {manage && <ActionForm url={url} fixed={{ cycleId: c.id, action: "add", kind: "CHECK" }} collapsed openLabel="+ Add an arrangement" submit="Add" fields={[{ name: "category", label: "Area", type: "select", options: Object.entries(CATEGORIES) as [string, string][] }, { name: "title", label: "What to check", width: 320 }]} />}
        </div>
      )}

      {items !== null && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>Mock visit — findings and tasks</h3>
          <p className="small-note" style={{ marginTop: 0 }}>Hold a mock visit a few weeks before. Each recommendation becomes a task for its owner, who is notified and closes it here.</p>
          {findings.length > 0 && (
            <table style={{ fontSize: 12.5 }}>
              <thead><tr><th>Area</th><th>Finding</th><th>Recommendation (task)</th><th>Owner · due</th><th>Status</th></tr></thead>
              <tbody>{findings.map((f) => {
                const late = f.status !== "DONE" && f.dueDate && f.dueDate < new Date();
                return (
                  <tr key={f.id}>
                    <td><b>{f.area}</b><div className="small-note">{f.severity}</div></td>
                    <td>{f.finding}</td>
                    <td>{f.recommendation}</td>
                    <td className="small-note" style={{ color: late ? "#B3261E" : undefined }}>{names.get(f.ownerId || "") || "—"}{f.dueDate ? ` · ${f.dueDate.toISOString().slice(0, 10)}` : ""}{late ? " (late)" : ""}</td>
                    <td>{f.status === "DONE" ? <span style={{ color: "#2E7D4F" }}>Done{f.doneNote ? ` — ${f.doneNote}` : ""}</span> : (manage || f.ownerId === user.id) ? <ActionButton url={url} body={{ cycleId: c.id, action: "close", id: f.id }} label="Mark done" askNote="What was done?" /> : "Open"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          )}
          {manage && <div style={{ marginTop: 8 }}><ActionForm url={url} fixed={{ cycleId: c.id, action: "finding" }} collapsed openLabel="+ Add a finding" submit="Add finding" fields={[
            { name: "area", label: "Area / criterion", width: 160 }, { name: "severity", label: "Severity", type: "select", options: [["HIGH", "High"], ["MEDIUM", "Medium"], ["LOW", "Low"]] },
            { name: "ownerId", label: "Owner", type: "select", options: [["", "—"], ...people] }, { name: "dueDate", label: "Due", type: "date" },
            { name: "finding", label: "Finding", type: "textarea", full: true }, { name: "recommendation", label: "Recommendation (the task)", type: "textarea", full: true },
          ]} /></div>}
        </div>
      )}
    </Shell>
  );
}
