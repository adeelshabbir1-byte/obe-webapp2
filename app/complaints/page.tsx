import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { ActionForm } from "../../components/fyp/FypClient";
import { cmdb, CATEGORIES, HANDLERS, STATUS, type Complaint } from "../../lib/complaints";

export const dynamic = "force-dynamic";

// Complaint register: everyone can lodge; Student Affairs and heads assign, act and close, with closure times for the SAR.
export default async function ComplaintsPage({ searchParams }: { searchParams: { status?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const cid = await chairmanIdFor(user);
  const handler = HANDLERS.includes(user.role);
  const shell = (c: React.ReactNode) => <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}><h1 style={{ fontSize: 22, marginBottom: 4 }}>Complaints &amp; Grievances</h1>{c}</Shell>;
  const all = ((await cmdb.complaint.findMany({ where: handler ? { chairmanId: cid } : { byUserId: user.id }, orderBy: { createdAt: "desc" }, take: 1000 }).catch(() => null)) as Complaint[] | null);
  if (all === null) return shell(<div className="err">Run prisma/migration_visit_extras.sql first.</div>);
  const list = searchParams.status ? all.filter((c) => c.status === searchParams.status) : all;
  const closed = all.filter((c) => c.closedAt);
  const avgDays = closed.length ? Math.round((10 * closed.reduce((s, c) => s + (c.closedAt!.getTime() - c.createdAt.getTime()) / 86400000, 0)) / closed.length) / 10 : null;
  const studs = new Map((await prisma.student.findMany({ where: { id: { in: all.map((c) => c.byStudentId).filter((x): x is string => !!x) } }, select: { id: true, name: true, rollNumber: true } })).map((s) => [s.id, `${s.rollNumber} ${s.name}`]));
  const staff = handler ? await prisma.user.findMany({ where: { isActive: true, OR: [{ id: cid }, { managedById: cid }, { managedBy: { managedById: cid } }] }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const names = new Map(staff.map((s) => [s.id, s.name]));
  return shell(<>
    {handler && <p className="small-note">{all.length} complaints · {all.filter((c) => c.status === "OPEN" || c.status === "IN_PROGRESS").length} open · average time to close {avgDays ?? "—"} days. By category: {CATEGORIES.map((k) => [k, all.filter((c) => c.category === k).length] as const).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(" · ")}</p>}
    <div className="card"><ActionForm url="/api/complaints" fixed={{ action: "lodge" }} submit="Send" collapsed openLabel="Lodge a complaint" initial={{ category: CATEGORIES[0], anonymous: false }} fields={[{ name: "category", label: "Category", type: "select", options: CATEGORIES.map((c) => [c, c] as [string, string]) }, { name: "subject", label: "Subject", width: 300 }, { name: "details", label: "Details", type: "textarea" }, { name: "anonymous", label: "Keep my name hidden", type: "checkbox" }]} /></div>
    {handler && <div style={{ display: "flex", gap: 6, marginBottom: 6 }}><Link href="/complaints" className="act">All</Link>{Object.entries(STATUS).map(([k, v]) => <Link key={k} href={`/complaints?status=${k}`} className="act" style={{ fontWeight: searchParams.status === k ? 700 : 400 }}>{v} {all.filter((c) => c.status === k).length}</Link>)}</div>}
    {list.map((c) => (
      <div key={c.id} className="card" style={{ fontSize: 13.5 }}>
        <div><b>{c.subject}</b> <span className="small-note">{c.category} · {c.createdAt.toISOString().slice(0, 10)} · {STATUS[c.status]}{c.assignedToId ? ` · with ${names.get(c.assignedToId) || "staff"}` : ""} · by {c.anonymous ? "anonymous" : c.byStudentId ? studs.get(c.byStudentId) : names.get(c.byUserId || "") || "staff"}</span></div>
        <div style={{ whiteSpace: "pre-wrap" }}>{c.details}</div>{c.resolution && <div><i>Action / response:</i> {c.resolution}</div>}
        {handler && <ActionForm url="/api/complaints" fixed={{ action: "update", id: c.id }} submit="Save" collapsed openLabel="Act on it" initial={{ status: c.status, assignedToId: c.assignedToId || "", resolution: c.resolution || "" }} fields={[{ name: "status", label: "Status", type: "select", options: Object.entries(STATUS) as [string, string][] }, { name: "assignedToId", label: "Assign to", type: "select", options: [["", "—"], ...staff.map((s) => [s.id, s.name] as [string, string])] }, { name: "resolution", label: "Action taken / response", type: "textarea" }]} />}
      </div>))}
    {!list.length && <p className="small-note">No complaints.</p>}
  </>);
}
