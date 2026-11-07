import { test } from "node:test";
import assert from "node:assert/strict";
import { moveDue, personalDaysUntil, parseDays } from "../lib/workDaysCore";

const at = (iso: string) => new Date(`${iso}T12:00:00+05:00`);
test("a deadline on a person's off day moves to their next working day (item 22)", () => {
  const weekend = { days: [5, 6, 0], off: new Set<string>() }; // Fri, Sat, Sun
  const r = moveDue(at("2026-11-10"), weekend); // Tuesday
  assert.ok(r.from);
  assert.equal(new Date(r.due.getTime() + 5 * 3600e3).toISOString().slice(0, 10), "2026-11-13"); // Friday
  assert.equal(moveDue(at("2026-11-14"), weekend).from, null); // Saturday is a working day for them
});
test("holidays, leave and fixed dates", () => {
  const week = { days: [1, 2, 3, 4, 5], off: new Set(["2026-11-09"]) };
  assert.equal(new Date(moveDue(at("2026-11-09"), week).due.getTime() + 5 * 3600e3).toISOString().slice(0, 10), "2026-11-10");
  assert.equal(moveDue(at("2026-11-09"), week, true).from, null);
  assert.equal(personalDaysUntil(at("2026-11-13"), week, at("2026-11-07")), 3);
  assert.deepEqual(parseDays("5,6,0"), [0, 5, 6]);
  assert.deepEqual(parseDays(""), [1, 2, 3, 4, 5]);
});
