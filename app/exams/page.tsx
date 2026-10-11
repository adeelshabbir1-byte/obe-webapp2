import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../lib/session";
import { prisma } from "../../lib/db";
import Shell from "../../components/Shell";
import { navForRole } from "../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../lib/reportScope";
import { xdb, parse, EXAM_MANAGERS, EXAM_VIEWERS, type ExamSessionRow, type ExamPaperRow } from "../../lib/exams";
import { ExamSessionForm } from "../../components/ExamControls";

export const dynamic = "force-dynamic";
const day = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export default async function ExamsPage() {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const manager = EXAM_MANAGERS.includes(user.role);
  const viewer = manager || EXAM_VIEWERS.includes(user.role);
  const chairmanId = await chairmanIdFor(user);
  let sessions: ExamSessionRow[] = [], missing = false;
  try { sessions = (await xdb.examSession.findMany({ where: { chairmanId, ...(viewer ? {} : { status: "PUBLISHED" }) }, orderBy: { startDate: "desc" } })) as ExamSessionRow[]; } catch { missing = true; }

  // My duties and my courses' papers in published sessions (teaching staff).
  const published = sessions.filter((s) => s.status === "PUBLISHED");
  let mine: { s: ExamSessionRow; when: string; room: string; what: string; kind: "duty" | "paper" }[] = [];
  if (published.length) {
    const papers = (await xdb.examPaper.findMany({ where: { sessionId: { in: published.map((s) => s.id) } } })) as ExamPaperRow[];
    const courses = await prisma.course.findMany({ where: { id: { in: papers.map((p) => p.courseId) } }, select: { id: true, code: true, title: true, instructorId: true } });
    const cOf = new Map(courses.map((c) => [c.id, c]));
    const roomIds = Array.from(new Set(papers.flatMap((p) => parse<{ roomId: string }[]>(p.roomsJson, []).map((r) => r.roomId))));
    const rooms = new Map((roomIds.length ? await prisma.room.findMany({ where: { id: { in: roomIds } }, select: { id: true, name: true } }) : []).map((r) => [r.id, r.name]));
    const seen = new Set<string>();
    for (const p of papers) {
      const s = published.find((x) => x.id === p.sessionId)!; const slots = parse<string[]>(s.slotsJson, []);
      if (!p.date || p.slot === null) continue;
      const when = `${day(p.date)} · ${slots[p.slot] || ""}`;
      for (const r of parse<{ roomId: string; userIds: string[] }[]>(p.invigilatorsJson, [])) {
        const k = `${s.id}|${ymd(new Date(p.date))}|${p.slot}|${r.roomId}`;
        if (r.userIds.includes(user.id) && !seen.has(k)) { seen.add(k); mine.push({ s, when, room: rooms.get(r.roomId) || "—", what: "Invigilation", kind: "duty" }); }
      }
      const c = cOf.get(p.courseId);
      if (c?.instructorId === user.id) mine.push({ s, when, room: parse<{ roomId: string }[]>(p.roomsJson, []).map((r) => rooms.get(r.roomId)).join(", ") || "—", what: `${c.code} ${c.title} — your paper`, kind: "paper" });
    }
    mine = mine.sort((a, b) => a.when.localeCompare(b.when));
  }

  // Defaults for a new session: the next midterm / final in the academic calendar.
  const next = manager ? await prisma.academicCalendarEntry.findFirst({ where: { chairmanId, kind: { in: ["MIDTERM", "FINAL"] }, startDate: { gte: new Date(Date.now() - 30 * 864e5) } }, orderBy: { startDate: "asc" } }) : null;
  const start = next?.startDate || new Date(Date.now() + 14 * 864e5);
  const end = next?.endDate || new Date(start.getTime() + 11 * 864e5);

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Exams</h1>
      <p style={{ color: "var(--slate)", fontSize: 13, marginBottom: 14 }}>
        Date sheets for midterm and final exams: every course&apos;s paper gets a day and a time with no student sitting two papers at once,
        rooms and seat numbers are given out, and invigilators are assigned evenly. Students see their own exams and seats once a date sheet is published.
      </p>
      {missing && <div className="err">The exam tables are not in the database yet — run prisma/migration_exams.sql in Supabase.</div>}

      {mine.length > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h3 style={{ marginTop: 0 }}>My exam duties and papers</h3>
          <table><thead><tr><th>When</th><th>What</th><th>Room</th><th>Session</th></tr></thead>
            <tbody>{mine.map((m, i) => <tr key={i}><td style={{ whiteSpace: "nowrap" }}>{m.when}</td><td>{m.kind === "duty" ? <span className="badge badge-warn">Invigilation</span> : m.what}</td><td>{m.room}</td><td><Link href={`/exams/${m.s.id}${m.kind === "duty" ? "?tab=duties" : ""}`}>{m.s.name}</Link></td></tr>)}</tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Exam sessions</h3>
        <table><thead><tr><th>Session</th><th>Exam</th><th>Days</th><th>Status</th></tr></thead>
          <tbody>
            {sessions.length === 0 && <tr><td colSpan={4} style={{ color: "var(--slate)" }}>{manager ? "None yet — create one below." : "No published date sheet yet."}</td></tr>}
            {sessions.map((s) => <tr key={s.id}><td><Link href={`/exams/${s.id}`}><b>{s.name}</b></Link></td><td>{s.examType}</td><td style={{ fontSize: 12.5 }}>{day(s.startDate)} – {day(s.endDate)}</td><td><span className={`badge ${s.status === "PUBLISHED" ? "badge-ok" : "badge-neutral"}`}>{s.status === "PUBLISHED" ? "Published" : "Draft"}</span></td></tr>)}
          </tbody>
        </table>
      </div>

      {manager && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>New exam session</h3>
          <ExamSessionForm initial={{ name: next ? next.title : "", examType: next?.kind === "FINAL" ? "Final" : "Midterm", startDate: ymd(new Date(start)), endDate: ymd(new Date(end)), slots: "09:00-11:00\n12:00-14:00", offDays: [0], maxPerDay: 2, seatPercent: 50, invigilatorsPerRoom: 1, includeLabs: false }} />
        </div>
      )}
    </Shell>
  );
}
