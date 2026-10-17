import { examChairman } from "../../../lib/examBranch";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import Shell from "../../../components/Shell";
import { navForRole } from "../../../components/reportNav";
import { roleLabel, chairmanIdFor } from "../../../lib/reportScope";
import { xdb, loadSession, sessionDays, examIssues, examRooms, parse, EXAM_VIEWERS, type ExamPaperRow } from "../../../lib/exams";
import { seatOrder } from "../../../lib/examPlanner";
import { ExamActions, ExamSessionForm, PaperMove } from "../../../components/ExamControls";

export const dynamic = "force-dynamic";
const ymd = (d: Date) => new Date(d).toISOString().slice(0, 10);
const dayLabel = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const TABS = [["sheet", "Date sheet"], ["rooms", "Rooms & seating"], ["duties", "Invigilation"], ["students", "Student look-up"], ["settings", "Settings"]] as const;

export default async function ExamSessionPage({ params, searchParams }: { params: { id: string }; searchParams: { tab?: string; q?: string; slot?: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const s = await loadSession(params.id).catch(() => null);
  if (!s || s.chairmanId !== (await chairmanIdFor(user))) notFound();
  const manager = !!(await examChairman(user));
  const viewer = manager || EXAM_VIEWERS.includes(user.role);
  if (!viewer && s.status !== "PUBLISHED") notFound();
  const tab = TABS.some((t) => t[0] === searchParams.tab) ? searchParams.tab! : "sheet";

  const [days, papers, rooms] = await Promise.all([sessionDays(s), xdb.examPaper.findMany({ where: { sessionId: s.id } }) as Promise<ExamPaperRow[]>, examRooms(s)]);
  const slots = parse<string[]>(s.slotsJson, []);
  const courses = await prisma.course.findMany({
    where: { id: { in: papers.map((p) => p.courseId) } },
    select: { id: true, code: true, title: true, instructorId: true, instructor: { select: { name: true } }, batch: { select: { degreeProgram: true, batchName: true } }, studentEnrollments: { where: { status: { not: "WITHDRAWN" } }, select: { studentId: true } } },
  });
  const cOf = new Map(courses.map((c) => [c.id, c]));
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const roomCap = new Map(rooms.map((r) => [r.id, r.seats]));
  const invIds = Array.from(new Set(papers.flatMap((p) => parse<{ userIds: string[] }[]>(p.invigilatorsJson, []).flatMap((r) => r.userIds))));
  const people = new Map((invIds.length ? await prisma.user.findMany({ where: { id: { in: invIds } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
  const issues = viewer ? await examIssues(s) : [];
  const slotKey = (p: ExamPaperRow) => (p.date && p.slot !== null ? `${ymd(p.date)}|${p.slot}` : "");
  const dayOpts = days.map((d) => ({ iso: ymd(d), label: dayLabel(d) }));

  // Paper groups (same code) for the date sheet.
  const groups = new Map<string, { code: string; title: string; papers: ExamPaperRow[]; students: number; batches: string[] }>();
  for (const p of papers) {
    const c = cOf.get(p.courseId); if (!c) continue;
    const g = groups.get(c.code) || { code: c.code, title: c.title, papers: [], students: 0, batches: [] };
    g.papers.push(p); g.students += c.studentEnrollments.length; if (c.batch) g.batches.push(c.batch.batchName);
    groups.set(c.code, g);
  }
  const groupList = Array.from(groups.values()).sort((a, b) => slotKey(a.papers[0]).localeCompare(slotKey(b.papers[0])) || a.code.localeCompare(b.code));

  // Rooms in use per slot.
  type RoomUse = { roomId: string; papers: { courseId: string; studentIds: string[] }[]; invigilators: string[] };
  const slotRooms = new Map<string, Map<string, RoomUse>>();
  for (const p of papers) {
    const k = slotKey(p); if (!k) continue;
    const m = slotRooms.get(k) || new Map<string, RoomUse>();
    const invs = parse<{ roomId: string; userIds: string[] }[]>(p.invigilatorsJson, []);
    for (const r of parse<{ roomId: string; studentIds: string[] }[]>(p.roomsJson, [])) {
      const u = m.get(r.roomId) || { roomId: r.roomId, papers: [], invigilators: [] };
      u.papers.push({ courseId: p.courseId, studentIds: r.studentIds });
      for (const id of invs.find((x) => x.roomId === r.roomId)?.userIds || []) if (!u.invigilators.includes(id)) u.invigilators.push(id);
      m.set(r.roomId, u);
    }
    slotRooms.set(k, m);
  }
  const slotKeys = Array.from(slotRooms.keys()).sort();
  const chosenSlot = searchParams.slot && slotRooms.has(searchParams.slot) ? searchParams.slot : slotKeys[0];
  const slotText = (k: string) => { const [d, i] = k.split("|"); return `${dayLabel(d)} · ${slots[Number(i)] || ""}`; };

  // Student names for seating and look-up (only what is needed).
  const needStudents: string[] = tab === "rooms" && chosenSlot ? Array.from(slotRooms.get(chosenSlot)!.values()).flatMap((u) => u.papers.flatMap((p) => p.studentIds)) : [];
  const q = (searchParams.q || "").trim();
  const found = tab === "students" && q ? await prisma.student.findMany({ where: { OR: [{ rollNumber: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] }, select: { id: true, name: true, rollNumber: true }, take: 5 }) : [];
  // For the look-up, seat numbers need the roll numbers of everyone in the same rooms (seats follow roll order).
  if (found.length) {
    for (const st of found) for (const p of papers) {
      const room = parse<{ roomId: string; studentIds: string[] }[]>(p.roomsJson, []).find((r) => r.studentIds.includes(st.id));
      const u = room && slotRooms.get(slotKey(p))?.get(room.roomId);
      if (u) for (const x of u.papers) needStudents.push(...x.studentIds);
    }
  }
  const studs = new Map((needStudents.length ? await prisma.student.findMany({ where: { id: { in: Array.from(new Set(needStudents)) } }, select: { id: true, name: true, rollNumber: true } }) : []).map((x) => [x.id, x]));

  // Invigilation roster.
  const roster = new Map<string, { k: string; roomId: string }[]>();
  for (const [k, m] of Array.from(slotRooms.entries())) for (const u of Array.from(m.values())) for (const id of u.invigilators) roster.set(id, [...(roster.get(id) || []), { k, roomId: u.roomId }]);
  const rosterList = Array.from(roster.entries()).map(([id, d]) => ({ id, name: people.get(id) || "—", duties: d.sort((a, b) => a.k.localeCompare(b.k)) })).sort((a, b) => (Number(b.id === user.id) - Number(a.id === user.id)) || b.duties.length - a.duties.length || a.name.localeCompare(b.name));
  const scheduled = papers.filter((p) => slotKey(p)).length;

  return (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <p className="no-print" style={{ marginBottom: 6 }}><Link href="/exams">← Exams</Link></p>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>{s.name}</h1>
        <span className={`badge ${s.status === "PUBLISHED" ? "badge-ok" : "badge-neutral"}`}>{s.status === "PUBLISHED" ? "Published" : "Draft"}</span>
        {manager && <span className="no-print" style={{ marginLeft: "auto" }}><ExamActions id={s.id} status={s.status} /></span>}
      </div>
      <p style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 12 }}>
        {days.length} exam days · {slots.length} slot(s) a day ({slots.join(", ")}) · {groups.size} papers ({papers.length} sections), {scheduled} scheduled · {rooms.length} rooms, {rooms.reduce((n, r) => n + r.seats, 0)} exam seats per slot · at most {s.maxPerDay} papers per student per day
      </p>
      {issues.length > 0 && (
        <div className="card no-print" style={{ borderLeft: `4px solid ${issues.some((i) => i.level === "bad") ? "var(--rust)" : "#B7791F"}` }}>
          {issues.map((i, k) => <div key={k} style={{ fontSize: 13, marginBottom: 4 }}><span className={`badge ${i.level === "bad" ? "badge-no" : "badge-warn"}`} style={{ marginRight: 8 }}>{i.level === "bad" ? "Problem" : "Check"}</span>{i.text}</div>)}
        </div>
      )}
      {viewer && papers.length > 0 && issues.length === 0 && <p className="no-print" style={{ fontSize: 12.5, background: "#E8F3EC", color: "#1F5E36", padding: "8px 12px" }}>No clashes, every student has a seat and every room has an invigilator.</p>}
      {papers.length === 0 && <div className="card"><p style={{ margin: 0, color: "var(--slate)" }}>{manager ? "Press “Generate date sheet” — every offered course with students gets a paper." : "No papers yet."}</p></div>}

      <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "6px 0" }}>
        <a className="btn btn-secondary btn-sm" href={`/exams/${s.id}/availability`}>Duty availability &amp; preferences</a>
        <a className="btn btn-secondary btn-sm" href={`/exams/${s.id}/my-duties`}>{manager ? "Duties & swap requests" : "My duties (grid) & swaps"}</a>
      </div>
      <nav className="tabs no-print" style={{ marginBottom: 12 }}>
        {TABS.filter((t) => t[0] !== "settings" || manager).filter((t) => viewer || t[0] === "sheet" || t[0] === "duties").map(([k, label]) => <a key={k} className="tab" href={`/exams/${s.id}?tab=${k}`} aria-current={tab === k ? "page" : undefined}>{label}</a>)}
      </nav>

      {tab === "sheet" && (
        <>
          <div className="card" style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Day</th>{slots.map((sl, i) => <th key={i}>{sl}</th>)}</tr></thead>
              <tbody>{days.map((d) => (
                <tr key={ymd(d)}>
                  <td style={{ whiteSpace: "nowrap", fontWeight: 700 }}>{dayLabel(d)}</td>
                  {slots.map((_, i) => {
                    const here = groupList.filter((g) => slotKey(g.papers[0]) === `${ymd(d)}|${i}`);
                    return <td key={i} style={{ verticalAlign: "top", fontSize: 12 }}>{here.length ? here.map((g) => <div key={g.code} style={{ marginBottom: 4 }}><b>{g.code}</b> {g.title}<div style={{ color: "var(--slate)", fontSize: 11 }}>{Array.from(new Set(g.batches)).join(", ")} · {g.students} students</div></div>) : <span style={{ color: "var(--slate-mute)" }}>—</span>}</td>;
                  })}
                </tr>
              ))}</tbody>
            </table>
          </div>
          {manager && groupList.length > 0 && (
            <div className="card no-print" style={{ overflowX: "auto" }}>
              <h3 style={{ marginTop: 0 }}>Move a paper</h3>
              <p style={{ fontSize: 12, color: "var(--slate)", marginTop: 0 }}>A moved paper stays where you put it when the date sheet is generated again. Rooms and invigilators are redone straight away; you&apos;re told if the move makes students clash.</p>
              <table style={{ fontSize: 12.5 }}>
                <thead><tr><th>Paper</th><th>Sections</th><th style={{ textAlign: "center" }}>Students</th><th>Day and slot</th></tr></thead>
                <tbody>{groupList.map((g) => { const p = g.papers[0]; return (
                  <tr key={g.code}><td><b>{g.code}</b> {g.title}{p.pinned && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>moved by hand</span>}</td><td style={{ fontSize: 11.5 }}>{Array.from(new Set(g.batches)).join(", ")}</td><td style={{ textAlign: "center" }}>{g.students}</td>
                    <td><PaperMove sessionId={s.id} paperId={p.id} date={p.date ? ymd(p.date) : null} slot={p.slot} days={dayOpts} slots={slots} /></td></tr>
                ); })}</tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "rooms" && (
        <div className="card">
          <form className="no-print" style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
            <input type="hidden" name="tab" value="rooms" />
            <label style={{ fontSize: 12.5 }}>Slot</label>
            <select name="slot" defaultValue={chosenSlot}>{slotKeys.map((k) => <option key={k} value={k}>{slotText(k)}</option>)}</select>
            <button className="btn" type="submit">Show</button>
            <span style={{ fontSize: 12, color: "var(--slate)" }}>Print this page for the seating plans of the slot.</span>
          </form>
          {!chosenSlot && <p style={{ color: "var(--slate)" }}>No scheduled papers yet.</p>}
          {chosenSlot && Array.from(slotRooms.get(chosenSlot)!.values()).sort((a, b) => (roomName.get(a.roomId) || "").localeCompare(roomName.get(b.roomId) || "")).map((u) => {
            const seated = seatOrder(u.papers.flatMap((p) => p.studentIds.map((sid) => ({ studentId: sid, courseId: p.courseId, roll: studs.get(sid)?.rollNumber || sid }))));
            return (
              <div key={u.roomId} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "10px 14px", marginBottom: 12, breakInside: "avoid" }}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                  <b style={{ fontSize: 15 }}>{roomName.get(u.roomId) || "Room"}</b>
                  <span style={{ fontSize: 12.5 }}>{slotText(chosenSlot)} · {seated.length} of {roomCap.get(u.roomId) ?? "—"} exam seats</span>
                  <span style={{ fontSize: 12.5 }}>Papers: {u.papers.map((p) => `${cOf.get(p.courseId)?.code} (${p.studentIds.length})`).join(", ")}</span>
                  <span style={{ fontSize: 12.5 }}>Invigilator(s): <b>{u.invigilators.map((id) => people.get(id) || "—").join(", ") || "none"}</b></span>
                </div>
                <table style={{ fontSize: 12, marginTop: 8 }}>
                  <thead><tr><th style={{ width: 60 }}>Seat</th><th>Roll no.</th><th>Name</th><th>Paper</th><th style={{ width: 120 }}>Signature</th></tr></thead>
                  <tbody>{seated.map((x) => <tr key={x.studentId}><td>{x.seat}</td><td>{x.roll}</td><td>{studs.get(x.studentId)?.name || ""}</td><td>{cOf.get(x.courseId)?.code}</td><td></td></tr>)}</tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {tab === "duties" && (
        <div className="card" style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Invigilator</th><th style={{ textAlign: "center" }}>Duties</th><th>When and where</th></tr></thead>
            <tbody>
              {rosterList.length === 0 && <tr><td colSpan={3} style={{ color: "var(--slate)" }}>No duties yet.</td></tr>}
              {rosterList.filter((r) => viewer || r.id === user.id).map((r) => (
                <tr key={r.id} style={r.id === user.id ? { background: "#FFF8EC" } : undefined}>
                  <td><b>{r.name}</b>{r.id === user.id ? " (you)" : ""}</td>
                  <td style={{ textAlign: "center" }}>{r.duties.length}</td>
                  <td style={{ fontSize: 12.5 }}>{r.duties.map((d) => `${slotText(d.k)} — ${roomName.get(d.roomId) || "room"}`).join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "students" && viewer && (
        <div className="card">
          <form style={{ display: "flex", gap: 8, marginBottom: 12 }}><input type="hidden" name="tab" value="students" /><input name="q" defaultValue={q} placeholder="Roll number or name" style={{ flex: "1 1 260px" }} /><button className="btn" type="submit">Find</button></form>
          {q && found.length === 0 && <p style={{ color: "var(--slate)" }}>No student found.</p>}
          {found.map((st) => {
            const rows = papers.filter((p) => cOf.get(p.courseId)?.studentEnrollments.some((e) => e.studentId === st.id)).sort((a, b) => slotKey(a).localeCompare(slotKey(b)));
            return (
              <div key={st.id} style={{ marginBottom: 14 }}>
                <b>{st.rollNumber} — {st.name}</b>
                <table style={{ fontSize: 12.5, marginTop: 6 }}>
                  <thead><tr><th>When</th><th>Paper</th><th>Room</th><th>Seat</th></tr></thead>
                  <tbody>{rows.map((p) => {
                    const room = parse<{ roomId: string; studentIds: string[] }[]>(p.roomsJson, []).find((r) => r.studentIds.includes(st.id));
                    const u = room && slotRooms.get(slotKey(p))?.get(room.roomId);
                    const seat = u ? seatOrder(u.papers.flatMap((x) => x.studentIds.map((sid) => ({ studentId: sid, courseId: x.courseId, roll: studs.get(sid)?.rollNumber || sid })))).find((x) => x.studentId === st.id)?.seat : undefined;
                    return <tr key={p.id}><td>{slotKey(p) ? slotText(slotKey(p)) : "not scheduled"}</td><td>{cOf.get(p.courseId)?.code} {cOf.get(p.courseId)?.title}</td><td>{room ? roomName.get(room.roomId) : "—"}</td><td>{seat ?? "—"}</td></tr>;
                  })}</tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {tab === "settings" && manager && (
        <div className="card">
          <ExamSessionForm sessionId={s.id} initial={{ name: s.name, examType: s.examType, startDate: ymd(s.startDate), endDate: ymd(s.endDate), slots: slots.join("\n"), offDays: parse<number[]>(s.offDaysJson, [0]), maxPerDay: s.maxPerDay, seatPercent: s.seatPercent, invigilatorsPerRoom: s.invigilatorsPerRoom, includeLabs: s.includeLabs }} />
          <p style={{ fontSize: 12, color: "var(--slate)" }}>After changing days or slots, press “Generate date sheet” again.</p>
        </div>
      )}
    </Shell>
  );
}
