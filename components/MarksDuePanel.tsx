import Link from "next/link";
import { prisma } from "../lib/db";
import { marksBoard, warningsOf } from "../lib/itemWarnings";

// The teacher's home: marks due or overdue (marks within one week) and early warnings waiting for a CQI action.
export default async function MarksDuePanel({ userId }: { userId: string }) {
  const courses = await prisma.course.findMany({ where: { OR: [{ instructorId: userId }, { labEngineerId: userId }], isOffered: true }, select: { id: true, code: true } });
  const ids = courses.map((c) => c.id);
  const [board, warns] = await Promise.all([marksBoard(ids).catch(() => []), warningsOf(ids).catch(() => [])]);
  const due = board.filter((b) => b.stage === "REMIND" || b.stage === "OVERDUE" || b.stage === "ESCALATED");
  const open = warns.filter((w) => !w.respondedAt);
  if (!due.length && !open.length) return null;
  const code = new Map(courses.map((c) => [c.id, c.code]));
  return (
    <div className="card" style={{ borderColor: due.some((d) => d.stage !== "REMIND") ? "#B3261E" : "#E0B54A" }} data-testid="marks-due">
      {due.map((d) => <p key={d.instrumentId} style={{ margin: "2px 0", fontSize: 13, color: d.stage === "REMIND" ? "#8A5A00" : "#B3261E" }}>{d.stage === "REMIND" ? "⏰" : "🔴"} Marks {d.stage === "REMIND" ? `due by ${new Date(d.dueOn).toISOString().slice(0, 10)}` : `overdue (working day ${d.day})`}: <Link href={`/instructor/courses/${d.courseId}/marks`}>{d.label}</Link></p>)}
      {open.map((w) => <p key={w.id} style={{ margin: "2px 0", fontSize: 13 }}>{w.level === "RED" ? "🔴" : "🟠"} Early warning in {code.get(w.courseId)}{w.topic ? ` — ${w.topic}` : ""}: {Math.round(w.belowPct)}% below the pass mark. <Link href={`/courses/${w.courseId}/clo-attainment#warnings`}>Choose a CQI action</Link></p>)}
    </div>
  );
}
