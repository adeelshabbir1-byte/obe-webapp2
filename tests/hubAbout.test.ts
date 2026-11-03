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

import { CARD_TEXT } from "../lib/cardText";
test("every menu page has its own card line, starting with a verb, of card length", () => {
  const missing = Array.from(pages.keys()).filter((h) => !CARD_TEXT[h]);
  assert.deepEqual(missing, []);
  const bad = Object.entries(CARD_TEXT).filter(([, l]) => l.length < 20 || l.length > 100 || !/^[A-Z][a-z]+\b/.test(l)).map(([h]) => h);
  assert.deepEqual(bad, []);
});

import { iconsFor, hasRule } from "../lib/cardIcons";
import { hubsOf } from "../lib/hubMenu";
test("every card has a chosen icon, none repeated inside a group", () => {
  const noRule = Array.from(pages.entries()).filter(([h, l]) => !hasRule(h, l)).map(([h]) => h);
  assert.deepEqual(noRule, []);
  for (const r of ROLES) for (const [, groups] of hubsOf(navForRole(r) as { href: string; label: string }[])) for (const g of groups) {
    const icons = Array.from(iconsFor(g.links).values());
    assert.equal(new Set(icons).size, icons.length, `${r} ${g.title}`);
  }
});
test("no group is a dumping ground", () => {
  for (const r of ROLES) for (const [hub, groups] of hubsOf(navForRole(r) as { href: string; label: string }[])) for (const g of groups) assert.ok(g.links.length <= 18, `${r} ${hub} ${g.title}: ${g.links.length} cards`);
});
