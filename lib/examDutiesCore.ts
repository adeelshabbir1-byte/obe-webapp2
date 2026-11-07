// Queue item 17, pure (tested in tests/examDuties.test.ts): duty codes, quotas, room layouts and the invigilator
// assignment with personal preferences, official work, reduced load, history and the "two in a row" limit.

export type Layout = { rows: number; cols: number; blocked: number };
export const layoutSeats = (l: Layout) => Math.max(0, l.rows * l.cols - (l.blocked || 0));
/** Seat label in a room: row-major, R3-S5. */
export const seatLabel = (i: number, cols: number) => `R${Math.floor(i / Math.max(1, cols)) + 1}-S${(i % Math.max(1, cols)) + 1}`;
/** Duty code: D{day},{slot}, 1-based (D1,1 = day 1 slot 1). */
export const dutyCode = (dayIndex: number, slot: number) => `D${dayIndex + 1},${slot + 1}`;
/** Invigilators a room needs: one per N students, at least one (N = 0 keeps the fixed number). */
export const neededFor = (students: number, perN: number, fixed: number) => (perN > 0 ? Math.max(1, Math.ceil(students / perN)) : Math.max(1, fixed));

/** How many duties each person must take: people with a set (reduced) quota keep it; the rest share what is left evenly. */
export function quotas(total: number, pool: string[], reduced: Map<string, number>) {
  const fixedSum = pool.reduce((a, p) => a + (reduced.has(p) ? Math.max(0, reduced.get(p)!) : 0), 0);
  const free = pool.filter((p) => !reduced.has(p));
  const each = free.length ? Math.ceil(Math.max(0, total - fixedSum) / free.length) : 0;
  return new Map(pool.map((p) => [p, reduced.has(p) ? Math.max(0, reduced.get(p)!) : each]));
}

export type Pref = { days?: string[]; maxDays?: number; perDay?: number; time?: "LAST" | "MORNING" | "ANY"; unavailable?: string[]; slots?: string[] };
export type DutySlot = { key: string; date: string; slot: number; slotsInDay: number; rooms: { roomId: string; need: number; teachers: string[]; female?: boolean; building?: string }[]; reserves: number };
export type DutyOpts = {
  prefs: Map<string, Pref>; quota: Map<string, number>; history: Map<string, number>; blocked: (userId: string, slotKey: string) => string | null;
  /** Women invigilators (FacultyProfile.gender); a room marked for women gets at least one when anyone is free. */
  female?: Set<string>;
};
export type Bent = { userId: string; slotKey: string; why: string };

/** Fills every room (and the reserves) of every slot. Hard: free (not blocked: leave, official work, own class, not
 * available), not two rooms at once, never more than two duties in a row, at most the person's daily limit, never the
 * only invigilator in a room with their own course. Soft, in order: fewest duties (with past sessions), under quota,
 * preferred days / slots, the time of day asked for, keeping to as few days as asked. */
export function assignDuties(slots: DutySlot[], pool: string[], o: DutyOpts) {
  const done = new Map(pool.map((p) => [p, 0]));
  const dayCount = new Map<string, number>(); const daysUsed = new Map<string, Set<string>>(); const slotOf = new Map<string, Set<string>>(); // user|date -> slots
  const out = new Map<string, Map<string, string[]>>(); const bent: Bent[] = []; let unfilled = 0;
  const load = (p: string) => (done.get(p) || 0) + (o.history.get(p) || 0) * 0.5;
  const bldOf = new Map<string, Set<string>>(); // user|date -> buildings already given that day
  const score = (p: string, s: DutySlot, building?: string) => {
    const pr = o.prefs.get(p) || {}; let x = load(p) * 10;
    const b = bldOf.get(`${p}|${s.date}`); if (building && b?.size && !b.has(building)) x += 5; // same building the whole day
    if ((done.get(p) || 0) >= (o.quota.get(p) ?? Infinity)) x += 40;
    if (pr.days?.length && !pr.days.includes(s.date)) x += 6;
    if (pr.slots?.length && !pr.slots.includes(s.key)) x += 3;
    if (pr.time === "LAST" && s.slot < s.slotsInDay - 1) x += 4;
    if (pr.time === "MORNING" && s.slot > 0) x += 4;
    const used = daysUsed.get(p) || new Set<string>();
    if (pr.maxDays && !used.has(s.date)) x += used.size >= pr.maxDays ? 20 : 2; else if (pr.maxDays && used.has(s.date)) x -= 2;
    return x;
  };
  const free = (p: string, s: DutySlot, taken: Set<string>) => {
    if (taken.has(p)) return false;
    if (o.blocked(p, s.key)) return false;
    const pr = o.prefs.get(p) || {};
    if (pr.unavailable?.includes(s.date)) return false;
    if ((dayCount.get(`${p}|${s.date}`) || 0) >= (pr.perDay || 3)) return false;
    const mine = slotOf.get(`${p}|${s.date}`) || new Set<string>();
    if (mine.has(String(s.slot - 1)) && mine.has(String(s.slot - 2))) return false; // a third in a row
    return true;
  };
  const take = (p: string, s: DutySlot, building?: string) => {
    if (building) bldOf.set(`${p}|${s.date}`, new Set([...(bldOf.get(`${p}|${s.date}`) || []), building]));
    done.set(p, (done.get(p) || 0) + 1); dayCount.set(`${p}|${s.date}`, (dayCount.get(`${p}|${s.date}`) || 0) + 1);
    daysUsed.set(p, new Set([...(daysUsed.get(p) || []), s.date])); slotOf.set(`${p}|${s.date}`, new Set([...(slotOf.get(`${p}|${s.date}`) || []), String(s.slot)]));
  };
  for (const s of slots) {
    const taken = new Set<string>(); const m = new Map<string, string[]>();
    const rooms: DutySlot["rooms"] = [...s.rooms, ...Array.from({ length: s.reserves }, (_, i) => ({ roomId: `RESERVE-${i + 1}`, need: 1, teachers: [] as string[] }))];
    for (const r of rooms) {
      const pick: string[] = [];
      for (let i = 0; i < r.need; i++) {
        const sole = r.need - pick.length === 1 && pick.length === 0;
        const needWoman = !!r.female && !!o.female && !pick.some((x) => o.female!.has(x)) && (i === r.need - 1 || i === 0);
        let cands = pool.filter((p) => free(p, s, taken) && !(sole && r.teachers.includes(p))).sort((a, b) => score(a, s, r.building) - score(b, s, r.building) || a.localeCompare(b));
        if (needWoman) { const w = cands.filter((p) => o.female!.has(p)); if (w.length) cands = w; else if (i === r.need - 1) bent.push({ userId: "", slotKey: s.key, why: `no woman invigilator free for ${r.roomId}` }); }
        let p = cands[0];
        if (!p) { const own = pool.filter((q) => free(q, s, taken)).sort((a, b) => score(a, s) - score(b, s))[0]; if (own) { p = own; bent.push({ userId: own, slotKey: s.key, why: "only free person teaches a paper in this room" }); } }
        if (!p) { unfilled++; continue; }
        const pr = o.prefs.get(p) || {};
        if (pr.days?.length && !pr.days.includes(s.date)) bent.push({ userId: p, slotKey: s.key, why: "not one of the days asked for" });
        else if (pr.time === "LAST" && s.slot < s.slotsInDay - 1) bent.push({ userId: p, slotKey: s.key, why: "not the last slot asked for" });
        pick.push(p); taken.add(p); take(p, s, r.building);
      }
      m.set(r.roomId, pick);
    }
    out.set(s.key, m);
  }
  return { bySlot: out, done, bent, unfilled };
}

/** The extra date-sheet rules (queue item 17.4), checked for one paper on one day. */
export type DayRules = { batchClash: boolean; coreCore: number; carried: number };
export function dayRules(group: { batches: string[]; core: boolean; students: string[] }, sameDay: { batches: string[]; core: boolean; students: Set<string> }[], carriedOf: (student: string) => boolean): DayRules {
  const batchClash = sameDay.some((g) => g.batches.some((b) => group.batches.includes(b)));
  let coreCore = 0, carried = 0;
  for (const st of group.students) for (const g of sameDay) if (g.students.has(st)) { if (group.core && g.core) coreCore++; if (carriedOf(st)) carried++; }
  return { batchClash, coreCore, carried };
}
