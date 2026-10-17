// Exam planning, as pure functions (no database) so it can be tested on its own:
//   1. scheduleExams  — date sheet: every paper group gets a day and a time slot with no student clash, at most
//                       maxPerDay papers per student per day, and enough exam seats in that slot.
//   2. allocateRooms  — for each slot, students go to rooms (papers may share a room; their students are interleaved).
//   3. assignInvigilators — every room in use gets invigilators, spreading duties evenly and never double-booking.
// A "group" is all sections of one course code: they sit the same paper at the same time.

export type Group = { key: string; courseIds: string[]; students: string[]; instructorIds: string[]; pinned?: { day: number; slot: number } | null };
export type Placement = { day: number; slot: number };
export type RoomIn = { id: string; seats: number };
export type RoomUse = { roomId: string; students: { studentId: string; courseId: string }[] };

/** Days available: from start to end, skipping off weekdays and holidays (YYYY-MM-DD). */
export function examDays(start: Date, end: Date, offDays: number[], holidays: Set<string>): Date[] {
  const out: Date[] = [];
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  while (d.getTime() <= last && out.length < 120) {
    const iso = d.toISOString().slice(0, 10);
    if (!offDays.includes(d.getUTCDay()) && !holidays.has(iso)) out.push(new Date(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function scheduleExams(groups: Group[], days: number, slots: number, maxPerDay: number, seatsPerSlot: number) {
  const placed = new Map<string, Placement>();
  const unplaced: { key: string; why: string }[] = [];
  const slotGroups = new Map<string, string[]>(); // "d:s" -> group keys
  const slotSeats = new Map<string, number>();
  const studentDay = new Map<string, number>(); // "student|day" -> papers
  const studentSlot = new Set<string>(); // "student|d:s"
  const byKey = new Map(groups.map((g) => [g.key, g]));

  // Which groups share students (cannot sit together).
  const studentsOf = new Map(groups.map((g) => [g.key, new Set(g.students)]));
  const conflicts = new Map<string, number>();
  const byStudent = new Map<string, string[]>();
  for (const g of groups) for (const s of g.students) byStudent.set(s, [...(byStudent.get(s) || []), g.key]);
  for (const g of groups) {
    const others = new Set<string>();
    for (const s of g.students) for (const k of byStudent.get(s) || []) if (k !== g.key) others.add(k);
    conflicts.set(g.key, others.size);
  }

  const put = (g: Group, p: Placement) => {
    const k = `${p.day}:${p.slot}`;
    placed.set(g.key, p);
    slotGroups.set(k, [...(slotGroups.get(k) || []), g.key]);
    slotSeats.set(k, (slotSeats.get(k) || 0) + g.students.length);
    for (const s of g.students) { studentDay.set(`${s}|${p.day}`, (studentDay.get(`${s}|${p.day}`) || 0) + 1); studentSlot.add(`${s}|${k}`); }
  };
  // Hand-placed papers first.
  for (const g of groups) if (g.pinned && g.pinned.day < days && g.pinned.slot < slots) put(g, g.pinned);

  const order = groups.filter((g) => !placed.has(g.key)).sort((a, b) => (conflicts.get(b.key)! - conflicts.get(a.key)!) || (b.students.length - a.students.length) || a.key.localeCompare(b.key));
  for (const g of order) {
    let best: { p: Placement; score: number } | null = null;
    let why = "no day/slot without a student clash";
    for (let d = 0; d < days; d++) {
      for (let s = 0; s < slots; s++) {
        const k = `${d}:${s}`;
        if (g.students.some((st) => studentSlot.has(`${st}|${k}`))) continue;
        if (g.students.some((st) => (studentDay.get(`${st}|${d}`) || 0) >= maxPerDay)) { why = `students would have more than ${maxPerDay} papers on a day`; continue; }
        if ((slotSeats.get(k) || 0) + g.students.length > seatsPerSlot) { why = "not enough exam seats in any free slot"; continue; }
        // Spread the load: fewer of this paper's students already sitting a paper that day, the day before or after, and emptier slots.
        let busy = 0;
        for (const st of g.students) busy += (studentDay.get(`${st}|${d}`) || 0) * 3 + (studentDay.get(`${st}|${d - 1}`) || 0) + (studentDay.get(`${st}|${d + 1}`) || 0);
        const score = busy / Math.max(1, g.students.length) + ((slotSeats.get(k) || 0) / Math.max(1, seatsPerSlot)) * 0.5 + d * 0.01 + s * 0.001;
        if (!best || score < best.score) best = { p: { day: d, slot: s }, score };
      }
    }
    if (best) put(g, best.p); else unplaced.push({ key: g.key, why });
  }
  void byKey; void studentsOf;
  return { placed, unplaced };
}

/** Fill the rooms of one slot. Each group's students go in roll order into rooms with free seats; rooms may be shared. */
export function allocateRooms(groupsInSlot: { courseId: string; students: string[] }[], rooms: RoomIn[]): { uses: RoomUse[]; short: number } {
  const free = rooms.filter((r) => r.seats > 0).sort((a, b) => b.seats - a.seats).map((r) => ({ ...r, left: r.seats, list: [] as { studentId: string; courseId: string }[] }));
  let short = 0;
  const sorted = [...groupsInSlot].sort((a, b) => b.students.length - a.students.length);
  for (const g of sorted) {
    for (const st of g.students) {
      const room = free.find((r) => r.left > 0);
      if (!room) { short++; continue; }
      room.list.push({ studentId: st, courseId: g.courseId }); room.left--;
    }
  }
  return { uses: free.filter((r) => r.list.length).map((r) => ({ roomId: r.id, students: r.list })), short };
}

/** Invigilators for every (slot, room) in use: fewest duties first, never two rooms at once, preferably not the
 * instructor of a paper being written in that room. */
export function assignInvigilators(slots: { key: string; rooms: { roomId: string; instructorIds: string[] }[] }[], pool: string[], perRoom: number, unavailable?: (slotKey: string) => Set<string>,
  prefs?: Map<string, { slots: Set<string>; maxPerDay: number }>) {
  const duties = new Map(pool.map((p) => [p, 0]));
  const perDay = new Map<string, number>(); // user|date -> duties that day
  const out = new Map<string, Map<string, string[]>>(); // slotKey -> roomId -> userIds
  let unfilled = 0;
  for (const s of slots) {
    const day = s.key.split(":")[0];
    const busy = new Set<string>(unavailable ? Array.from(unavailable(s.key)) : []);
    const m = new Map<string, string[]>();
    // A teacher's preferences: preferred slots first (soft), never more duties in a day than they asked for (hard, when given).
    const full = (p: string) => { const pr = prefs?.get(p); return !!pr && pr.maxPerDay > 0 && (perDay.get(`${p}|${day}`) || 0) >= pr.maxPerDay; };
    const pref = (p: string) => { const pr = prefs?.get(p); return pr && pr.slots.size ? (pr.slots.has(s.key) ? 0 : 0.6) : 0.3; };
    for (const r of s.rooms) {
      const pick: string[] = [];
      for (let i = 0; i < perRoom; i++) {
        const cand = pool.filter((p) => !busy.has(p) && !full(p)).sort((a, b) => (duties.get(a)! + pref(a) - duties.get(b)! - pref(b)) || (Number(r.instructorIds.includes(a)) - Number(r.instructorIds.includes(b))) || a.localeCompare(b));
        const p = cand[0];
        if (!p) { unfilled++; continue; }
        pick.push(p); busy.add(p); duties.set(p, duties.get(p)! + 1); perDay.set(`${p}|${day}`, (perDay.get(`${p}|${day}`) || 0) + 1);
      }
      m.set(r.roomId, pick);
    }
    out.set(s.key, m);
  }
  return { bySlot: out, duties, unfilled };
}

/** Seat numbers in a room: papers interleaved (A, B, A, B...) so neighbours write different papers where possible. */
export function seatOrder(students: { studentId: string; courseId: string; roll: string }[]) {
  const byCourse = new Map<string, typeof students>();
  for (const s of [...students].sort((a, b) => a.roll.localeCompare(b.roll))) byCourse.set(s.courseId, [...(byCourse.get(s.courseId) || []), s]);
  const lists = Array.from(byCourse.values()).sort((a, b) => b.length - a.length);
  const out: typeof students = [];
  for (let i = 0; out.length < students.length; i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out.map((s, i) => ({ ...s, seat: i + 1 }));
}
