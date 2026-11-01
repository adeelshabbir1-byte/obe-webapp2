import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import Tabs from "../../../components/Tabs";
import { navForRole } from "../../../components/reportNav";
import { chairmanIdFor, roleLabel } from "../../../lib/reportScope";
import { completeness, getPlan, rowsOf, scoreOf, yearLabelNow, type Plan } from "../../../lib/yearPlan";
import { loadMatrix } from "../../../lib/assignerMatrix";
import { getFlag } from "../../../lib/scopedSettings";
import { Act, RowEdit } from "../AllocForms";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;

// The one-year allocation plan (Adeel prompt §25.1, 11): Fall + Spring + tentative Summer, Draft A / B with scores,
// submit (blocked while a Fall / Spring section is open), HOD approval, changes after approval with a reason.
export default async function YearPlanPage({ searchParams }: { searchParams: { draft?: string; term?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const assigner = ["COURSE_ASSIGNER", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN"].includes(user.role);
  if (!assigner) redirect("/allocation/year-card");
  const cid = await chairmanIdFor(user as never);
  const draft = searchParams.draft === "B" ? "B" : "A";
  const [a, b] = await Promise.all([getPlan(user as never, cid, "A"), getPlan(user as never, cid, "B")]);
  const plan = draft === "B" ? b : a;
  const waiting = ((await db.allocationPlan?.findMany({ where: { chairmanId: cid, status: "SUBMITTED" } }).catch(() => [])) || []) as Plan[];
  const swaps = ((await db.allocSwap?.findMany({ where: { status: "AGREED", planId: { in: [a?.id, b?.id].filter(Boolean).concat("none") as string[] } } }).catch(() => [])) || []) as { id: string; aRow: string; bRow: string; aId: string; bId: string }[];
  const m = await loadMatrix(user as never).catch(() => null) as unknown as { instructors?: { id: string; name: string; isVisiting?: boolean }[] } | null;
  const pool = (m?.instructors || []).filter((i) => !i.isVisiting).map((i) => ({ id: i.id, name: i.name }));
  const rows = plan ? rowsOf(plan) : [];
  const comp = completeness(rows);
  const terms = Array.from(new Set(rows.map((r) => r.term)));
  const term = searchParams.term && terms.includes(searchParams.term) ? searchParams.term : terms[0];
  const [sa, sb] = await Promise.all([a ? scoreOf(rowsOf(a)) : null, b ? scoreOf(rowsOf(b)) : null]);
  const concerns = plan ? await Promise.all(Array.from(new Set(rows.flatMap((r) => r.teachers.map((t) => t.id)))).map(async (id) => ({ id, text: await getFlag(id, `alloc:concern:${plan.id}`), ack: await getFlag(id, `alloc:ack:${plan.id}`) }))) : [];
  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>Year allocation plan {yearLabelNow()}</h1>
      <p className="small-note">Fall and Spring must be complete (a teacher or “Visiting needed” for every section) before you submit; Summer is tentative. The HOD approves the whole year. <Link href="/allocation/board">Preferences board →</Link> · <Link href="/assigner/matrix">This term&apos;s matrix →</Link></p>
      {waiting.length > 0 && ["HEAD_OF_DEPARTMENT", "CHAIRMAN"].includes(user.role) && <div className="card" style={{ marginBottom: 10 }}><b>Waiting for your approval</b><ul style={{ fontSize: 13 }}>{waiting.map((w) => <li key={w.id}>{w.yearLabel} · draft {w.draft} · {w.scopeKey} <Act body={{ action: "decide", planId: w.id, approve: true }} label="Approve" /> <Act body={{ action: "decide", planId: w.id, approve: false }} label="Return" /></li>)}</ul></div>}
      <div className="card" style={{ marginBottom: 10, fontSize: 13 }}>
        <b>Drafts:</b> <Link href="?draft=A">{draft === "A" ? <b>Draft A</b> : "Draft A"}</Link> {sa ? `(score ${sa.score} · preferences met ${sa.prefPct}% · balance ${sa.balance} · visiting ${sa.visiting}) · ${a?.status.toLowerCase()}` : "(not started)"} · <Link href="?draft=B">{draft === "B" ? <b>Draft B</b> : "Draft B"}</Link> {sb ? `(score ${sb.score} · preferences ${sb.prefPct}% · balance ${sb.balance} · visiting ${sb.visiting}) · ${b?.status.toLowerCase()}` : "(not started)"}
        <div style={{ marginTop: 6 }}>{(!plan || plan.status === "DRAFT") && <Act body={{ action: "start", draft }} label={plan ? "Restart from the forecast" : "Start from the forecast"} confirmText={plan ? "Replace this draft with a fresh forecast?" : undefined} />}
          {plan && plan.status === "DRAFT" && <> <Act body={{ action: "submit", draft }} label="Submit to the HOD" /> <Act body={{ action: "submit", draft, markVisiting: true }} label="Mark the rest Visiting needed and submit" confirmText="Every open Fall / Spring section becomes “Visiting needed”. Submit?" /></>}
          {plan?.status === "SUBMITTED" && <> Waiting for the HOD. <Act body={{ action: "withdraw", draft }} label="Withdraw" /></>}
          {plan?.status === "APPROVED" && <> ✓ Approved {plan.approvedAt ? new Date(plan.approvedAt).toLocaleDateString("en-GB") : ""} — changes need a reason; started terms are locked.</>}</div>
      </div>
      {comp.length > 0 && <div className="card" style={{ marginBottom: 10, fontSize: 13 }}>{comp.map((c) => <span key={c.term} style={{ marginRight: 14 }}>{c.term}{c.summer ? " (tentative)" : ""}: <b style={{ color: c.pct === 100 ? "#1B6B3A" : c.summer ? "#7A520C" : "#B3261E" }}>{c.pct}%</b> ({c.done}/{c.need})</span>)}</div>}
      {swaps.length > 0 && <div className="card" style={{ marginBottom: 10, fontSize: 13 }}><b>Swaps agreed by both teachers</b>{swaps.map((s) => <div key={s.id}>{pool.find((p) => p.id === s.aId)?.name} ⇄ {pool.find((p) => p.id === s.bId)?.name} <Act body={{ action: "swapApprove", id: s.id, approve: true }} label="Approve" /> <Act body={{ action: "swapApprove", id: s.id, approve: false }} label="Refuse" /></div>)}</div>}
      {concerns.some((c) => c.text) && <div className="card" style={{ marginBottom: 10, fontSize: 13 }}><b>Concerns raised</b>{concerns.filter((c) => c.text).map((c) => <div key={c.id}>{pool.find((p) => p.id === c.id)?.name}: {c.text}</div>)}</div>}
      {plan && <>
        <Tabs base={`/allocation/year-plan?draft=${draft}`} current={term || ""} tabs={terms.map((t) => ({ key: t, label: t, badge: (comp.find((c) => c.term === t)?.need || 0) - (comp.find((c) => c.term === t)?.done || 0) || null, warn: true }))} />
        <div className="card" style={{ overflowX: "auto" }}><table className="table" style={{ fontSize: 12.5, width: "100%" }}><thead><tr><th style={{ textAlign: "left" }}>Course</th><th>Batch</th><th>Sections</th><th style={{ textAlign: "left" }}>Teachers</th></tr></thead>
          <tbody>{rows.filter((r) => r.term === term).map((r) => <tr key={r.key}><td><b>{r.code}</b> {r.title}</td><td>{r.batch}</td><td style={{ textAlign: "center" }}>{r.sections}</td><td>{plan.status === "SUBMITTED" ? r.teachers.map((t) => `${t.name} ×${t.n}`).join(", ") + (r.visiting ? ` · Visiting ×${r.visiting}` : "") : <RowEdit draft={draft} rowKey={r.key} teachers={r.teachers} visiting={r.visiting} sections={r.sections} pool={pool} approved={plan.status === "APPROVED"} />}</td></tr>)}</tbody></table></div>
      </>}
    </Shell>
  );
}
