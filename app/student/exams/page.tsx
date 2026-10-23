import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { prisma } from "../../../lib/db";
import StudentShell from "../../../components/StudentShell";
import { xdb, parse, type ExamSessionRow, type ExamPaperRow } from "../../../lib/exams";
import { seatOrder } from "../../../lib/examPlanner";

export const dynamic = "force-dynamic";
const day = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function StudentExamsPage() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  if (student.mustChangePassword) redirect("/student/change-password");
  const batch = await prisma.batch.findUnique({ where: { id: student.batchId }, select: { coordinator: { select: { managedById: true } } } });
  const chairmanId = batch?.coordinator?.managedById || "none";
  const enrolled = await prisma.studentEnrollment.findMany({ where: { studentId: student.id, status: { not: "WITHDRAWN" } }, select: { courseId: true, course: { select: { code: true, title: true } } } });
  let sessions: ExamSessionRow[] = [], papers: ExamPaperRow[] = [];
  try {
    sessions = (await xdb.examSession.findMany({ where: { chairmanId, status: "PUBLISHED" }, orderBy: { startDate: "desc" } })) as ExamSessionRow[];
    if (sessions.length) papers = (await xdb.examPaper.findMany({ where: { sessionId: { in: sessions.map((s) => s.id) }, courseId: { in: enrolled.map((e) => e.courseId) } } })) as ExamPaperRow[];
  } catch { /* tables not created yet */ }
  // Seat numbers follow roll order in each room, so the room-mates' roll numbers are needed.
  const allPapersInSlots = papers.length ? ((await xdb.examPaper.findMany({ where: { sessionId: { in: Array.from(new Set(papers.map((p) => p.sessionId))) } } })) as ExamPaperRow[]) : [];
  const myRooms = papers.map((p) => ({ p, room: parse<{ roomId: string; studentIds: string[] }[]>(p.roomsJson, []).find((r) => r.studentIds.includes(student.id)) }));
  const mates = new Set<string>();
  const sameRoom = (p: ExamPaperRow, roomId: string) => allPapersInSlots.filter((x) => x.sessionId === p.sessionId && x.slot === p.slot && x.date && p.date && new Date(x.date).getTime() === new Date(p.date).getTime())
    .flatMap((x) => parse<{ roomId: string; studentIds: string[] }[]>(x.roomsJson, []).filter((r) => r.roomId === roomId).map((r) => ({ courseId: x.courseId, ids: r.studentIds })));
  for (const m of myRooms) if (m.room) for (const r of sameRoom(m.p, m.room.roomId)) r.ids.forEach((i) => mates.add(i));
  const rolls = new Map((mates.size ? await prisma.student.findMany({ where: { id: { in: Array.from(mates) } }, select: { id: true, rollNumber: true } }) : []).map((x) => [x.id, x.rollNumber]));
  const rooms = new Map((await prisma.room.findMany({ where: { id: { in: myRooms.map((m) => m.room?.roomId).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((r) => [r.id, r.name]));
  const courseOf = new Map(enrolled.map((e) => [e.courseId, e.course]));

  return (
    <StudentShell studentName={student.name}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>My Exams</h1>
        <p><a className="btn btn-sm" href="/admit-card" target="_blank">Print my admit card</a> <a className="btn btn-sm btn-secondary" href="/student/recheck">Result re-checking</a></p>
        <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 16 }}>Your papers, rooms and seat numbers. Bring your student card and be in your seat 15 minutes early.</p>
        {sessions.length === 0 && <div className="card"><p style={{ margin: 0, color: "var(--slate)" }}>No date sheet has been published yet.</p></div>}
        {sessions.map((s) => {
          const slots = parse<string[]>(s.slotsJson, []);
          const mine = myRooms.filter((m) => m.p.sessionId === s.id).sort((a, b) => (a.p.date ? new Date(a.p.date).getTime() : 9e15) - (b.p.date ? new Date(b.p.date).getTime() : 9e15) || (a.p.slot ?? 0) - (b.p.slot ?? 0));
          return (
            <div key={s.id} className="card" style={{ overflowX: "auto" }}>
              <h3 style={{ marginTop: 0 }}>{s.name}</h3>
              <table>
                <thead><tr><th>Day</th><th>Time</th><th>Paper</th><th>Room</th><th>Seat</th></tr></thead>
                <tbody>
                  {mine.length === 0 && <tr><td colSpan={5} style={{ color: "var(--slate)" }}>None of your courses has a paper in this session.</td></tr>}
                  {mine.map(({ p, room }) => {
                    const seat = room ? seatOrder(sameRoom(p, room.roomId).flatMap((r) => r.ids.map((id) => ({ studentId: id, courseId: r.courseId, roll: rolls.get(id) || id })))).find((x) => x.studentId === student.id)?.seat : undefined;
                    return <tr key={p.id}><td>{p.date ? day(p.date) : "To be announced"}</td><td>{p.slot !== null ? slots[p.slot] : "—"}</td><td><b>{courseOf.get(p.courseId)?.code}</b> {courseOf.get(p.courseId)?.title}</td><td>{room ? rooms.get(room.roomId) : "—"}</td><td style={{ fontWeight: 700 }}>{seat ?? "—"}</td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </StudentShell>
  );
}
