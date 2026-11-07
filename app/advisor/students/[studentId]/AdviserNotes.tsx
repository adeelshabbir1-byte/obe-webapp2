import { prisma } from "../../../../lib/db";
import { adviserNotes, MON_HINT } from "../../../../lib/workMonitor";
import { AdviserNoteForm } from "../../../../components/MonitoringForms";

// Queue item 20: the adviser's meeting notes for a student, and the semester plan approved term by term.
export default async function AdviserNotes({ studentId }: { studentId: string }) {
  const notes = await adviserNotes(studentId);
  if (!notes) return <div className="card small-note">{MON_HINT}</div>;
  const names = new Map((await prisma.user.findMany({ where: { id: { in: notes.map((n) => n.adviserId).concat("none") } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return <div className="card"><h3 style={{ marginTop: 0 }}>Adviser notes</h3><AdviserNoteForm studentId={studentId} />
    <ul style={{ fontSize: 12.5, margin: "8px 0 0 18px" }}>{notes.map((n) => <li key={n.id}>{n.at.toISOString().slice(0, 10)} · {names.get(n.adviserId)}{n.planTerm ? ` · plan ${n.planTerm}${n.planApproved ? " ✓ approved" : ""}` : ""}: {n.text}</li>)}</ul></div>;
}
