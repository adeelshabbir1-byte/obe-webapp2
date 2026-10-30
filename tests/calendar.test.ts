import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, at, forViewer, freeSlots, icsInvite, localDay, localMin, mondayOf, type Item } from "../lib/calendarCore";

// Prompt 10 B: teacher calendar — free slots, the daily limit, privacy of busy times, and the .ics invite.
const DAY = "2030-01-07"; // a Monday
const now = at("2030-01-01", 0);

test("Pakistan time: 10:00 local is 05:00 UTC, and the week starts on Monday", () => {
  assert.equal(new Date(at(DAY, 600)).toISOString(), "2030-01-07T05:00:00.000Z");
  assert.equal(localDay(at(DAY, 600)), DAY);
  assert.equal(localMin(at(DAY, 600)), 600);
  assert.equal(mondayOf("2030-01-10"), DAY);
});

test("free slots skip classes and blocks, and a booked slot is no longer free", () => {
  const busy: Item[] = [{ start: at(DAY, 600), end: at(DAY, 690), kind: "CLASS", label: "CS-101 A · Room 1", privacy: "DETAILS" }];
  const free = freeSlots(DEFAULT_SETTINGS, busy, DAY, 1, now);
  const times = free.map((f) => localMin(f.start));
  assert.ok(times.includes(540) && times.includes(570), "09:00 and 09:30 are free");
  assert.ok(!times.includes(600) && !times.includes(630) && !times.includes(660), "the class 10:00–11:30 is not");
  assert.ok(times.includes(690), "11:30 is free again");
  // Booking 11:30 (it becomes a pending appointment, which is busy) takes it out of the free list.
  const booked = [...busy, { start: at(DAY, 690), end: at(DAY, 720), kind: "APPOINTMENT" as const, label: "x", privacy: "BUSY" as const }];
  assert.ok(!freeSlots(DEFAULT_SETTINGS, booked, DAY, 1, now).some((f) => localMin(f.start) === 690));
});

test("the daily limit and the appointment days are respected; closed means no slots", () => {
  assert.equal(freeSlots({ ...DEFAULT_SETTINGS, maxPerDay: 2 }, [], DAY, 1, now, { [DAY]: 2 }).length, 0);
  assert.equal(freeSlots(DEFAULT_SETTINGS, [], "2030-01-06", 1, now).length, 0, "Sunday is not an appointment day");
  assert.equal(freeSlots({ ...DEFAULT_SETTINGS, open: false }, [], DAY, 1, now).length, 0);
  assert.equal(freeSlots({ ...DEFAULT_SETTINGS, slotMinutes: 60 }, [], DAY, 1, now).length, 7, "09:00–16:00 in hours");
  assert.equal(freeSlots(DEFAULT_SETTINGS, [], DAY, 1, at(DAY, 600)).filter((f) => f.start < at(DAY, 660)).length, 0, "nothing within the next hour");
});

test("a Busy-only block hides its details from others; the teacher still sees them", () => {
  const items: Item[] = [
    { start: at(DAY, 780), end: at(DAY, 840), kind: "BLOCK", label: "Doctor's appointment", privacy: "BUSY", id: "b1" },
    { start: at(DAY, 600), end: at(DAY, 690), kind: "CLASS", label: "CS-101 A · Room 1", privacy: "DETAILS" },
  ];
  const other = forViewer(items, false);
  assert.equal(other[0].label, "Busy");
  assert.ok(!JSON.stringify(other).includes("Doctor"));
  assert.equal(other[0].id, undefined);
  assert.equal(other[1].label, "CS-101 A · Room 1");
  assert.equal(forViewer(items, true)[0].label, "Doctor's appointment");
});

test(".ics invite has the times in UTC and escapes text", () => {
  const ics = icsInvite({ id: "abc", start: at(DAY, 600), end: at(DAY, 630), title: "Appointment: A and B", description: "Discuss marks; quiz, too", organizer: "A", attendee: "B" });
  assert.match(ics, /DTSTART:20300107T050000Z/);
  assert.match(ics, /DTEND:20300107T053000Z/);
  assert.match(ics, /DESCRIPTION:Discuss marks\\; quiz\\, too/);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
});
