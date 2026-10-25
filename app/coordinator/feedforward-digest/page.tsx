import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";


export default async function FeedForwardDigestPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.role !== "PROGRAM_COORDINATOR") redirect("/dashboard");

  const notes = await prisma.feedForwardNote.findMany({
    where: { course: { coordinatorId: user.id } },
    include: { course: { include: { batch: true } } },
    orderBy: { createdAt: "desc" },
  });

  const acks = ((await (prisma as unknown as Record<string, any>).feedForwardAck.findMany({ where: { noteId: { in: notes.map((n) => n.id).concat("none") } } }).catch(() => [])) as { id: string; noteId: string; userId: string; checkpoint: string; status: string; comment: string | null }[]);
  const who = new Map((await prisma.user.findMany({ where: { id: { in: acks.map((a) => a.userId).concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <Shell roleLabel="Program Lead" userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Feed-Forward Notes Digest</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 20 }}>
        Every note instructors have left for whoever teaches a course next — a rolled-up "lessons learned" view.
      </p>
      <div className="card">
        {notes.length === 0 && <p style={{ color: "var(--slate)", fontSize: 12.5 }}>No feed-forward notes yet.</p>}
        {notes.map((n) => (
          <div key={n.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid var(--line)" }}>
            <div style={{ fontSize: 11.5, color: "var(--slate)", marginBottom: 3 }}>
              {n.course.code} — {n.course.title} ({n.course.batch ? `${n.course.batch.degreeProgram} — ${n.course.batch.batchName}` : "—"}) · {n.createdAt.toISOString().slice(0, 10)}
            </div>
            <div style={{ fontSize: 13 }}>{n.body}</div>
            {(acks.filter((a) => a.noteId === n.id)).length > 0 && <div style={{ fontSize: 11.5, marginTop: 3 }}>{acks.filter((a) => a.noteId === n.id).map((a) => <div key={a.id}>✓ {who.get(a.userId) || ""} — {a.checkpoint.toLowerCase()} · {a.status.toLowerCase().replace("_", " ")}{a.comment ? `: ${a.comment}` : ""}</div>)}</div>}
          </div>
        ))}
      </div>
    </Shell>
  );
}
