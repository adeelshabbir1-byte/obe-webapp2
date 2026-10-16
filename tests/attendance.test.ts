import { test } from "node:test";
import assert from "node:assert/strict";
import { checkClaim, checkToken, distanceM, issueClaim, issueToken, networkKeyOf, newSessionKey, tokenSessionId, windowAt } from "../lib/attendanceToken";
import { DEFAULT_POLICY, percentage, phaseOf, standing, tally, type AttendancePolicy } from "../lib/attendance";

const start = new Date("2026-10-16T09:00:00Z");
const session = { id: "cmabcdefghijklmnopqrstuvw", keyHex: newSessionKey(), startedAt: start, rotateSeconds: 12 };
const at = (s: number) => start.getTime() + s * 1000;

// ------------------------------------------------------------------------------------------------ the rotating token
test("a token works in its window and the next one, then expires", () => {
  const t0 = issueToken(session, windowAt(start, 12, at(5)));
  assert.deepEqual(checkToken(t0, session, at(5)), { ok: true, window: 0 });
  assert.equal(checkToken(t0, session, at(20)).ok, true, "one window of grace for slow scans");
  assert.deepEqual(checkToken(t0, session, at(25)), { ok: false, reason: "EXPIRED" });
  assert.equal(tokenSessionId(t0), session.id);
});

test("tokens change every window and can't be forged, moved or pre-made", () => {
  const a = issueToken(session, 3), b = issueToken(session, 3);
  assert.notEqual(a, b, "random nonce: even the same window gives a different code");
  const flipped = a.slice(0, -2) + (a.endsWith("A") ? "BB" : "AA");
  assert.deepEqual(checkToken(flipped, session, at(40)), { ok: false, reason: "INVALID" });
  const other = { ...session, keyHex: newSessionKey() };
  assert.deepEqual(checkToken(a, other, at(40)), { ok: false, reason: "INVALID" }, "another session's key");
  const moved = { ...session, id: "cmzzzzzzzzzzzzzzzzzzzzzzz" };
  assert.deepEqual(checkToken(a.replace(session.id, moved.id), moved, at(40)), { ok: false, reason: "INVALID" }, "the session id is authenticated");
  assert.deepEqual(checkToken(issueToken(session, 10), session, at(40)), { ok: false, reason: "INVALID" }, "a future window is refused");
  assert.equal(tokenSessionId("not a token"), null);
  assert.equal(tokenSessionId(`${session.id}.short`), null);
});

test("a scan claim lasts two minutes and only on the device that scanned", () => {
  const c = issueClaim(session, "device-a", at(10));
  assert.equal(checkClaim(c, session, "device-a", at(100)), at(10));
  assert.equal(checkClaim(c, session, "device-b", at(100)), null, "forwarded to another phone");
  assert.equal(checkClaim(c, session, "device-a", at(10 + 121)), null, "too old");
  assert.equal(checkClaim(c.replace(String(at(10)), String(at(50))), session, "device-a", at(60)), null, "a changed scan time breaks the signature");
  assert.equal(checkClaim(c, { ...session, keyHex: newSessionKey() }, "device-a", at(20)), null);
});

test("network and distance checks", () => {
  assert.equal(networkKeyOf("203.0.113.57"), "203.0.113");
  assert.equal(networkKeyOf("203.0.113.9, 10.0.0.1"), "203.0.113", "the first address of x-forwarded-for");
  assert.equal(networkKeyOf("::ffff:198.51.100.4"), "198.51.100");
  assert.equal(networkKeyOf("2001:db8:abcd:12:1:2:3:4"), "2001:db8:abcd:12");
  assert.equal(networkKeyOf(""), null);
  const lahore = { lat: 31.5204, lng: 74.3587 };
  assert.equal(distanceM(lahore, lahore), 0);
  const d = distanceM(lahore, { lat: 31.5213, lng: 74.3587 });
  assert.ok(d > 90 && d < 110, `about 100 m, got ${d}`);
});

// ------------------------------------------------------------------------------------------------ percentages and standing
test("late counts as attended by default; the OMC can count it as absent", () => {
  const t = tally(["PRESENT", "LATE", "ABSENT", "PRESENT"]);
  assert.deepEqual(t, { present: 2, late: 1, absent: 1, excused: 0, marked: 4 });
  assert.equal(percentage(t, DEFAULT_POLICY), 75);
  assert.equal(percentage(t, { ...DEFAULT_POLICY, lateCountsPresent: false }), 50);
});

test("excused leave counts against the student unless the OMC leaves it out (the original rule is the default)", () => {
  const t = tally(["PRESENT", "PRESENT", "PRESENT", "LEAVE"]);
  assert.equal(percentage(t, DEFAULT_POLICY), 75, "same as before this change: present / marked");
  assert.equal(percentage(t, { ...DEFAULT_POLICY, excusedExcluded: true }), 100);
  assert.equal(percentage(tally(["LEAVE"]), { ...DEFAULT_POLICY, excusedExcluded: true }), null, "nothing left to count");
  assert.equal(percentage(tally([]), DEFAULT_POLICY), null);
  assert.equal(tally(["WHATEVER"]).marked, 0, "unknown statuses are ignored");
});

test("standing: on track, close to the minimum, below it, and past recovery", () => {
  const p: AttendancePolicy = { ...DEFAULT_POLICY, minPct: 75, warnMarginPct: 5 };
  const of = (present: number, absent: number) => tally([...Array(present).fill("PRESENT"), ...Array(absent).fill("ABSENT")]);
  assert.equal(standing(of(9, 1), p, 20).standing, "OK");
  assert.equal(standing(of(39, 11), p, 0).standing, "AT_RISK", "78%: within 5% of 75");
  const short = standing(of(7, 3), p, 20);
  assert.equal(short.standing, "SHORT", "70% now, but 20 lectures still to come");
  assert.equal(short.best, 90);
  const lost = standing(of(5, 10), p, 3);
  assert.equal(lost.standing, "CANNOT_RECOVER", "even 3 more out of 3 leaves 8/18");
  assert.equal(lost.canMiss, 0);
  assert.equal(standing(tally([]), p, 30).standing, "NONE");
});

test("how many remaining lectures can still be missed", () => {
  const p = { ...DEFAULT_POLICY, minPct: 75 };
  // 10 of 10 so far, 20 to go: finishing at ≥ 75% of 30 needs 23 attended, so 7 may be missed.
  assert.equal(standing(tally(Array(10).fill("PRESENT")), p, 20).canMiss, 7);
  assert.equal(standing(tally(Array(10).fill("PRESENT")), p, 0).canMiss, 0);
});

// ------------------------------------------------------------------------------------------------ session phases
test("present for the first minutes, late until closing, then closed", () => {
  const s = { id: "x", status: "OPEN", startedAt: start, closesAt: new Date(at(25 * 60)), presentMinutes: 10, lateMinutes: 25 };
  assert.equal(phaseOf(s, at(0)), "PRESENT");
  assert.equal(phaseOf(s, at(10 * 60 - 1)), "PRESENT");
  assert.equal(phaseOf(s, at(10 * 60)), "LATE");
  assert.equal(phaseOf(s, at(25 * 60)), "CLOSED");
  assert.equal(phaseOf({ ...s, status: "CLOSED" }, at(60)), "CLOSED", "closed early by the instructor");
});
