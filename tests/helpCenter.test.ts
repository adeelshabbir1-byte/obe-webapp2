import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { BUILTIN_ARTICLES, BUILTIN_BY_KEY } from "../lib/help/content";
import { CAPABILITIES, PSEUDO_ROLES } from "../lib/help/permissions";
import { searchArticles, suggestFor, stem, tokens } from "../lib/help/search";
import { CATEGORIES, EVERYONE, STUDENT, forAudience } from "../lib/help/types";
import { DESKS, deskForCategory } from "../lib/help/deskList";

const ROOT = path.join(__dirname, "..");
const top = (q: string, role: string, n = 1, p?: string) => searchArticles(BUILTIN_ARTICLES, q, { role, path: p }).slice(0, n).map((h) => h.article.key);

// ------------------------------------------------------------------------------------------------ search quality
test("the spec's example questions find the right answers", () => {
  assert.equal(top("How do I reset my password?", "INSTRUCTOR")[0], "forgot-password");
  assert.ok(top("Who can add a new faculty member?", "PROGRAM_COORDINATOR", 2).some((k) => k === "add-faculty" || k === "who-adds-whom"));
  assert.equal(top("Why is my course registration blocked?", STUDENT)[0], "registration-blocked");
});

test("permission questions find the matching FAQ", () => {
  assert.ok(top("who can modify cascading weightages", "OMC", 2).includes("who-changes-weights"));
  assert.equal(top("who assigns FYP evaluation panels", "HEAD_OF_DEPARTMENT")[0], "fyp-who-does-what");
  assert.ok(top("who can reset another user's credentials", "CHAIRMAN", 2).includes("who-resets-passwords"));
  assert.ok(top("prerequisite override approval", "CHAIRMAN", 3).includes("grant-exemption"));
  assert.equal(top("how to run a CQI report", "CHAIRMAN")[0], "run-cqi");
});

test("everyday wording, synonyms and typos still match", () => {
  assert.equal(top("lost my phone, can't get the authenticator code", "INSTRUCTOR")[0], "lost-authenticator");
  assert.equal(top("account locked too many attempts", "SUBJECT_EXPERT")[0], "account-locked");
  assert.ok(top("pasword reset", "INSTRUCTOR", 2).includes("forgot-password"), "a misspelling");
  assert.ok(top("add a lecturer", "PROGRAM_COORDINATOR", 2).includes("add-faculty"), "lecturer ~ teacher");
  assert.ok(top("cannot enroll in course", STUDENT, 2).includes("registration-blocked"), "enroll ~ registration, cannot ~ blocked");
  assert.ok(top("2fa", "DEAN", 3).some((k) => k === "two-step-setup" || k === "lost-authenticator"));
});

test("stemming joins the forms of a word", () => {
  assert.equal(stem("approved"), stem("approval"));
  assert.equal(stem("approves"), stem("approve"));
  assert.equal(stem("registrations"), stem("registration"));
  assert.deepEqual(tokens("Who can't register?"), ["cant", "register"]);
});

test("nonsense finds nothing, and empty queries return no hits", () => {
  assert.equal(searchArticles(BUILTIN_ARTICLES, "xqzv plorbt", { role: "INSTRUCTOR" }).length, 0);
  assert.equal(searchArticles(BUILTIN_ARTICLES, "  the of and  ", { role: "INSTRUCTOR" }).length, 0);
});

test("students only see student and everyone articles; staff never get student-only ones", () => {
  const forStudents = searchArticles(BUILTIN_ARTICLES, "add faculty teacher onboarding", { role: STUDENT });
  assert.ok(forStudents.every((h) => h.article.roles.includes(STUDENT) || h.article.roles.includes(EVERYONE)));
  assert.ok(!forStudents.some((h) => h.article.key === "add-faculty"));
  const staff = searchArticles(BUILTIN_ARTICLES, "student forgot password roll number", { role: "INSTRUCTOR" });
  assert.ok(!staff.some((h) => h.article.key === "student-forgot-password"));
  assert.ok(!forAudience(BUILTIN_BY_KEY.get("grant-exemption")!, "INSTRUCTOR"), "Institute Head only");
});

test("suggestions follow the page and the role", () => {
  assert.equal(suggestFor(BUILTIN_ARTICLES, { role: "OMC", path: "/omc/weight-policy" })[0].key, "weight-policy");
  const reg = suggestFor(BUILTIN_ARTICLES, { role: STUDENT, path: "/student/registration" }).slice(0, 2).map((a) => a.key);
  assert.ok(reg.includes("registration-blocked") && reg.includes("student-register"), reg.join());
  assert.ok(suggestFor(BUILTIN_ARTICLES, { role: "CHAIRMAN", path: "/chairman/people" }).some((a) => a.key === "reset-someone-password"));
  assert.ok(suggestFor(BUILTIN_ARTICLES, { role: "INSTRUCTOR", path: "/somewhere-new" }).length > 0, "falls back to role articles");
});

test("being on the page lifts an article that matches less well otherwise", () => {
  const off = top("weights", "OMC", 3, "/elsewhere"), on = top("weights", "OMC", 1, "/omc/weight-exceptions");
  assert.ok(off.length > 0);
  assert.equal(on[0], "weight-exception");
});

// ------------------------------------------------------------------------------------------------ content integrity
function pageRoutes(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (e.name !== "api") walk(path.join(dir, e.name)); }
      else if (e.name === "page.tsx") out.push("/" + path.relative(path.join(ROOT, "app"), dir).split(path.sep).join("/"));
    }
  };
  walk(path.join(ROOT, "app"));
  return out.map((r) => (r === "/" ? "/" : r.replace(/\/$/, "")));
}
const ROLES = new Set(["SUPER_USER", "CHAIRMAN", "PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "INSTRUCTOR", "OMC", "COURSE_ASSIGNER", "HEAD_OF_DEPARTMENT", "DEAN", "DEPARTMENT_COORDINATOR", "LAB_ENGINEER", "LAB_MANAGER", "LIBRARIAN", "FINANCE_OFFICER", "STUDENT_AFFAIRS", "FACILITIES_MANAGER", STUDENT, EVERYONE]);

test("article keys are unique and every related link exists", () => {
  assert.equal(new Set(BUILTIN_ARTICLES.map((a) => a.key)).size, BUILTIN_ARTICLES.length);
  for (const a of BUILTIN_ARTICLES) {
    assert.match(a.key, /^[a-z0-9-]+$/, a.key);
    for (const r of a.related || []) assert.ok(BUILTIN_BY_KEY.has(r), `${a.key} → missing related ${r}`);
    assert.ok(CATEGORIES.some((c) => c.key === a.category), `${a.key} category`);
    for (const r of a.roles) assert.ok(ROLES.has(r), `${a.key} role ${r}`);
    assert.ok(a.summary.length >= 40 && a.title.length >= 8, `${a.key} too short`);
  }
});

test("every page an article links to, or is suggested on, exists", () => {
  const routes = pageRoutes();
  const isRoute = (h: string) => routes.includes(h);
  const isPrefix = (p: string) => routes.some((r) => r === p || r.startsWith(p.endsWith("/") ? p : p + "/"));
  for (const a of BUILTIN_ARTICLES) {
    if (a.href) assert.ok(isRoute(a.href), `${a.key}: no page at ${a.href}`);
    for (const p of a.pages || []) assert.ok(isPrefix(p), `${a.key}: no page under ${p}`);
  }
  for (const c of CAPABILITIES) if (c.where) assert.ok(isRoute(c.where.href), `${c.key}: no page at ${c.where.href}`);
});

test("every category has articles for staff, and students have their own", () => {
  for (const c of CATEGORIES) assert.ok(BUILTIN_ARTICLES.some((a) => a.category === c.key), c.key);
  assert.ok(BUILTIN_ARTICLES.filter((a) => forAudience(a, STUDENT)).length >= 8);
});

// ------------------------------------------------------------------------------------------------ the permission matrix matches the code
test("each permission listed is enforced where the matrix says", () => {
  for (const c of CAPABILITIES) {
    assert.ok(c.roles.length > 0, c.key);
    for (const r of c.roles) assert.ok(ROLES.has(r) || r in PSEUDO_ROLES, `${c.key} role ${r}`);
    if (c.article) assert.ok(BUILTIN_BY_KEY.has(c.article), `${c.key} → missing article ${c.article}`);
    for (const e of c.enforcedIn) {
      const file = path.join(ROOT, e.file);
      assert.ok(fs.existsSync(file), `${c.key}: ${e.file} is gone`);
      const src = fs.readFileSync(file, "utf8");
      for (const s of e.contains) assert.ok(src.includes(s), `${c.key}: ${e.file} no longer contains ${JSON.stringify(s)} — update lib/help/permissions.ts and the FAQ`);
    }
  }
});

test("every article category routes help requests to a desk", () => {
  for (const c of CATEGORIES) assert.ok(DESKS.some((d) => d.key === deskForCategory(c.key)), c.key);
  assert.equal(deskForCategory("fyp"), "FYP");
  assert.equal(deskForCategory("account"), "ACCOUNT");
  assert.equal(deskForCategory(undefined), "TECHNICAL");
});
