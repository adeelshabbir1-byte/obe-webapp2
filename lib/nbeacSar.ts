import { prisma } from "./db";
import { programBindings } from "./accreditation/bodies";
import { inferBody } from "./accreditation/bodyInfer";
import { facultyOf } from "./fyp";
import { getPolicy } from "./registrationRules";
import { courseTermIndex, termLabel } from "./courseTerm";
import { termIndex } from "./termLogic";
import { experienceSummary, yearsOfService } from "./facultyProfile";
import { MEETING_KINDS } from "./evidenceFiles";
import { loadProfile, type SarScope } from "./sarAccess";
import { APPENDICES, kindDef, type AreaKey } from "./sarRegistry";
import { titlesFor } from "./titles";
import { countedCredits } from "./courseTypes";

// The NBEAC Self-Assessment Report (SAR v4.0) for one business school (a department), built from everything the system
// holds: the accreditation registers and profiles, and the programs, courses, students, faculty, results, FYPs,
// societies, finance and facilities kept elsewhere. Each question becomes a table, a written answer or an appendix,
// with whether it is filled in and where to fill it.

export type Cell = string | number | null;
export type Status = "filled" | "missing" | "restricted";
export type Item = {
  code: string; question: string; kind: "table" | "narrative" | "appendix";
  columns?: string[]; rows?: Cell[][]; text?: string;
  files?: { id: string; title: string; fileName: string | null; approvedBy: string; date: string }[];
  status: Status; fill?: string; note?: string;
};
export type FormDoc = { key: string; title: string; weight: string; items: Item[] };
/** `programs`: the department's NBEAC programs this SAR covers; `otherCouncil`: its programs governed by another council (left out). */
export type SarDoc = { department: { id: string; name: string }; school: string; generatedAt: string; forms: FormDoc[]; programs: string[]; otherCouncil: { program: string; body: string }[] };

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const s = (v: unknown) => (v === null || v === undefined || v === "" ? "" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));
const yn = (v: unknown) => (v === true ? "Yes" : v === false ? "No" : "");
const r1 = (x: number) => Math.round(x * 100) / 100;
const nonNull = <T,>(x: T | null): x is T => x !== null;

export async function buildNbeacSar(user: { id: string; role: string }, scope: SarScope, departmentId: string): Promise<SarDoc | null> {
  const chairmanId = scope.chairmanId;
  const titles = await titlesFor(chairmanId);
  const dept = await prisma.department.findFirst({ where: { id: departmentId, chairmanId }, select: { id: true, name: true, facultyId: true } });
  if (!dept) return null;
  const t = new Date().getFullYear();
  const years = [t, t - 1, t - 2];
  const fiscal = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;

  // ---- What the business school is made of
  // Only programs bound to NBEAC: a computing or general program of the same department belongs to another council's forms.
  const bindings = await programBindings(chairmanId).catch(() => []);
  const councilOf = (name: string) => bindings.find((b) => b.program === name)?.body || inferBody(name);
  const allLeads = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId, departmentId: dept.id }, select: { id: true, name: true, leadProgram: true } });
  const leads = allLeads.filter((l) => councilOf(l.leadProgram || l.name) === "NBEAC");
  const deptPrograms = bindings.filter((b) => b.departmentId === dept.id);
  const otherCouncil = [
    ...allLeads.filter((l) => !leads.includes(l)).map((l) => ({ program: l.leadProgram || l.name, body: councilOf(l.leadProgram || l.name) })),
    ...deptPrograms.filter((b) => b.body !== "NBEAC" && !allLeads.some((l) => l.leadProgram === b.program)).map((b) => ({ program: b.program, body: b.body })),
  ];
  const leadIds = leads.map((l) => l.id).concat(["none"]);
  const [programs, profiles, batches, hei, school] = await Promise.all([
    prisma.degreeProgram.findMany({ where: { coordinatorId: { in: leadIds } }, select: { name: true, coordinatorId: true, createdAt: true } }),
    prisma.programProfile.findMany({ where: { coordinatorId: { in: leadIds } } }),
    prisma.batch.findMany({ where: { coordinatorId: { in: leadIds } }, select: { id: true, coordinatorId: true, degreeProgram: true, batchName: true, startTerm: true, startYear: true, studentCount: true } }),
    loadProfile(chairmanId, "HEI").catch(() => ({} as Record<string, Record<string, unknown>>)),
    loadProfile(chairmanId, dept.id).catch(() => ({} as Record<string, Record<string, unknown>>)),
  ]);
  // A program counts once it is registered to the department or has a lead — before its first batch is admitted too.
  const programNames = Array.from(new Set([...deptPrograms.map((b) => b.program), ...leads.map((l) => l.leadProgram).filter((x): x is string => !!x), ...programs.map((p) => p.name), ...batches.map((b) => b.degreeProgram)])).filter((name) => councilOf(name) === "NBEAC");
  const profileOf = (name: string) => profiles.find((p) => p.degreeProgram === name) || null;
  const levelOf = (name: string) => profileOf(name)?.programLevel || (/^(ms|mphil|mba|m\.)/i.test(name) ? "GRAD18" : /phd/i.test(name) ? "PHD" : "UG16");
  const batchIds = batches.map((b) => b.id).concat(["none"]);
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const [courses, students] = await Promise.all([
    prisma.course.findMany({
      where: { coordinatorId: { in: leadIds } },
      select: { id: true, code: true, title: true, creditHours: true, courseType: true, semesterNumber: true, batchId: true, prerequisiteCourseId: true, instructorId: true, isOffered: true, offeredTermName: true, offeredTermYear: true, corporateRelevance: true, indigenousFocus: true, teachingMethods: true, createdAt: true },
    }),
    prisma.student.findMany({ where: { batchId: { in: batchIds } }, select: { id: true, batchId: true, status: true, statusDate: true } }),
  ]);
  const courseTerm = (c: (typeof courses)[number]) => courseTermIndex({ ...c, batch: c.batchId ? batchById.get(c.batchId) || null : null });
  const current = await prisma.currentTerm.findFirst({ where: { coordinatorId: { in: leadIds } }, select: { termName: true, year: true } });
  const nowTerm = current ? termIndex(current.termName, current.year) : termIndex(new Date().getMonth() >= 7 ? "Fall" : "Spring", new Date().getMonth() >= 7 ? t : t);
  const programOfBatch = (id: string | null) => (id ? batchById.get(id)?.degreeProgram || "" : "");
  // The newest batch of each program stands for its current curriculum.
  const newestBatch = (name: string) => batches.filter((b) => b.degreeProgram === name).sort((a, b) => termIndex(b.startTerm, b.startYear) - termIndex(a.startTerm, a.startYear))[0] || null;
  const curriculum = (name: string) => { const b = newestBatch(name); return b ? courses.filter((c) => c.batchId === b.id) : []; };

  // ---- Records (accreditation registers) and policies
  const allRecords = await prisma.accreditationRecord.findMany({ where: { chairmanId, OR: [{ departmentId: null }, { departmentId: dept.id }] }, orderBy: [{ recordDate: "desc" }, { year: "desc" }, { createdAt: "desc" }] }).catch(() => []);
  const parsed = allRecords.map((r) => ({ ...r, data: (() => { try { return JSON.parse(r.dataJson) as Record<string, unknown>; } catch { return {}; } })() }));
  const visible = (kind: string) => { const k = kindDef(kind); return !!k && scope.canViewKind(k); };
  const recs = (kind: string) => (visible(kind) ? parsed.filter((r) => r.kind === kind) : []);
  const narratives = ((school as Record<string, Record<string, unknown>>).narratives || {}) as Record<string, string>;
  const sec = (doc: Record<string, Record<string, unknown>>, key: string) => (doc[key] || {}) as Record<string, unknown>;
  const HEI = sec(hei, "HEI"), SCHOOL = sec(school, "SCHOOL"), CONTACTS = sec(school, "CONTACTS"), QEC = sec(hei, "QEC"), ORIC = sec(hei, "ORIC");
  const LOAD = sec(school, "WORKLOAD_POLICY"), FAC = sec(school, "FACILITY_DETAILS"), LIB = sec(school, "LIBRARY_DETAILS"), IT = sec(school, "IT_DETAILS");
  const area = (a: AreaKey) => `/accreditation/${a}?dept=${dept.id}`;

  const table = (code: string, question: string, columns: string[], rows: Cell[][], fill?: string, note?: string): Item => ({ code, question, kind: "table", columns, rows, status: rows.length ? "filled" : "missing", fill, note });
  const restricted = (code: string, question: string, kind: string): Item | null => (visible(kind) ? null : { code, question, kind: "table", status: "restricted", note: "Confidential: only the Institute Head, the Dean and the department's Chairman see these cases." });
  const narrative = (code: string, question: string): Item => ({ code, question, kind: "narrative", text: narratives[code] || "", status: (narratives[code] || "").trim() ? "filled" : "missing" });
  const policies = parsed.filter((r) => r.kind === "POLICY");
  const appendix = (codes: string[], question: string, label?: string): Item => {
    const files = policies.filter((p) => codes.some((c) => String(p.data.appendix || "").startsWith(`${c} `))).map((p) => ({ id: p.id, title: p.title, fileName: p.fileName, approvedBy: s(p.data.approvedBy), date: iso(p.recordDate) }));
    return { code: `Appendix ${codes.join(", ")}`, question, kind: "appendix", files, status: files.length ? "filled" : "missing", fill: area("policies"), note: label || APPENDICES.find((a) => a.startsWith(`${codes[0]} `)) };
  };
  const push = (arr: Item[], it: Item | null, alt?: Item) => { arr.push(it || alt!); };

  // ---- Faculty of the business school
  const facultyList = await facultyOf(chairmanId, dept.id);
  const fIds = facultyList.map((f) => f.id).concat(["none"]);
  const [fProfiles, fRecords, fUsers] = await Promise.all([
    prisma.facultyProfile.findMany({ where: { userId: { in: fIds } } }),
    prisma.facultyRecord.findMany({ where: { userId: { in: fIds }, kind: { in: ["EDUCATION", "EXPERIENCE", "PUBLICATION", "GRANT"] } }, orderBy: [{ startYear: "desc" }] }),
    prisma.user.findMany({ where: { id: { in: fIds } }, select: { id: true, name: true, role: true, email: true, isActive: true, createdAt: true } }),
  ]);
  const prof = (id: string) => fProfiles.find((p) => p.userId === id) || null;
  const nameOf = (id: string) => fUsers.find((u) => u.id === id)?.name || facultyList.find((f) => f.id === id)?.name || "";
  const isVisiting = (id: string) => /visiting|adjunct|part-time/i.test(prof(id)?.employmentType || "");
  const highest = (id: string) => fRecords.filter((r) => r.userId === id && r.kind === "EDUCATION").sort((a, b) => (b.endYear || 0) - (a.endYear || 0))[0] || null;
  const expOf = (id: string) => experienceSummary(prof(id)?.dateOfJoining, fRecords.filter((r) => r.userId === id && r.kind === "EXPERIENCE"));

  // =========================================================================================================== Form 1
  const f1: Item[] = [];
  const deanUser = dept.facultyId ? await prisma.user.findFirst({ where: { role: "DEAN", managedById: chairmanId, facultyId: dept.facultyId, isActive: true }, select: { id: true, name: true, email: true } }) : null;
  const hodUser = await prisma.user.findFirst({ where: { role: "HEAD_OF_DEPARTMENT", managedById: chairmanId, departmentId: dept.id, isActive: true }, select: { id: true, name: true, email: true } });
  const inst = await prisma.user.findUnique({ where: { id: chairmanId }, select: { instituteName: true } });
  const tableA: Cell[][] = [
    ["Name of the HEI", s(HEI.heiName) || inst?.instituteName || ""], ["HEI type", s(HEI.heiType)], ["Reference no. and date of Act / Ordinance / Charter", s(HEI.actRef)],
    ["Charter type", s(HEI.charterType)], ["Sector", s(HEI.sector)], ["Profit / non-profit status", s(HEI.profitStatus)], ["Chief administrative officer", s(HEI.caoTitle)],
    ["Name of the chief administrative officer", s(HEI.caoName)], ["Title of the business school", s(SCHOOL.title) || dept.name], ["Year of establishment", s(SCHOOL.yearEstablished)],
    ["Address", s(SCHOOL.address)], ["Website URL", s(SCHOOL.website)], ["Hierarchical context", s(SCHOOL.hierarchy)], ["Number of other campuses", s(HEI.campuses)], ["Location of other campuses", s(HEI.campusLocations)],
  ];
  // Only the names alone (always known) don't count as having filled the table in.
  f1.push(table("Table A", "Information on the HEI and the business school", ["Item", "Information"], tableA.filter((r) => r[1] !== "").length > 2 ? tableA : [], area("governance")));
  f1.push(table("Table B", "Scope of accreditation", ["No.", "Program applied for", "Undergraduate / graduate", "Program launch date"],
    programNames.map((p, i) => [i + 1, p, levelOf(p) === "UG16" ? "Undergraduate" : levelOf(p) === "PHD" ? "Doctoral" : "Graduate", iso(profileOf(p)?.launchDate)]), "/coordinator/program-profile",
    "Program level and launch date are set on each program's Program Profile."));
  const contact = (p: string, fallback: { name: string; email: string | null } | null, title: string): Cell[] => [title, s(CONTACTS[`${p}Name`]) || fallback?.name || "", s(CONTACTS[`${p}Designation`]), s(CONTACTS[`${p}TelOff`]), s(CONTACTS[`${p}TelCell`]), s(CONTACTS[`${p}Email`]) || fallback?.email || ""];
  f1.push(table("Table C", "Contact information (attach the CVs in Appendix A)", ["Role", "Name", "Designation", "Tel (office)", "Tel (cell)", "Email"],
    [contact("dean", deanUser, titles.DEAN.title), contact("head", hodUser, "Head of business school"), contact("focal", null, "Focal person for NBEAC")].filter((r) => r[1]), area("governance")));
  const schoolVision = s(SCHOOL.vision) || s(profiles[0]?.departmentVision), schoolMission = s(SCHOOL.mission) || s(profiles[0]?.departmentMission);
  f1.push(table("Table 1.1", "Approved vision and mission of the HEI and the business school", ["", "Statement", "Approving authority", "Date of approval"],
    [["HEI vision", s(HEI.vision), s(HEI.vmAuthority), s(HEI.vmDate)], ["HEI mission", s(HEI.mission), s(HEI.vmAuthority), s(HEI.vmDate)], ["Business school vision", schoolVision, s(SCHOOL.vmAuthority), s(SCHOOL.vmDate)], ["Business school mission", schoolMission, s(SCHOOL.vmAuthority), s(SCHOOL.vmDate)]].filter((r) => r[1]), area("governance")));
  f1.push(narrative("1.1b", "The process of forming the business school's vision and mission with faculty and stakeholders, and their approval"));
  f1.push(appendix(["1A"], "Official pages approving the vision and mission"));
  f1.push(narrative("1.1c", "Measures the business school takes to realize its mission"));
  f1.push(appendix(["1B"], "Current strategic plan (SWOT, strategic goals, action plan)"));
  f1.push(table("Table 1.2", "Strategic plan of the business school", ["Strategic plan", "Plan", "Period", "Date of approval", "Approving authority", "Updated / reviewed on", "Progress documented till"],
    recs("STRATEGIC_PLAN").map((r) => [r.title, s(r.data.status), s(r.data.period), iso(r.recordDate), s(r.data.authority), s(r.data.reviewedOn), s(r.data.progressTill)]), area("governance")));
  f1.push(appendix(["1C"], "Latest strategic plan progress report"));
  f1.push(table("Table 1.3a", "Composition of the statutory bodies", ["Statutory body", "Chairperson", "Ex-officio members (designations)", "Appointed members"],
    recs("STATUTORY_BODY").map((r) => [r.title, s(r.data.chair), s(r.data.exOfficio), s(r.data.appointed)]), area("governance")));
  f1.push(table("Table 1.3b", "External participation in statutory bodies", ["Statutory body", "External participant", "National / international", "Designation & affiliation", "Meetings attended"],
    recs("BODY_MEMBER").filter((r) => r.data.memberType === "External participant").map((r) => [s(r.data.body), r.title, s(r.data.reach), s(r.data.designation), s(r.data.meetings)]), area("governance")));
  f1.push(appendix(["1D"], "Rules of business for statutory bodies"));
  const meetings = await prisma.meetingMinutes.findMany({ where: { chairmanId, OR: [{ leadId: null }, { leadId: { in: leadIds } }] }, select: { kind: true, title: true, meetingDate: true, attendees: true, decisions: true }, orderBy: { meetingDate: "desc" } }).catch(() => []);
  const bodyKinds: [string, string][] = [["SENATE", "Senate"], ["SYNDICATE", "Syndicate / Board of Governors"], ["ACADEMIC_COUNCIL", "Academic Council"], ["BPF", "Board of Faculty"], ["BOS", "Board of Studies"], ["SELECTION_BOARD", "Selection Board"], ["BASR", "BASR"], ["FINANCE_PLANNING", "Finance & Planning Committee"]];
  f1.push(table("Table 1.4", "Dates of the last four meetings of the statutory bodies", ["Statutory body", "Meeting 1", "Meeting 2", "Meeting 3", "Meeting 4"],
    bodyKinds.map(([k, label]) => { const m = meetings.filter((x) => x.kind === k).slice(0, 4).map((x) => iso(x.meetingDate)); return m.length ? [label, ...m, ...Array(4 - m.length).fill("")] : null; }).filter(nonNull), "/meetings",
    "From Meetings & Minutes (Senate, Syndicate, Academic Council, BPF, BOS, Selection Board, BASR, Finance & Planning)."));
  f1.push(table("Table 1.5", "Policies, rules and manuals", ["Kind", "Title", "Approving body", "Approval date", "Review date"],
    policies.map((p) => [s(p.data.category), p.title, s(p.data.approvedBy), iso(p.recordDate), s(p.data.reviewDate)]), area("policies")));
  f1.push(appendix(["1E"], "Organograms of the business school and the parent institution"));
  const managers: [string, string, string][] = [];
  if (deanUser) managers.push([titles.DEAN.title, deanUser.id, deanUser.name]);
  if (hodUser) managers.push(["Chairperson / HOD", hodUser.id, hodUser.name]);
  const mgrRecords = managers.length ? await prisma.facultyRecord.findMany({ where: { userId: { in: managers.map((m) => m[1]) }, kind: { in: ["EDUCATION", "EXPERIENCE"] } } }) : [];
  const mgrProfiles = managers.length ? await prisma.facultyProfile.findMany({ where: { userId: { in: managers.map((m) => m[1]) } } }) : [];
  f1.push(table("Table 1.6", "Academic managerial positions", ["Position", "Name", "Qualification", "Field of qualification", "Experience (years)"],
    managers.map(([pos, id, who]) => { const ed = mgrRecords.filter((r) => r.userId === id && r.kind === "EDUCATION").sort((a, b) => (b.endYear || 0) - (a.endYear || 0))[0]; const ex = experienceSummary(mgrProfiles.find((p) => p.userId === id)?.dateOfJoining, mgrRecords.filter((r) => r.userId === id && r.kind === "EXPERIENCE")); return [pos, who, ed?.title || "", ed?.role || "", ex.total || ""]; }),
    "/faculty/profile", "Qualifications and experience come from the faculty profiles."));
  f1.push(table("Table 1.7", "Response to the QAA-HEC quality assurance framework", ["QA model", "Program / institution", "Last external review", "Last internal (self) review", "Corrective action plan / progress"],
    recs("QA_REVIEW").map((r) => [s(r.data.model), r.title, s(r.data.externalOn), s(r.data.internalOn), s(r.data.plan)]), area("governance")));
  f1.push(table("Table 1.8", "Quality Enhancement Cell (QEC)", ["Date of establishment", "Number of staff", "Qualification of the QEC head", "QAA-HEC category"],
    QEC.established || QEC.staff || QEC.headQualification ? [[s(QEC.established), s(QEC.staff), s(QEC.headQualification), s(QEC.category)]] : [], area("governance")));
  f1.push(appendix(["1F"], "Last financial audit report"));
  f1.push(narrative("1.8b", "Corrective measures taken against the auditors' observations"));
  f1.push(table("Table 1.9", "External auditing (last three audits)", ["Year", "Auditing firm / AGPR", "SBP category", "Salient observations", "Corrective measures"],
    recs("AUDIT").map((r) => [s(r.year), r.title, s(r.data.sbpCategory), s(r.data.observations), s(r.data.measures)]).slice(0, 3), area("governance")));

  // =========================================================================================================== Form 2
  const f2: Item[] = [];
  f2.push(table("Table 2.1", "Program portfolio", ["Program", "Semesters", "Courses", "Credit hours", "Curriculum breakup (credit hours)", "Academic Council approval", "HEC NOC"],
    programNames.map((p) => {
      const cs = curriculum(p);
      if (!cs.length) return null;
      const byType = new Map<string, number>();
      for (const c of cs) byType.set(c.courseType || "Other", (byType.get(c.courseType || "Other") || 0) + c.creditHours);
      return [p, Math.max(0, ...cs.map((c) => c.semesterNumber || 0)), cs.length, countedCredits(cs), Array.from(byType.entries()).map(([k, v]) => `${k} ${v}`).join("; "), iso(profileOf(p)?.academicCouncilDate), iso(profileOf(p)?.hecNocDate)];
    }).filter(nonNull), "/coordinator/program-profile"));
  const codeOfId = new Map(courses.map((c) => [c.id, c.code]));
  f2.push(table("Table 2.2", "Courses of each program", ["Program", "Category", "Course title and code", "Credit hours", "Prerequisite"],
    programNames.flatMap((p) => curriculum(p).sort((a, b) => (a.courseType || "").localeCompare(b.courseType || "") || (a.semesterNumber || 0) - (b.semesterNumber || 0)).map((c) => [p, c.courseType || "", `${c.title} (${c.code})`, c.creditHours, c.prerequisiteCourseId ? codeOfId.get(c.prerequisiteCourseId) || "" : ""])), "/coordinator/courses"));
  f2.push(narrative("2.2b", "Bridging semester for 14-year qualification holders (undergraduate programs)"));
  f2.push(narrative("2.2c", "Credit exemptions (30–36) for relevant degree holders entering the MBA"));
  const peosOf = (p: string): string[] => { try { return JSON.parse(profileOf(p)?.peos || "[]"); } catch { return []; } };
  f2.push(table("Table 2.3a", "Program educational objectives (PEOs)", ["Program", "PEO", "Statement"], programNames.flatMap((p) => peosOf(p).map((x, i) => [p, `PEO${i + 1}`, x])), "/coordinator/program-profile"));
  const plosByProgram = await Promise.all(programNames.map(async (p) => { const b = newestBatch(p); return { p, plos: b ? await prisma.pLO.findMany({ where: { batchId: b.id }, select: { number: true, title: true, description: true }, orderBy: { number: "asc" } }) : [] }; }));
  f2.push(table("Table 2.3b", "Program learning outcomes (GAs)", ["Program", "PLO", "Statement"], plosByProgram.flatMap(({ p, plos }) => plos.map((x) => [p, `PLO${x.number}`, x.description || x.title])), "/coordinator/plos"));
  f2.push(table("Table 2.4", "Mapping of PEOs and GAs", ["Program", "PEO", "GAs serving it"],
    programNames.flatMap((p) => { let m: Record<string, number[]> = {}; try { m = JSON.parse(profileOf(p)?.peoPloJson || "{}"); } catch { m = {}; } return peosOf(p).map((_, i) => (m[`PEO${i + 1}`]?.length ? [p, `PEO${i + 1}`, m[`PEO${i + 1}`].map((x) => `PLO${x}`).join(", ")] : null)).filter(nonNull); }), "/coordinator/program-profile"));
  f2.push(narrative("2.3d", "How the PEOs of each program align with the business school's vision and mission"));
  const latestPerCode = new Map<string, (typeof courses)[number]>();
  for (const c of courses) { const have = latestPerCode.get(c.code); if (!have || c.createdAt > have.createdAt) latestPerCode.set(c.code, c); }
  const flagged = (pick: (c: (typeof courses)[number]) => string | null) => Array.from(latestPerCode.values()).filter((c) => pick(c));
  f2.push(table("Table 2.5", "Courses designed in line with corporate needs", ["No.", "Course title", "Corporate relevance"], flagged((c) => c.corporateRelevance).map((c, i) => [i + 1, `${c.title} (${c.code})`, c.corporateRelevance || ""]), "/coordinator/courses", "Set on each course's \"Additional course information\" by its Subject Expert."));
  f2.push(table("Table 2.6a", "Courses addressing indigenous issues", ["No.", "Course", "Focus of the course", "Course introduction date"], flagged((c) => c.indigenousFocus).map((c, i) => [i + 1, `${c.title} (${c.code})`, c.indigenousFocus || "", iso(c.createdAt)]), "/coordinator/courses"));
  f2.push(table("Table 2.6b", "Indigenous teaching materials", ["No.", "Material (APA)", "Nature", "Course", "Contribution"], recs("INDIGENOUS_MATERIAL").map((r, i) => [i + 1, r.title, s(r.data.nature), s(r.data.course), s(r.data.contribution)]), area("curriculum")));
  const cycles = await prisma.fypCycle.findMany({ where: { chairmanId, departmentId: dept.id }, select: { id: true, termName: true, termYear: true } }).catch(() => []);
  const fypProps = cycles.length ? await prisma.fypProposal.findMany({ where: { cycleId: { in: cycles.map((c) => c.id) }, status: "APPROVED" }, select: { title: true, societalIssue: true, domain: true } }) : [];
  f2.push(table("Table 2.7", "Projects / theses on corporate and societal issues", ["No.", "Thesis / project title", "Corporate / societal issue covered"], fypProps.filter((p) => p.societalIssue).map((p, i) => [i + 1, p.title, p.societalIssue || ""]), "/fyp", "From approved Final Year Project proposals that name the issue they address."));
  const offeredIds = courses.map((c) => c.id).concat(["none"]);
  const affective = await prisma.cLO.findMany({ where: { courseId: { in: offeredIds }, source: "SE", bloomLevel: { startsWith: "A" } }, select: { courseId: true } });
  const affSet = new Set(affective.map((x) => codeOfId.get(x.courseId) || ""));
  const direct = flagged((c) => (c.teachingMethods && /role play|group project|presentation|case stud/i.test(c.teachingMethods) ? c.teachingMethods : null)).map((c) => `${c.title} (${c.code})`);
  const viaClo = Array.from(latestPerCode.values()).filter((c) => affSet.has(c.code)).map((c) => `${c.title} (${c.code})`);
  f2.push(table("Table 2.8", "Soft skills, affective attributes and ethos developed by the curriculum", ["Courses directly promoting them", "Courses with CLOs for them (affective domain)"],
    Array.from({ length: Math.max(direct.length, viaClo.length) }, (_, i) => [direct[i] || "", viaClo[i] || ""]), "/coordinator/courses"));
  f2.push(table("Table 2.9", "Program delivery methods", ["No.", "Course", "Teaching methods"], flagged((c) => c.teachingMethods).map((c, i) => [i + 1, `${c.title} (${c.code})`, c.teachingMethods || ""]), "/coordinator/courses"));
  f2.push(narrative("2.5c", "How the teaching methods promote students' soft skills, affective attributes and ethos"));
  f2.push(narrative("2.5d", "How these are assessed, and corrective measures"));
  const outlineCourses = ["General Education", "Core", "Elective"].map((type) => Array.from(latestPerCode.values()).find((c) => (c.courseType || "").toLowerCase().startsWith(type.toLowerCase().split(" ")[0]))).filter((c): c is (typeof courses)[number] => !!c);
  const outlineRows: Cell[][] = [];
  for (const c of outlineCourses) {
    const [clos, sessions] = await Promise.all([prisma.cLO.count({ where: { courseId: c.id, source: "SE" } }), prisma.lectureRow.findMany({ where: { courseId: c.id, source: "SE", topic: { not: "" } }, select: { teachingMethod: true } })]);
    outlineRows.push([`${c.title} (${c.code})`, c.courseType || "", clos, sessions.length, sessions.filter((x) => x.teachingMethod).length]);
  }
  f2.push(table("Q 2.6", "Course outlines of one support, one core and one elective course (Appendix 2C)", ["Course", "Category", "CLOs", "Sessions planned", "Sessions with a teaching method"], outlineRows, "/coordinator/courses",
    "Each course outline (CLOs, CLO-GA map, session plan with method, assessment and materials) prints from the course's Course Description report."));
  f2.push(appendix(["2A", "2B"], "Academic Council approval and HEC NOC"));
  f2.push(appendix(["2D"], "Policy for continuously updating the curriculum"));
  f2.push(table("Table 2.10", "Curriculum review record", ["Program", "Review", "Number", "Date", "Participants", "Details", "Approved by"],
    recs("CURRICULUM_REVIEW").map((r) => [r.title, s(r.data.type), s(r.data.number), iso(r.recordDate), s(r.data.participants), s(r.data.details), s(r.data.approvedBy)]), area("curriculum")));
  f2.push(appendix(["2E"], "Semester management rules"));
  const folders = await prisma.courseFolder.count({ where: { coordinatorId: { in: leadIds }, kept: true } }).catch(() => 0);
  f2.push({ ...appendix(["2F"], "Sample course file (soft copy)"), note: `${folders} course folder${folders === 1 ? "" : "s"} marked complete under Course Folders.` });
  f2.push(appendix(["2G"], "Assessment and grading policy"));
  f2.push(appendix(["2H"], "Question paper and exam result moderation policy"));
  const instruments = await prisma.assessmentInstrument.findMany({ where: { courseId: { in: offeredIds }, source: "SE" }, select: { courseId: true, type: true, marksPct: true } });
  const byKind = new Map<string, { courses: Set<string>; count: number; min: number; max: number }>();
  for (const i of instruments) {
    const k = i.type || "Other";
    const e = byKind.get(k) || { courses: new Set<string>(), count: 0, min: Infinity, max: -Infinity };
    e.courses.add(i.courseId); e.count++; e.min = Math.min(e.min, i.marksPct); e.max = Math.max(e.max, i.marksPct);
    byKind.set(k, e);
  }
  f2.push(table("Table 2.11", "Assessment methods used", ["Assessment mode", "Frequency (average per course using it)", "Range of marks (%)"],
    Array.from(byKind.entries()).map(([k, e]) => [k, r1(e.count / e.courses.size), e.min === e.max ? `${e.min}` : `${e.min}–${e.max}`]), "/coordinator/courses", "Worked out from the assessment plans of the program courses."));
  f2.push(appendix(["2I"], "Examination rules and procedures"));
  f2.push(narrative("2.13b", "How the examination rules are communicated to faculty and students"));
  f2.push(appendix(["2J"], "Policy for unfair means in assessments"));
  push(f2, restricted("Table 2.12", "Unfair means detection cases (last two semesters)", "UNFAIR_MEANS"),
    table("Table 2.12", "Unfair means detection cases (last two semesters)", ["Semester", "Assessment type", "Student name / ID", "Degree program", "Offense", "Investigation outcome"], recs("UNFAIR_MEANS").map((r) => [s(r.year), s(r.data.assessment), r.title, s(r.data.program), s(r.data.offense), s(r.data.outcome)]), area("cases")));

  // =========================================================================================================== Form 3
  const f3: Item[] = [];
  const studentsOf = (pred: (b: (typeof batches)[number]) => boolean) => students.filter((x) => { const b = batchById.get(x.batchId); return b && pred(b); });
  const activeIn = (y: number, level: string) => studentsOf((b) => levelOf(b.degreeProgram) === level && b.startYear <= y && y - b.startYear < (level === "UG16" ? 4 : level === "GRAD18" ? 2 : 5))
    .filter((x) => x.status === "ACTIVE" || (x.statusDate && x.statusDate.getFullYear() >= y)).length;
  f3.push(table("Table 3.1", "Student enrolment in all study programs", ["Year", "16-year programs", "18-year programs", "Doctoral programs", "Total"],
    years.map((y) => { const a = activeIn(y, "UG16"), b = activeIn(y, "GRAD18"), c = activeIn(y, "PHD"); return [y === t ? `${y} (current)` : `${y}`, a, b, c, a + b + c]; }).filter((r) => (r[4] as number) > 0), "/coordinator/students"));
  const intakeRows: Cell[][] = [];
  for (const y of years) for (const term of ["Fall", "Spring"]) {
    const row: Cell[] = [`${y}`, term];
    let total = 0;
    for (const p of programNames) { const k = studentsOf((b) => b.degreeProgram === p && b.startYear === y && b.startTerm === term).length; row.push(k); total += k; }
    row.push(total);
    if (total) intakeRows.push(row);
  }
  f3.push(table("Table 3.2", "Student intake in the programs under review", ["Year", "Semester", ...programNames, "Total"], intakeRows, "/coordinator/batches"));
  f3.push(table("Table 3.3", "Admission-to-application ratio", ["Program", "Year", "Semester", "Applications (A)", "Passed admission test (B)", "Admissions offered (C)", "Enrolled (D)", "Admission % (D/A)"],
    recs("ADMISSION_STATS").map((r) => { const a = n(r.data.applications), d = n(r.data.enrolled); return [r.title, s(r.year), s(r.data.semester), a, n(r.data.passedTest), n(r.data.offered), d, a && d !== null ? `${r1((100 * d) / a)}%` : ""]; }), area("students")));
  f3.push(table("Table 3.4", "Selection tools used for admissions", ["Program", "Selection tool", "Weightage %"], recs("SELECTION_TOOL").map((r) => [r.title, s(r.data.tool), n(r.data.weightage)]), area("students")));
  f3.push(appendix(["3A"], "Admission policy and procedure"));
  f3.push(narrative("3.6", "How admission policy, requirements, intake and enrolment align with the vision and mission"));
  f3.push(appendix(["3B"], "Policy for monitoring student progression"));
  const graduating = batches.filter((b) => levelOf(b.degreeProgram) === "UG16" ? b.startYear <= t - 4 : b.startYear <= t - 2).sort((a, b) => b.startYear - a.startYear);
  f3.push(table("Table 3.5", "Student dropout rate (last three graduating batches)", ["Program", "Batch", "Intake (A)", "Graduated (B)", "Pending graduation (C)", "Left, non-academic (D)", "Dropped, academic (E)", "Dropout % (E/A×100)"],
    programNames.flatMap((p) => graduating.filter((b) => b.degreeProgram === p).slice(0, 3).map((b) => {
      const st = students.filter((x) => x.batchId === b.id);
      const c = (k: string) => st.filter((x) => x.status === k).length;
      return [p, b.batchName, st.length, c("GRADUATED"), c("ACTIVE"), c("LEFT"), c("DROPPED"), st.length ? `${r1((100 * c("DROPPED")) / st.length)}%` : ""];
    })), "/coordinator/students", "Set each student's status (graduated, left, dropped) on the Students page."));
  f3.push(appendix(["3C"], "Policy for helping weak students"));
  // Probation: cumulative CGPA after each of a student's semesters, in the last graduated batch of each program.
  const threshold = (await getPolicy(chairmanId)).lowCgpaThreshold;
  const probationRows: Cell[][] = [];
  for (const p of programNames) {
    const b = graduating.find((x) => x.degreeProgram === p) || batches.filter((x) => x.degreeProgram === p).sort((a, c) => a.startYear - c.startYear)[0];
    if (!b) continue;
    const ids = students.filter((x) => x.batchId === b.id).map((x) => x.id);
    if (!ids.length) continue;
    const tr = await prisma.studentTranscriptRecord.findMany({ where: { studentId: { in: ids } }, select: { studentId: true, termName: true, termYear: true, creditHours: true, gpaPoints: true } });
    const reached = Array(9).fill(0), recovered = Array(9).fill(0), added = Array(9).fill(0);
    for (const id of ids) {
      const terms = Array.from(new Set(tr.filter((x) => x.studentId === id).map((x) => termIndex(x.termName, x.termYear)))).sort((a, c) => a - c).slice(0, 8);
      let prev = false;
      terms.forEach((ti, k) => {
        const upto = tr.filter((x) => x.studentId === id && termIndex(x.termName, x.termYear) <= ti && x.gpaPoints !== null);
        const cr = upto.reduce((a, x) => a + x.creditHours, 0);
        const on = cr > 0 && upto.reduce((a, x) => a + (x.gpaPoints || 0) * x.creditHours, 0) / cr < threshold;
        if (on) reached[k + 1]++;
        if (k > 0 && prev && !on) recovered[k + 1]++;
        if (k > 0 && !prev && on) added[k + 1]++;
        prev = on;
      });
    }
    if (reached.some((x) => x > 0)) probationRows.push([`${p} (${b.batchName})`, reached[1], ...[2, 3, 4, 5, 6, 7, 8].flatMap((k) => [recovered[k], added[k]])]);
  }
  f3.push(table("Table 3.6", `Students reaching probation (CGPA below ${threshold}) and recovering`, ["Program (batch)", "On probation after sem 1", ...[2, 3, 4, 5, 6, 7, 8].flatMap((k) => [`Sem ${k}: recovered`, `Sem ${k}: added`])], probationRows, "/coordinator/student-transcript",
    "Worked out from the transcripts of the last graduated batch."));
  f3.push(appendix(["3D"], "Student counselling policy and process"));
  f3.push(table("Table 3.7a", "Academic and non-academic counselling", ["Semester", "Counsellor", "Frequency of sessions", "Students counselled", "Mostly sought on"], recs("COUNSELING").map((r) => [s(r.year), r.title, s(r.data.frequency), n(r.data.students), s(r.data.topics)]), area("students")));
  f3.push(table("Table 3.7b", "Counselling by a professional psychologist", ["Semester", "Psychologist (full / part-time)", "Cases accessed directly", "Referred by faculty / management", "Mostly sought on"], recs("PSYCH_COUNSELING").map((r) => [s(r.year), `${r.title}${r.data.employment ? ` (${r.data.employment})` : ""}`, n(r.data.direct), n(r.data.referred), s(r.data.topics)]), area("students")));
  f3.push(appendix(["3E"], "Rules for academic societies and campus clubs"));
  const fin = await prisma.financeEntry.findMany({ where: { chairmanId } }).catch(() => []);
  const finAmt = (fy: string, kind: string, cat: string) => fin.filter((e) => e.fiscalYear === fy && e.kind === kind && e.category === cat).reduce((a, e) => a + e.amount, 0);
  f3.push(table("Table 3.8a", "Budget for academic societies and campus clubs", ["Year", "Budget (PKR)"], [t, t - 1].map((y) => [fiscal(y), finAmt(fiscal(y), "BUDGET", "Student activities and societies")]).filter((r) => (r[1] as number) > 0), "/chairman/finance"));
  const societies = await prisma.studentSociety.findMany({ where: { chairmanId, OR: [{ departmentId: null }, { departmentId: dept.id }] } }).catch(() => []);
  const sMembers = societies.length ? await prisma.societyMember.findMany({ where: { societyId: { in: societies.map((x) => x.id) } } }) : [];
  const sociRow = (x: (typeof societies)[number]): Cell[] => [x.name, x.constitutedOn ? iso(x.constitutedOn) : s(x.foundedYear), x.description || "", sMembers.filter((m) => m.societyId === x.id && m.position !== "Member").map((m) => `${m.position}: ${m.name}`).join("; "), x.memberCount ?? sMembers.filter((m) => m.societyId === x.id).length];
  const isAcademic = (x: (typeof societies)[number]) => x.societyType ? x.societyType === "ACADEMIC_SOCIETY" : ["TECHNICAL", "LITERARY"].includes(x.category);
  f3.push(table("Table 3.8b", "Campus clubs", ["Club", "Date of constitution", "Objectives", "Office bearers", "Total membership"], societies.filter((x) => !isAcademic(x)).map(sociRow), "/student-activities"));
  f3.push(table("Table 3.8c", "Academic societies", ["Academic society", "Date of constitution", "Objectives", "Office bearers", "Total membership"], societies.filter(isAcademic).map(sociRow), "/student-activities"));
  const events = societies.length ? await prisma.societyEvent.findMany({ where: { societyId: { in: societies.map((x) => x.id) }, status: { in: ["APPROVED", "COMPLETED"] }, eventDate: { gte: new Date(Date.UTC(t - 2, 0, 1)) } }, orderBy: { eventDate: "desc" } }) : [];
  const socName = new Map(societies.map((x) => [x.id, x]));
  f3.push(table("Table 3.8d", "Activities held by academic societies and campus clubs (last two years)", ["Activity", "Society / club", "Kind", "Date", "Students who took part"],
    events.map((e) => { const so = socName.get(e.societyId)!; return [e.title, so.name, isAcademic(so) ? "Co-curricular" : "Extracurricular", iso(e.eventDate), e.participants ?? ""]; }), "/student-activities"));
  const direct2 = await prisma.activityLog.findMany({ where: { coordinatorId: { in: leadIds }, activityDate: { gte: new Date(Date.UTC(t - 2, 0, 1)) } }, orderBy: { activityDate: "desc" } }).catch(() => []);
  f3.push(table("Table 3.8e", "Co- and extracurricular activities held directly (last two years)", ["Activity", "Kind", "Date", "Students who took part"],
    direct2.map((a) => [a.title, /sport|cultur|community|trip/i.test(a.category) ? "Extracurricular" : "Co-curricular", iso(a.activityDate), a.participants ?? ""]), "/coordinator/activities"));
  f3.push(appendix(["3F"], "Internship and placement policy"));
  f3.push(table("Table 3.9", "Student internships", ["Program", "Year", "Students eligible", "Got internships", "Arranged by the business school"], recs("INTERNSHIP_STATS").map((r) => [r.title, s(r.year), n(r.data.eligible), n(r.data.got), n(r.data.arranged)]), area("students")));
  f3.push(table("Table 3.10", "Placement activities", ["No.", "Placement activity", "Date", "Program", "Students exposed"], recs("PLACEMENT_ACTIVITY").map((r, i) => [i + 1, r.title, iso(r.recordDate), s(r.data.program), n(r.data.students)]), area("students")));
  const alumni = await prisma.alumni.findMany({ where: { chairmanId, degreeProgram: { in: programNames.concat(["none"]) }, status: "APPROVED" }, select: { id: true, graduationYear: true, employment: { select: { startDate: true, employer: { select: { scope: true, industryType: true } } } } } }).catch(() => []);
  f3.push(table("Table 3.11", "Employment of graduates within six months", ["Year", "Graduates on record", "Employed in national organisations", "Employed in multinational organisations"],
    [t - 1, t - 2].map((y) => {
      const grads = alumni.filter((a) => a.graduationYear === y);
      const within = (a: (typeof alumni)[number], sc: string) => a.employment.some((e) => e.employer.scope === sc && e.startDate && e.startDate <= new Date(Date.UTC(y + 1, 0, 31)));
      return grads.length ? [`${y}`, grads.length, grads.filter((a) => within(a, "NATIONAL")).length, grads.filter((a) => within(a, "MULTINATIONAL")).length] : null;
    }).filter(nonNull), "/coordinator/stakeholders", "From the approved alumni records and their employers (national / multinational)."));
  f3.push(appendix(["3G"], "Student grievance policy and procedure"));
  push(f3, restricted("Table 3.12", "Student grievances (last two years)", "GRIEVANCE"),
    table("Table 3.12", "Student grievances (last two years)", ["Date", "Nature of grievance", "Action taken", "Outcome"], recs("GRIEVANCE").map((r) => [iso(r.recordDate), r.title, s(r.data.action), s(r.data.outcome)]), area("cases")));
  f3.push(appendix(["3H"], "Merit scholarships and financial assistance policy"));
  f3.push(narrative("3.13b", "How scholarships and financial assistance are communicated to students"));
  const sch = await prisma.scholarshipRecord.findMany({ where: { chairmanId } }).catch(() => []);
  const outside = (x: string) => /hec|ehsaas|bisp|pm laptop|government|external|outside|usaid|peef/i.test(x);
  const kindOfScheme = (x: string) => (/merit|sports|hafiz/i.test(x) ? "merit" : /need|ehsaas|bisp|orphan|disabled|kinship/i.test(x) ? "need" : "other");
  f3.push(table("Table 3.13", "Merit scholarships and need-based financial assistance", ["Year", "Enrolment (A)", "Tuition revenue (B)", "Merit: own", "Merit: outside", "Need-based: own", "Need-based: outside", "Others", "Total (F)", "Ratio F/B"],
    years.map((y) => {
      const rows = sch.filter((x) => x.fiscalYear === fiscal(y) && (!x.degreeProgram || programNames.includes(x.degreeProgram)));
      if (!rows.length) return null;
      const sum = (pred: (x: (typeof rows)[number]) => boolean) => rows.filter(pred).reduce((a, x) => a + x.amount, 0);
      const total = rows.reduce((a, x) => a + x.amount, 0), tuition = finAmt(fiscal(y), "INCOME", "Tuition and fees");
      const enrol = activeIn(y, "UG16") + activeIn(y, "GRAD18") + activeIn(y, "PHD");
      return [fiscal(y), enrol, tuition || "", sum((x) => kindOfScheme(x.scheme) === "merit" && !outside(x.scheme)), sum((x) => kindOfScheme(x.scheme) === "merit" && outside(x.scheme)), sum((x) => kindOfScheme(x.scheme) === "need" && !outside(x.scheme)), sum((x) => kindOfScheme(x.scheme) === "need" && outside(x.scheme)), sum((x) => kindOfScheme(x.scheme) === "other"), total, tuition ? r1(total / tuition) : ""];
    }).filter(nonNull), "/chairman/finance", "Tuition revenue is the institute's figure from Finance."));

  // =========================================================================================================== Form 4
  const f4: Item[] = [];
  const permanent = facultyList.filter((f) => !isVisiting(f.id) && fUsers.find((u) => u.id === f.id)?.isActive !== false);
  const visiting = facultyList.filter((f) => isVisiting(f.id));
  const DESIG = ["Professor", "Associate Professor", "Assistant Professor", "Lecturer"];
  const discipline = (id: string) => { const sp = `${prof(id)?.specialization || ""} ${highest(id)?.role || ""}`.toLowerCase(); return /public admin/.test(sp) ? 2 : /commerce/.test(sp) ? 3 : /business|management|financ|marketing|account|human resource|hr|economic|supply chain|mba|bba/.test(sp) ? 1 : 4; };
  f4.push(table("Table 4.1a", "Core faculty by designation", ["Designation", "Business administration / management science", "Public administration", "Commerce", "Others", "Total"],
    [...DESIG.map((d) => { const g = permanent.filter((f) => (prof(f.id)?.designation || "") === d || (d === "Lecturer" && /lecturer/i.test(prof(f.id)?.designation || ""))); return [d, ...[1, 2, 3, 4].map((k) => g.filter((f) => discipline(f.id) === k).length), g.length]; }),
      ["Total", ...[1, 2, 3, 4].map((k) => permanent.filter((f) => DESIG.some((d) => (prof(f.id)?.designation || "").includes(d.split(" ")[0])) && discipline(f.id) === k).length), permanent.length]].filter((r, i, a) => i === a.length - 1 || (r[5] as number) > 0),
    "/faculty-report", "Designation and specialization come from the faculty profiles."));
  f4.push(table("Table 4.1b", "Permanent faculty", ["No.", "Name & CNIC", "Designation", "Qualification", "Specialization", "Academic experience (yrs)", "Industry experience (yrs)", "Degree awarding institution", "Current job duration (yrs)"],
    permanent.map((f, i) => { const p = prof(f.id), h = highest(f.id), ex = expOf(f.id); return [i + 1, `${f.name}${p?.cnic ? ` (${p.cnic})` : ""}`, p?.designation || "", h?.title || "", p?.specialization || h?.role || "", ex.teaching || "", ex.industry || "", h?.organisation || "", yearsOfService(p?.dateOfJoining) ?? ""]; }), "/faculty-report"));
  const g = (gender: string, pred: (id: string) => boolean) => facultyList.filter((f) => (prof(f.id)?.gender || "") === gender && pred(f.id)).length;
  const reg = (id: string) => !isVisiting(id), adj = (id: string) => /adjunct/i.test(prof(id)?.employmentType || ""), vis = (id: string) => /visiting|part-time/i.test(prof(id)?.employmentType || "");
  f4.push(table("Table 4.1c", "Faculty gender mix", ["Gender", "Permanent / regular", "Adjunct", "Visiting"], ["Male", "Female"].map((x) => [x, g(x, reg), g(x, adj), g(x, vis)]).filter((r) => (r[1] as number) + (r[2] as number) + (r[3] as number) > 0), "/faculty-report"));
  // Teaching load per term from the section assignments (credit hours × sections).
  const assignments = await prisma.courseSectionAssignment.findMany({ where: { instructorId: { in: fIds } }, select: { instructorId: true, sectionCount: true, course: { select: { id: true, creditHours: true, semesterNumber: true, offeredTermName: true, offeredTermYear: true, batch: { select: { startTerm: true, startYear: true, degreeProgram: true } } } } } });
  const loadIn = (fid: string, term: number) => {
    const mine = assignments.filter((a) => a.instructorId === fid && courseTermIndex(a.course) === term);
    const per = new Map<string, number>();
    for (const a of mine) { const pg = a.course.batch?.degreeProgram || "Other"; per.set(pg, (per.get(pg) || 0) + a.course.creditHours * Math.max(1, a.sectionCount)); }
    return { total: Array.from(per.values()).reduce((x, y) => x + y, 0), per };
  };
  const maxFor = (fid: string) => { const d = prof(fid)?.designation || ""; const v = isVisiting(fid) ? LOAD.Visiting : (LOAD as Record<string, unknown>)[d] ?? LOAD.Default; return n(v); };
  const ug = programNames.filter((p) => levelOf(p) === "UG16"), gradP = programNames.filter((p) => levelOf(p) === "GRAD18"), phdP = programNames.filter((p) => levelOf(p) === "PHD");
  const fteCols = [...ug, "MS / MPhil", "PhD"];
  const fteRows = (list: typeof facultyList, label: "FTE" | "VFE") => [nowTerm, nowTerm - 1].flatMap((term) => list.map((f) => {
    const L = loadIn(f.id, term), A = maxFor(f.id);
    if (!L.total) return null;
    const c = [...ug.map((p) => L.per.get(p) || 0), gradP.reduce((a, p) => a + (L.per.get(p) || 0), 0), phdP.reduce((a, p) => a + (L.per.get(p) || 0), 0)];
    return [termLabel(term), f.name, label === "FTE" ? prof(f.id)?.designation || "" : prof(f.id)?.affiliation || "", A ?? "set the policy", L.total, ...c, ...c.map((x) => (A ? r1(x / A) : ""))];
  }).filter(nonNull));
  const fteHead = (label: string, who: string) => ["Semester", "Faculty", who, "Max credit hours allowed (A)", "Total credit hours taught (B)", ...fteCols.map((c) => `CH in ${c}`), ...fteCols.map((c) => `${label} ${c}`)];
  const fteNote = Object.keys(LOAD).length ? "Credit hours come from the section assignments (credit hours × sections)." : "Set the teaching-load policy (Faculty activities) to work out FTE.";
  f4.push(table("Table 4.1d", "Full-time equivalent (FTE) teaching load of permanent faculty", fteHead("FTE", "Designation"), fteRows(permanent, "FTE"), area("faculty"), fteNote));
  f4.push(table("Table 4.1e", "Visiting faculty equivalent (VFE) teaching load", fteHead("VFE", "Affiliation"), fteRows(visiting, "VFE"), area("faculty"), `${fteNote} The SAR divides the visiting totals by 3.`));
  const enrolIn = (p: string, term: number) => studentsOf((b) => b.degreeProgram === p && termIndex(b.startTerm, b.startYear) <= term && term - termIndex(b.startTerm, b.startYear) < (levelOf(p) === "UG16" ? 8 : 4)).filter((x) => x.status === "ACTIVE" || (x.statusDate && termIndex(x.statusDate.getMonth() >= 7 ? "Fall" : "Spring", x.statusDate.getFullYear()) >= term)).length;
  const fteFor = (p: string, term: number, list: typeof facultyList, div = 1) => r1(list.reduce((a, f) => { const A = maxFor(f.id); return a + (A ? (loadIn(f.id, term).per.get(p) || 0) / A : 0); }, 0) / div);
  f4.push(table("Table 4.1f", "Faculty-to-student ratio", ["Program", "Semester", "Enrolment (A)", "FTE (B)", "VFE (C)", "Ratio A/(B+C)"],
    programNames.flatMap((p) => [nowTerm, nowTerm - 1, nowTerm - 2].map((term) => { const A = enrolIn(p, term), B = fteFor(p, term, permanent), C = fteFor(p, term, visiting, 3); return A && B + C ? [p, termLabel(term), A, B, C, r1(A / (B + C))] : null; }).filter(nonNull)), area("faculty")));
  const enrollments = await prisma.studentEnrollment.groupBy({ by: ["courseId"], where: { courseId: { in: offeredIds }, status: { not: "WITHDRAWN" } }, _count: true });
  const sections = await prisma.courseSectionAssignment.groupBy({ by: ["courseId"], where: { courseId: { in: offeredIds } }, _sum: { sectionCount: true } });
  f4.push(table("Table 4.1g", "Class size", ["Program", "Semester", "Course enrolments", "Sections", "Class size"],
    programNames.flatMap((p) => [nowTerm, nowTerm - 1, nowTerm - 2].map((term) => {
      const cs = courses.filter((c) => programOfBatch(c.batchId) === p && courseTerm(c) === term);
      const e = cs.reduce((a, c) => a + (enrollments.find((x) => x.courseId === c.id)?._count || 0), 0);
      const sct = cs.reduce((a, c) => a + Math.max(1, sections.find((x) => x.courseId === c.id)?._sum.sectionCount || 0), 0);
      return e ? [p, termLabel(term), e, sct, r1(e / sct)] : null;
    }).filter(nonNull)), "/coordinator/semester"));
  f4.push(appendix(["4A"], "Faculty workload policy"));
  f4.push(table("Table 4.2a", "Workload time allocation (hours per week)", ["Semester", "Faculty", "Designation", "Teaching", "Research", "Services", "Managerial"], recs("WORKLOAD_ALLOCATION").map((r) => [s(r.year), r.title, s(r.data.designation), n(r.data.teaching), n(r.data.research), n(r.data.service), n(r.data.managerial)]), area("faculty")));
  const fyHeads = cycles.length ? await prisma.fypStaff.findMany({ where: { departmentId: dept.id } }).catch(() => []) : [];
  const roleDuty = (id: string) => { const u = fUsers.find((x) => x.id === id); return [u?.role === "HEAD_OF_DEPARTMENT" ? titles.HEAD_OF_DEPARTMENT.title : u?.role === "DEAN" ? titles.DEAN.title : u?.role === "PROGRAM_COORDINATOR" ? titles.PROGRAM_LEAD.title : u?.role === "OMC" ? "OMC member" : "", fyHeads.find((x) => x.userId === id) ? (fyHeads.find((x) => x.userId === id)!.role === "HEAD" ? "FYP Head" : "FYP Committee") : ""].filter(Boolean).join(", "); };
  f4.push(table("Table 4.2b", "Faculty workload executed", ["Semester", "Faculty", "Designation", "Credit hours taught", "Research work produced (this year)", "Committee works", "Administrative duties"],
    [nowTerm, nowTerm - 1].flatMap((term) => permanent.map((f) => { const L = loadIn(f.id, term); if (!L.total) return null; const pubs = fRecords.filter((r) => r.userId === f.id && r.kind === "PUBLICATION" && r.startYear === t).length; const comm = recs("COMMITTEE").filter((c) => s(c.data.composition).toLowerCase().includes(f.name.toLowerCase())).map((c) => c.title).join("; "); return [termLabel(term), f.name, prof(f.id)?.designation || "", L.total, pubs, comm, roleDuty(f.id)]; }).filter(nonNull)), "/coordinator/load-report"));
  f4.push(appendix(["4B"], "Faculty hiring policy")); f4.push(appendix(["4C"], "Documentation of the last faculty hiring"));
  f4.push(appendix(["4D"], "Faculty performance management policy"));
  const appraisals = await prisma.facultyAppraisal.groupBy({ by: ["year", "status"], where: { userId: { in: fIds } }, _count: true }).catch(() => []);
  f4.push({ ...appendix(["4E"], "Performance appraisal instrument"), note: appraisals.length ? `Appraisals on record: ${appraisals.map((a) => `${a.year} ${a.status.toLowerCase()} ${a._count}`).join(", ")}.` : "No appraisals recorded yet (Faculty Appraisal)." });
  const surveys = await prisma.surveyTemplate.findMany({ where: { coordinatorId: { in: leadIds }, stakeholderType: "STUDENT" }, select: { id: true, _count: { select: { responses: true } } } }).catch(() => []);
  f4.push({ ...appendix(["4F"], "Student feedback questionnaire on faculty"), note: `${surveys.length} student survey${surveys.length === 1 ? "" : "s"} with ${surveys.reduce((a, x) => a + x._count.responses, 0)} responses (Feedback Surveys).` });
  f4.push(appendix(["4G"], "Faculty development policy"));
  const devTitles = (y: number) => recs("FACULTY_DEVELOPMENT").filter((r) => r.recordDate && r.recordDate.getFullYear() === y).map((r) => r.title).slice(0, 4).join("; ");
  f4.push(table("Table 4.3a", "Faculty development budget", ["Year", "Budget assigned", "Budget spent", "Major development activities"],
    years.map((y) => [fiscal(y), finAmt(fiscal(y), "BUDGET", "Faculty development and training"), finAmt(fiscal(y), "SPENT", "Faculty development and training"), devTitles(y)]).filter((r) => (r[1] as number) || (r[2] as number) || r[3]), "/chairman/finance"));
  f4.push(table("Table 4.3b", "Faculty development activities (three years)", ["Year", "Activity", "On / off the job", "Internal / external / international", "Venue", "Date", "Faculty attended"],
    recs("FACULTY_DEVELOPMENT").map((r) => [r.recordDate ? r.recordDate.getFullYear() : "", r.title, s(r.data.mode), s(r.data.where), s(r.data.venue), iso(r.recordDate), n(r.data.attendees)]), area("faculty")));
  f4.push(table("Table 4.4a", "Faculty serving on statutory bodies", ["Statutory body", "Faculty member", "Member by designation / appointed", "Date of notification"],
    recs("BODY_MEMBER").filter((r) => String(r.data.memberType || "").startsWith("Faculty")).map((r) => [s(r.data.body), r.title, s(r.data.memberType).replace(/^Faculty \(|\)$/g, ""), iso(r.recordDate)]), area("governance")));
  f4.push(table("Table 4.4b", "Faculty on internal committees", ["Semester", "Committee & purpose", "Composition", "Meeting dates"], recs("COMMITTEE").map((r) => [s(r.year), r.title, s(r.data.composition), s(r.data.meetings)]), area("faculty")));
  f4.push(table("Table 4.4c", "Faculty meetings (last two semesters)", ["Date", "Meeting", "Decisions made"], meetings.filter((m) => m.kind === "FACULTY" && m.meetingDate >= new Date(Date.now() - 400 * 86400000)).map((m) => [iso(m.meetingDate), m.title, m.decisions || ""]), "/meetings"));
  f4.push(appendix(["4H"], "Faculty consultancy policy"));
  f4.push(table("Table 4.5", "Consultancy projects (three years)", ["No.", "Project", "Client agency", "Start & end", "Principal consultant", "Amount (PKR)", "Business school – consultant share"], recs("CONSULTANCY").map((r, i) => [i + 1, r.title, s(r.data.client), `${s(r.data.start)} – ${s(r.data.end)}`, s(r.data.consultant), n(r.data.amount), s(r.data.share)]), area("faculty")));
  f4.push(appendix(["4I"], "Executive education by faculty policy"));
  f4.push(table("Table 4.6", "Executive education conducted by faculty", ["Semester", "Activity", "Date", "On campus / in-house", "Faculty", "Participants", "Revenue (PKR)"], recs("EXEC_EDUCATION").map((r) => [s(r.year), r.title, iso(r.recordDate), s(r.data.venue), s(r.data.faculty), s(r.data.participants), n(r.data.revenue)]), area("faculty")));
  f4.push(appendix(["4J"], "Policy for faculty engagement with outside organisations"));
  f4.push(table("Table 4.7", "Faculty engagement with outside organisations", ["Year", "Faculty", "Outside organisation", "Type of engagement", "Last activity"], recs("OUTSIDE_ENGAGEMENT").map((r) => [s(r.year), r.title, s(r.data.organization), s(r.data.type), `${s(r.data.lastActivity)}${r.data.lastDate ? ` (${s(r.data.lastDate)})` : ""}`]), area("faculty")));
  f4.push({ ...appendix(["4K"], "Faculty satisfaction survey questionnaire"), note: recs("FACULTY_SURVEY").map((r) => `${s(r.year)}: ${s(r.data.respondents)} respondents, ${s(r.data.score)}/5`).join("; ") || "No faculty satisfaction survey recorded." });
  // Exits name colleagues, so the register is confidential; the SAR only needs the counts, which everyone building it may see.
  const exits = parsed.filter((r) => r.kind === "FACULTY_EXIT");
  f4.push({ ...appendix(["4L"], "Faculty exit interview questionnaire"), note: `${exits.filter((r) => r.data.interviewed).length} exit interviews recorded.` });
  f4.push(table("Table 4.8", "Faculty turnover (three years)", ["Year", "Total faculty", "Resigned", "Terminated", "New induction", "Turnover rate"],
    years.map((y) => {
      const joined = (id: string) => prof(id)?.dateOfJoining;
      const left = (yy: number, reason?: string) => exits.filter((e) => e.recordDate && e.recordDate.getFullYear() === yy && (!reason || e.data.reason === reason)).length;
      const total = facultyList.filter((f) => !isVisiting(f.id) && (!joined(f.id) || joined(f.id)!.getFullYear() <= y)).length + exits.filter((e) => e.recordDate && e.recordDate.getFullYear() > y).length;
      const res = left(y, "Resigned"), term = left(y, "Terminated"), inducted = facultyList.filter((f) => !isVisiting(f.id) && joined(f.id)?.getFullYear() === y).length;
      return [`${y}`, total, res, term, inducted, total ? `${r1((100 * (res + term)) / total)}%` : ""];
    }), area("faculty"), "Totals come from the faculty profiles (date of joining) and the exits recorded under Faculty activities."));

  // =========================================================================================================== Form 5
  const f5: Item[] = [];
  f5.push(appendix(["5A"], "Research & development policy"));
  f5.push(narrative("5.1b", "How the R&D policy and output align with the vision and mission"));
  f5.push(table("Table 5.1", "ORIC", ["Item", "Information"], ORIC.established || ORIC.head ? [["Date of establishment", s(ORIC.established)], ["Date of HEC recognition", s(ORIC.hecRecognition)], ["Head of ORIC", s(ORIC.head)], ["Reports to", s(ORIC.reportsTo)], ["ORIC ranking", s(ORIC.ranking)]] : [], area("research")));
  f5.push(appendix(["5B"], "ORIC scorecards (last two years)"));
  f5.push(table("Table 5.2", "Research centres", ["Centre / committee", "Year of establishment", "Hierarchical position", "Head", "Reports to"], recs("RESEARCH_CENTER").map((r) => [r.title, n(r.data.year), s(r.data.position), s(r.data.head), s(r.data.reportsTo)]), area("research")));
  f5.push(narrative("5.3b", "Contribution of each research centre to research output"));
  f5.push(table("Table 5.3", "Special-interest research groups", ["No.", "Research group", "Members", "Published output"], recs("RESEARCH_GROUP").map((r, i) => [i + 1, r.title, s(r.data.members), s(r.data.output)]), area("research")));
  const fund = recs("RESEARCH_FUNDING"), spend = recs("RESEARCH_SPENDING");
  const yrMatch = (v: unknown, y: number) => String(v || "").startsWith(String(y));
  f5.push(table("Table 5.4a", "Research funding and spending (PKR)", ["Year", "HEI / school R&D budget", "Government grants", "Industry funding", "Others", "Research spending", "Unspent"],
    years.map((y) => { const f = (src: string) => fund.filter((r) => yrMatch(r.year, y) && r.data.source === src).reduce((a, r) => a + (n(r.data.amount) || 0), 0); const a = f("HEI / business school R&D budget"), b = f("Government research grants"), c = f("Industry research funding"), d = f("Others"); const sp = spend.filter((r) => yrMatch(r.year, y)).reduce((x, r) => x + (n(r.data.amount) || 0), 0); return a + b + c + d + sp ? [`${y}`, a, b, c, d, sp, a + b + c + d - sp] : null; }).filter(nonNull), area("research")));
  f5.push(table("Table 5.4b", "Research spending by heading", ["Year", "Heading", "Funds spent (PKR)", "Faculty benefited"], spend.map((r) => [s(r.year), r.title, n(r.data.amount), n(r.data.faculty)]), area("research")));
  const grants = fRecords.filter((r) => r.kind === "GRANT" && (r.startYear || 0) >= t - 3);
  f5.push(table("Table 5.5", "Funded research projects (three years)", ["No.", "Project", "Funding agency", "Start & end", "Principal investigator", "Amount (PKR)", "Business school – investigator share"],
    [...recs("FUNDED_PROJECT").map((r) => [r.title, s(r.data.agency), `${s(r.data.start)} – ${s(r.data.end)}`, s(r.data.pi), n(r.data.amount), s(r.data.share)]),
      ...grants.map((r) => [r.title, r.organisation || "", `${r.startYear || ""} – ${r.endYear || ""}`, /principal/i.test(r.role || "") ? nameOf(r.userId) : `${nameOf(r.userId)} (${r.role || "member"})`, r.amount || "", ""])].map((x, i) => [i + 1, ...x]), area("research"), "Includes the grants faculty list on their profiles."));
  f5.push(narrative("5.7", "How faculty allocate time to R&D under the workload policy"));
  const pubs = fRecords.filter((r) => r.kind === "PUBLICATION" && (r.status || "Published") === "Published" && r.startYear && r.startYear >= t - 2);
  const pubRows: Cell[][] = [];
  for (const [type, cats] of [["Journal article", ["Impact factor journal", "HEC W category", "HEC X category", "HEC Y category", "Other listing"]], ["Conference paper", [""]], ["Book / chapter", [""]]] as [string, string[]][]) {
    for (const cat of cats) for (const y of years) {
      const set = pubs.filter((p) => (p.role || "") === type && (cat ? (p.category || "Other listing") === cat : true) && p.startYear === y);
      if (!set.length) continue;
      const first = set.filter((p) => p.authorship === "First author").length;
      pubRows.push([type, cat || "—", `${y}`, first, set.length - first, set.length]);
    }
  }
  f5.push(table("Table 5.6", "Research output (three years)", ["Publication type", "Category", "Year", "Faculty as first author", "Faculty as co-author", "Total"], pubRows, "/faculty/profile", "From the publications faculty list on their profiles (category and authorship)."));
  f5.push({ code: "Appendix 5C", question: "Publications in APA format with citation counts", kind: "table", columns: ["Year", "Publication", "Citations"],
    rows: pubs.sort((a, b) => (b.startYear || 0) - (a.startYear || 0)).map((p) => [p.startYear || "", `${p.details ? `${p.details.split("\n")[0]}. ` : `${nameOf(p.userId)}. `}(${p.startYear}). ${p.title}. ${p.organisation || ""}.${p.link ? ` ${p.link}` : ""}`, p.citations ?? ""]),
    status: pubs.length ? "filled" : "missing", fill: "/faculty/profile" });
  f5.push(appendix(["5D"], "Anti-plagiarism policy"));
  push(f5, restricted("Table 5.7", "Plagiarism cases in research work (three years)", "PLAGIARISM_CASE"),
    table("Table 5.7", "Plagiarism cases in research work (three years)", ["Year", "Research work", "Student name / ID", "Degree program", "Offense level", "Investigation outcome"], recs("PLAGIARISM_CASE").map((r) => [s(r.year), r.title, s(r.data.student), s(r.data.program), s(r.data.level), s(r.data.outcome)]), area("cases")));
  f5.push(table("Table 5.8", "Research outputs with societal / industrial impact", ["No.", "Research output", "Type", "Impact"], recs("IMPACT_OUTPUT").filter((r) => r.data.impact !== "Curricular").slice(0, 10).map((r, i) => [i + 1, r.title, s(r.data.type), s(r.data.description)]), area("research")));
  f5.push(narrative("5.11a", "How faculty are encouraged to use their research in the school's academic development"));
  f5.push(table("Table 5.9", "Research outputs with a curricular impact", ["No.", "Research output (APA)", "Contribution to academic development"], recs("IMPACT_OUTPUT").filter((r) => r.data.impact === "Curricular").map((r, i) => [i + 1, r.title, s(r.data.curricular) || s(r.data.description)]), area("research")));
  f5.push(table("Table 5.10", "Conference papers presented by faculty (three years)", ["No.", "Faculty & designation", "Paper", "Conference & venue", "Year"],
    pubs.filter((p) => p.role === "Conference paper").map((p, i) => [i + 1, `${nameOf(p.userId)}${prof(p.userId)?.designation ? `, ${prof(p.userId)!.designation}` : ""}`, p.title, p.organisation || "", p.startYear || ""]), "/faculty/profile"));
  f5.push(table("Table 5.11", "Knowledge dissemination forums organised (three years)", ["No.", "Conference / seminar / symposium", "Theme", "Speakers", "National / international", "Date", "Proceedings published by"],
    recs("DISSEMINATION_FORUM").map((r, i) => [i + 1, r.title, s(r.data.theme), n(r.data.speakers), s(r.data.reach), iso(r.recordDate), s(r.data.proceedings)]), area("research")));
  f5.push(appendix(["5E"], "Thesis / project rules"));
  const groups = cycles.length ? await prisma.fypGroup.findMany({ where: { cycleId: { in: cycles.map((c) => c.id) }, status: { in: ["ACTIVE", "COMPLETED"] } }, select: { cycleId: true, supervisorId: true } }) : [];
  const supRows: Cell[][] = cycles.map((c) => { const gs = groups.filter((x) => x.cycleId === c.id); if (!gs.length) return null; const per = new Map<string, number>(); for (const x of gs) if (x.supervisorId) per.set(x.supervisorId, (per.get(x.supervisorId) || 0) + 1); return [`${c.termName} ${c.termYear}`, "Undergraduate projects", gs.length, per.size, Math.max(0, ...Array.from(per.values()))]; }).filter(nonNull);
  for (const r of recs("THESIS_SUPERVISION")) supRows.push([s(r.year), `${s(r.data.level)} (${r.title})`, n(r.data.theses), n(r.data.supervisors), n(r.data.maxLoad)]);
  f5.push(table("Table 5.12", "Research supervision (three semesters)", ["Semester", "Level", "Projects / theses", "Supervisors", "Maximum load per supervisor"], supRows, "/fyp/manage", "Undergraduate projects come from Final Year Projects; graduate and doctoral theses from Research & ORIC."));

  // =========================================================================================================== Form 6
  const f6: Item[] = [];
  f6.push(appendix(["6A"], "Policy on external linkages"));
  for (const [code, type, label] of [["Table 6.1a", "International", "International linkages"], ["Table 6.1b", "National academic", "National academic linkages"], ["Table 6.1c", "Corporate", "Corporate linkages"]]) {
    f6.push(table(code, `${label} (last two years)`, ["No.", "Organisation / institution", "MOU date", "Activities under the MOU", "Last activity", "Title of the last activity"], recs("MOU").filter((r) => r.data.partnerType === type).map((r, i) => [i + 1, r.title, iso(r.recordDate), n(r.data.activities), s(r.data.lastDate), s(r.data.lastTitle)]), area("outreach")));
  }
  for (const [code, who] of [["Table 6.2a", "Students"], ["Table 6.2b", "Faculty"]]) {
    f6.push(table(code, `${who === "Students" ? "Student" : "Faculty"} exchange (last two years)`, ["Flow", "Institution", "Number", "Starting date", "Completion date"], recs("EXCHANGE").filter((r) => r.data.who === who).map((r) => [s(r.data.direction), r.title, n(r.data.count), s(r.data.start), s(r.data.end)]), area("outreach")));
  }
  const iab = meetings.filter((m) => m.kind === "IAB" && m.meetingDate >= new Date(Date.UTC(t - 2, 0, 1)));
  const members = recs("ADVISORY_MEMBER").map((r) => `${r.title}${r.data.designation ? ` (${s(r.data.designation)})` : ""}`).join("; ");
  f6.push(table("Table 6.3", "Corporate advisory board (last two years)", ["Meeting date", "Members", "Topics discussed and outcome"], iab.map((m) => [iso(m.meetingDate), m.attendees || members, m.decisions || m.title]), "/meetings", members ? `Members: ${members}.` : "Add the board members under Linkages & outreach."));
  f6.push(narrative("6.2b", "How the corporate advisory board has contributed to the school's effectiveness"));
  f6.push(appendix(["6B"], "Alumni association charter"));
  const graduates = students.filter((x) => x.status === "GRADUATED").length;
  const allAlumni = alumni.length;
  const industries = new Map<string, number>();
  for (const a of alumni) for (const e of a.employment) if (e.employer.industryType) industries.set(e.employer.industryType, (industries.get(e.employer.industryType) || 0) + 1);
  f6.push(table("Table 6.4", "Alumni body membership", ["Total graduates", "Registered alumni", "Membership %", "Major industries of placement"],
    graduates || allAlumni ? [[graduates || allAlumni, allAlumni, graduates ? `${r1((100 * allAlumni) / graduates)}%` : "", Array.from(industries.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k).join(", ")]] : [], "/coordinator/stakeholders"));
  f6.push(table("Table 6.5", "Alumni participation", ["No.", "Engagement activity", "Association-based / individual", "Alumni who took part"], recs("ALUMNI_ACTIVITY").map((r, i) => [i + 1, r.title, s(r.data.participation), n(r.data.alumni)]), area("outreach")));
  f6.push(appendix(["6C"], "Community development and social service policy"));
  const community = recs("COMMUNITY_ACTIVITY");
  const communityEvents = events.filter((e) => /community/i.test(e.category));
  const communityLog = direct2.filter((a) => /community/i.test(a.category));
  f6.push(table("Table 6.6a", "Community development activities through MOUs", ["No.", "Activity", "Partner organisation", "MOU date", "Students involved", "Date"], community.filter((r) => r.data.partner).map((r, i) => [i + 1, r.title, s(r.data.partner), s(r.data.mouDate), n(r.data.students), iso(r.recordDate)]), area("outreach")));
  f6.push(table("Table 6.6b", "Community development activities held directly", ["No.", "Activity", "Students involved", "Date"],
    [...community.filter((r) => !r.data.partner).map((r) => [r.title, n(r.data.students), iso(r.recordDate)]), ...communityEvents.map((e) => [e.title, e.participants ?? "", iso(e.eventDate)]), ...communityLog.map((a) => [a.title, a.participants ?? "", iso(a.activityDate)])].map((x, i) => [i + 1, ...x]), area("outreach")));
  f6.push(appendix(["6D"], "Environmental protection policy"));
  f6.push(table("Table 6.7a", "On-campus environmental initiatives", ["No.", "Initiative", "Description", "Date"], recs("ENVIRONMENT_INITIATIVE").filter((r) => r.data.where === "On campus").map((r, i) => [i + 1, r.title, s(r.data.description), iso(r.recordDate)]), area("outreach")));
  f6.push(table("Table 6.7b", "Outside environmental activities", ["No.", "Activity", "Partner (if through an MOU)", "Description", "Students involved", "Date"], recs("ENVIRONMENT_INITIATIVE").filter((r) => r.data.where === "Outside").map((r, i) => [i + 1, r.title, s(r.data.partner), s(r.data.description), n(r.data.students), iso(r.recordDate)]), area("outreach")));

  // =========================================================================================================== Form 7
  const f7: Item[] = [];
  f7.push(appendix(["7A"], "Finance manual"));
  f7.push(table("Table 7.1", "Budget (three years)", ["Year", "University budget", "Proposed by the business school", "Received by the business school", "Budget type"], recs("BUDGET_YEAR").map((r) => [r.title, n(r.data.university), n(r.data.proposed), n(r.data.received), s(r.data.type)]), area("resources")));
  const lines = recs("FINANCE_LINE");
  const fyears = [t - 3, t - 2, t - 1, t, t + 1, t + 2].map(fiscal);
  const amt = (p: string, fy: string) => lines.filter((r) => r.title === p && String(r.year || "") === fy).reduce((a, r) => a + (n(r.data.amount) || 0), 0);
  const particulars = Array.from(new Set(lines.map((r) => r.title)));
  const revenue = particulars.filter((p) => p.startsWith("Revenue")), expense = particulars.filter((p) => p.startsWith("Expense"));
  const total = (ps: string[], fy: string) => ps.reduce((a, p) => a + amt(p, fy), 0);
  f7.push(table("Table 7.2", "Financial information of the business school (PKR million)", ["Particular", ...fyears.map((fy, i) => (i >= 4 ? `${fy} (projected)` : fy))],
    lines.length ? [...revenue.map((p) => [p, ...fyears.map((fy) => amt(p, fy) || "")]), ["TOTAL REVENUE (A)", ...fyears.map((fy) => total(revenue, fy) || "")], ...expense.map((p) => [p, ...fyears.map((fy) => amt(p, fy) || "")]), ["TOTAL EXPENSES (B)", ...fyears.map((fy) => total(expense, fy) || "")], ["ANNUAL BALANCE (A−B)", ...fyears.map((fy) => r1(total(revenue, fy) - total(expense, fy)) || "")]] : [],
    area("resources")));
  f7.push(narrative("7.4a", "How the school identifies financial risks from internal and external factors, and remedies"));
  f7.push(table("Table 7.3", "Financial risk management", ["Financial risk", "Remedial measures", "Stakeholders involved"], recs("FINANCIAL_RISK").map((r) => [r.title, s(r.data.remedies), s(r.data.stakeholders)]), area("resources")));
  // Facilities from the buildings, rooms, services, library and labs, plus the school's own details.
  const [buildings, rooms, services, lib, labs] = await Promise.all([
    prisma.facilityBuilding.findMany({ where: { chairmanId } }).catch(() => []),
    prisma.facilityRoom.findMany({ where: { chairmanId } }).catch(() => []),
    prisma.facilityService.findMany({ where: { chairmanId } }).catch(() => []),
    prisma.libraryInfo.findUnique({ where: { chairmanId } }).catch(() => null),
    prisma.labInfo.findMany({ where: { chairmanId, OR: [{ departmentId: dept.id }, { departmentId: null }] } }).catch(() => []),
  ]);
  const roomsOf = (types: string[], mine?: boolean) => rooms.filter((r) => types.includes(r.roomType) && (mine === undefined || (mine ? r.departmentId === dept.id : r.departmentId === null)));
  const caps = (rs: typeof rooms) => { const c = rs.map((r) => r.capacity || 0).filter(Boolean); return c.length ? `${Math.min(...c)}–${Math.max(...c)}` : ""; };
  const svc = (kind: string) => services.filter((x) => x.kind === kind && x.available);
  const enrolledNow = students.filter((x) => x.status === "ACTIVE").length;
  const workstations = labs.reduce((a, l) => a + l.computers, 0);
  const fr: Cell[][] = [
    ["Premises", "Total area (sq ft)", buildings.reduce((a, b) => a + (b.totalAreaSqft || 0), 0) || ""], ["Premises", "Covered area (sq ft)", buildings.reduce((a, b) => a + (b.coveredAreaSqft || 0), 0) || ""],
    ["Premises", "Open area (sq ft)", buildings.reduce((a, b) => a + Math.max(0, (b.totalAreaSqft || 0) - (b.coveredAreaSqft || 0)), 0) || ""], ["Premises", "Total student enrolment", enrolledNow],
    ["Faculty offices", "Total faculty", facultyList.length], ["Faculty offices", "Faculty offices", roomsOf(["FACULTY_OFFICE"], true).length + roomsOf(["FACULTY_OFFICE"], false).length || ""],
    ["Faculty offices", "Offices with one / two / more faculty", [FAC.officesOne, FAC.officesTwo, FAC.officesMore].map((x) => s(x) || "—").join(" / ")],
    ["Faculty offices", "Air conditioning / safe cabinets / own computers", [yn(FAC.officeAc), yn(FAC.officeCabinets), yn(FAC.officeComputers)].map((x) => x || "—").join(" / ")], ["Faculty offices", "Printers", s(FAC.printers)],
    ["Lecture halls", "Dedicated to the business school", s(FAC.hallsDedicated) || roomsOf(["CLASSROOM", "LECTURE_HALL"], true).length || ""], ["Lecture halls", "Used on a shared basis", s(FAC.hallsShared) || roomsOf(["CLASSROOM", "LECTURE_HALL"], false).length || ""],
    ["Lecture halls", "Seating capacity (min–max)", caps(roomsOf(["CLASSROOM", "LECTURE_HALL"]))],
    ["Lecture halls", "Smartboards / white boards / multimedia / audiovisual / lighting / AC", [yn(FAC.hallSmartboards), yn(FAC.hallWhiteboards), yn(FAC.hallMultimedia) || (rooms.some((r) => r.multimedia) ? "Yes" : ""), yn(FAC.hallAudioVisual), yn(FAC.hallLighting), yn(FAC.hallAc) || (rooms.some((r) => r.airConditioned) ? "Yes" : "")].map((x) => x || "—").join(" / ")],
    ["Halls and spaces", "Auditoriums (seats)", roomsOf(["AUDITORIUM"]).map((r) => `${r.name} (${r.capacity || "?"})`).join(", ")], ["Halls and spaces", "Seminar / multipurpose halls (seats)", roomsOf(["SEMINAR"]).map((r) => `${r.name} (${r.capacity || "?"})`).join(", ")],
    ["Halls and spaces", "Conference rooms (seats)", roomsOf(["CONFERENCE"]).map((r) => `${r.name} (${r.capacity || "?"})`).join(", ")], ["Halls and spaces", "Study spaces / breakout rooms", s(FAC.studySpaces)],
    ["Library", "Number of libraries", s(LIB.libraries) || (lib ? 1 : "")], ["Library", "Total seating capacity", lib?.seats ?? ""], ["Library", "Management-science textbooks (hard copy)", s(LIB.textbooks)],
    ["Library", "Management-science reference books", s(LIB.referenceBooks)], ["Library", "Local / international journal subscriptions", [s(LIB.localJournals), s(LIB.intlJournals)].map((x) => x || "—").join(" / ")],
    ["Library", "Magazines / e-books", [s(LIB.magazines), s(LIB.ebooks) || s(lib?.ebooks)].map((x) => x || "—").join(" / ")], ["Library", "Budget for new books & journals (allocated / spent, PKR)", [s(LIB.budgetAllocated), s(LIB.budgetSpent)].map((x) => x || "—").join(" / ")],
    ["Library", "New books / subscriptions this year", s(LIB.newItems)], ["Library", "HEC digital library / off-campus access", [yn(LIB.hecDigitalLibrary), yn(LIB.offCampusAccess)].map((x) => x || "—").join(" / ")],
    ["Library", "Other digital libraries", s(LIB.otherDigitalLibraries) || s(lib?.databases)],
    ["Laboratories", "Laboratories", labs.length || ""], ["Laboratories", "Workstations", workstations || ""], ["Laboratories", "Computer-to-student ratio", workstations && enrolledNow ? `1 : ${r1(enrolledNow / workstations)}` : ""],
    ["Laboratories", "Software installed", Array.from(new Set(labs.flatMap((l) => (l.software || "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean)))).slice(0, 20).join(", ")],
    ["IT", "LAN / WAN; bandwidth; Wi-Fi areas", [s(IT.network), s(IT.bandwidth) || s(svc("INTERNET")[0]?.capacity), s(IT.wanAreas)].map((x) => x || "—").join("; ")],
    ["IT", "LMS / CMS / backup servers", [yn(IT.lms), yn(IT.cms), yn(IT.backup)].map((x) => x || "—").join(" / ")],
    ["IT", "Smartboards / document cameras / webcams / audio / tablets / video conferencing", [yn(IT.smartboards), yn(IT.documentCameras), yn(IT.webcams), yn(IT.audio), yn(IT.tablets), yn(IT.videoConferencing)].map((x) => x || "—").join(" / ")],
    ["Admissions office", "Seats / computers / software", [s(FAC.admissionsSeats), s(FAC.admissionsComputers), s(FAC.admissionsSoftware)].map((x) => x || "—").join(" / ")],
    ["Examination office", "Seats / computers / software / photocopiers / strong room", [s(FAC.examSeats), s(FAC.examComputers), s(FAC.examSoftware), s(FAC.examPhotocopiers), yn(FAC.examStrongRoom)].map((x) => x || "—").join(" / ")],
    ["Transport", "Vans for faculty / students", [s(FAC.vansFaculty), s(FAC.vansStudents)].map((x) => x || "—").join(" / ") + (svc("TRANSPORT").length ? ` (transport: ${svc("TRANSPORT").map((x) => `${x.quantity ?? "?"} vehicles`).join(", ")})` : "")],
    ["Miscellaneous", "Prayer room / cafeteria / sports / dispensary", [svc("PRAYER").length ? "Yes" : "No", svc("CAFETERIA").length ? "Yes" : "No", svc("SPORTS").length ? "Yes" : "No", svc("DISPENSARY").length ? "Yes" : "No"].join(" / ")],
    ["Miscellaneous", "Female common room / male lounge", [yn(FAC.femaleCommonRoom), yn(FAC.maleCommonRoom)].map((x) => x || "—").join(" / ")],
    ["Hostels", "Faculty / female / male hostels", [s(FAC.facultyHostels), s(FAC.femaleHostels), s(FAC.maleHostels)].map((x) => x || "—").join(" / ") + (svc("HOSTEL").length ? ` (hostels on record: ${svc("HOSTEL").map((x) => `${x.name} ${x.capacity ?? "?"} beds`).join(", ")})` : "")],
  ];
  f7.push(table("Table 7.4", "Business school facilities", ["Facility", "Criterion", "Measurement / number"], fr.filter((r) => r[2] !== "" && r[2] !== "— / — / —"), area("resources"), "Buildings, rooms, services, library and labs come from Facilities, Library and Labs; the rest from Finance & resources."));
  f7.push(appendix(["7B"], "Admin manual"));
  f7.push(table("Table 7.5", "Support staff", ["Function", "Number", "Head of the function", "Qualification & experience of the head"], recs("SUPPORT_STAFF").map((r) => [r.title, n(r.data.number), s(r.data.head), s(r.data.headProfile)]), area("resources")));
  f7.push(table("Table 7.6", "Employee benefits and welfare", ["Scheme", "Faculty beneficiaries", "Staff beneficiaries"], recs("EMPLOYEE_BENEFIT").map((r) => [r.title, n(r.data.faculty), n(r.data.staff)]), area("resources")));
  f7.push(appendix(["7C"], "Codes of ethics for employees and students"));
  push(f7, restricted("Table 7.7a", "Faculty and staff misconduct cases (two years)", "EMPLOYEE_MISCONDUCT"),
    table("Table 7.7a", "Faculty and staff misconduct cases (two years)", ["Date", "Faculty / staff involved", "Nature of misconduct", "Outcome", "Action taken"], recs("EMPLOYEE_MISCONDUCT").map((r) => [iso(r.recordDate), r.title, s(r.data.nature), s(r.data.outcome), s(r.data.action)]), area("cases")));
  push(f7, restricted("Table 7.7b", "Student misconduct cases (two years)", "STUDENT_MISCONDUCT"),
    table("Table 7.7b", "Student misconduct cases (two years)", ["Date", "Student(s) involved", "Nature of misconduct", "Outcome", "Action taken"], recs("STUDENT_MISCONDUCT").map((r) => [iso(r.recordDate), r.title, s(r.data.nature), s(r.data.outcome), s(r.data.action)]), area("cases")));
  f7.push(appendix(["7D"], "Sexual harassment policy"));
  push(f7, restricted("Table 7.8", "Sexual harassment cases (two years)", "HARASSMENT"),
    table("Table 7.8", "Sexual harassment cases (two years)", ["Date", "Person(s) involved", "Outcome", "Action taken"], recs("HARASSMENT").map((r) => [iso(r.recordDate), r.title, s(r.data.outcome), s(r.data.action)]), area("cases")));

  void MEETING_KINDS;
  return {
    programs: programNames, otherCouncil,
    department: { id: dept.id, name: dept.name }, school: s(SCHOOL.title) || dept.name, generatedAt: new Date().toISOString(),
    forms: [
      { key: "1", title: "Form 1: Strategic Management", weight: "15%", items: f1 },
      { key: "2", title: "Form 2: Curriculum", weight: "15%", items: f2 },
      { key: "3", title: "Form 3: Students", weight: "15%", items: f3 },
      { key: "4", title: "Form 4: Faculty", weight: "20%", items: f4 },
      { key: "5", title: "Form 5: Research and Development", weight: "10%", items: f5 },
      { key: "6", title: "Form 6: External Linkages and Outreach", weight: "10%", items: f6 },
      { key: "7", title: "Form 7: Institutional Resources", weight: "15%", items: f7 },
    ],
  };
}

/** How complete each form is. */
export function progress(doc: SarDoc) {
  return doc.forms.map((f) => ({ key: f.key, title: f.title, total: f.items.filter((i) => i.status !== "restricted").length, filled: f.items.filter((i) => i.status === "filled").length }));
}
