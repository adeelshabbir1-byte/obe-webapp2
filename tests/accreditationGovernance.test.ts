import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { BODY_KEYS, inferBody, isBody } from "../lib/accreditation/bodyInfer";
import { DEFAULT_STANDARDS, STANDARD_FIELDS } from "../lib/accreditation/bodies";
import { ASSIGNABLE_ROLES, CATALOGUE, groupOf, taskDef } from "../lib/accreditation/catalogue";
import { accessWindow, canWorkOn, taskProgress } from "../lib/accreditation/governance";
import { handlesSource } from "../lib/accreditation/sources";
import { NCEAC_DEFAULTS } from "../lib/readiness";
import { KINDS, SECTIONS } from "../lib/sarRegistry";

const ROOT = path.join(__dirname, "..");

// ------------------------------------------------------------------------------------------------ which council
test("programs are read to the right council from their names", () => {
  for (const p of ["BS Computer Science", "BS Software Engineering", "BS Artificial Intelligence", "BS Data Science", "BS Cyber Security", "BS Information Technology", "MS Computer Science", "BSCS"])
    assert.equal(inferBody(p), "NCEAC", p);
  for (const p of ["BBA", "BBA (Hons)", "MBA", "Executive MBA", "BS Accounting & Finance", "BS Management Sciences", "MS Business Administration"])
    assert.equal(inferBody(p), "NBEAC", p);
  for (const p of ["BS Mathematics", "BS Physics", "BS Economics", "BS English", "BS Biotechnology", "BS Psychology"])
    assert.equal(inferBody(p), "HEC", p);
});

test("only the four councils are accepted", () => {
  assert.deepEqual([...BODY_KEYS].sort(), ["HEC", "NBEAC", "NCEAC", "PEC"]);
  for (const b of BODY_KEYS) assert.ok(isBody(b));
  for (const b of ["", "nceac", "pec", "ABET", null, undefined, 3]) assert.ok(!isBody(b as unknown as string), String(b));
});

// ------------------------------------------------------------------------------------------------ standards
test("NCEAC's default thresholds are the ones readiness always used, so scores don't move", () => {
  for (const [k, v] of Object.entries(NCEAC_DEFAULTS)) assert.equal((DEFAULT_STANDARDS.NCEAC as Record<string, unknown>)[k], v, k);
});

test("every council's defaults sit inside the limits the form allows", () => {
  for (const b of BODY_KEYS) for (const f of STANDARD_FIELDS) {
    const v = (DEFAULT_STANDARDS[b] as Record<string, unknown>)[f.key];
    if (v === null) { assert.ok(f.nullable, `${b} ${f.key} is empty but required`); continue; }
    assert.equal(typeof v, "number", `${b} ${f.key}`);
    assert.ok((v as number) >= f.min && (v as number) <= f.max, `${b} ${f.key}=${v} outside ${f.min}–${f.max}`);
  }
  // Pass marks default to the institute's own Passing Criteria.
  for (const b of BODY_KEYS) { assert.equal(DEFAULT_STANDARDS[b].cloPassPct, null); assert.equal(DEFAULT_STANDARDS[b].ploPassPct, null); }
});

// ------------------------------------------------------------------------------------------------ the task catalogue
function pageRoutes(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (e.name !== "api") walk(path.join(dir, e.name)); }
      else if (e.name === "page.tsx") out.push("/" + path.relative(path.join(ROOT, "app"), dir).split(path.sep).join("/"));
    }
  };
  walk(path.join(ROOT, "app"));
  return out;
}

test("each council's catalogue is whole: unique codes, known groups, every group has work", () => {
  for (const b of BODY_KEYS) {
    const { groups, tasks } = CATALOGUE[b];
    assert.equal(new Set(tasks.map((t) => t.code)).size, tasks.length, `${b} duplicate code`);
    assert.equal(new Set(groups.map((g) => g.key)).size, groups.length, `${b} duplicate group`);
    for (const t of tasks) {
      assert.ok(groupOf(b, t.group), `${b} ${t.code} has unknown group ${t.group}`);
      assert.ok(t.code.startsWith(t.group + "."), `${b} ${t.code} not numbered under ${t.group}`);
      assert.equal(taskDef(b, t.code), t);
      assert.ok(t.title.length > 5 && t.purpose.length > 30, `${b} ${t.code} needs a title and purpose`);
      assert.ok(t.checklist.length > 0, `${b} ${t.code} has nothing to confirm`);
      assert.ok(t.sources.length > 0, `${b} ${t.code} fills nothing in`);
      for (const s of t.sources) assert.ok(handlesSource(s), `${b} ${t.code} source ${s} isn't wired`);
      for (const r of t.suggested) assert.ok(ASSIGNABLE_ROLES.includes(r), `${b} ${t.code} suggests ${r}, who can't be assigned`);
    }
    for (const g of groups) assert.ok(tasks.some((t) => t.group === g.key), `${b} group ${g.key} has no task`);
  }
  // The examples the institute asked for exist.
  assert.match(taskDef("NCEAC", "5.1")!.title, /Faculty Qualification Register/i);
  assert.match(taskDef("NCEAC", "3.2")!.title, /Course File Audit/i);
  assert.ok(CATALOGUE.NBEAC.tasks.some((t) => /Alumni/i.test(t.title)));
});

test("a task of one council is never found under another", () => {
  for (const b of BODY_KEYS) for (const t of CATALOGUE[b].tasks) for (const o of BODY_KEYS) {
    if (o === b) continue;
    const same = taskDef(o, t.code);
    if (same) assert.notEqual(same, t, `${b} ${t.code} leaks into ${o}`);
  }
  assert.equal(taskDef("ABET", "1.1"), null);
});

test("councils use their own frameworks: NCEAC criteria, NBEAC SAR forms and registers", () => {
  for (const t of CATALOGUE.NCEAC.tasks) {
    // A task that counts NCEAC's readiness checks names its own criterion.
    if (t.sources.includes("readiness")) assert.equal(String(t.criterion), t.group, `NCEAC ${t.code} criterion`);
    if (t.criterion !== undefined) assert.ok(t.criterion >= 1 && t.criterion <= 9, `NCEAC ${t.code} criterion`);
    if (t.evidenceCriterion !== undefined) assert.ok(t.evidenceCriterion >= 1 && t.evidenceCriterion <= 9, `NCEAC ${t.code} evidence criterion`);
    assert.ok(!t.sarForm && !t.sarKinds?.length && !t.sarSections?.length, `NCEAC ${t.code} must not grant NBEAC registers`);
  }
  for (const t of [...CATALOGUE.HEC.tasks, ...CATALOGUE.NBEAC.tasks]) assert.ok(!t.criterion && !t.sources.includes("readiness"), `${t.code}: NCEAC's readiness checks are for NCEAC programs only`);
  for (const t of [...CATALOGUE.NCEAC.tasks, ...CATALOGUE.HEC.tasks]) assert.ok(!t.sources.includes("nbeac"), `${t.code}: the NBEAC SAR is for NBEAC programs only`);
  for (const t of CATALOGUE.HEC.tasks) assert.ok(!t.sarForm && !t.sarKinds?.length && !t.sarSections?.length, `HEC ${t.code}`);
  for (const t of CATALOGUE.NBEAC.tasks) {
    if (t.sources.includes("nbeac")) assert.ok(t.sarForm, `NBEAC ${t.code} reads SAR items but names no form`);
    if (t.sarForm) assert.match(t.sarForm, /^[1-7]$/, `NBEAC ${t.code} form`);
    if (t.sarCodes) assert.ok(t.sarForm, `NBEAC ${t.code} item codes without a form`);
    for (const k of t.sarKinds || []) assert.ok(KINDS.some((x) => x.kind === k), `NBEAC ${t.code} register ${k}`);
    for (const k of t.sarSections || []) assert.ok(SECTIONS.some((x) => x.key === k), `NBEAC ${t.code} section ${k}`);
  }
});

test("every page a task points to exists", () => {
  const routes = pageRoutes();
  const exists = (href: string) => {
    const p = href.split("?")[0].split("#")[0];
    return routes.some((r) => r === p || new RegExp("^" + r.replace(/\[[^\]]+\]/g, "[^/]+") + "$").test(p));
  };
  for (const b of BODY_KEYS) for (const t of CATALOGUE[b].tasks) for (const pg of t.pages) assert.ok(exists(pg.href), `${b} ${t.code}: no page at ${pg.href}`);
});

// ------------------------------------------------------------------------------------------------ progress and access
const DEF = { ...CATALOGUE.NCEAC.tasks[0], checklist: ["a", "b"] };
const row = (status: string, checked: Record<string, boolean> = {}) => ({ status, dataJson: JSON.stringify({ checked }) });

test("progress is 70% the data held and 30% the sign-off", () => {
  assert.equal(taskProgress(DEF, row("OPEN"), 0), 0);
  assert.equal(taskProgress(DEF, row("ASSIGNED"), 100), 70);
  assert.equal(taskProgress(DEF, row("SUBMITTED"), 100), 85);
  assert.equal(taskProgress(DEF, row("SUBMITTED"), 50), 50);
  assert.equal(taskProgress(DEF, row("APPROVED"), 0), 100);
  // Nothing checkable: the confirmations stand in for the data.
  assert.equal(taskProgress(DEF, row("ASSIGNED", { a: true }), null), 35);
  assert.equal(taskProgress(DEF, row("ASSIGNED", { a: true, b: true }), null), 70);
  assert.equal(taskProgress(DEF, { status: "ASSIGNED", dataJson: "not json" }, null), 0);
});

test("only the assignee works on a task, while it is theirs and the visit is open", () => {
  const future = new Date(Date.now() + 864e5), past = new Date(Date.now() - 1000);
  const t = (o: Partial<{ assigneeId: string | null; status: string; accessUntil: Date | null }>) => ({ assigneeId: "u1", status: "ASSIGNED", accessUntil: future, ...o });
  const open = { status: "OPEN" };
  assert.ok(canWorkOn("u1", t({}), open));
  assert.ok(canWorkOn("u1", t({ status: "RETURNED" }), open));
  assert.ok(canWorkOn("u1", t({ accessUntil: null }), open));
  assert.ok(!canWorkOn("u2", t({}), open), "someone else");
  assert.ok(!canWorkOn("u1", t({ assigneeId: null }), open), "withdrawn");
  assert.ok(!canWorkOn("u1", t({ status: "SUBMITTED" }), open), "signed off");
  assert.ok(!canWorkOn("u1", t({ status: "APPROVED" }), open), "approved");
  assert.ok(!canWorkOn("u1", t({ accessUntil: past }), open), "access ended");
  assert.ok(!canWorkOn("u1", t({}), { status: "CLOSED" }), "visit closed");
});

test("access lasts a week past the due date, else a day past the visit, else 60 days", () => {
  const due = new Date("2030-03-01T00:00:00Z"), visit = new Date("2030-04-01T00:00:00Z");
  assert.equal(accessWindow(due, visit).toISOString(), "2030-03-08T00:00:00.000Z");
  assert.equal(accessWindow(null, visit).toISOString(), "2030-04-02T00:00:00.000Z");
  const d = (accessWindow(null, new Date("2000-01-01")).getTime() - Date.now()) / 864e5;
  assert.ok(d > 59.9 && d < 60.1, "a past visit date falls back to 60 days");
});
