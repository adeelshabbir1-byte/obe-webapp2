import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import { planProgress } from "../../lib/deadlines";
import { OVERVIEW_ROLES } from "../../lib/readinessScope";

const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const box = { background: "var(--card)", border: "1px solid var(--line)", padding: "14px 16px" } as const;

function Tile({ n, label, href, bad }: { n: number; label: string; href: string; bad?: boolean }) {
  return (
    <Link href={href} style={{ ...box, textDecoration: "none", color: "inherit", display: "block", borderLeft: `4px solid ${n === 0 ? "#2E7D4F" : bad ? "#B3261E" : "#B7791F"}` }}>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{n}</div><div style={{ fontSize: 13 }}>{label}</div>
    </Link>
  );
}

export default async function HomePage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (!OVERVIEW_ROLES.includes(user.role)) redirect("/dashboard");
  const chairmanId = user.role === "CHAIRMAN" ? user.id : user.managedById || "none";
  const now = new Date();
  const [lines, openAsked, answered, splitWaiting, overdue, staleLib, lastChanges] = await Promise.all([
    planProgress(user),
    prisma.taskRequest.count({ where: { toId: user.id, status: "OPEN" } }),
    prisma.taskRequest.count({ where: { fromId: user.id, status: { in: ["RESPONDED", "DONE"] } } }),
    prisma.courseOwner.count({ where: { chairmanId, status: "PENDING" } as never }),
    prisma.deadline.findMany({ where: { assigneeId: user.id, completedAt: null, dueDate: { lt: now }, allCourses: false } as never, select: { id: true, title: true, dueDate: true }, orderBy: { dueDate: "asc" }, take: 10 }),
    prisma.libraryInfo.findUnique({ where: { chairmanId }, select: { updatedAt: true } }),
    prisma.changeLog.findMany({ where: { chairmanId } as never, orderBy: { createdAt: "desc" }, take: 5 }),
  ]) as unknown as [Awaited<ReturnType<typeof planProgress>>, number, number, number, { id: string; title: string; dueDate: Date }[], { updatedAt: Date } | null, { id: string; area: string; summary: string; createdAt: Date }[]];
  const behind = lines.filter((l) => l.state === "BEHIND").sort((a, b) => b.behind - a.behind);
  const risk = lines.filter((l) => l.state === "AT_RISK");
  const staleDays = staleLib ? Math.floor((now.getTime() - staleLib.updatedAt.getTime()) / 86400000) : null;
  return (
    <Shell roleLabel="Home" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Needs your attention</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>What is late, waiting for you, or waiting on others, as of today. Green means nothing to do.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10, marginBottom: 18 }}>
        <Tile n={behind.length} label="plan tasks behind" href="/semester-plan" bad />
        <Tile n={risk.length} label="plan tasks at risk" href="/semester-plan" />
        <Tile n={overdue.length} label="of your own tasks overdue" href="/deadlines" bad />
        <Tile n={openAsked} label="requests waiting for you" href="/requests" />
        <Tile n={answered} label="replies to read" href="/requests" />
        <Tile n={splitWaiting} label="course requests to accept" href="/course-split" />
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>Most behind</h3>
        {behind.length === 0 ? <p style={{ margin: 0, color: "var(--slate)" }}>Nothing is behind the plan.</p> : (
          <table><thead><tr><th>Task</th><th>Role</th><th>Was due</th><th>Not done</th></tr></thead>
            <tbody>{behind.slice(0, 8).map((l) => <tr key={l.id}><td><b>{l.title}</b></td><td>{l.role || ""}</td><td>{day(l.dueDate)}</td><td style={{ color: "#B3261E" }}>{l.behind} of {l.total}</td></tr>)}</tbody></table>
        )}
        <p style={{ marginBottom: 0, fontSize: 12.5 }}><Link href="/semester-plan">Open the full semester plan and send reminders →</Link></p>
      </div>
      {overdue.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <h3 style={{ marginTop: 0 }}>Your overdue tasks</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{overdue.map((o) => <li key={o.id}>{o.title}, due {day(o.dueDate)}</li>)}</ul>
        </div>
      )}
      {user.role === "CHAIRMAN" && staleDays !== null && staleDays > 120 && (
        <div className="card" style={{ marginBottom: 14, borderLeft: "4px solid #B7791F" }}>The library record was last updated {staleDays} days ago. <Link href="/resources">Check Resources</Link></div>
      )}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Latest changes to shared figures</h3>
        {lastChanges.length === 0 ? <p style={{ margin: 0, color: "var(--slate)", fontSize: 13 }}>Nothing recorded yet.</p> : <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{lastChanges.map((c) => <li key={c.id}><b>{c.area}</b>: {c.summary} <span style={{ color: "var(--slate)" }}>({day(c.createdAt)})</span></li>)}</ul>}
        <p style={{ marginBottom: 0, fontSize: 12.5 }}><Link href="/yearly-summary">Yearly summary →</Link></p>
      </div>
    </Shell>
  );
}
