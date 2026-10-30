// Teacher calendar rules with no database: Pakistan time (UTC+5, no daylight saving), free slots, what others may see,
// and the .ics invite. lib/teacherCalendar.ts feeds these with the timetable, counselling hours, blocks and bookings.

export const PK_MIN = 5 * 60;
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export type Privacy = "DETAILS" | "BUSY";
export type Kind = "CLASS" | "COUNSELLING" | "BLOCK" | "EXTERNAL" | "APPOINTMENT";
/** One busy stretch. start / end are epoch milliseconds. */
export type Item = { start: number; end: number; kind: Kind; label: string; privacy: Privacy; id?: string };
export type Settings = { slotMinutes: number; maxPerDay: number; startMin: number; endMin: number; days: number[]; classPrivacy: Privacy; counsellingPrivacy: Privacy; open: boolean };
export const DEFAULT_SETTINGS: Settings = { slotMinutes: 30, maxPerDay: 4, startMin: 9 * 60, endMin: 16 * 60, days: [1, 2, 3, 4, 5], classPrivacy: "DETAILS", counsellingPrivacy: "BUSY", open: true };

const pad = (n: number) => String(n).padStart(2, "0");
/** Local (Pakistan) date "YYYY-MM-DD", weekday and minute-of-day of an instant. */
export const localDay = (ms: number) => new Date(ms + PK_MIN * 60000).toISOString().slice(0, 10);
export const localDow = (ms: number) => new Date(ms + PK_MIN * 60000).getUTCDay();
export const localMin = (ms: number) => { const d = new Date(ms + PK_MIN * 60000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
/** The instant of a local date and minute-of-day. */
export const at = (day: string, min: number) => Date.parse(`${day}T00:00:00Z`) + (min - PK_MIN) * 60000;
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
export const dowOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
export const hm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
export const toMin = (s: unknown) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? "").trim()); if (!m) return null; const v = Number(m[1]) * 60 + Number(m[2]); return v >= 0 && v <= 24 * 60 ? v : null; };
/** Monday of the week containing a local date. */
export const mondayOf = (day: string) => addDays(day, -((dowOf(day) + 6) % 7));
export const whenText = (ms: number) => `${new Date(ms + PK_MIN * 60000).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} ${hm(localMin(ms))}`;

/** What someone other than the teacher sees: details only where the teacher allows them, otherwise just "Busy". */
export function forViewer(items: Item[], owner: boolean): Item[] {
  if (owner) return items;
  return items.map((i) => ({ start: i.start, end: i.end, kind: i.privacy === "DETAILS" ? i.kind : "BLOCK", label: i.privacy === "DETAILS" ? i.label : "Busy", privacy: i.privacy }));
}

/**
 * Bookable slots: on the teacher's appointment days, within their hours, of their slot length, not overlapping anything
 * busy, at least an hour from now, and only on days that still have room under the daily limit.
 */
export function freeSlots(s: Settings, busy: Item[], fromDay: string, days: number, now: number, bookedPerDay: Record<string, number> = {}) {
  const out: { start: number; end: number; day: string }[] = [];
  if (!s.open) return out;
  const len = Math.max(10, s.slotMinutes);
  for (let d = 0; d < days; d++) {
    const day = addDays(fromDay, d);
    if (!s.days.includes(dowOf(day))) continue;
    if ((bookedPerDay[day] || 0) >= s.maxPerDay) continue;
    for (let m = s.startMin; m + len <= s.endMin; m += len) {
      const start = at(day, m), end = start + len * 60000;
      if (start < now + 3600e3) continue;
      if (busy.some((b) => b.start < end && start < b.end)) continue;
      out.push({ start, end, day });
    }
  }
  return out;
}

/** Weekly items (classes, repeating blocks) laid out on each matching date of the range. */
export function expandWeekly<T extends { dow: number; startMin: number; endMin: number }>(rows: T[], fromDay: string, days: number, make: (r: T, start: number, end: number) => Item): Item[] {
  const out: Item[] = [];
  for (let d = 0; d < days; d++) {
    const day = addDays(fromDay, d), dow = dowOf(day);
    for (const r of rows) if (r.dow === dow && r.endMin > r.startMin) out.push(make(r, at(day, r.startMin), at(day, r.endMin)));
  }
  return out;
}

const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const fold = (line: string) => { const parts: string[] = []; let s = line; while (s.length > 74) { parts.push(s.slice(0, 74)); s = " " + s.slice(74); } parts.push(s); return parts.join("\r\n"); };
/** A calendar invite (.ics) for an accepted appointment. */
export function icsInvite(a: { id: string; start: number; end: number; title: string; description: string; location?: string | null; organizer: string; attendee: string; cancelled?: boolean }) {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OBEHUB//Appointments//EN", "CALSCALE:GREGORIAN", `METHOD:${a.cancelled ? "CANCEL" : "REQUEST"}`,
    "BEGIN:VEVENT", `UID:${a.id}@obehub`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(a.start)}`, `DTEND:${stamp(a.end)}`,
    `SUMMARY:${esc(a.title)}`, `DESCRIPTION:${esc(a.description)}`, ...(a.location ? [`LOCATION:${esc(a.location)}`] : []),
    `ORGANIZER;CN=${esc(a.organizer)}:noreply@obehub`, `ATTENDEE;CN=${esc(a.attendee)};ROLE=REQ-PARTICIPANT:noreply@obehub`,
    `STATUS:${a.cancelled ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
