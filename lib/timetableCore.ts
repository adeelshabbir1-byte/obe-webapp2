// Timetable views and queries (Adeel prompt §22). No database here (tested on its own).
export type E = { id: string; dayOfWeek: string; startHour: number; endHour: number; courseCode: string; instructorId: string; instructorName: string; roomId: string; roomName: string; roomType?: string; batchLabels: string[]; sectionKeys: string[]; batchIds?: string[] };
export type RoomInfo = { id: string; name: string; type: string; capacity: number };
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** One consistent colour per teacher (from his id), readable with dark text. */
export function teacherColour(id: string) {
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 65% 82%)`;
}
const overlap = (a: E, b: E) => a.dayOfWeek === b.dayOfWeek && a.startHour < b.endHour && b.startHour < a.endHour;

/** Same teacher, room or student section at an overlapping time. */
export function clashes(es: E[]) {
  const out: { a: E; b: E; why: string }[] = [];
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
    const a = es[i], b = es[j];
    if (!overlap(a, b)) continue;
    if (a.instructorId === b.instructorId) out.push({ a, b, why: `teacher ${a.instructorName}` });
    else if (a.roomId === b.roomId) out.push({ a, b, why: `room ${a.roomName}` });
    else { const s = a.sectionKeys.find((k) => b.sectionKeys.includes(k)); if (s) out.push({ a, b, why: `section ${s}` }); }
  }
  return out;
}

/** Busy intervals of the selected sections / teachers on one day. */
function busy(es: E[], day: string, sel: { sections?: string[]; teachers?: string[] }) {
  return es.filter((e) => e.dayOfWeek === day && (e.sectionKeys.some((k) => sel.sections?.includes(k)) || (sel.teachers || []).includes(e.instructorId))).map((e) => [e.startHour, e.endHour] as [number, number]);
}
const freeWithin = (b: [number, number][], from: number, to: number) => {
  const sorted = b.slice().sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = []; let t = from;
  for (const [s, e] of sorted) { if (s > t) out.push([t, Math.min(s, to)]); t = Math.max(t, e); if (t >= to) break; }
  if (t < to) out.push([t, to]);
  return out.filter(([s, e]) => e - s > 0);
};

/** Every common free slot of the chosen sections / teachers this week, with a free room that fits; longest first. */
export function freeSlots(es: E[], rooms: RoomInfo[], sel: { sections?: string[]; teachers?: string[]; roomType?: string; minHours?: number; size?: number; days?: string[]; from?: number; to?: number }) {
  const out: { day: string; start: number; end: number; rooms: string[] }[] = [];
  for (const day of sel.days || DAYS) {
    for (const [s, e] of freeWithin(busy(es, day, sel), sel.from ?? 8, sel.to ?? 17)) {
      if (e - s < (sel.minHours ?? 1)) continue;
      const fit = rooms.filter((r) => (!sel.roomType || r.type === sel.roomType) && (!sel.size || r.capacity >= sel.size) && !es.some((x) => x.roomId === r.id && x.dayOfWeek === day && x.startHour < e && s < x.endHour));
      if (fit.length) out.push({ day, start: s, end: e, rooms: fit.slice(0, 5).map((r) => r.name) });
    }
  }
  return out.sort((a, b) => b.end - b.start - (a.end - a.start));
}

/** Slots ranked by how many of these sections are free then. */
export function mostFree(es: E[], sections: string[], step = 1.5, from = 8, to = 17) {
  const out: { day: string; start: number; end: number; free: number; busy: string[] }[] = [];
  for (const day of DAYS) for (let s = from; s + step <= to; s += step) {
    const e = s + step;
    const taken = new Set(es.filter((x) => x.dayOfWeek === day && x.startHour < e && s < x.endHour).flatMap((x) => x.sectionKeys));
    const b = sections.filter((k) => taken.has(k));
    out.push({ day, start: s, end: e, free: sections.length - b.length, busy: b });
  }
  return out.sort((a, b) => b.free - a.free || DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start - b.start);
}

/** Sections free at a time but on campus (a class earlier and later that day), and teachers free then. */
export function whoIsFree(es: E[], day: string, hour: number, allSections: string[], allTeachers: { id: string; name: string }[]) {
  const today = es.filter((e) => e.dayOfWeek === day);
  const now = today.filter((e) => e.startHour <= hour && hour < e.endHour);
  const busyS = new Set(now.flatMap((e) => e.sectionKeys)), busyT = new Set(now.map((e) => e.instructorId));
  const sections = allSections.filter((k) => !busyS.has(k) && today.some((e) => e.sectionKeys.includes(k) && e.endHour <= hour) && today.some((e) => e.sectionKeys.includes(k) && e.startHour > hour));
  return { sections, teachers: allTeachers.filter((t) => !busyT.has(t.id)) };
}

/** Utilisation per room: share of the week's teaching hours (8–17, Mon–Sat) it is booked. */
export function utilisation(es: E[], rooms: RoomInfo[], hoursPerDay = 9, days = 6) {
  return rooms.map((r) => { const h = es.filter((e) => e.roomId === r.id).reduce((a, e) => a + (e.endHour - e.startHour), 0); return { room: r.name, type: r.type, hours: h, pct: Math.round((100 * h) / (hoursPerDay * days)) }; }).sort((a, b) => a.pct - b.pct);
}
/** Long days and big gaps per section; many classes in a row per teacher. */
export function dayLength(es: E[]) {
  const out: { who: string; day: string; span: number; gaps: number; inRow: number }[] = [];
  const groups = new Map<string, E[]>();
  for (const e of es) { for (const k of e.sectionKeys) groups.set(`S|${k}|${e.dayOfWeek}`, [...(groups.get(`S|${k}|${e.dayOfWeek}`) || []), e]); groups.set(`T|${e.instructorName}|${e.dayOfWeek}`, [...(groups.get(`T|${e.instructorName}|${e.dayOfWeek}`) || []), e]); }
  for (const [k, list] of Array.from(groups.entries())) {
    const [, who, day] = k.split("|");
    const l = list.slice().sort((a, b) => a.startHour - b.startHour);
    const span = l[l.length - 1].endHour - l[0].startHour;
    let gaps = 0, inRow = 1, run = 1;
    for (let i = 1; i < l.length; i++) { const g = l[i].startHour - l[i - 1].endHour; if (g > 0) { gaps += g; run = 1; } else { run++; inRow = Math.max(inRow, run); } }
    if (span >= 7 || gaps >= 3 || (k.startsWith("T|") && inRow >= 4)) out.push({ who: (k.startsWith("T|") ? "Teacher " : "Section ") + who, day, span, gaps, inRow });
  }
  return out.sort((a, b) => b.span - a.span);
}
export const hh = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
