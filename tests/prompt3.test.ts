import { test } from "node:test";
import assert from "node:assert/strict";
import { gzipSync } from "zlib";
import { KINDS, kindOf, autoMap, headerRow, mappedRows } from "../lib/dataImport";
import { rankByCgpa } from "../lib/examController";
import { readBackup, TABLES } from "../lib/instituteBackup";
import { ipOf } from "../lib/rateLimit";
import { isLab, toolGa, kindOf as courseKind } from "../lib/gaCoverage";

test("data import: finds the heading row below a title and matches owner's own column names", () => {
  const k = kindOf("students")!;
  const grid = [["Enrolled Students Fall 2026"], [], ["Sr", "Reg No", "Student Name", "Semester"], ["1", "2026-CS-001", "Ali Khan", "1"], ["2", "2026-CS-002", "Sara", ""], ["", "", "", ""]];
  const hi = headerRow(grid, k);
  assert.equal(hi, 2);
  const map = autoMap(grid[hi], k);
  assert.deepEqual(map, { rollNumber: 1, name: 2, semester: 3 });
  const rows = mappedRows(grid, hi, map);
  assert.equal(rows.length, 2); // the blank row is dropped
  assert.equal(rows[0].row, 4); // spreadsheet row number for error messages
  assert.deepEqual(rows[0].v, { rollNumber: "2026-CS-001", name: "Ali Khan", semester: "1" });
});

test("data import: transcript columns from a typical result sheet", () => {
  const k = kindOf("transcripts")!;
  const m = autoMap(["Roll No", "Course Code", "Course Title", "Cr Hrs", "Grade", "Session", "Year", "Marks"], k);
  assert.deepEqual(m, { rollNumber: 0, courseCode: 1, courseTitle: 2, creditHours: 3, grade: 4, termName: 5, termYear: 6, totalPct: 7 });
});

test("data import: every kind has required fields with aliases and an example", () => {
  for (const k of KINDS) {
    assert.ok(k.fields.some((f) => f.required), k.key);
    for (const f of k.fields) { assert.ok(f.aliases.length > 0, `${k.key}.${f.key}`); assert.notEqual(f.example, undefined); }
  }
});

test("standing list: ties share a position, no CGPA goes last without a position", () => {
  const r = rankByCgpa([{ n: "a", cgpa: 3.1 }, { n: "b", cgpa: 3.8 }, { n: "c", cgpa: null }, { n: "d", cgpa: 3.8 }, { n: "e", cgpa: 2.0 }]);
  assert.deepEqual(r.map((x) => [x.n, x.position]), [["b", 1], ["d", 1], ["a", 3], ["e", 4], ["c", null]]);
});

test("backups: reads gzipped and plain files, rejects others", () => {
  const b = { version: 1, chairmanId: "c1", institute: "X", createdAt: "2026-10-24T00:00:00.000Z", tables: { student: [{ id: "s1" }] } };
  assert.equal(readBackup(gzipSync(Buffer.from(JSON.stringify(b)))).tables.student.length, 1);
  assert.equal(readBackup(Buffer.from(JSON.stringify(b))).chairmanId, "c1");
  assert.throws(() => readBackup(Buffer.from(JSON.stringify({ hello: 1 }))));
  // parents restore before children
  const order = TABLES.map((t) => t.model);
  assert.ok(order.indexOf("batch") < order.indexOf("student") && order.indexOf("course") < order.indexOf("studentMark") && order.indexOf("user") < order.indexOf("batch"));
  // no secrets in backups
  assert.deepEqual(TABLES.find((t) => t.model === "user")!.omit, ["passwordHash", "mfaSecret"]);
});

test("rate limit: first address of x-forwarded-for", () => {
  assert.equal(ipOf(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" })), "203.0.113.5");
  assert.equal(ipOf(new Headers({})), "");
});

test("GA coverage: labs and the tool-usage GA", () => {
  assert.ok(isLab({ courseType: "Core", title: "Programming Fundamentals Lab", code: "CS101L" }));
  assert.ok(!isLab({ courseType: "Core", title: "Calculus", code: "MT101" }));
  assert.equal(courseKind({ courseType: "Capstone", title: "FYP-I", code: "CS491" }), "Project");
  assert.equal(toolGa([{ id: "1", number: 4, title: "Investigation" }, { id: "2", number: 5, title: "Modern Tool Usage" }])!.id, "2");
  assert.equal(toolGa([{ id: "9", number: 5, title: "Something" }])!.id, "9");
});

test("data import: NCEAC Teacher Data headings are matched, both email columns", () => {
  const k = kindOf("faculty-details")!;
  const head = ["Email Address", "Name", "Gender", "CNIC", "Date of Birth", "Phone Number", "Email", "Address", "Province", "City", "Contract Type", "Academic Rank", "Joining Date", "Leaving Date", "Degree Name", "Degree Type", "Field of Study", "Degree Awarded Country", "Degree Awarded Institute", "Degree Start Date", "Degree End Date", "Department"];
  const m = autoMap(head, k);
  assert.equal(m.email, 0); assert.equal(m.personalEmail, 6); assert.equal(m.department, 21);
  assert.equal(m.rank, 11); assert.equal(m.university, 18); assert.equal(m.degreeEnd, 20); assert.equal(m.country, 17);
});

test("curriculum codes: official and institute curricula", async () => {
  const { propose, ownerCode } = await import("../lib/curriculumLibrary");
  assert.equal(propose({ id: "1", authority: "NCEAC", title: "BS Computer Science", version: "2023", chairmanId: null }).code, "NCEAC-BS-CS-2023");
  assert.equal(propose({ id: "2", authority: "HEC", title: "BS Artificial Intelligence", version: "2025 rev", chairmanId: null }).code, "HEC-BS-AI-2025");
  assert.equal(propose({ id: "3", authority: "NBEAC", title: "BBA (Hons)", version: "2024", chairmanId: null }).code, "NBEAC-BBA-2024");
  assert.equal(propose({ id: "4", authority: "HEC", title: "BS Software Engineering", version: "2027", chairmanId: "x" }, "University of the Punjab").code, "UP-BS-SE-2027");
  assert.equal(ownerCode("Punjab University"), "PU");
  assert.equal(propose({ id: "5", authority: "PEC", title: "BSc Electrical Engineering", version: "2022", chairmanId: null }).level, "BE");
});

test("credit hours count elective slots, not the elective list", async () => {
  const { countedCredits, typeKey } = await import("../lib/courseTypes");
  const cs = [{ creditHours: 3, category: "Core" }, { creditHours: 3, category: "Elective" }, { creditHours: 3, category: "Elective" }, { creditHours: 3, category: "Domain Elective" }, { creditHours: 3, category: "Domain Elective" }, { creditHours: 3, category: "Domain Elective" }, { creditHours: 2, category: "Major" }, { creditHours: 0, category: "Certification" }];
  assert.equal(countedCredits(cs), 11);
  assert.equal(typeKey("Major"), "Core"); assert.equal(typeKey("general education / other"), "General Education");
});

test("builder: NCEAC 2023 CS template matches the official document and places courses", async () => {
  const { TEMPLATES, autoPlace, parseReq, reqPresent } = await import("../lib/curriculumTemplates");
  const t = TEMPLATES.find((x) => x.key === "NCEAC-BS-CS-2023")!;
  const counted = t.types.filter((x) => x.kind !== "ELECTIVE_LIST");
  assert.equal(counted.reduce((s, x) => s + (x.minCredits || 0), 0), 130);
  assert.equal(counted.reduce((s, x) => s + (x.minCourses || 0), 0), 44);
  for (const x of counted) if ((x.required || []).length) assert.equal(x.required!.reduce((s, r) => s + (parseReq(r).ch || 0), 0), x.minCredits, x.name);
  assert.deepEqual(parseReq("Programming Fundamentals 4 (3+1)"), { title: "Programming Fundamentals", ch: 4, theory: 3, lab: 1 });
  assert.ok(reqPresent("Quantitative Reasoning I (Discrete Structures) 3", ["Discrete Structures"]));
  const types = t.types.map((x) => ({ name: x.name, kind: x.kind, required: x.required || [] }));
  assert.equal(autoPlace({ title: "Data Structures", category: "Major" }, types), "Computing Core");
  assert.equal(autoPlace({ title: "Theory of Automata", category: "Major" }, types), "Domain Core");
  assert.equal(autoPlace({ title: "Linear Algebra", category: "Major" }, types), "Mathematics & Supporting Courses");
  assert.equal(autoPlace({ title: "Calculus and Analytic Geometry", category: "Major" }, types), "General Education");
  assert.equal(autoPlace({ title: "Cloud Computing", category: "Domain Elective" }, types), "Domain Elective list");
});

test("course codes: prefix, year digit and sequence", async () => {
  const { sample } = await import("../lib/courseCodes");
  assert.equal(sample({ prefix: "CS", digits: 4, separator: "-" }, 1, 1), "CS-1001");
  assert.equal(sample({ prefix: "MT", digits: 3, separator: "" }, 2, 3), "MT203");
});

test("HEC BS CS 2025: 130 CH and 14 tracks with shared electives", async () => {
  const { TEMPLATES, HEC_CS_2025_TRACKS, parseReq, normTitle, kindInfo } = await import("../lib/curriculumTemplates");
  const t = TEMPLATES.find((x) => x.key === "HEC-BS-CS-2025")!;
  const ch = t.types.filter((x) => kindInfo(x.kind).counts).reduce((a, x) => a + (x.minCredits || 0), 0);
  assert.equal(ch, 130);
  assert.equal(Object.keys(HEC_CS_2025_TRACKS).length, 14);
  const all = Object.values(HEC_CS_2025_TRACKS).flat().map((x) => normTitle(parseReq(x).title));
  assert.ok(new Set(all).size < all.length); // e.g. Machine Learning sits in several tracks
  assert.equal(parseReq("Embedded Programming 4 (3+1)").lab, 1);
});

test("HEC CS 2025 master content: semesters, CLOs, lecture plans resolve for every required course", async () => {
  const { TEMPLATES, HEC_CS_2025_TRACKS, parseReq } = await import("../lib/curriculumTemplates");
  const { CONTENT_PACKS, mapLectures, suggestPlo } = await import("../lib/curriculumContent");
  const pack = CONTENT_PACKS["HEC-BS-CS-2025"];
  const t = TEMPLATES.find((x) => x.key === "HEC-BS-CS-2025")!;
  const miss: string[] = [];
  for (const ty of t.types) for (const r of ty.required || []) {
    const title = parseReq(r).title;
    if (ty.kind === "IDS_LIST") continue;
    if (!pack.semester(title, ty.kind, 0)) miss.push("sem " + title);
    if (["Professional Certification", "Field Experience", "Final Year Project"].includes(title)) continue;
    const c = pack.content(title);
    if (!c || !c.clos.length) miss.push("clo " + title); else if (c.topics.length < 32) miss.push("lec " + title);
  }
  assert.deepEqual(miss, []);
  const el = Object.values(HEC_CS_2025_TRACKS).flat().map((x) => parseReq(x).title);
  assert.equal(el.filter((x) => !pack.content(x)?.clos.length).length, 0);
  assert.equal(pack.semester("Specialization Electives V", "ELECTIVE_SLOT", 4), 7);
  const m = mapLectures(["Linked lists", "Stacks and queues", "Graph traversal"], ["Implement linked lists and stacks", "Traverse graphs"]);
  assert.deepEqual(m, [1, 1, 2]);
  assert.equal(suggestPlo("Discuss ethical issues of AI", "C2"), 9);
  assert.equal(suggestPlo("Design a distributed system", "C6"), 4);
});

test("PU BSCS 2021: 131 CH, labs merged, mapped to HEC 2025 and NCEAC 2023", async () => {
  const { TEMPLATES, kindInfo } = await import("../lib/curriculumTemplates");
  const { PU_BSCS_2021 } = await import("../lib/puBscs2021");
  const { CONTENT_PACKS } = await import("../lib/curriculumContent");
  const { courseKeys, editionFor } = await import("../lib/curriculumEquivalence");
  const t = TEMPLATES.find((x) => x.key === "PU-BSCS-2021")!;
  assert.equal(t.types.filter((x) => kindInfo(x.kind).counts).reduce((a, x) => a + (x.minCredits || 0), 0), 131);
  assert.equal(PU_BSCS_2021.find((c) => c.code === "CC-112")!.lab, 1);
  const pu = CONTENT_PACKS["PU-BSCS-2021"];
  assert.equal(pu.content("Data Structures and Algorithms")!.from, "Data Structures");
  assert.equal(pu.details!("Database Systems")!.code, "CC-312");
  assert.equal(pu.semester("Compiler Construction", "", 0), 5);
  const meet = (a: string, b: string, e: "2025" | "2023" | null) => courseKeys(a, e).some((k) => courseKeys(b, e).includes(k));
  assert.ok(meet("Data Structures and Algorithms", "Data Structures", "2025"));
  assert.ok(meet("Computer Organization and Assembly Language", "Computer Organization and Architecture", "2025"));
  assert.ok(meet("Discrete Structures", "Quantitative Reasoning I (Discrete Structures)", "2023"));
  assert.ok(meet("Design and Analysis of Algorithms", "Analysis of Algorithms", "2023"));
  // never across editions: a 2023 title does not map in a 2025 comparison, and 2023 vs 2025 gets no table
  assert.ok(!meet("Design and Analysis of Algorithms", "Analysis of Algorithms", "2025"));
  assert.equal(editionFor("2023", "2025"), null);
  assert.equal(editionFor("2021", "2025"), "2025");
  assert.ok(!meet("Compiler Construction", "Cloud Computing", "2023"));
  assert.ok(TEMPLATES.some((x) => x.key === "NCEAC-BS-CS-2025" && x.council === "NCEAC"));
});

test("consortium: rules strictness, CNIC identity, NOC expiry, exam-centre gaps", async () => {
  const { RULES, DEFAULT_RULES, stricterOk, normCnic, fmtCnic, maskCnic, nocState, centreGaps } = await import("../lib/consortium");
  const r = (k: string) => RULES.find((x) => x.key === k)!;
  assert.ok(stricterOk(r("minHomeResidencyPct"), 60, 50));
  assert.ok(!stricterOk(r("minHomeResidencyPct"), 40, 50));
  assert.ok(stricterOk(r("maxSemesterLoad"), 18, 21));
  assert.ok(!stricterOk(r("capstoneAtHome"), false, true));
  assert.equal(DEFAULT_RULES.industryApplicants, false);
  assert.equal(normCnic("35202-1234567-1"), "3520212345671");
  assert.equal(normCnic("3520212345"), null);
  assert.equal(fmtCnic("3520212345671"), "35202-1234567-1");
  assert.ok(!maskCnic("3520212345671").includes("35202"));
  const day = 86400000, now = new Date("2026-10-24");
  assert.equal(nocState({ expiresOn: new Date(now.getTime() - day) }, now).state, "EXPIRED");
  assert.equal(nocState({ expiresOn: new Date(now.getTime() + 30 * day) }, now).state, "EXPIRING");
  assert.equal(nocState({ expiresOn: new Date(now.getTime() + 400 * day) }, now).state, "VALID");
  const c = { id: "x", chairmanId: "u", campusId: null, name: "Hall", city: null, address: null, seats: 100, cctv: false, biometric: true, status: "ACTIVE" };
  assert.equal(centreGaps(c, DEFAULT_RULES).length, 1);
});

test("consortium equivalence: edition, evidence, two-sided approval", async () => {
  const { editionOf, evidenceOf, statusFrom } = await import("../lib/consortiumAgreements");
  assert.equal(editionOf("2025"), "2025");
  assert.equal(editionOf("v1.0 (2021)"), "2021");
  assert.equal(editionOf("Fall"), null);
  const A = { id: "a", code: "CS-201", title: "Data Structures", creditHours: 4, category: "Core", lab: 1, clos: [{ statement: "Implement linked lists, stacks and queues", bloomLevel: "C3" }, { statement: "Analyze algorithm complexity using Big O", bloomLevel: "C4" }] };
  const B = { id: "b", code: "CC-213", title: "Data Structures and Algorithms", creditHours: 4, category: "Core", lab: 1, clos: [{ statement: "Implement stacks, queues and linked lists", bloomLevel: "C3" }] };
  const e = evidenceOf(A, B);
  assert.equal(e.coverBA, 100);
  assert.equal(e.coverAB, 50);
  assert.deepEqual(e.missingInB, ["Analyze algorithm complexity using Big O"]);
  assert.ok(e.flags.some((f) => /70%/.test(f)));
  const ag = { kind: "JOINT_DEGREE" } as never, eq = { chairmanA: "U1", chairmanB: "U2" } as never;
  const ok = { by: "x", name: "x", at: "2026-10-24", ok: true };
  assert.equal(statusFrom(ag, eq, { U1: { se: ok, chair: ok } }), "PROPOSED");
  assert.equal(statusFrom(ag, eq, { U1: { se: ok, chair: ok }, U2: { se: ok, chair: ok } }), "APPROVED");
  assert.equal(statusFrom({ kind: "CREDIT_RECOGNITION" } as never, eq, { U1: { se: ok, chair: ok } }), "APPROVED");
  assert.equal(statusFrom(ag, eq, { U2: { se: { ...ok, ok: false } } }), "REJECTED");
});

test("consortium transfer: grade points by agreement map, else home scale, else host", async () => {
  const { convert } = await import("../lib/consortiumTransfer");
  const scale = new Map([["A", 4], ["B+", 3.5]]);
  assert.deepEqual(convert("a", 4, { A: 3.9 }, scale), { points: 3.9, basis: "agreement grade map" });
  assert.deepEqual(convert("B+", 3.3, null, scale), { points: 3.5, basis: "home grading scale" });
  assert.deepEqual(convert("C", 2, null, scale), { points: 2, basis: "host grade points" });
});

test("joint degree plan: rules engine checks credits, load, residency, capstone, partner share", async () => {
  const { validatePlan } = await import("../lib/consortiumJoint");
  const { DEFAULT_RULES } = await import("../lib/consortium");
  const mk = (id: string, sem: number, ch: number, extra: Record<string, unknown> = {}) => ({ id, code: id, title: id, ch, semester: sem, capstone: false, major: false, internship: false, options: [{ chairmanId: "B", label: "B", offered: null }], ...extra });
  const courses = Array.from({ length: 40 }, (_, i) => mk(`C${i}`, Math.floor(i / 5) + 1, 3)).concat([mk("FYP", 8, 6, { capstone: true }), mk("INT", 7, 3, { internship: true })]);
  const base = { courses, home: "A", partners: ["B"], names: { A: "Uni A", B: "Uni B" }, rules: DEFAULT_RULES, residency: { minHomeResidencyPct: null, capstoneAtHome: true, majorsAtHome: false }, shares: { A: 70, B: 30 } };
  const none = validatePlan({ ...base, choice: {} });
  assert.equal(none.total, 129);
  assert.ok(!none.checks.find((c) => c.rule === "Taken at Uni B")!.ok); // B's 30% share not met
  const choice = Object.fromEntries(courses.slice(0, 13).map((c) => [c.id, "B"]));
  const good = validatePlan({ ...base, choice });
  assert.ok(good.ok, JSON.stringify(good.checks.filter((c) => !c.ok)));
  const bad = validatePlan({ ...base, choice: { ...choice, FYP: "B" } });
  assert.ok(!bad.checks.find((c) => c.rule === "Capstone at the lead university")!.ok);
  const tooMuch = validatePlan({ ...base, choice: Object.fromEntries(courses.slice(0, 30).map((c) => [c.id, "B"])) });
  assert.ok(!tooMuch.checks.find((c) => c.rule === "Taken at Uni A")!.ok);
});

test("shared course content: same-named course, same edition first, then official", async () => {
  const { pick } = await import("../lib/curriculumShare");
  const s = (label: string, edition: string, official: boolean, n = 1) => ({ keys: new Set(["programming fundamental"]), outline: null, textbook: null, references: null, fromCourseId: label, label, edition, official, clos: Array.from({ length: n }, () => ({ statement: "x", bloomLevel: "C3", plo: 2, source: "HEC" })), topics: [], plos: [] });
  assert.equal(pick([s("CS 2025", "2025", true, 5), s("SE 2023", "2023", true)], "2023")!.label, "SE 2023");
  assert.equal(pick([s("Uni CS 2025", "2025", false, 9), s("HEC CS 2025", "2025", true)], "2025")!.label, "HEC CS 2025");
  assert.equal(pick([s("CS 2025", "2025", true)], "2023")!.label, "CS 2025"); // other edition when nothing else
  assert.equal(pick([], "2025"), null);
});
