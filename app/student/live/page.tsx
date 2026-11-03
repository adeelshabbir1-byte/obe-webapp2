import { redirect } from "next/navigation";
import { getAuthenticatedStudent } from "../../../lib/studentSession";
import { prisma } from "../../../lib/db";
import StudentShell from "../../../components/StudentShell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live lectures" };

// The student's live online lectures (Google Meet / Teams) for their enrolled courses, with the join link and, after
// the lecture, the recording when the teacher has linked one.
export default async function StudentLivePage() {
  const student = await getAuthenticatedStudent();
  if (!student) redirect("/student/login");
  const enr = await prisma.studentEnrollment.findMany({ where: { studentId: student.id }, select: { course: { select: { id: true, code: true, title: true } } } });
  const courses = new Map<string, { id: string; code: string; title: string }>(enr.map((e) => [e.course.id, e.course as { id: string; code: string; title: string }]));
  const db = prisma as unknown as Record<string, any>;
  const sessions = ((await db.liveSession?.findMany({ where: { courseId: { in: Array.from(courses.keys()) }, startsAt: { gte: new Date(Date.now() - 14 * 864e5) } }, orderBy: { startsAt: "asc" }, take: 200 }).catch(() => [])) || []) as { id: string; courseId: string; lectureNumber: number; tool: string; startsAt: Date; endsAt: Date; joinUrl: string | null; recordingUrl: string | null; status: string }[];
  const now = Date.now();
  const upcoming = sessions.filter((s) => s.endsAt.getTime() >= now), past = sessions.filter((s) => s.endsAt.getTime() < now).reverse();
  const when = (d: Date) => d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });
  const row = (s: (typeof sessions)[number], live: boolean) => { const c = courses.get(s.courseId); return (
    <tr key={s.id}><td>{when(s.startsAt)}</td><td>{c?.code} — {c?.title}</td><td>Lecture {s.lectureNumber}</td><td>{s.tool === "GOOGLE" ? "Google Meet" : "Microsoft Teams"}</td>
      <td>{live ? (s.joinUrl ? <a className="btn btn-sm" href={s.joinUrl} target="_blank" rel="noopener noreferrer">Join</a> : "link to come") : s.recordingUrl && !s.recordingUrl.startsWith("teams-recording:") ? <a href={s.recordingUrl} target="_blank" rel="noopener noreferrer">Recording</a> : s.recordingUrl ? "recording in Teams" : s.status === "NOT_HELD" ? "not held" : "—"}</td></tr>); };
  return (
    <StudentShell studentName={student.name}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Live lectures</h1>
      <p className="small-note" style={{ marginTop: 0 }}>Sign in with your university account to join. Times are Pakistan time.</p>
      <div className="card" style={{ overflowX: "auto" }}><h2 style={{ fontSize: 16, marginTop: 0 }}>Coming up</h2>
        {upcoming.length ? <table className="table" style={{ fontSize: 13 }}><tbody>{upcoming.map((s) => row(s, true))}</tbody></table> : <p className="small-note">No live lecture scheduled.</p>}</div>
      {past.length > 0 && <div className="card" style={{ overflowX: "auto" }}><h2 style={{ fontSize: 16, marginTop: 0 }}>Last two weeks</h2><table className="table" style={{ fontSize: 13 }}><tbody>{past.map((s) => row(s, false))}</tbody></table></div>}
    </StudentShell>
  );
}
