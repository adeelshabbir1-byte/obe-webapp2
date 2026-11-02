import { test } from "node:test";
import assert from "node:assert/strict";
import { navForRole } from "../components/reportNav";
import { BUILTIN_ARTICLES } from "../lib/help/content";
import { aboutPages } from "../lib/hubAbout";

const ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "PROGRAM_LEAD", "DEPARTMENT_COORDINATOR", "SUBJECT_EXPERT", "INSTRUCTOR", "OMC", "COURSE_ASSIGNER", "LAB_ENGINEER", "LAB_MANAGER", "LIBRARIAN", "FINANCE_OFFICER", "STUDENT_AFFAIRS", "FACILITIES_MANAGER", "SUPER_USER"];
const about = aboutPages(BUILTIN_ARTICLES as never);
const pages = new Map<string, string>();
for (const r of ROLES) for (const l of navForRole(r) as { href: string; label: string }[]) pages.set(l.href, l.label);

test("every menu page has its own one-line purpose", () => {
  const missing = Array.from(pages.keys()).filter((h) => !about[h]);
  assert.deepEqual(missing, []);
});
test("no two menu pages show the same line", () => {
  const seen = new Map<string, string>(); const dup: string[] = [];
  for (const h of pages.keys()) { const l = about[h]; const o = seen.get(l); if (o) dup.push(`${o} = ${h}: ${l}`); else seen.set(l, h); }
  assert.deepEqual(dup, []);
});
test("Import Course Content describes importing, not equivalence", () => {
  assert.match(about["/omc/import-content"], /Copy CLOs/);
  assert.doesNotMatch(about["/omc/import-content"], /Equivalence/i);
});
