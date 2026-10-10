import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import { navForRole } from "../../components/reportNav";
import Shell from "../../components/Shell";
import RequestActions from "../../components/RequestActions";
import { ROLE_TEXT } from "../../lib/institutePeople";
import { requestInboxIds } from "../../lib/requests";

type Row = { id: string; fromId: string; toId: string; subject: string; area: string | null; href: string | null; body: string; dueDate: Date | null; status: string; response: string | null; respondedAt: Date | null; doneAt: Date | null; remindedAt: Date | null; reminders: number; createdAt: Date };
const day = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const STATUS: Record<string, { text: string; colour: string }> = { OPEN: { text: "Waiting", colour: "#B7791F" }, RESPONDED: { text: "Replied", colour: "#1B6CA8" }, DONE: { text: "Done", colour: "#2E7D4F" }, CLOSED: { text: "Closed", colour: "#6B7177" } };

export default async function RequestsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  const inbox = await requestInboxIds(user);
  const shared = inbox.length > 1;
  const rows = (await prisma.taskRequest.findMany({ where: { OR: [{ toId: { in: inbox } }, { fromId: user.id }] }, orderBy: { createdAt: "desc" }, take: 200 })) as unknown as Row[];
  const ids = Array.from(new Set(rows.flatMap((r) => [r.fromId, r.toId])));
  const people = (await prisma.user.findMany({ where: { id: { in: ids.length ? ids : ["none"] } }, select: { id: true, name: true, role: true } })) as unknown as { id: string; name: string; role: string }[];
  const who = new Map(people.map((p) => [p.id, `${p.name} (${ROLE_TEXT[p.role] || p.role})`]));
  const toMe = rows.filter((r) => inbox.includes(r.toId));
  const byMe = rows.filter((r) => r.fromId === user.id);
  const now = new Date();

  const card = (r: Row, mode: "to" | "from") => {
    const s = STATUS[r.status] || STATUS.OPEN;
    const late = r.dueDate && r.status === "OPEN" && r.dueDate.getTime() + 86400000 < now.getTime();
    return (
      <div key={r.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
          <b>{r.subject}</b>
          <span><span style={{ background: s.colour, color: "#fff", borderRadius: 5, padding: "2px 7px", fontSize: 11.5 }}>{s.text}</span>{late && <span style={{ color: "#B3261E", fontSize: 12, marginLeft: 6 }}>overdue</span>}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--slate)" }}>
          {mode === "to" ? `From ${who.get(r.fromId) || "—"}${r.toId !== user.id ? ` · sent to ${who.get(r.toId) || "an OMC member"}` : ""}` : `To ${who.get(r.toId) || "—"}`} · sent {day(r.createdAt)}{r.dueDate ? ` · needed by ${day(r.dueDate)}` : ""}{r.reminders ? ` · reminded ${r.reminders} time${r.reminders > 1 ? "s" : ""}` : ""}{r.area ? ` · ${r.area}` : ""}
        </div>
        <div style={{ fontSize: 13, margin: "6px 0", whiteSpace: "pre-wrap" }}>{r.body}</div>
        {r.href && mode === "to" && r.status !== "DONE" && r.status !== "CLOSED" && <a className="btn" href={r.href} style={{ fontSize: 12 }}>Open the page to do it</a>}
        {r.response && <div style={{ background: "#F4F1EA", padding: "6px 10px", fontSize: 13, marginTop: 6 }}><b>Reply{r.respondedAt ? ` (${day(r.respondedAt)})` : ""}:</b> {r.response}</div>}
        <RequestActions id={r.id} mode={mode} status={r.status} />
      </div>
    );
  };

  return (
    <Shell roleLabel={ROLE_TEXT[user.role] || "Requests"} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Requests</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        Requests to finish something, sent from the accreditation report. Reply, or mark it done once the work is finished. The person who asked sees your answer here.
      </p>
      <div className="card" style={{ marginBottom: 14 }}>
        <h3 style={{ marginTop: 0 }}>{shared ? "Asked of the OMC" : "Asked of me"}</h3>
        {shared && <p style={{ fontSize: 12, color: "var(--slate)", marginTop: -4 }}>Every OMC member sees requests sent to any OMC member, and any of you can reply or mark one done.</p>}
        {toMe.length === 0 ? <p style={{ color: "var(--slate)", margin: 0 }}>{shared ? "Nothing has been asked of the OMC." : "Nothing has been asked of you."}</p> : toMe.map((r) => card(r, "to"))}
      </div>
      {byMe.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Asked by me</h3>
          {byMe.map((r) => card(r, "from"))}
        </div>
      )}
    </Shell>
  );
}
