import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/session";
import Shell from "../../../components/Shell";
import Tabs from "../../../components/Tabs";
import { navForRole } from "../../../components/reportNav";
import { chairmanIdFor, roleLabel } from "../../../lib/reportScope";
import { getTimetableEntries } from "../../../lib/timetableView";
import { classLog, nextDays, onDate } from "../../../lib/timetableLive";
import { DAYS, clashes, dayLength, freeSlots, hh, mostFree, teacherColour, utilisation, whoIsFree } from "../../../lib/timetableCore";
import { canDo } from "../../../lib/delegation";
import { qrGif } from "../../../lib/signoff";
import { Approve, BookForm, ChangeForm, RegisterRow, Review, TokenButton } from "./LiveForms";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;
const LEADERS = ["PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN", "DEAN"];
type SP = { tab?: string; group?: string; program?: string; batch?: string; teacher?: string; room?: string; day?: string; sections?: string | string[]; teachers?: string | string[]; roomType?: string; min?: string; mode?: string; at?: string; course?: string; print?: string };
const arr = (v?: string | string[]) => (Array.isArray(v) ? v : v ? [v] : []);

// Timetable views and classes in reality (Adeel prompt §22–23), on one page with tabs.
export default async function TimetableLivePage({ searchParams: sp }: { searchParams: SP }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  if (!user.mfaVerified) redirect("/mfa-verify");
  const cid = await chairmanIdFor(user as never);
  const leader = LEADERS.includes(user.role) || (await canDo(user, "dc.timetableChanges")).ok;
  const attendant = leader || (await canDo(user, "dc.floorRegister")).ok;
  const tab = sp.tab || "grid";
  const base = "/timetable/live";
  const all = await getTimetableEntries(cid);
  const rooms = await prisma.room.findMany({ where: { chairmanId: cid }, select: { id: true, name: true, type: true, capacity: true }, orderBy: { name: "asc" } });
  const teachers = Array.from(new Map(all.map((e) => [e.instructorId, { id: e.instructorId, name: e.instructorName }])).values()).sort((a, b) => a.name.localeCompare(b.name));
  const sections = Array.from(new Set(all.flatMap((e) => e.sectionKeys))).sort();
  const secLabel = new Map<string, string>(); for (const e of all) e.sectionKeys.forEach((k, i) => secLabel.set(k, `${e.batchLabels[Math.min(i, e.batchLabels.length - 1)] || k}${k.includes("#") ? ` · ${k.split("#")[1]}` : ""}`));
  const filtered = all.filter((e) => (!sp.program || e.degreePrograms.includes(sp.program)) && (!sp.batch || e.batchLabels.some((b) => b.includes(sp.batch!))) && (!sp.teacher || e.instructorId === sp.teacher) && (!sp.room || e.roomId === sp.room) && (!sp.day || e.dayOfWeek === sp.day));
  const opts = { entries: all.filter((e) => leader || e.instructorId === user.id).map((e) => ({ id: e.id, label: `${e.courseCode} · ${e.batchLabels.join(", ")} · ${e.dayOfWeek.slice(0, 3)} ${hh(e.startHour)} · ${e.roomName}` })), rooms: rooms.map((r) => ({ id: r.id, label: `${r.name} (${r.type}, ${r.capacity})` })), teachers: teachers.map((t) => ({ id: t.id, label: t.name })) };
  const pendingMoves = leader ? ((await db.timetableChange?.findMany({ where: { chairmanId: cid, status: "PENDING" } }).catch(() => [])) || []) : [];
  const shell = (body: React.ReactNode) => (
    <Shell roleLabel={roleLabel(user.role)} userName={user.name} navLinks={navForRole(user.role)}>
      <h1>Timetable — views and changes</h1>
      <Tabs base={base} current={tab} tabs={[{ key: "grid", label: "Master grid" }, { key: "rooms", label: "Room sheets" }, { key: "week", label: "Next 7 days" }, { key: "finder", label: "Free-slot finder" }, { key: "reports", label: "Reports" }, ...(attendant ? [{ key: "register", label: "Floor register" }] : []), ...(leader ? [{ key: "review", label: "Review", badge: pendingMoves.length || null }] : []), { key: "log", label: "Class log" }]} />
      {all.length === 0 ? <div className="card"><p>No timetable yet. The Department Coordinator generates it (Timetable).</p></div> : body}
    </Shell>
  );

  if (tab === "grid") {
    const clash = clashes(filtered);
    const clashIds = new Set(clash.flatMap((c) => [c.a.id, c.b.id]));
    const start = Math.floor(Math.min(...filtered.map((e) => e.startHour), 8)), end = Math.ceil(Math.max(...filtered.map((e) => e.endHour), 16));
    const slots: number[] = []; for (let h = start; h < end; h += 0.5) slots.push(h);
    const keys = sections.filter((k) => filtered.some((e) => e.sectionKeys.includes(k)));
    const rowsBy = sp.group === "batch" ? keys.flatMap((k) => DAYS.map((d) => ({ k, d }))) : DAYS.flatMap((d) => keys.map((k) => ({ k, d })));
    const programs = Array.from(new Set(all.flatMap((e) => e.degreePrograms))).sort();
    return shell(<>
      <form className="card no-print" style={{ display: "flex", flexWrap: "wrap", gap: 8, fontSize: 13, alignItems: "center" }}>
        <input type="hidden" name="tab" value="grid" />
        <select name="program" defaultValue={sp.program || ""}><option value="">All programs</option>{programs.map((p) => <option key={p}>{p}</option>)}</select>
        <input name="batch" defaultValue={sp.batch || ""} placeholder="Batch / section" style={{ width: 120 }} />
        <select name="teacher" defaultValue={sp.teacher || ""}><option value="">All teachers</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <select name="room" defaultValue={sp.room || ""}><option value="">All rooms</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        <select name="day" defaultValue={sp.day || ""}><option value="">All days</option>{DAYS.map((d) => <option key={d}>{d}</option>)}</select>
        <select name="group" defaultValue={sp.group || "day"}><option value="day">Group by day</option><option value="batch">Group by batch</option></select>
        <button className="btn btn-sm">Show</button> <Link href={base} className="small-note">Clear</Link>
      </form>
      {clash.length > 0 && <div className="err" style={{ fontSize: 13 }}>⚠ {clash.length} clash{clash.length > 1 ? "es" : ""}: {clash.slice(0, 8).map((c) => `${c.a.dayOfWeek.slice(0, 3)} ${hh(c.a.startHour)} ${c.a.courseCode} / ${c.b.courseCode} (${c.why})`).join(" · ")}</div>}
      <div className="card" style={{ overflow: "auto", maxHeight: "75vh", padding: 0 }}>
        <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: 900 }}>
          <thead style={{ position: "sticky", top: 0, background: "#fff", zIndex: 2 }}><tr><th style={{ position: "sticky", left: 0, background: "#fff", minWidth: 170, textAlign: "left", padding: 4 }}>Section · day</th>{slots.map((h) => <th key={h} style={{ padding: "2px 4px", borderLeft: "1px solid #eee" }}>{hh(h)}</th>)}</tr></thead>
          <tbody>{rowsBy.map(({ k, d }) => {
            const cls = filtered.filter((e) => e.dayOfWeek === d && e.sectionKeys.includes(k)).sort((a, b) => a.startHour - b.startHour);
            if (!cls.length && sp.group !== "batch") return null;
            const cells: React.ReactNode[] = []; let h = start;
            while (h < end) {
              const c = cls.find((x) => x.startHour <= h && h < x.endHour && Math.abs(x.startHour - h) < 0.26) || null;
              if (c) { const span = Math.max(1, Math.round((c.endHour - c.startHour) * 2)); cells.push(<td key={h} colSpan={span} title={`${c.courseCode} · ${c.instructorName} · ${c.roomName}`} style={{ background: teacherColour(c.instructorId), border: clashIds.has(c.id) ? "2px solid #B3261E" : "1px solid #fff", padding: 3, whiteSpace: "nowrap" }}><b>{c.courseCode}</b> {clashIds.has(c.id) ? "⚠" : ""}<br />{c.instructorName.split(" ").slice(-1)} · {c.roomName}</td>); h += span / 2; }
              else { cells.push(<td key={h} style={{ borderLeft: "1px solid #f3f3f3" }} />); h += 0.5; }
            }
            return <tr key={`${k}|${d}`} style={{ borderTop: "1px solid #eee" }}><td style={{ position: "sticky", left: 0, background: "#fff", padding: 4, whiteSpace: "nowrap" }}>{secLabel.get(k) || k} · {d.slice(0, 3)}</td>{cells}</tr>;
          })}</tbody>
        </table>
      </div>
      <p className="small-note">Each teacher has one colour everywhere. Red border = clash. Filter by one teacher to highlight him.</p>
    </>);
  }

  if (tab === "rooms") {
    const list = sp.room ? rooms.filter((r) => r.id === sp.room) : rooms;
    return shell(<>
      <p className="no-print" style={{ fontSize: 13 }}>One printable page per room for its door, with a QR code to the live room view. <a href="#" className="small-note">Use the browser&apos;s Print (Ctrl + P) for “Print all rooms”.</a></p>
      {list.map((r) => {
        const es = all.filter((e) => e.roomId === r.id);
        const url = `/timetable/live?tab=week&room=${r.id}`;
        return (
          <div key={r.id} className="card" style={{ pageBreakAfter: "always", marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div><h2 style={{ margin: 0 }}>{r.name}</h2><div className="small-note">{r.type} · {r.capacity} seats · last updated {new Date().toLocaleDateString("en-GB")}</div></div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrGif(`https://obe-webapp2.vercel.app${url}`, 3)} alt="QR to the live room page" width={90} height={90} />
            </div>
            <table className="table" style={{ fontSize: 12, marginTop: 8, width: "100%" }}><thead><tr><th>Day</th><th style={{ textAlign: "left" }}>Classes</th></tr></thead>
              <tbody>{DAYS.map((d) => <tr key={d}><td>{d}</td><td>{es.filter((e) => e.dayOfWeek === d).sort((a, b) => a.startHour - b.startHour).map((e) => `${hh(e.startHour)}–${hh(e.endHour)} ${e.courseCode} (${e.batchLabels.join(", ")}) ${e.instructorName}`).join(" · ") || "—"}</td></tr>)}</tbody></table>
            {leader && <div className="no-print" style={{ marginTop: 6 }}><TokenButton kind="KIOSK" roomId={r.id} label={r.name} /></div>}
          </div>
        );
      })}
    </>);
  }

  if (tab === "week") {
    const days = await nextDays(cid, 7);
    const leaves = ((await db.shortLeave?.findMany({ where: { chairmanId: cid, status: "APPROVED", toDate: { gte: new Date() } } }).catch(() => [])) || []) as { userId: string; fromDate: Date; toDate: Date }[];
    return shell(<>
      <div className="card no-print" style={{ marginBottom: 10 }}><b style={{ fontSize: 13.5 }}>Change a class</b><ChangeForm {...opts} /></div>
      <div className="card no-print" style={{ marginBottom: 10 }}><b style={{ fontSize: 13.5 }}>Book a free room</b> <BookForm rooms={opts.rooms} /></div>
      <div className="card no-print" style={{ marginBottom: 10, fontSize: 13 }}><b>My calendar:</b> <TokenButton kind="ICS" /> <span className="small-note">Add it to Google / Outlook / your phone; it includes reschedules and cancellations.</span></div>
      {days.map((d) => {
        const onLeave = d.classes.filter((c) => c.status === "NORMAL" && leaves.some((l) => l.userId === c.instructorId && new Date(l.fromDate) <= new Date(d.date + "T23:59:59Z") && new Date(l.toDate) >= new Date(d.date + "T00:00:00Z")));
        const busy = (r: { id: string }) => d.classes.filter((c) => c.roomId === r.id && c.status !== "CANCELLED");
        const shown = sp.room ? rooms.filter((r) => r.id === sp.room) : rooms;
        return (
          <div key={d.date} className="card" style={{ marginBottom: 10, overflowX: "auto" }}>
            <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>{d.weekday} {d.date}</h3>
            {onLeave.length > 0 && <div className="err" style={{ fontSize: 12.5 }}>Teacher on leave, no substitute yet: {onLeave.map((c) => { const free = whoIsFree(d.classes, d.weekday, c.startHour + 0.1, [], teachers).teachers.filter((t) => t.id !== c.instructorId).slice(0, 3); return `${c.courseCode} ${hh(c.startHour)} (${c.instructorName}) — free: ${free.map((t) => t.name).join(", ") || "nobody"}`; }).join(" · ")}. Assign one with “Substitute teacher”, or cancel it (the room is then free that day).</div>}
            {d.classes.filter((c) => c.status && c.status !== "NORMAL").length > 0 && <div style={{ fontSize: 12.5, marginBottom: 6 }}><b>Changes:</b> {d.classes.filter((c) => c.status !== "NORMAL").map((c) => `${c.courseCode} ${hh(c.startHour)} ${c.status?.toLowerCase()}${c.note ? ` (${c.note})` : ""}`).join(" · ")}</div>}
            <table style={{ fontSize: 11.5, borderCollapse: "collapse" }}><tbody>{shown.map((r) => <tr key={r.id} style={{ borderTop: "1px solid #eee" }}><td style={{ padding: "3px 6px", whiteSpace: "nowrap" }}><b>{r.name}</b> <span className="small-note">{r.type} {r.capacity}</span></td>
              <td style={{ padding: "3px 6px" }}>{busy(r).length ? busy(r).map((c) => <span key={c.id} style={{ display: "inline-block", background: teacherColour(c.instructorId), borderRadius: 4, padding: "1px 5px", marginRight: 4 }}>{hh(c.startHour)}–{hh(c.endHour)} {c.courseCode}{c.status === "MOVED" ? " (moved)" : c.status === "MAKEUP" ? " (make-up)" : c.status === "BOOKING" ? ` (${c.note})` : ""}</span>) : <span style={{ color: "#1B6B3A" }}>free all day</span>}</td></tr>)}</tbody></table>
          </div>
        );
      })}
    </>);
  }

  if (tab === "finder") {
    const selS = arr(sp.sections), selT = arr(sp.teachers);
    const mode = sp.mode || "common";
    const at = (sp.at || "Wednesday 11:00").split(" ");
    return shell(<>
      <form className="card no-print" style={{ fontSize: 13, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-start" }}>
        <input type="hidden" name="tab" value="finder" />
        <label>Mode <select name="mode" defaultValue={mode}><option value="common">Common free slots</option><option value="most">Slot with the most sections free</option><option value="who">Who is free at…</option></select></label>
        <label>Sections <select name="sections" multiple size={6} defaultValue={selS} style={{ minWidth: 200 }}>{sections.map((k) => <option key={k} value={k}>{secLabel.get(k) || k}</option>)}</select></label>
        <label>Teachers <select name="teachers" multiple size={6} defaultValue={selT} style={{ minWidth: 160 }}>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <div style={{ display: "grid", gap: 6 }}>
          <label>Room type <select name="roomType" defaultValue={sp.roomType || ""}><option value="">Any</option>{Array.from(new Set(rooms.map((r) => r.type))).map((t) => <option key={t}>{t}</option>)}</select></label>
          <label>At least <input name="min" type="number" step="0.5" defaultValue={sp.min || "1"} style={{ width: 60 }} /> hours</label>
          <label>Who is free at <input name="at" defaultValue={sp.at || "Wednesday 11:00"} style={{ width: 140 }} /></label>
          <button className="btn btn-sm">Find</button>
        </div>
      </form>
      {mode === "common" && (selS.length || selT.length) ? (() => { const f = freeSlots(all, rooms, { sections: selS, teachers: selT, roomType: sp.roomType, minHours: Number(sp.min) || 1 }); return <div className="card">{f.length ? <ul style={{ fontSize: 13, paddingLeft: 18 }}>{f.slice(0, 40).map((x, i) => <li key={i}>{x.day} {hh(x.start)}–{hh(x.end)} · rooms: {x.rooms.join(", ")}</li>)}</ul> : <p>No common free slot.</p>}<p className="small-note">Book one on “Next 7 days” → Book a free room.</p></div>; })() : null}
      {mode === "most" && (() => { const pool = selS.length ? selS : sections; return <div className="card"><ul style={{ fontSize: 13, paddingLeft: 18 }}>{mostFree(all, pool).slice(0, 15).map((x, i) => <li key={i}>{x.day} {hh(x.start)}–{hh(x.end)} — {x.free} of {pool.length} sections free{x.busy.length ? ` (busy: ${x.busy.slice(0, 6).map((k) => secLabel.get(k) || k).join(", ")})` : ""}</li>)}</ul></div>; })()}
      {mode === "who" && (() => { const [d, t] = [at[0], at[1] || "11:00"]; const [h, m] = t.split(":").map(Number); const w = whoIsFree(all, d, h + (m || 0) / 60, sections, teachers); return <div className="card" style={{ fontSize: 13 }}><p><b>Sections free and on campus</b> ({d} {t}): {w.sections.map((k) => secLabel.get(k) || k).join(", ") || "none"}</p><p><b>Teachers free:</b> {w.teachers.map((x) => x.name).join(", ") || "none"}</p></div>; })()}
    </>);
  }

  if (tab === "reports") {
    const u = utilisation(all, rooms), dl = dayLength(all), c = clashes(all);
    return shell(<>
      <div className="card" style={{ marginBottom: 10 }}><h3 style={{ marginTop: 0, fontSize: 15 }}>Room utilisation (Mon–Sat, 08:00–17:00)</h3>
        <table className="table" style={{ fontSize: 12.5 }}><thead><tr><th style={{ textAlign: "left" }}>Room</th><th>Type</th><th>Hours / week</th><th>Used</th></tr></thead><tbody>{u.map((r) => <tr key={r.room}><td>{r.room}</td><td>{r.type}</td><td style={{ textAlign: "center" }}>{r.hours.toFixed(1)}</td><td style={{ textAlign: "center", color: r.pct < 30 ? "#B26A00" : undefined }}>{r.pct}%</td></tr>)}</tbody></table>
        <p className="small-note">Labs used for theory: {all.filter((e) => /lab/i.test(e.roomType) && !/lab/i.test(e.courseCode)).length} class(es).</p></div>
      <div className="card" style={{ marginBottom: 10 }}><h3 style={{ marginTop: 0, fontSize: 15 }}>Long days, gaps and classes in a row</h3>
        {dl.length ? <ul style={{ fontSize: 12.5, paddingLeft: 18 }}>{dl.slice(0, 40).map((x, i) => <li key={i}>{x.who} · {x.day}: {x.span.toFixed(1)} h day, {x.gaps.toFixed(1)} h gaps{x.inRow >= 4 ? `, ${x.inRow} classes in a row` : ""}</li>)}</ul> : <p>None ✓</p>}
        <p className="small-note">The next timetable run can take these as soft rules.</p></div>
      <div className="card"><h3 style={{ marginTop: 0, fontSize: 15 }}>Clashes</h3>{c.length ? <ul style={{ fontSize: 12.5, paddingLeft: 18 }}>{c.map((x, i) => <li key={i}>{x.a.dayOfWeek} {hh(x.a.startHour)}: {x.a.courseCode} / {x.b.courseCode} — {x.why}</li>)}</ul> : <p>None ✓</p>}</div>
    </>);
  }

  if (tab === "register" && attendant) {
    const today = new Date().toISOString().slice(0, 10);
    const list = (await onDate(cid, new Date())).filter((c) => !c.id.startsWith("chg:") && c.status !== "CANCELLED" && (!sp.room || c.roomId === sp.room));
    const floors = Array.from(new Set(rooms.map((r) => r.name.replace(/\d{2}$/, "").trim()))).slice(0, 20);
    return shell(<div className="card">
      <p style={{ fontSize: 13 }}>Today, {today}. Mark each class as it starts: “On time”, or type the actual start; when it ends; room changes; “not held”. Differences go to the Program Lead today.</p>
      <form className="no-print" style={{ fontSize: 12.5, marginBottom: 8 }}><input type="hidden" name="tab" value="register" /><select name="room" defaultValue={sp.room || ""}><option value="">All rooms</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select> <button className="btn btn-sm">Show</button> <span className="small-note">({floors.length} floor groups)</span></form>
      <table className="table" style={{ fontSize: 12.5, width: "100%" }}><tbody>{list.map((c) => <tr key={c.id}><td style={{ whiteSpace: "nowrap" }}><b>{c.roomName}</b> {hh(c.startHour)}–{hh(c.endHour)}</td><td>{c.courseCode} · {c.batchLabels.join(", ")} · {c.substitute || c.instructorName}</td><td><RegisterRow entryId={c.id} date={today} planned={hh(c.startHour)} roomId={c.roomId} /></td></tr>)}</tbody></table>
    </div>);
  }

  if (tab === "review" && leader) {
    const since = new Date(Date.now() - 14 * 864e5);
    const regs = ((await db.floorRegister?.findMany({ where: { chairmanId: cid, date: { gte: since }, review: null }, orderBy: { date: "desc" }, take: 300 }).catch(() => [])) || []) as { id: string; entryId: string; date: Date; startedAt: number | null; endedAt: number | null; held: boolean; note: string | null; teacherReply: string | null }[];
    const byId = new Map(all.map((e) => [e.id, e]));
    const diffs = regs.filter((r) => { const e = byId.get(r.entryId); if (!e) return false; return !r.held || (r.startedAt != null && r.startedAt > e.startHour + 5 / 60) || (r.endedAt != null && r.endedAt < e.endHour - 5 / 60); }).filter((r) => user.role !== "PROGRAM_COORDINATOR" || byId.get(r.entryId)?.batchIds.length);
    return shell(<>
      {pendingMoves.length > 0 && <div className="card" style={{ marginBottom: 10 }}><h3 style={{ marginTop: 0, fontSize: 15 }}>Permanent changes waiting</h3><ul style={{ fontSize: 13, paddingLeft: 18 }}>{(pendingMoves as { id: string; entryId: string; fromDate: Date; toStart: number; toEnd: number; reason: string }[]).map((m) => <li key={m.id}>{byId.get(m.entryId)?.courseCode} from {new Date(m.fromDate).toLocaleDateString("en-GB")}: {hh(m.toStart)}–{hh(m.toEnd)} — {m.reason} <Approve id={m.id} /></li>)}</ul></div>}
      <div className="card"><h3 style={{ marginTop: 0, fontSize: 15 }}>Differences from the floor register (last 14 days)</h3>
        {diffs.length === 0 ? <p>None ✓</p> : <table className="table" style={{ fontSize: 12.5, width: "100%" }}><tbody>{diffs.map((r) => { const e = byId.get(r.entryId)!; return <tr key={r.id}><td>{new Date(r.date).toLocaleDateString("en-GB")}</td><td>{e.courseCode} · {e.instructorName}</td><td>planned {hh(e.startHour)}–{hh(e.endHour)} · {r.held ? `actual ${r.startedAt != null ? hh(r.startedAt) : "?"}–${r.endedAt != null ? hh(r.endedAt) : "?"}` : "not held"}{r.note ? ` · ${r.note}` : ""}{r.teacherReply ? ` · teacher: ${r.teacherReply}` : ""}</td><td><Review id={r.id} /></td></tr>; })}</tbody></table>}
        <p className="small-note">“Penalise” counts in the late-arrival rule and the teacher&apos;s record (and visiting pay checks); “Excused” keeps it in the class log only.</p></div>
    </>);
  }

  // Class log
  const codes = Array.from(new Set(all.filter((e) => leader || e.instructorId === user.id).map((e) => e.courseCode))).sort();
  const course = sp.course || codes[0] || "";
  const ids = all.filter((e) => e.courseCode === course && (leader || e.instructorId === user.id)).map((e) => e.id);
  const rows = course ? await classLog(cid, ids, new Date(Date.now() - 16 * 7 * 864e5)) : [];
  return shell(<>
    <form className="card no-print" style={{ fontSize: 13 }}><input type="hidden" name="tab" value="log" /> Course <select name="course" defaultValue={course}>{codes.map((c) => <option key={c}>{c}</option>)}</select> <button className="btn btn-sm">Show</button> <span className="small-note">Every class of the term: planned vs actual, who taught, and every change.</span></form>
    <div className="card" style={{ overflowX: "auto" }}><table className="table" style={{ fontSize: 12, width: "100%" }}><thead><tr><th>Date</th><th>Planned</th><th>Actual</th><th>Room</th><th>Taught by</th><th>Status</th><th style={{ textAlign: "left" }}>Notes</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} style={{ color: r.status === "CANCELLED" || r.status === "NOT HELD" ? "#B3261E" : r.status === "LATE" ? "#B26A00" : undefined }}><td>{r.date}</td><td>{r.planned}</td><td>{r.actual}</td><td>{r.room}</td><td>{r.teacher}</td><td>{r.status.toLowerCase()}</td><td>{r.note}</td></tr>)}</tbody></table>
      <p className="small-note">Missed: {rows.filter((r) => r.status === "CANCELLED" || r.status === "NOT HELD").length} · make-ups: {rows.filter((r) => r.status === "MAKEUP").length}. Plan make-ups with the Free-slot finder.</p></div>
  </>);
}
