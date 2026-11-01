import { test } from "node:test";
import assert from "node:assert/strict";
import { menuStatuses, groupStatus, linkFor, statusOf, workingDaysUntil } from "../lib/menuStatusCore";

const now = new Date("2026-11-02T08:00:00Z"); // Monday
test("working days skip the weekend", () => {
  assert.equal(workingDaysUntil(new Date("2026-11-04T10:00:00Z"), now), 2);
  assert.equal(workingDaysUntil(new Date("2026-11-09T10:00:00Z"), now), 5);
});
test("amber within N working days, red after the due date", () => {
  const t = { title: "Quiz 3 marks", href: "/instructor/courses/c1/marks", due: new Date("2026-11-04T10:00:00Z"), urgency: "normal" as const };
  assert.equal(statusOf(t, 3, now), "amber");
  assert.equal(statusOf(t, 1, now), "blue");
  assert.equal(statusOf(t, 3, new Date("2026-11-05T08:00:00Z")), "red");
});
test("a task attaches to the longest matching menu link", () => {
  assert.equal(linkFor("/approvals?kind=LEAVE", ["/approvals", "/dashboard"]), "/approvals");
  assert.equal(linkFor("/subjectexpert/courses/x/clos", ["/subjectexpert/courses", "/subjectexpert"]), "/subjectexpert/courses");
  assert.equal(linkFor("/nowhere", ["/approvals"]), null);
});
test("badge counts, worst status, waiting items left out, group heading takes the worst", () => {
  const tasks = [
    { title: "A", href: "/approvals?kind=X", urgency: "normal" as const },
    { title: "B", href: "/approvals", urgency: "overdue" as const },
    { title: "C", href: "/omc/queue", urgency: "soon" as const },
  ];
  const s = menuStatuses(tasks, ["/approvals", "/omc/queue"], 3, new Set(["B|/approvals"]), now);
  assert.deepEqual([s["/approvals"].status, s["/approvals"].count], ["blue", 1]);
  assert.equal(groupStatus(["/approvals", "/omc/queue"], s), "amber");
});
