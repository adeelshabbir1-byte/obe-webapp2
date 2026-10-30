// Smart scheduling, rescheduling and visiting-faculty rules, with no database.
//  · Free slots: for chosen batches, the times with no class; or every time ranked by how few classes it would move.
//  · A reschedule goes to the Chairman / Dean first, then (provisionally approved) to the Program Lead and the teacher.
//    A visiting teacher must confirm the new slot himself; if he can't, the reschedule is blocked and the organiser
//    picks another slot.
//  · Hard blackouts: no class may be moved into the last week of the semester or the week before the midterms.
//  · Force majeure: a declared campus closure moves every class of the day to a make-up slot, without the consent chain.

export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export type ClassSlot = { entryId: string; courseId: string; code: string; batchIds: string[]; day: string; start: number; end: number; instructorId: string | null }; // hours, e.g. 8.5
export const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

/** Each candidate time (weekday, start hour) with the classes of these batches it would clash with — fewest first. */
export function rankSlots(classes: ClassSlot[], batchIds: string[], o: { days?: string[]; from?: number; to?: number; length?: number; step?: number } = {}) {
  const days = o.days || ["Mon", "Tue", "Wed", "Thu", "Fri"], from = o.from ?? 8, to = o.to ?? 17, len = o.length ?? 1, step = o.step ?? 0.5;
  const mine = classes.filter((c) => c.batchIds.some((b) => batchIds.includes(b)));
  const out: { day: string; start: number; end: number; affected: ClassSlot[] }[] = [];
  for (const day of days) for (let s = from; s + len <= to + 1e-9; s += step) {
    const slot = { start: s, end: s + len };
    out.push({ day, start: s, end: s + len, affected: mine.filter((c) => c.day === day && overlaps(c, slot)) });
  }
  return out.sort((a, b) => a.affected.length - b.affected.length || days.indexOf(a.day) - days.indexOf(b.day) || a.start - b.start);
}
export const freeSlots = (classes: ClassSlot[], batchIds: string[], o?: Parameters<typeof rankSlots>[2]) => rankSlots(classes, batchIds, o).filter((s) => !s.affected.length);

// ---- blackout windows
export type SemesterDates = { semesterStart: Date | null; midtermStart: Date | null; finalStart: Date | null };
const DAY_MS = 864e5;
const d0 = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).getTime();
/** Why a date can't take a moved class, or null: the week before the midterms; the last week of the semester (the week before the finals). */
export function blackout(date: Date, s: SemesterDates) {
  const t = d0(date);
  if (s.midtermStart && t >= d0(s.midtermStart) - 7 * DAY_MS && t < d0(s.midtermStart)) return "the week before the midterms";
  if (s.finalStart && t >= d0(s.finalStart) - 7 * DAY_MS && t < d0(s.finalStart)) return "the last week of the semester";
  return null;
}

// ---- the request's path
export type Status = "PENDING_DEAN" | "PROVISIONAL" | "APPROVED" | "REJECTED" | "BLOCKED";
export type Req = { status: Status; visiting: boolean; plOk: boolean | null; facultyOk: boolean | null };
/** One decision on a request → its new state. */
export function decide(r: Req, who: "DEAN" | "PL" | "FACULTY", ok: boolean): Req & { message: string } {
  if (r.status === "PENDING_DEAN") {
    if (who !== "DEAN") throw new Error("The Chairman / Dean reviews it first.");
    return ok ? { ...r, status: "PROVISIONAL", message: "Provisionally approved — sent to the Program Lead and the teacher." } : { ...r, status: "REJECTED", message: "Rejected by the Chairman / Dean." };
  }
  if (r.status !== "PROVISIONAL") throw new Error("This request is closed.");
  if (who === "DEAN") throw new Error("Waiting for the Program Lead and the teacher.");
  const n = { ...r, ...(who === "PL" ? { plOk: ok } : { facultyOk: ok }) };
  if (who === "FACULTY" && !ok) return r.visiting
    ? { ...n, status: "BLOCKED", message: "The visiting teacher is not available at the new time — the reschedule is blocked. Choose another slot." }
    : { ...n, status: "REJECTED", message: "The teacher declined the new time." };
  if (who === "PL" && !ok) return { ...n, status: "REJECTED", message: "The Program Lead declined." };
  if (n.plOk && n.facultyOk) return { ...n, status: "APPROVED", message: "Approved — the class moves to the new time." };
  return { ...n, status: "PROVISIONAL", message: who === "PL" ? "Program Lead agreed; waiting for the teacher." : "Teacher confirmed; waiting for the Program Lead." };
}

/** Force majeure: each class of a closed day gets the first make-up slot (in the next two weeks) free for its batches and teacher. */
export function makeupSlots(closedDate: Date, onDay: ClassSlot[], all: ClassSlot[], s: SemesterDates, taken: { date: string; start: number; end: number; batchIds: string[]; instructorId: string | null }[] = []) {
  const plan: { entryId: string; date: string; start: number; end: number }[] = [], unplaced: string[] = [];
  const used = [...taken];
  for (const c of onDay) {
    let done = false;
    for (let k = 1; k <= 14 && !done; k++) {
      const day = new Date(d0(closedDate) + k * DAY_MS);
      const dn = DAYS[day.getUTCDay()];
      if (dn === "Sat" || dn === "Sun" || blackout(day, s)) continue;
      const iso = day.toISOString().slice(0, 10), len = c.end - c.start;
      for (let st = 8; st + len <= 17 + 1e-9 && !done; st += 0.5) {
        const slot = { start: st, end: st + len };
        const clash = all.some((x) => x.day === dn && overlaps(x, slot) && (x.batchIds.some((b) => c.batchIds.includes(b)) || (c.instructorId && x.instructorId === c.instructorId)))
          || used.some((u) => u.date === iso && overlaps(u, slot) && (u.batchIds.some((b) => c.batchIds.includes(b)) || (c.instructorId && u.instructorId === c.instructorId)));
        if (clash) continue;
        plan.push({ entryId: c.entryId, date: iso, start: st, end: st + len });
        used.push({ date: iso, start: st, end: st + len, batchIds: c.batchIds, instructorId: c.instructorId });
        done = true;
      }
    }
    if (!done) unplaced.push(c.code);
  }
  return { plan, unplaced };
}
/** Events planned before the timetable is published hold their slot: classes that would clash are flagged. */
export function eventConflicts(events: { id: string; title: string; day: string; start: number; end: number; batchIds: string[] }[], classes: ClassSlot[]) {
  return events.flatMap((e) => classes.filter((c) => c.day === e.day && overlaps(c, e) && (!e.batchIds.length || c.batchIds.some((b) => e.batchIds.includes(b)))).map((c) => ({ eventId: e.id, event: e.title, code: c.code, day: c.day, start: c.start, end: c.end })));
}
export const hh = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
