import { randomUUID } from "crypto";
import { prisma } from "./db";
import { hashPassword } from "./auth";
import { DEMO_HEAD, DEMO_PASSWORD } from "./demoInstitute";
import { CATALOGUE } from "./accreditation/catalogue";
import { FLOWS } from "./accreditation/processFlow";
import { EXPENSE_CATEGORIES, fiscalYearNow } from "./resources";
import { seed as seedVisitDay } from "./visitDay";
import { BBA_PLOS } from "./demoBba";

// Dream University, completed for an NCEAC and an NBEAC visit:
//  • a business school with a BBA (NBEAC) beside the computing programs (NCEAC), a Dean over both, HODs, Student
//    Affairs, Facilities, Finance and the Librarian;
//  • the BBA curriculum (HEC BBA scheme, 8 semesters) built in, so it needs no source institute;
//  • everything the SARs and the readiness checks read: faculty profiles, rooms and labs, library, budget, admissions,
//    surveys, alumni and employers, societies, scholarships, meetings, CQI, course evaluations, NBEAC registers and
//    profile sections, accreditation visits with tasks and process steps, the visit-day plan and a mock visit;
//  • the newer modules: FDP, leave with types, facility bookings, faculty meals, the meeting planner.
// Every step can run again: it skips what is already there.

const db = prisma as unknown as Record<string, any>;
const d = (s: string) => new Date(`${s}T00:00:00Z`);
function rng(seed: string) { let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

async function headId() {
  const h = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!h) throw new Error("Build the demo institute first.");
  return h.id;
}

/** People, the business school, the BBA program and batch, council bindings. Returns the BBA batch id. */
export async function addBusinessSchool() {
  const head = await headId();
  const hash = await hashPassword(DEMO_PASSWORD);
  const mk = (username: string, name: string, role: string, extra: Record<string, unknown> = {}) => ({ id: randomUUID(), username, email: `${username}@dreaminstitute.demo`, passwordHash: hash, name, role, mustChangePassword: false, managedById: head, ...extra });
  const ensure = async (username: string, name: string, role: string, extra: Record<string, unknown> = {}) => {
    const u = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (u) { if (Object.keys(extra).length) await prisma.user.update({ where: { id: u.id }, data: extra as never }); return u.id; }
    const row = mk(username, name, role, extra);
    await prisma.user.create({ data: row as never });
    return row.id;
  };
  const faculty = await prisma.faculty.upsert({ where: { chairmanId_name: { chairmanId: head, name: "Faculty of Computing and Management Sciences" } }, create: { chairmanId: head, name: "Faculty of Computing and Management Sciences" }, update: {} });
  let computing = await prisma.department.findFirst({ where: { chairmanId: head, name: "Department of Computing" } });
  if (!computing) computing = await prisma.department.create({ data: { chairmanId: head, name: "Department of Computing" } });
  let business = await prisma.department.findFirst({ where: { chairmanId: head, name: "Dream Business School" } });
  if (!business) business = await prisma.department.create({ data: { chairmanId: head, name: "Dream Business School" } });
  await prisma.department.updateMany({ where: { id: { in: [computing.id, business.id] } }, data: { facultyId: faculty.id } });
  await prisma.user.update({ where: { id: head }, data: { instituteName: "Dream University (DEMO)" } as never });
  await ensure("dream.dean", "Prof. Dr. Shahid Mehmood", "DEAN", { facultyId: faculty.id });
  await ensure("dream.hod.cs", "Dr. Farhan Ali", "HEAD_OF_DEPARTMENT", { departmentId: computing.id });
  await ensure("dream.hod.bba", "Dr. Ayesha Siddiqa", "HEAD_OF_DEPARTMENT", { departmentId: business.id });
  await ensure("dream.sa", "Ms. Rabia Noor", "STUDENT_AFFAIRS");
  await ensure("dream.facilities", "Mr. Tariq Mahmood", "FACILITIES_MANAGER");
  await ensure("dream.finance", "Mr. Kashif Raza", "FINANCE_OFFICER");
  await ensure("dream.librarian", "Ms. Samina Akhtar", "LIBRARIAN");
  // Program leads get their program named (needed for councils and visits).
  for (const [u, p] of [["dream.lead.cs", "BS Computer Science"], ["dream.lead.ai", "BS Artificial Intelligence"]]) await prisma.user.updateMany({ where: { username: u }, data: { leadProgram: p, departmentId: computing.id } as never });
  const lead = await ensure("dream.lead.bba", "Dr. Saima Qadir", "PROGRAM_COORDINATOR", { departmentId: business.id, leadProgram: "BBA (Hons)" });
  const names = ["Dr. Umair Hashmi", "Ms. Mehwish Latif", "Mr. Adnan Sheikh", "Dr. Sobia Rauf", "Mr. Waqas Anjum", "Ms. Nimra Javed"];
  for (let i = 0; i < names.length; i++) await ensure(`dream.b${i + 1}`, names[i], "INSTRUCTOR", { managedById: lead, departmentId: business.id });
  for (const [program, body, dept] of [["BS Computer Science", "NCEAC", computing.id], ["BS Artificial Intelligence", "NCEAC", computing.id], ["BBA (Hons)", "NBEAC", business.id]] as const)
    await prisma.departmentProgram.upsert({ where: { chairmanId_degreeProgram: { chairmanId: head, degreeProgram: program } }, create: { chairmanId: head, degreeProgram: program, departmentId: dept, accreditationBody: body, bodySetAt: new Date(), bodySetById: head }, update: { accreditationBody: body, departmentId: dept } });

  let batch = await prisma.batch.findFirst({ where: { coordinatorId: lead }, select: { id: true } });
  if (!batch) {
    const teachers = await prisma.user.findMany({ where: { managedById: lead }, orderBy: { username: "asc" }, select: { id: true } });
    await prisma.degreeProgram.create({ data: { coordinatorId: lead, name: "BBA (Hons)", shortCode: "BBA" } });
    batch = await prisma.batch.create({ data: { coordinatorId: lead, degreeProgram: "BBA (Hons)", batchName: "BBA Fall 2024", startTerm: "Fall", startYear: 2024, studentCount: 30, advisorId: teachers[2]?.id || null } as never, select: { id: true } });
    await prisma.currentTerm.create({ data: { coordinatorId: lead, termName: "Fall", year: 2026 } as never });
    const GR: [string, number][] = [["A", 4], ["A-", 3.67], ["B+", 3.33], ["B", 3], ["B-", 2.67], ["C+", 2.33], ["C", 2], ["C-", 1.67], ["D+", 1.33], ["D", 1], ["F", 0]];
    await prisma.gradingScale.createMany({ data: GR.map(([letter, gpaValue], i) => ({ coordinatorId: lead, letter, gpaValue, orderIndex: i })) as never });
    await prisma.pLO.createMany({ data: BBA_PLOS.map((t, i) => ({ coordinatorId: lead, batchId: batch!.id, number: i + 1, title: t.split(":")[0], description: t, status: "approved" })) as never });
    await prisma.programProfile.create({ data: { coordinatorId: lead, degreeProgram: "BBA (Hons)", peos: JSON.stringify(["Graduates hold responsible managerial and entrepreneurial positions in national and international organisations.", "Graduates make ethical, evidence-based business decisions and contribute to society.", "Graduates continue professional development through higher studies and certifications."]), peoPloJson: JSON.stringify({ PEO1: [1, 2, 5, 7], PEO2: [3, 4, 6], PEO3: [8] }), departmentVision: "To be a leading business school that develops ethical and innovative business leaders.", departmentMission: "To impart quality business education through research-led teaching, industry linkages and community engagement." } as never });
    const r = rng("students-BBA");
    const F = ["Ali", "Sara", "Hamza", "Ayesha", "Bilal", "Zainab", "Usman", "Hira", "Fahad", "Maryam", "Saad", "Iqra", "Omar", "Noor", "Taha", "Amna"], L = ["Khan", "Ahmed", "Raza", "Malik", "Shah", "Iqbal", "Butt", "Qureshi", "Javed", "Riaz"];
    await prisma.student.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ id: randomUUID(), batchId: batch!.id, name: `${F[Math.floor(r() * F.length)]} ${L[Math.floor(r() * L.length)]}`, rollNumber: `DRM-BB-24-${String(i + 1).padStart(3, "0")}`, passwordHash: hash, mustChangePassword: false, currentSemesterNumber: 5 })) as never });
  }
  return { demoBatchId: batch.id, sourceBatchId: "BUILTIN:BBA" };
}

/* ------------------------------------------------------------------------------------------------ campus data */

async function scope() {
  const head = await headId();
  const users = await prisma.user.findMany({ where: { OR: [{ id: head }, { managedById: head }, { managedBy: { managedById: head } }] }, select: { id: true, name: true, role: true, username: true, departmentId: true, managedById: true, leadProgram: true } });
  const leads = users.filter((u) => u.role === "PROGRAM_COORDINATOR");
  const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: leads.map((l) => l.id) } }, select: { id: true, coordinatorId: true, degreeProgram: true, batchName: true } });
  const depts = await prisma.department.findMany({ where: { chairmanId: head }, select: { id: true, name: true } });
  const teachers = users.filter((u) => ["INSTRUCTOR", "SUBJECT_EXPERT"].includes(u.role));
  return { head, users, leads, batches, depts, teachers, by: (u: string) => users.find((x) => x.username === u)?.id || head };
}

/** Faculty profiles, qualifications, experience and research; rooms, labs, library, buildings, services, budget. */
export async function campusPeople() {
  const s = await scope();
  const staff = s.users.filter((u) => !["CHAIRMAN"].includes(u.role));
  const DES = ["Professor", "Associate Professor", "Assistant Professor", "Assistant Professor", "Lecturer", "Lecturer"];
  const SPEC: Record<string, string[]> = { cs: ["Artificial Intelligence", "Software Engineering", "Computer Networks", "Data Science", "Cyber Security"], bba: ["Finance", "Marketing", "Human Resource Management", "Management", "Accounting & Finance", "Supply Chain"] };
  for (const [i, u] of staff.entries()) {
    if (await prisma.facultyProfile.findUnique({ where: { userId: u.id }, select: { id: true } })) continue;
    const bba = /\.b\d|bba/.test(u.username || "");
    const des = u.role === "DEAN" || u.role === "CHAIRMAN" ? "Professor" : u.role === "HEAD_OF_DEPARTMENT" || u.role === "PROGRAM_COORDINATOR" ? "Associate Professor" : DES[i % DES.length];
    const spec = (bba ? SPEC.bba : SPEC.cs)[i % 5];
    const phd = /^Dr\.|Prof/.test(u.name);
    await prisma.facultyProfile.create({ data: { userId: u.id, designation: ["STUDENT_AFFAIRS", "FACILITIES_MANAGER", "FINANCE_OFFICER", "LIBRARIAN"].includes(u.role) ? "Manager" : des, employmentType: "Permanent", employeeCode: `DU-${String(1001 + i)}`, dateOfJoining: d(`${2012 + (i % 10)}-0${1 + (i % 8)}-01`), gender: /^(Ms|Mrs)\./.test(u.name) ? "Female" : "Male", phone: `0300-55${String(10000 + i * 37).slice(-5)}`, specialization: spec, officeHours: "Mon & Wed 11:00–13:00", verifiedAt: new Date() } as never });
    const recs: Record<string, unknown>[] = [
      { userId: u.id, kind: "EDUCATION", title: phd ? `PhD ${bba ? "Management Sciences" : "Computer Science"}` : `MS ${bba ? "Business Administration" : "Computer Science"}`, organisation: phd ? ["University of Manchester", "NUST", "LUMS", "University of Malaya"][i % 4] : ["FAST-NUCES", "COMSATS", "IBA Karachi", "UET Lahore"][i % 4], startYear: 2008 + (i % 6), endYear: 2012 + (i % 6) },
      { userId: u.id, kind: "EDUCATION", title: bba ? "BBA (Hons)" : "BS Computer Science", organisation: ["Punjab University", "BZU Multan", "GCU Lahore"][i % 3], startYear: 2002 + (i % 6), endYear: 2006 + (i % 6) },
      { userId: u.id, kind: "EXPERIENCE", title: bba ? "Business Analyst" : "Software Engineer", organisation: ["Systems Ltd", "Engro", "HBL", "Netsol"][i % 4], startYear: 2006 + (i % 5), endYear: 2010 + (i % 5) },
    ];
    if (phd || i % 2 === 0) for (let k = 0; k < (phd ? 4 : 1); k++) recs.push({ userId: u.id, kind: "PUBLICATION", title: `${["A study of", "Towards", "An empirical analysis of", "Improving"][k]} ${spec.toLowerCase()} in Pakistani ${bba ? "firms" : "software industry"}`, organisation: ["IEEE Access", "Journal of Business Research", "Pakistan Journal of Commerce", "PLOS ONE"][k], startYear: 2022 + (k % 4), category: ["Impact factor journal", "HEC W category", "HEC X category", "HEC Y category"][k], authorship: k === 0 ? "First author" : "Co-author", citations: 3 + k * 4 });
    if (phd) recs.push({ userId: u.id, kind: "GRANT", title: `HEC NRPU: ${spec} research`, organisation: "HEC", startYear: 2024, amount: "PKR 4.5 million", status: "Ongoing" });
    recs.push({ userId: u.id, kind: "EVENT", title: "OBE and Outcome Assessment Workshop", organisation: "HEC / QAA", startYear: 2025, role: "Participant" });
    await prisma.facultyRecord.createMany({ data: recs as never });
  }
  // Rooms (timetable), facilities, labs, library.
  if (!(await prisma.room.count({ where: { chairmanId: s.head } }))) {
    await prisma.room.createMany({ data: [["CR-101", "LECTURE", 50], ["CR-102", "LECTURE", 50], ["CR-201", "LECTURE", 45], ["CR-202", "LECTURE", 45], ["BS-01", "LECTURE", 50], ["BS-02", "LECTURE", 40], ["Lab-1 (AI Lab)", "LAB", 40], ["Lab-2 (Software Lab)", "LAB", 40]].map(([name, type, capacity]) => ({ chairmanId: s.head, name: String(name), type: String(type), capacity: Number(capacity) })) });
  }
  if (!(await prisma.facilityBuilding.count({ where: { chairmanId: s.head } }))) {
    const a = await prisma.facilityBuilding.create({ data: { chairmanId: s.head, name: "Academic Block A", campus: "Main Campus", totalAreaSqft: 62000, coveredAreaSqft: 48000, floors: 3, yearBuilt: 2014, ownership: "OWNED" } });
    const b = await prisma.facilityBuilding.create({ data: { chairmanId: s.head, name: "Business School Block", campus: "Main Campus", totalAreaSqft: 38000, coveredAreaSqft: 30000, floors: 3, yearBuilt: 2018, ownership: "OWNED" } });
    const comp = s.depts.find((x) => /Computing/.test(x.name))?.id || null, bus = s.depts.find((x) => /Business/.test(x.name))?.id || null;
    const rooms: [string, string, string, string, number, number, number, boolean, string | null][] = [
      [a.id, "CR-101", "CLASSROOM", "Ground", 30, 28, 50, true, comp], [a.id, "CR-102", "CLASSROOM", "Ground", 30, 28, 50, true, comp], [a.id, "CR-201", "CLASSROOM", "First", 28, 26, 45, true, comp], [a.id, "CR-202", "CLASSROOM", "First", 28, 26, 45, true, comp],
      [a.id, "Lab-1 (AI Lab)", "LAB", "Ground", 40, 30, 40, true, comp], [a.id, "Lab-2 (Software Lab)", "LAB", "First", 40, 30, 40, true, comp], [a.id, "Main Auditorium", "AUDITORIUM", "Ground", 90, 60, 350, true, null],
      [a.id, "Seminar Room A", "SEMINAR", "Second", 35, 25, 60, true, null], [a.id, "Board Room", "CONFERENCE", "Second", 30, 20, 24, true, null], [a.id, "Central Library", "LIBRARY", "Ground", 80, 50, 150, false, null],
      [b.id, "BS-01", "CLASSROOM", "Ground", 30, 28, 50, true, bus], [b.id, "BS-02", "CLASSROOM", "Ground", 28, 24, 40, true, bus], [b.id, "Case Study Room", "SEMINAR", "First", 30, 22, 45, true, bus], [b.id, "Faculty Offices (BS)", "FACULTY_OFFICE", "Second", 60, 30, 14, false, bus],
    ];
    await prisma.facilityRoom.createMany({ data: rooms.map(([buildingId, name, roomType, floor, lengthFt, widthFt, capacity, multimedia, departmentId]) => ({ chairmanId: s.head, buildingId, name, roomType, floor, lengthFt, widthFt, capacity, multimedia, airConditioned: true, departmentId })) });
    await prisma.facilityService.createMany({ data: ([
      ["DISPENSARY", "Campus Health Centre", 1, 6, 4, "Doctor 9–5, first aid, ambulance on call"], ["PRAYER", "Campus Masjid", 1, 400, 2, "Separate prayer area for women"], ["SPORTS", "Sports Ground & Courts", 3, 200, 3, "Cricket ground, basketball and badminton courts"],
      ["CAFETERIA", "Faculty & Student Cafeteria", 2, 220, 12, "Separate faculty dining"], ["TRANSPORT", "University Transport", 8, 400, 10, "8 buses on 6 routes"], ["INTERNET", "Campus Wi-Fi", 1, null, 3, "500 Mbps fibre, Wi-Fi in all blocks"],
      ["POWER_BACKUP", "Generators & UPS", 3, null, 2, "500 kVA generator, solar 100 kW"], ["SECURITY", "Security", 1, null, 24, "CCTV, guards at all gates"], ["FIRE_SAFETY", "Fire Safety", 1, null, 2, "Extinguishers, drills each semester"], ["ACCESSIBILITY", "Ramps & Lifts", 4, null, null, "Ramps on all blocks, 2 lifts"],
    ] as [string, string, number, number | null, number | null, string][]).map(([kind, name, quantity, capacity, staff, details]) => ({ chairmanId: s.head, kind, name, quantity, capacity, staff, details })) });
  }
  if (!(await prisma.labInfo.count({ where: { chairmanId: s.head } }))) {
    const comp = s.depts.find((x) => /Computing/.test(x.name))?.id || null;
    for (const [name, sw] of [["AI Lab", "Python, Anaconda, TensorFlow, PyTorch, Jupyter"], ["Software Lab", "Visual Studio, JDK, Android Studio, MySQL, Git"]]) {
      const lab = await prisma.labInfo.create({ data: { chairmanId: s.head, departmentId: comp, name, location: "Academic Block A", seats: 40, computers: 40, computersWorking: 38, software: sw, equipment: "Multimedia projector, LED, whiteboard", internetMbps: 100, lastAudit: d("2026-08-15") } });
      await prisma.labComputerSpec.create({ data: { chairmanId: s.head, labId: lab.id, quantity: 40, makeModel: "Dell OptiPlex 7010", processor: "Core i7 13th gen", ramGb: 16, storage: "512 GB SSD", gpu: name === "AI Lab" ? "RTX 3060" : null, os: "Windows 11 / Ubuntu", purchaseYear: 2024 } });
    }
  }
  await prisma.libraryInfo.upsert({ where: { chairmanId: s.head }, create: { chairmanId: s.head, seats: 150, totalTitles: 14200, computingTitles: 3900, totalVolumes: 31000, printJournals: 42, ebooks: 65000, databases: "HEC Digital Library, IEEE Xplore, ACM DL, Emerald, JSTOR, ScienceDirect", openHoursPerWeek: 72, hasLibrarian: true, lastStockCheck: d("2026-06-30") }, update: {} });
  const fy = fiscalYearNow();
  if (!(await prisma.financeEntry.count({ where: { chairmanId: s.head, fiscalYear: fy } }))) {
    const amt = [185e6, 22e6, 9e6, 6e6, 12e6, 15e6, 4e6, 3e6];
    await prisma.financeEntry.createMany({ data: EXPENSE_CATEGORIES.flatMap((category, i) => [{ chairmanId: s.head, fiscalYear: fy, kind: "BUDGET", category, amount: amt[i] || 1e6 }, { chairmanId: s.head, fiscalYear: fy, kind: "SPENT", category, amount: Math.round((amt[i] || 1e6) * 0.38) }]) });
    const prev = `${Number(fy.slice(0, 4)) - 1}-${fy.slice(2, 4)}`;
    await prisma.financeEntry.createMany({ data: EXPENSE_CATEGORIES.map((category, i) => ({ chairmanId: s.head, fiscalYear: prev, kind: "BUDGET", category, amount: Math.round((amt[i] || 1e6) * 0.9) })) });
  }
  return staff.length;
}

/** Admissions, surveys, alumni and employers, societies, scholarships, evidence, CQI, course evaluations, course folders. */
export async function campusStudents() {
  const s = await scope();
  const fy = fiscalYearNow();
  for (const l of s.leads) {
    const prog = l.leadProgram || "";
    if (!(await prisma.admissionCriteria.count({ where: { chairmanId: s.head, degreeProgram: prog } })))
      await prisma.admissionCriteria.create({ data: { chairmanId: s.head, scopeKey: l.id, degreeProgram: prog, academicYear: "2026-27", minPercentage: 50, requiredSubjects: /BBA/.test(prog) ? "Intermediate (any group) with Mathematics or Statistics preferred" : "FSc Pre-Engineering / ICS, or FSc Pre-Medical with deficiency Mathematics", entryTest: "Dream University Admission Test (or NTS / SAT)", minTestScore: 50, seats: 60, transferPolicy: "Credit transfer up to 50% from HEC-recognised institutions, grade C or better.", otherConditions: "Interview for shortlisted candidates." } });
    if (!(await prisma.surveyResult.count({ where: { leadId: l.id } }))) {
      const rows: [string, string, number, number, number, string, string][] = [
        ["STUDENT", "2026-01-25", 52, 60, 3.9, "Students want more industry projects and earlier lab sessions.", "Industry mini-projects added in two core courses."],
        ["EXIT", "2026-06-20", 38, 45, 4.1, "Graduating students rate faculty highly; career counselling needs to start earlier.", "Career office now meets students from semester 6."],
        ["ALUMNI", "2026-03-15", 41, 120, 4.0, "Alumni value problem solving; ask for more communication skills.", "Presentation component added to capstone evaluation."],
        ["EMPLOYER", "2026-04-10", 14, 25, 3.8, "Employers satisfied with technical skills; teamwork can improve.", "Group projects assessed with peer evaluation rubric."],
      ];
      await prisma.surveyResult.createMany({ data: rows.map(([kind, date, respondents, invited, avgRating, findings, actionTaken]) => ({ chairmanId: s.head, leadId: l.id, kind, surveyDate: d(date), respondents, invited, avgRating, findings, actionTaken, createdById: l.id })) });
      await prisma.surveyTemplate.createMany({ data: ["STUDENT", "ALUMNI", "EMPLOYER"].map((t) => ({ coordinatorId: l.id, title: `${t.charAt(0) + t.slice(1).toLowerCase()} survey ${prog}`, stakeholderType: t })) });
    }
    if (!(await prisma.programEvidence.count({ where: { coordinatorId: l.id } })))
      await prisma.programEvidence.createMany({ data: [
        { coordinatorId: l.id, area: "INDUSTRY", kind: "IAB meeting", title: "Industrial Advisory Board meeting", organization: "Systems Ltd, Engro, HBL", date: d("2026-03-12"), count: 7, notes: "Curriculum feedback on electives." },
        { coordinatorId: l.id, area: "INTERNSHIP", kind: "Internships", title: "Summer internships 2026", organization: "34 organisations", date: d("2026-08-30"), count: 41, target: 90, actual: 82 },
        { coordinatorId: l.id, area: "COUNSELLING", kind: "Career counselling", title: "Career fair and counselling sessions", organization: "Career Office", date: d("2026-04-20"), count: 6 },
        { coordinatorId: l.id, area: "PEO", kind: "PEO assessment", title: "PEO attainment from alumni and employer surveys", date: d("2026-05-15"), target: 70, actual: 76 },
      ] });
  }
  // Alumni and employers (graduates of earlier intakes, before the batches in OBEHUB).
  if (!(await prisma.alumni.count({ where: { chairmanId: s.head } }))) {
    const emps = ["Systems Limited", "Netsol Technologies", "Engro Corporation", "Habib Bank Limited", "Unilever Pakistan", "Arbisoft", "Jazz", "Meezan Bank", "10Pearls", "Nestlé Pakistan"];
    const empIds: string[] = [];
    for (const [i, n] of emps.entries()) { const e = await prisma.employer.create({ data: { chairmanId: s.head, organizationName: n, contactName: `HR Manager ${i + 1}`, contactEmail: `hr${i + 1}@${n.toLowerCase().replace(/[^a-z]/g, "")}.demo`, companySize: i % 2 ? "1000+" : "200-999", industryType: i < 2 || i === 5 || i === 8 ? "Software" : i === 3 || i === 7 ? "Banking" : "FMCG / Telecom", status: "APPROVED" } }); empIds.push(e.id); }
    const r = rng("alumni");
    const F = ["Asim", "Sana", "Kamran", "Huma", "Naveed", "Saba", "Junaid", "Aqsa", "Faisal", "Mehreen", "Shoaib", "Nadia"], L = ["Akhtar", "Bashir", "Chaudhry", "Durrani", "Farooqi", "Gillani", "Hussain", "Jamil"];
    for (const [prog, code] of [["BS Computer Science", "CS"], ["BS Artificial Intelligence", "AI"], ["BBA (Hons)", "BB"]]) for (let y = 2022; y <= 2025; y++) for (let k = 0; k < (code === "AI" ? 4 : 8); k++) {
      const a = await prisma.alumni.create({ data: { chairmanId: s.head, name: `${F[Math.floor(r() * F.length)]} ${L[Math.floor(r() * L.length)]}`, email: `alum.${code.toLowerCase()}${y}${k}@mail.demo`, rollNumber: `DRM-${code}-${String(y - 4).slice(-2)}-${String(k + 1).padStart(3, "0")}`, degreeProgram: prog, graduationYear: y, totalWorkExperienceYears: 2026 - y, status: "APPROVED" } });
      if (r() < 0.85) await prisma.alumniEmployment.create({ data: { alumniId: a.id, employerId: empIds[(code === "BB" ? [2, 3, 4, 6, 7, 9] : [0, 1, 5, 6, 8])[Math.floor(r() * (code === "BB" ? 6 : 5))]], jobTitle: code === "BB" ? ["Management Trainee", "Business Analyst", "Relationship Manager", "Marketing Executive"][k % 4] : ["Software Engineer", "Data Analyst", "ML Engineer", "QA Engineer"][k % 4], startDate: d(`${y}-09-01`), status: "APPROVED" } });
    }
  }
  // Societies with office bearers and events.
  if (!(await prisma.studentSociety.count({ where: { chairmanId: s.head } }))) {
    const students = await prisma.student.findMany({ where: { batchId: { in: s.batches.map((b) => b.id) } }, select: { id: true, name: true, rollNumber: true, batchId: true }, take: 90 });
    const advisor = s.teachers[0]?.id || null;
    const socs: [string, string, string][] = [["Dream Computing Society", "TECHNICAL", "ACADEMIC_SOCIETY"], ["Business & Entrepreneurship Club", "TECHNICAL", "ACADEMIC_SOCIETY"], ["Sports Society", "SPORTS", "CAMPUS_CLUB"], ["Literary & Debating Society", "LITERARY", "CAMPUS_CLUB"], ["Community Service Club", "COMMUNITY", "CAMPUS_CLUB"]];
    for (const [i, [name, category, societyType]] of socs.entries()) {
      const soc = await prisma.studentSociety.create({ data: { chairmanId: s.head, name, category, societyType, advisorId: advisor, foundedYear: 2016 + i, memberCount: 40 + i * 12, description: `${name} of Dream University.`, constitutedOn: d(`${2016 + i}-10-01`) } });
      const pick = students.slice(i * 4, i * 4 + 4);
      await prisma.societyMember.createMany({ data: pick.map((st, k) => ({ societyId: soc.id, studentId: st.id, name: st.name, rollNumber: st.rollNumber, position: ["President", "Vice President", "General Secretary", "Treasurer"][k], term: "2026-27" })) });
      await prisma.societyEvent.createMany({ data: [
        { societyId: soc.id, chairmanId: s.head, title: ["Hackathon 2026", "Startup Pitch Day", "Inter-departmental Cricket", "Annual Debate", "Blood Donation Drive"][i], category: ["COMPETITION", "SEMINAR", "SPORTS", "COMPETITION", "COMMUNITY"][i], eventDate: d(`2026-0${3 + i}-1${i}`), venue: ["Lab-1 (AI Lab)", "Main Auditorium", "Sports Ground & Courts", "Seminar Room A", "Main Auditorium"][i], participants: 80 + i * 20, status: "COMPLETED", outcome: "Held as planned; report filed.", createdById: s.head },
        { societyId: soc.id, chairmanId: s.head, title: ["AI Bootcamp", "Business Plan Competition", "Sports Gala", "Urdu Mushaira", "Tree Plantation"][i], category: ["WORKSHOP", "COMPETITION", "SPORTS", "CULTURAL", "COMMUNITY"][i], eventDate: d(`2026-11-${10 + i * 3}`), venue: ["Lab-1 (AI Lab)", "Main Auditorium", "Sports Ground & Courts", "Main Auditorium", "Campus"][i], participants: 60, status: "APPROVED", startTime: "10:00", endTime: "13:00", createdById: s.head },
      ] });
    }
  }
  if (!(await prisma.scholarshipRecord.count({ where: { chairmanId: s.head } })))
    await prisma.scholarshipRecord.createMany({ data: [["HEC Need-Based Scholarship", 18, 2.7e6], ["Merit Scholarship (Dream University)", 24, 3.1e6], ["Ehsaas Undergraduate Scholarship", 12, 1.9e6], ["Kinship / Sibling Discount", 9, 0.6e6]].flatMap(([scheme, students, amount]) => ["BS Computer Science", "BBA (Hons)"].map((p) => ({ chairmanId: s.head, fiscalYear: fy, scheme: String(scheme), degreeProgram: p, students: Math.round(Number(students) / 2), amount: Number(amount) / 2 }))) });
  // Course evaluations (teacher and course) for finished and current courses; course folders kept for finished ones.
  const courses = await prisma.course.findMany({ where: { batchId: { in: s.batches.map((b) => b.id) }, isOffered: true }, select: { id: true, coordinatorId: true, semesterNumber: true, instructorId: true, studentEnrollments: { select: { studentId: true } } } });
  let evals = 0;
  for (const c of courses) {
    if (await db.courseEvaluation.count({ where: { courseId: c.id } }).catch(() => 1)) continue;
    const r = rng(`eval-${c.id}`), base = 3.4 + r() * 1.2;
    const rows: Record<string, unknown>[] = [];
    for (const e of c.studentEnrollments.slice(0, 22)) for (const kind of ["COURSE", "TEACHER"]) {
      const keys = kind === "COURSE" ? ["objectives", "content", "workload", "assessment", "feedback", "resources", "labs", "skills", "overall"] : ["prepared", "clear", "punctual", "engaged", "fair", "available", "respect", "covered", "overall"];
      rows.push({ id: randomUUID(), courseId: c.id, studentId: e.studentId, kind, answersJson: JSON.stringify(Object.fromEntries(keys.map((k) => [k, Math.max(1, Math.min(5, Math.round(base + (r() - 0.5) * 2)))]))), comment: r() < 0.15 ? ["More examples please.", "Very helpful teacher.", "Assignments were too close together.", "Excellent course."][Math.floor(r() * 4)] : null, createdAt: new Date() });
    }
    await db.courseEvaluation.createMany({ data: rows, skipDuplicates: true }).catch(() => null);
    if ((c.semesterNumber || 0) < 5) await prisma.courseFolder.upsert({ where: { courseId: c.id }, create: { courseId: c.id, coordinatorId: c.coordinatorId, kept: true, note: "Complete: outline, plan, samples (best/average/worst), attendance, results." }, update: {} });
    evals++;
  }
  // CQI on the BBA too (the computing programs got theirs when the demo was built).
  const bba = s.batches.find((b) => /BBA/.test(b.degreeProgram));
  if (bba && !(await prisma.cqiRecord.count({ where: { batchId: bba.id } }))) {
    const weak = await prisma.course.findMany({ where: { batchId: bba.id, semesterNumber: { lte: 4 } }, take: 3, orderBy: { code: "asc" }, select: { id: true, code: true } });
    await prisma.cqiRecord.createMany({ data: weak.map((c, i) => ({ chairmanId: s.head, authorId: bba.coordinatorId, batchId: bba.id, courseId: c.id, sourceType: "CLO", sourceReference: `CLO-${i + 2}`, finding: `${c.code}: fewer than 60% of students reached CLO-${i + 2}.`, actionTaken: i === 2 ? null : "Case-based tutorials and a revision quiz added.", status: i === 0 ? "closed" : i === 1 ? "in-progress" : "open", metricBefore: 50 + i * 3 })) });
  }
  // Past intakes (2019, 2020) uploaded as history, so Performance Prediction has finished students to learn from.
  if (!(await db.historicalRecord.count({ where: { chairmanId: s.head } }).catch(() => 1))) {
    const GR: [string, number, number][] = [["A", 85, 4], ["A-", 80, 3.67], ["B+", 75, 3.33], ["B", 71, 3], ["B-", 68, 2.67], ["C+", 64, 2.33], ["C", 61, 2], ["C-", 58, 1.67], ["D+", 54, 1.33], ["D", 50, 1], ["F", 0, 0]];
    for (const b of s.batches.filter((x) => /Computer Science|BBA/.test(x.degreeProgram))) {
      const cs = await prisma.course.findMany({ where: { batchId: b.id, semesterNumber: { not: null } }, select: { code: true, creditHours: true, semesterNumber: true } });
      const hard = new Map(cs.map((c) => { const r = rng(`hard-${c.code}`); return [c.code, (r() - 0.5) * 0.16]; }));
      const rows: Record<string, unknown>[] = [];
      for (const intake of [2019, 2020]) for (let k = 0; k < 40; k++) {
        const r = rng(`hist-${b.degreeProgram}-${intake}-${k}`);
        const ability = Math.max(0.3, Math.min(0.97, 0.68 + 0.14 * Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r())));
        const roll = `${/BBA/.test(b.degreeProgram) ? "BB" : "CS"}-${String(intake).slice(-2)}-${String(k + 1).padStart(3, "0")}`;
        let fails = 0, last = 8;
        const recs: Record<string, unknown>[] = [];
        for (let sem = 1; sem <= 8; sem++) {
          for (const c of cs.filter((x) => x.semesterNumber === sem)) {
            const pct = Math.max(20, Math.min(98, 100 * (ability - (hard.get(c.code) || 0) + 0.08 * (r() - 0.5) * 2)));
            const g = GR.find(([, min]) => pct >= min)!;
            if (g[0] === "F") fails++;
            recs.push({ id: randomUUID(), chairmanId: s.head, program: b.degreeProgram, intakeYear: intake, rollNumber: roll, semester: sem, termName: sem % 2 ? "Fall" : "Spring", termYear: intake + Math.floor(sem / 2), courseCode: c.code, creditHours: c.creditHours, marksPct: Math.round(pct), attendancePct: Math.round(70 + 28 * ability), grade: g[0], gpaPoints: g[2], uploadedAt: new Date() });
          }
          if (fails >= 4 && sem >= 2) { last = sem; break; }
        }
        const outcome = last < 8 ? "DROPPED" : "GRADUATED";
        for (const x of recs) rows.push({ ...x, outcome });
      }
      for (let i = 0; i < rows.length; i += 1000) await db.historicalRecord.createMany({ data: rows.slice(i, i + 1000) });
    }
  }
  return evals;
}

/** NBEAC registers and profile sections, accreditation visits with tasks and process steps, eligibility, visit day. */
export async function campusAccreditation() {
  const s = await scope();
  const bus = s.depts.find((x) => /Business/.test(x.name));
  const comp = s.depts.find((x) => /Computing/.test(x.name));
  const dean = s.by("dream.dean");
  // Profile sections (HEI and business school).
  const put = async (scopeKey: string, doc: Record<string, unknown>) => {
    const row = await prisma.sarProfile.findUnique({ where: { chairmanId_scopeKey: { chairmanId: s.head, scopeKey } } });
    let cur: Record<string, unknown> = {}; try { cur = row ? JSON.parse(row.dataJson) : {}; } catch { cur = {}; }
    for (const [k, v] of Object.entries(doc)) if (!cur[k]) cur[k] = v;
    await prisma.sarProfile.upsert({ where: { chairmanId_scopeKey: { chairmanId: s.head, scopeKey } }, create: { chairmanId: s.head, scopeKey, dataJson: JSON.stringify(cur), updatedById: s.head }, update: { dataJson: JSON.stringify(cur) } });
  };
  await put("HEI", {
    HEI: { heiName: "Dream University", heiType: "University", actRef: "Punjab Act No. XII of 2012, 14 May 2012", charterType: "Punjab", sector: "Private", profitStatus: "Not for profit", caoTitle: "Vice Chancellor", caoName: "Prof. Kamran Aziz", campuses: "1", campusLocations: "Multan (sub-campus)", vision: "To be a globally recognised university known for ethical leadership, innovation and service to society.", mission: "To provide quality education and research that prepare graduates to serve Pakistan and the world.", vmAuthority: "Board of Governors", vmDate: "2022-06-15" },
    QEC: { established: "2013-03-01", staff: "5", headQualification: "PhD Education (Quality Assurance)", category: "W" },
    ORIC: { established: "2015-01-10", hecRecognition: "2016-05-20", head: "Dr. Imran Saeed", reportsTo: "Vice Chancellor", ranking: "Category B" },
  });
  if (bus) await put(bus.id, {
    SCHOOL: { title: "Dream Business School", yearEstablished: "2014", address: "Main Campus, Bosan Road, Multan", website: "https://dreamuniversity.demo/dbs", hierarchy: "Constituent part", vision: "To be a leading business school developing ethical and innovative business leaders.", mission: "To impart quality business education through research-led teaching, industry linkages and community engagement.", vmAuthority: "Academic Council", vmDate: "2023-09-10" },
    CONTACTS: { deanName: "Prof. Dr. Shahid Mehmood", deanDesignation: "Dean", deanTelOff: "061-1112233", deanTelCell: "0300-1112233", deanEmail: "dream.dean@dreaminstitute.demo", headName: "Dr. Ayesha Siddiqa", headDesignation: "Head of Business School", headTelOff: "061-1112244", headTelCell: "0301-1112244", headEmail: "dream.hod.bba@dreaminstitute.demo", focalName: "Dr. Saima Qadir", focalDesignation: "Program Lead BBA / NBEAC focal person", focalTelOff: "061-1112255", focalTelCell: "0302-1112255", focalEmail: "dream.lead.bba@dreaminstitute.demo" },
    WORKLOAD_POLICY: { Professor: "6", "Associate Professor": "9", "Assistant Professor": "12", Lecturer: "12", Visiting: "6", Default: "12" },
    FACILITY_DETAILS: { officesOne: "8", officesTwo: "3", officesMore: "0", officeAc: true, officeCabinets: true, officeComputers: true, printers: "Shared, one per 4 faculty", hallsDedicated: "4", hallsShared: "2", hallSmartboards: true, hallWhiteboards: true, hallMultimedia: true, hallAudioVisual: true, hallLighting: true, hallAc: true, studySpaces: "2 breakout rooms, 40 seats", admissionsSeats: "6", admissionsComputers: "6", admissionsSoftware: "Campus ERP", examSeats: "5", examComputers: "5", examSoftware: "OBEHUB", examPhotocopiers: "2", examStrongRoom: true, vansFaculty: "2", vansStudents: "6", femaleCommonRoom: true, maleCommonRoom: true, facultyHostels: "1 (20 rooms)", femaleHostels: "1 (150)", maleHostels: "1 (200)" },
    LIBRARY_DETAILS: { libraries: "1", textbooks: "5200", referenceBooks: "2100", localJournals: "12", intlJournals: "18", magazines: "10", ebooks: "65000", budgetAllocated: "6000000", budgetSpent: "2300000", newItems: "640", hecDigitalLibrary: true, offCampusAccess: true, otherDigitalLibraries: "Emerald, JSTOR, EBSCO Business Source" },
    IT_DETAILS: { network: "Fibre LAN, campus-wide Wi-Fi", bandwidth: "500 Mbps", wanAreas: "All blocks, library, hostels", lms: true, cms: true, backup: true, smartboards: true, documentCameras: true, webcams: true, audio: true, tablets: false, videoConferencing: true },
    narratives: { "1.1": "Dream Business School is a constituent part of Dream University, established in 2014 with the BBA (Hons) program.", "2.1": "The BBA curriculum follows the HEC 2023 BBA framework and was last reviewed by the Board of Studies in March 2026." },
  });
  // Registers.
  if (!(await prisma.accreditationRecord.count({ where: { chairmanId: s.head } }))) {
    const rec = (kind: string, title: string, data: Record<string, unknown>, extra: { departmentId?: string | null; recordDate?: string; year?: string } = {}) => ({ chairmanId: s.head, kind, title, dataJson: JSON.stringify(data), departmentId: extra.departmentId === undefined ? bus?.id || null : extra.departmentId, recordDate: extra.recordDate ? d(extra.recordDate) : null, year: extra.year || null, createdById: s.head });
    const P = (t: string, appendix: string, category: string, date: string) => rec("POLICY", t, { appendix, category, approvedBy: "Academic Council", reviewDate: "2027-06-30", communicated: "Website, student handbook and LMS" }, { departmentId: null, recordDate: date });
    await prisma.accreditationRecord.createMany({ data: [
      rec("STRATEGIC_PLAN", "Strategic Plan 2024–2028", { status: "Current", period: "2024–2028", authority: "Board of Governors", reviewedOn: "2026-01-20", progressTill: "2026-06-30" }, { departmentId: null, recordDate: "2024-02-10" }),
      rec("STRATEGIC_PLAN", "Strategic Plan 2019–2023", { status: "Previous", period: "2019–2023", authority: "Board of Governors" }, { departmentId: null, recordDate: "2019-01-15" }),
      ...["Senate", "Syndicate / Board of Governors", "Academic Council", "Board of Faculty", "Board of Studies", "Selection Board", "BASR", "Finance & Planning Committee"].map((b) => rec("STATUTORY_BODY", b, { chair: b === "Board of Studies" ? "Dr. Ayesha Siddiqa, HOD" : b === "Board of Faculty" ? "Prof. Dr. Shahid Mehmood, Dean" : "Prof. Kamran Aziz, Vice Chancellor", exOfficio: "Dean, Registrar, Controller of Examinations, Treasurer", appointed: "Two external experts nominated by HEC; two senior faculty" }, { departmentId: null })),
      rec("BODY_MEMBER", "Mr. Asad Umar (external)", { body: "Board of Studies", memberType: "External participant", designation: "CFO, Engro Corporation", reach: "National", meetings: "2 (Mar 2026, Sep 2026)" }, { recordDate: "2025-09-01" }),
      rec("BODY_MEMBER", "Dr. Lena Hoffmann (external)", { body: "Board of Studies", memberType: "External participant", designation: "Professor, University of Mannheim", reach: "International", meetings: "1 (online, Mar 2026)" }, { recordDate: "2025-09-01" }),
      rec("QA_REVIEW", "BBA (Hons)", { model: "PREE / SAR", externalOn: "2024-11-20", internalOn: "2026-05-15", plan: "Implementation plan 80% complete" }),
      rec("QA_REVIEW", "Institutional Performance Evaluation", { model: "IPE / RIPE", externalOn: "2023-04-10", internalOn: "2025-12-01", plan: "All 11 standards met or mostly met" }, { departmentId: null }),
      rec("AUDIT", "A. F. Ferguson & Co.", { sbpCategory: "A", observations: "No material observations; fixed-asset register to be updated.", measures: "Asset register updated in ERP." }, { departmentId: null, year: "2024-25" }),
      P("Admission Policy", "3A Admission policy", "Students", "2023-05-10"), P("Semester Rules and Regulations", "2E Semester management rules", "Academic", "2023-05-10"), P("Assessment and Grading Policy", "2G Assessment & grading policy", "Academic", "2023-05-10"),
      P("Examination Rules", "2I Examination rules", "Academic", "2023-05-10"), P("Unfair Means Policy", "2J Unfair means policy", "Academic", "2023-05-10"), P("Faculty Workload Policy", "4A Faculty workload policy", "HR", "2022-08-01"),
      P("Faculty Hiring Policy", "4B Faculty hiring policy", "HR", "2022-08-01"), P("Faculty Development Policy", "4G Faculty development policy", "HR", "2023-01-15"), P("Research & Development Policy", "5A Research & development policy", "Research", "2022-03-01"),
      P("Anti-Plagiarism Policy", "5D Anti-plagiarism policy", "Research", "2022-03-01"), P("Student Grievance Policy", "3G Student grievance policy", "Students", "2023-05-10"), P("Protection against Harassment Policy", "7D Sexual harassment policy", "Administration", "2021-09-01"),
      P("Finance Manual", "7A Finance manual", "Finance", "2021-07-01"), P("Scholarships and Financial Assistance Policy", "3H Scholarships & financial assistance policy", "Students", "2023-05-10"), P("Internship and Placement Policy", "3F Internship & placement policy", "Students", "2023-05-10"),
      rec("CURRICULUM_REVIEW", "BBA (Hons)", { type: "Major", number: "3", participants: "Board of Studies with two external members and the Industrial Advisory Board", details: "Aligned with HEC BBA 2023 framework; added Digital Marketing and Business Analytics electives.", approvedBy: "Academic Council" }, { recordDate: "2026-03-18" }),
      rec("INDIGENOUS_MATERIAL", "Qadir, S. (2025). Growing a family business in Multan: a case study. Dream Business Review, 4(2).", { nature: "Case study", course: "ENT501 Entrepreneurship", contribution: "Local case used in class discussion." }),
      ...["Fall 2024", "Spring 2025", "Fall 2025", "Fall 2026"].map((y, i) => rec("ADMISSION_STATS", "BBA (Hons)", { semester: y.split(" ")[0], applications: String(180 + i * 25), admitted: String(55 + i * 3) }, { year: y })),
      rec("SELECTION_TOOL", "Admission test and interview", { tool: "Written test (English, Mathematics, analytical) 60% + interview 10% + intermediate marks 30%" }),
      rec("COUNSELING", "Academic advising", { frequency: "Twice a semester per batch advisor", topics: "Course load, probation, career paths" }, { year: "2026" }),
      rec("PSYCH_COUNSELING", "Ms. Hina Batool (Clinical Psychologist)", { employment: "Full-time", topics: "Stress, anxiety, adjustment" }),
      rec("INTERNSHIP_STATS", "Summer 2026", { students: "41", organisations: "34" }, { year: "2026" }),
      rec("PLACEMENT_ACTIVITY", "Career Fair 2026", { program: "BBA (Hons), BS Computer Science" }, { recordDate: "2026-04-20" }),
      rec("FACULTY_DEVELOPMENT", "Outcome-Based Education and Assessment", { mode: "On-the-job", where: "Internal", venue: "Seminar Room A", names: "All faculty (14)" }, { recordDate: "2026-02-14" }),
      rec("FACULTY_DEVELOPMENT", "Case Method Teaching (LUMS)", { mode: "Off-the-job", where: "External", venue: "LUMS, Lahore", names: "Dr. Umair Hashmi, Ms. Mehwish Latif" }, { recordDate: "2026-05-08" }),
      rec("COMMITTEE", "Quality Assurance Committee", { composition: "Dean (chair), HODs, QEC representative", meetings: "4 in 2026" }),
      rec("COMMITTEE", "Curriculum Review Committee", { composition: "HOD (chair), Program Lead, two senior faculty", meetings: "3 in 2026" }),
      rec("CONSULTANCY", "Market study for Multan Chamber of Commerce", { client: "Multan Chamber of Commerce & Industry", start: "2026-01-10", end: "2026-04-30", consultant: "Dr. Sobia Rauf", share: "PKR 350,000" }),
      rec("EXEC_EDUCATION", "Financial Management for Non-Finance Managers", { venue: "On campus", faculty: "Dr. Umair Hashmi", participants: "28" }, { recordDate: "2026-07-12" }),
      rec("OUTSIDE_ENGAGEMENT", "Dr. Ayesha Siddiqa", { organization: "HEC National Curriculum Review Committee (Business)", type: "Statutory body member", lastActivity: "Curriculum review meeting", lastDate: "2026-02-20" }),
      rec("FACULTY_SURVEY", "Faculty satisfaction survey 2026", { observations: "High satisfaction with leadership; workload concerns in Fall.", actions: "Teaching assistants hired for large classes." }, { year: "2026" }),
      rec("RESEARCH_CENTER", "Centre for Entrepreneurship and SMEs", { position: "Dedicated to the business school", head: "Dr. Sobia Rauf", reportsTo: "Dean", contribution: "SME case studies, incubation support" }),
      rec("RESEARCH_GROUP", "Islamic Finance Research Group", { members: "4 faculty, 6 students", output: "3 papers in 2025–26" }),
      rec("RESEARCH_FUNDING", "Dream University R&D grant", { source: "HEI / business school R&D budget", amount: "PKR 2,000,000" }, { year: "2025-26" }),
      rec("FUNDED_PROJECT", "SME digital adoption in South Punjab", { agency: "HEC NRPU", start: "2025-03-01", end: "2027-02-28", pi: "Dr. Sobia Rauf", share: "PKR 4,500,000" }),
      rec("IMPACT_OUTPUT", "Rauf, S. (2026). Digital adoption by SMEs in South Punjab. Journal of Business Research.", { type: "Journal article", impact: "Industrial", description: "Findings shared with the Chamber of Commerce." }),
      rec("DISSEMINATION_FORUM", "National Conference on Business and Economics 2026", { theme: "Sustainable growth", reach: "National", proceedings: "ISBN 978-969-0000-00-0" }, { recordDate: "2026-04-05" }),
      rec("MOU", "University of Mannheim Business School", { partnerType: "International", lastDate: "2026-03-01", lastTitle: "Joint online guest lectures" }, { recordDate: "2024-11-15" }),
      rec("MOU", "Engro Corporation", { partnerType: "Corporate", lastDate: "2026-07-01", lastTitle: "Summer internships for 8 students" }, { recordDate: "2023-05-20" }),
      rec("EXCHANGE", "Exchange semester at Mannheim", { who: "2 students", direction: "Students", start: "2026-02-01", end: "2026-06-30" }),
      rec("ADVISORY_MEMBER", "Mr. Asad Umar", { designation: "CFO, Engro Corporation", since: "2023" }),
      rec("ADVISORY_MEMBER", "Ms. Farah Naz", { designation: "Regional Head, Meezan Bank", since: "2024" }),
      rec("ALUMNI_ACTIVITY", "Alumni Homecoming 2026", { participation: "Alumni association" }, { recordDate: "2026-02-28" }),
      rec("COMMUNITY_ACTIVITY", "Financial literacy for women entrepreneurs", { partner: "Akhuwat Foundation", mouDate: "2025-10-01" }, { recordDate: "2026-03-08" }),
      rec("ENVIRONMENT_INITIATIVE", "Plastic-free campus", { where: "On campus", description: "Water dispensers and cloth bags", partner: "WWF Pakistan" }),
      rec("BUDGET_YEAR", "2025-26", { type: "Explicit" }, { year: "2025-26" }),
      rec("FINANCE_LINE", "Revenue: Undergraduate programs fee", { amount: "185000000", projected: "198000000" }, { year: "2025-26" }),
      rec("FINANCE_LINE", "Expense: Faculty salaries", { amount: "96000000", projected: "104000000" }, { year: "2025-26" }),
      rec("FINANCIAL_RISK", "Fall in enrolment", { remedies: "New programs, scholarships, marketing", stakeholders: "Board of Governors, Finance & Planning Committee" }),
      rec("SUPPORT_STAFF", "Admissions Office", { head: "Mr. Bilal Ahmed", headProfile: "MBA, 10 years" }),
      rec("EMPLOYEE_BENEFIT", "Health insurance (employee and family)", {}),
    ] as never });
  }
  // Visits: one NCEAC (BS CS) and one NBEAC (BBA), with tasks, process steps, eligibility and the visit day.
  const out: string[] = [];
  for (const [username, body, visit, title] of [["dream.lead.cs", "NCEAC", "2026-12-08", "BS Computer Science — NCEAC accreditation visit 2026"], ["dream.lead.bba", "NBEAC", "2027-02-16", "BBA (Hons) — NBEAC accreditation 2027"]] as const) {
    const lead = s.users.find((u) => u.username === username);
    if (!lead) continue;
    let cycle = await prisma.accreditationCycle.findFirst({ where: { leadId: lead.id, body } });
    if (!cycle) {
      cycle = await prisma.accreditationCycle.create({ data: { chairmanId: s.head, departmentId: body === "NBEAC" ? bus?.id || null : comp?.id || null, leadId: lead.id, program: lead.leadProgram || "", body, title, visitDate: d(visit), createdById: s.head } });
      const tasks = CATALOGUE[body].tasks;
      const people = [lead.id, dean, s.by(body === "NBEAC" ? "dream.hod.bba" : "dream.hod.cs"), ...s.teachers.filter((t) => t.managedById === lead.id).map((t) => t.id)];
      await prisma.accreditationTask.createMany({ data: tasks.map((t, i) => {
        const status = i % 5 === 0 ? "APPROVED" : i % 5 === 1 ? "SUBMITTED" : i % 5 === 4 ? "OPEN" : "ASSIGNED";
        return { cycleId: cycle!.id, code: t.code, status, assigneeId: status === "OPEN" ? null : people[i % people.length], assignedById: status === "OPEN" ? null : s.head, assignedAt: status === "OPEN" ? null : d("2026-09-01"), dueDate: d(body === "NBEAC" ? "2026-12-15" : "2026-11-15"), submittedAt: ["APPROVED", "SUBMITTED"].includes(status) ? d("2026-10-05") : null, reviewedAt: status === "APPROVED" ? d("2026-10-10") : null, reviewedById: status === "APPROVED" ? s.head : null };
      }) });
      const flow = FLOWS[body];
      const done = body === "NCEAC" ? 4 : 5; // NCEAC: desk audit done, visit next; NBEAC: eligibility cleared, SAR in preparation
      let day = d(body === "NCEAC" ? "2026-05-10" : "2026-03-01").getTime();
      await db.accreditationStep.createMany({ data: flow.map((st, i) => { day += (st.days || 14) * 864e5; return { id: randomUUID(), cycleId: cycle!.id, stepKey: st.key, status: i < done ? "DONE" : "PENDING", doneOn: i < done ? new Date(day) : null, expectedOn: i >= done ? new Date(Math.max(day, Date.now() + (i - done + 1) * 21 * 864e5)) : null, note: i < done ? "Completed" : null, updatedById: s.head, updatedAt: new Date() }; }), skipDuplicates: true }).catch(() => null);
      await seedVisitDay(s.head, cycle.id, cycle.visitDate, s.head).catch(() => null);
      const items = (await db.visitDayItem.findMany({ where: { cycleId: cycle.id } }).catch(() => [])) as { id: string; kind: string; orderNo: number }[];
      for (const it of items) await db.visitDayItem.update({ where: { id: it.id }, data: { ownerId: people[it.orderNo % people.length], status: it.kind === "CHECK" && it.orderNo % 3 === 0 ? "DONE" : it.kind === "CHECK" && it.orderNo % 3 === 1 ? "IN_PROGRESS" : "PENDING" } }).catch(() => null);
      await db.mockVisitFinding.createMany({ data: [
        ["Course files", "Three course files lack samples of best / average / worst student work.", "Add the three samples to every course file of the last two semesters.", "HIGH", "DONE"],
        ["CLO attainment", "Weak CLO in two courses has no documented CQI action.", "Record the CQI action and re-measure next offering.", "MEDIUM", "OPEN"],
        ["Faculty", "Two faculty CVs not updated in the profile.", "Update faculty profiles with 2025–26 publications.", "LOW", "OPEN"],
        ["Facilities", "Lab-2 has 2 computers out of order.", "Repair or replace before the visit.", "MEDIUM", "OPEN"],
      ].map(([area, finding, recommendation, severity, status], i) => ({ id: randomUUID(), chairmanId: s.head, cycleId: cycle!.id, area, finding, recommendation, severity, ownerId: people[(i + 1) % people.length], dueDate: d("2026-11-20"), status, doneNote: status === "DONE" ? "Samples added." : null, createdById: s.head, createdAt: d("2026-10-01"), closedAt: status === "DONE" ? d("2026-10-12") : null })) }).catch(() => null);
      out.push(`${body} visit`);
    }
    await db.councilEligibility.upsert({ where: { chairmanId_body_program: { chairmanId: s.head, body, program: lead.leadProgram || "" } }, create: { id: randomUUID(), chairmanId: s.head, body, program: lead.leadProgram || "", inputsJson: JSON.stringify(body === "NBEAC" ? { charter: "yes", delivery: "Traditional", gradBatches: "6", fullTime: "9" } : { charter: "yes", delivery: "Traditional" }), updatedById: s.head, updatedAt: new Date() }, update: {} }).catch(() => null);
  }
  return out;
}

/** Meetings with minutes and actions, FDP, leave, bookings, meals, appraisals. */
export async function campusActivity() {
  const s = await scope();
  const leadCs = s.by("dream.lead.cs"), leadBba = s.by("dream.lead.bba");
  if (!(await prisma.meetingMinutes.count({ where: { chairmanId: s.head } }))) {
    const M: [string | null, string, string, string, string, string][] = [
      [leadCs, "BOS", "Board of Studies — BS Computer Science", "2026-03-10", "HOD, Program Lead, 4 faculty, 2 external members", "Approved revised CS electives; added AI ethics topic to CS-401."],
      [leadBba, "BOS", "Board of Studies — BBA (Hons)", "2026-03-18", "HOD, Program Lead, 5 faculty, 2 external members", "Approved Digital Marketing elective; internship made 3 credit hours."],
      [null, "OMC", "OMC meeting — CLO attainment review", "2026-07-05", "OMC members, Program Leads", "Courses with weak CLOs to submit CQI actions by 15 August."],
      [null, "FACULTY", "Faculty meeting — Fall 2026 start", "2026-08-20", "All faculty", "Teaching plans to be uploaded by week 1; attendance to be marked daily."],
      [leadCs, "IAB", "Industrial Advisory Board — Computing", "2026-03-12", "7 industry members, HOD, Program Lead", "Industry asked for cloud and DevOps topics."],
      [leadBba, "IAB", "Corporate Advisory Board — Business School", "2026-04-02", "6 corporate members, Dean, HOD", "Banks offer 10 internships; ask for Excel modelling skills."],
      [null, "ACADEMIC_COUNCIL", "Academic Council — 32nd meeting", "2026-06-12", "Vice Chancellor (chair), Deans, HODs", "Approved BOS recommendations for both programs."],
      [leadBba, "ALUMNI", "BBA alumni meet", "2026-02-28", "38 alumni, faculty", "Alumni to mentor final-year students; 4 workshops offered."],
      [leadCs, "STUDENT", "Student representatives meeting — BS CS", "2026-09-15", "Class representatives of all batches", "Lab timings extended to 8 pm; more office hours in week before mids."],
    ];
    for (const [leadId, kind, title, date, attendees, decisions] of M) {
      const m = await prisma.meetingMinutes.create({ data: { chairmanId: s.head, leadId, kind, title, meetingDate: d(date), attendees, decisions, createdById: s.head } });
      await db.meetingExtra.create({ data: { id: randomUUID(), meetingId: m.id, venue: "Board Room", startTime: "11:00", agenda: decisions, inviteesJson: JSON.stringify({ faculty: "ALL", alumniProgram: kind === "ALUMNI" ? "BBA (Hons)" : null, batchId: null, external: null }), status: "HELD" } }).catch(() => null);
      await db.meetingAction.create({ data: { id: randomUUID(), meetingId: m.id, text: `Follow up: ${decisions.split(";")[0]}`, ownerId: leadId || s.head, dueDate: d("2026-11-30"), status: date < "2026-06-01" ? "DONE" : "OPEN", doneAt: date < "2026-06-01" ? d("2026-06-15") : null, createdAt: new Date() } }).catch(() => null);
    }
    for (const [leadId, kind, title, date, venue, agenda] of [[leadCs, "ALUMNI", "BS CS alumni evening 2026", "2026-11-14", "Main Auditorium", "Alumni talks; mentoring sign-up; curriculum feedback"], [leadBba, "STUDENT", "BBA student town hall", "2026-10-28", "Case Study Room", "Feedback on Fall 2026; internship plans"]] as const) {
      const m = await prisma.meetingMinutes.create({ data: { chairmanId: s.head, leadId, kind, title, meetingDate: d(date), createdById: s.head } });
      await db.meetingExtra.create({ data: { id: randomUUID(), meetingId: m.id, venue, startTime: "15:00", agenda, inviteesJson: JSON.stringify({ faculty: "PROGRAM", alumniProgram: kind === "ALUMNI" ? "BS Computer Science" : null, batchId: kind === "STUDENT" ? s.batches.find((b) => /BBA/.test(b.degreeProgram))?.id || null : null, external: null }), status: "SCHEDULED" } }).catch(() => null);
    }
  }
  // FDP.
  if (!(await db.fdpSession.count({ where: { chairmanId: s.head } }).catch(() => 1))) {
    const staff = s.users.filter((u) => ["INSTRUCTOR", "SUBJECT_EXPERT", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT"].includes(u.role)).map((u) => u.id);
    await db.fdpTarget.create({ data: { id: randomUUID(), chairmanId: s.head, hoursPerYear: 20, updatedAt: new Date() } });
    const S: [string, string, string, number, string, string, number][] = [["Outcome-Based Education and Assessment", "WORKSHOP", "2026-02-14", 6, "Dr. Nida Farooq (OMC)", "HELD", 1], ["Writing Good Exam Questions (Bloom's levels)", "WORKSHOP", "2026-04-11", 4, "QEC", "HELD", 0.8], ["Research Writing and Publishing", "SEMINAR", "2026-06-06", 3, "ORIC", "HELD", 0.6], ["Case Method Teaching", "TRAINING", "2026-09-19", 8, "LUMS faculty (visiting)", "HELD", 0.4], ["Using OBEHUB for CLO attainment", "WORKSHOP", "2026-11-07", 3, "Dr. Nida Farooq", "PLANNED", 0], ["Active Learning in Large Classes", "WORKSHOP", "2026-12-05", 4, "QEC", "PLANNED", 0]];
    let n = 0;
    for (const [title, kind, date, hours, facilitator, status, share] of S) {
      const id = randomUUID();
      await db.fdpSession.create({ data: { id, chairmanId: s.head, title, kind, date: d(date), hours, facilitator, venue: "Seminar Room A", status, reason: title.includes("Exam") ? "Weak CLOs in two courses (CQI)" : null, createdById: s.head, createdAt: new Date() } });
      const who = staff.filter((_, i) => (i * 37) % 100 < share * 100);
      for (const u of who) { n++; await db.fdpAttendance.create({ data: { id: randomUUID(), sessionId: id, userId: u, attended: true, certificateNo: `FDP-2026-${String(n).padStart(4, "0")}`, createdAt: new Date() } }); }
    }
    for (const u of staff.slice(0, 4)) await db.fdpExternal.create({ data: { id: randomUUID(), chairmanId: s.head, userId: u, title: "HEC National Faculty Development Workshop", organizer: "HEC Learning Innovation Division", date: d("2026-07-20"), hours: 12, createdAt: new Date() } });
  }
  // Leave: one approved (with a covered class), one waiting for the Dean, one pending with the HOD.
  if (!(await prisma.shortLeave.count({ where: { chairmanId: s.head } }))) {
    const t = s.teachers;
    const L: [string, string, string, string, string, string, number, string][] = [
      [t[0]?.id, "2026-09-29", "2026-09-30", "Attending IEEE conference in Karachi", "APPROVED", "DUTY", 2, "NONE"],
      [t[1]?.id, "2026-11-02", "2026-11-13", "Umrah", "PENDING", "HAJJ", 10, "PENDING"],
      [t[2]?.id, "2026-10-22", "2026-10-22", "Family function", "PENDING", "CASUAL", 1, "NONE"],
    ].filter((x) => x[0]) as never;
    for (const [userId, from, to, reason, status, kind, days, dean] of L) {
      const l = await prisma.shortLeave.create({ data: { userId, chairmanId: s.head, fromDate: d(from), toDate: d(to), reason, status, approverId: status === "APPROVED" ? s.by("dream.hod.cs") : null, decidedAt: status === "APPROVED" ? d("2026-09-25") : null } });
      await db.leaveDetail.create({ data: { id: randomUUID(), leaveId: l.id, kind, days, deanStatus: dean, hodId: dean === "PENDING" || status === "APPROVED" ? s.by("dream.hod.cs") : null, hodAt: dean === "PENDING" ? d("2026-10-15") : null } }).catch(() => null);
    }
  }
  // Facility bookings and the faculty menu for the coming week.
  if (!(await db.facilityBooking.count({ where: { chairmanId: s.head } }).catch(() => 1))) {
    const svc = await prisma.facilityService.findMany({ where: { chairmanId: s.head, kind: { in: ["SPORTS", "PRAYER"] } }, select: { id: true, kind: true } });
    const fac = await prisma.facilityRoom.findMany({ where: { chairmanId: s.head, roomType: { in: ["AUDITORIUM", "SEMINAR", "CONFERENCE"] } }, select: { id: true, name: true } });
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
    const B: [string | undefined, number, string, string, string][] = [[fac[0] && `fac:${fac[0].id}`, 3, "10:00", "13:00", "Seminar: AI in Business (guest speaker)"], [fac[1] && `fac:${fac[1].id}`, 4, "14:00", "16:00", "BOS preparatory meeting"], [svc.find((x) => x.kind === "SPORTS") && `svc:${svc.find((x) => x.kind === "SPORTS")!.id}`, 5, "15:00", "18:00", "Inter-batch cricket match"], [svc.find((x) => x.kind === "PRAYER") && `svc:${svc.find((x) => x.kind === "PRAYER")!.id}`, 6, "13:00", "14:00", "Dars-e-Quran (Student Affairs)"], ["area:Common area / lawn", 8, "11:00", "15:00", "Food festival (Business Club)"]];
    for (const [resource, plus, startTime, endTime, purpose] of B) if (resource) await db.facilityBooking.create({ data: { id: randomUUID(), chairmanId: s.head, resource, roomId: null, date: new Date(today + plus * 864e5), startTime, endTime, purpose, bookedById: s.by("dream.sa"), status: "BOOKED", createdAt: new Date() } });
  }
  if (!(await db.facultyMeal.count({ where: { chairmanId: s.head } }).catch(() => 1))) {
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
    const menu = [["Chicken Biryani", 350], ["Daal Chawal", 220], ["Chicken Karahi with Naan", 450], ["Vegetable Pulao & Raita", 250], ["Chicken Sandwich & Tea", 280]];
    for (let k = 0; k < 7; k++) { const dt = new Date(today + k * 864e5); if (dt.getUTCDay() === 0) continue; for (const [j, [item, price]] of [menu[k % 5], menu[(k + 2) % 5]].entries()) { const id = randomUUID(); await db.facultyMeal.create({ data: { id, chairmanId: s.head, date: dt, item, price, cutoff: "11:00", createdById: s.by("dream.facilities"), createdAt: new Date() } }); for (const u of s.teachers.slice(j * 3, j * 3 + 3 + (k % 3))) await db.mealOrder.create({ data: { id: randomUUID(), mealId: id, userId: u.id, qty: 1, createdAt: new Date() } }); } }
  }
  // Academic rules, with the OMC member holding the Controller of Examinations duty.
  await db.academicRule.upsert({ where: { chairmanId: s.head }, create: { id: randomUUID(), chairmanId: s.head, warningCgpa: 2.5, probationCgpa: 2.0, holdCgpa: 2.0, dismissCgpa: 1.5, dismissAfterProbations: 2, minAttendanceForExam: 75, updatedById: s.head, updatedAt: new Date() }, update: {} }).catch(() => null);
  const omc = s.users.find((u) => u.username === "dream.omc");
  if (omc) { const u = await prisma.user.findUnique({ where: { id: omc.id }, select: { extraRoles: true } }); if (!(u?.extraRoles || []).includes("EXAM_CONTROLLER")) await prisma.user.update({ where: { id: omc.id }, data: { extraRoles: [...(u?.extraRoles || []), "EXAM_CONTROLLER"] } }); }
  // Last year's appraisals (shared).
  for (const t of s.teachers.slice(0, 8)) {
    if (await db.facultyAppraisal.count({ where: { userId: t.id, year: 2025 } }).catch(() => 1)) continue;
    await db.facultyAppraisal.create({ data: { userId: t.id, year: 2025, chairmanId: s.head, reviewerId: s.head, status: "FINAL", ratingsJson: JSON.stringify({ teaching: 4, research: 3, service: 4, conduct: 5 }), studentFeedback: 4.1, overall: "VERY_GOOD", strengths: "Well-prepared, students rate highly.", improve: "More research output.", goals: "One journal paper; complete OBE workshop." } }).catch(() => null);
  }
  return true;
}

/** Indirect evidence for the outcomes reports: stakeholder surveys with questions mapped to PLOs, and course-exit CLO
 * self-ratings for finished courses. */
export async function campusSurveys() {
  const s = await scope();
  let made = 0;
  for (const b of s.batches) {
    const plos = await prisma.pLO.findMany({ where: { batchId: b.id }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true } });
    if (!plos.length) continue;
    let templates = await prisma.surveyTemplate.findMany({ where: { coordinatorId: b.coordinatorId }, select: { id: true, stakeholderType: true } });
    if (!templates.length) { await prisma.surveyTemplate.createMany({ data: ["STUDENT", "ALUMNI", "EMPLOYER"].map((t) => ({ coordinatorId: b.coordinatorId, title: `${t} survey`, stakeholderType: t })) }); templates = await prisma.surveyTemplate.findMany({ where: { coordinatorId: b.coordinatorId }, select: { id: true, stakeholderType: true } }); }
    const students = await prisma.student.findMany({ where: { batchId: b.id }, select: { id: true, name: true }, take: 25 });
    const alumni = await prisma.alumni.findMany({ where: { chairmanId: s.head, degreeProgram: b.degreeProgram }, select: { id: true, name: true }, take: 15 });
    const employers = await prisma.employer.findMany({ where: { chairmanId: s.head }, select: { id: true, organizationName: true }, take: 8 });
    for (const t of templates) {
      if (await prisma.surveyQuestion.count({ where: { surveyTemplateId: t.id } })) continue;
      const verb = t.stakeholderType === "EMPLOYER" ? "Our graduates employed by you demonstrate" : t.stakeholderType === "ALUMNI" ? "The program prepared me for" : "This program is developing my";
      await prisma.surveyQuestion.createMany({ data: plos.map((p, i) => ({ surveyTemplateId: t.id, text: `${verb}: ${p.title.toLowerCase()}`, mappedPloId: p.id, orderIndex: i })) });
      const qs = await prisma.surveyQuestion.findMany({ where: { surveyTemplateId: t.id }, select: { id: true } });
      const who = t.stakeholderType === "STUDENT" ? students.map((x) => ({ label: x.name, studentId: x.id })) : t.stakeholderType === "ALUMNI" ? alumni.map((x) => ({ label: x.name, alumniId: x.id })) : employers.map((x) => ({ label: x.organizationName, employerId: x.id }));
      const r = rng(`survey-${t.id}`);
      for (const w of who) {
        const resp = await prisma.surveyResponse.create({ data: { surveyTemplateId: t.id, token: randomUUID(), respondentType: t.stakeholderType, respondentLabel: w.label, studentId: (w as { studentId?: string }).studentId || null, alumniId: (w as { alumniId?: string }).alumniId || null, employerId: (w as { employerId?: string }).employerId || null, submittedAt: d("2026-05-20") } });
        await prisma.surveyAnswer.createMany({ data: qs.map((q) => ({ surveyResponseId: resp.id, questionId: q.id, ratingValue: Math.max(1, Math.min(5, Math.round(3.7 + (r() - 0.5) * 2.4))) })) });
        made++;
      }
    }
    // Course-exit CLO self-ratings for finished courses.
    const finished = await prisma.course.findMany({ where: { batchId: b.id, semesterNumber: { lte: 4 }, isOffered: true }, select: { id: true, studentEnrollments: { select: { studentId: true }, take: 22 } } });
    for (const c of finished) {
      if (await db.courseExitResponse.count({ where: { courseId: c.id } }).catch(() => 1)) continue;
      const clos = await prisma.cLO.findMany({ where: { courseId: c.id, source: "INSTRUCTOR" }, select: { id: true } });
      const r = rng(`exit-${c.id}`);
      await db.courseExitResponse.createMany({ data: c.studentEnrollments.map((e) => ({ id: randomUUID(), courseId: c.id, studentId: e.studentId, ratingsJson: JSON.stringify(Object.fromEntries(clos.map((cl) => [cl.id, Math.max(1, Math.min(5, Math.round(3.8 + (r() - 0.5) * 2.2)))]))), createdAt: new Date() })), skipDuplicates: true }).catch(() => null);
    }
  }
  return made;
}
