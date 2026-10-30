import { prisma } from "./db";
import { bodyOfProgram } from "./accreditation/bodies";
import { canon, listsWith } from "./nceacLists";
import { countedCredits } from "./courseTypes";

// NCEAC's Accreditation Automation System (AAS): the sections and fields of its Data Requirement Document, named as NCEAC
// names them. OBEHUB fills what it already knows; people fill the rest in OBEHUB's AAS workbook and upload it back.
// Values typed by people (stored in AasRecord) win over values worked out by the system.

export const adb = prisma as unknown as Record<string, any>;
export const AAS_HINT = "Not set up yet — the Super User needs to run prisma/migration_aas.sql.";

// `list` names one of the NCEAC portal's dropdowns (lib/nceacLists.ts): the value must be one of its choices.
export type Field = { key: string; label: string; required?: boolean; hint?: string; kind?: "cnic" | "email" | "date" | "yesno" | "number"; list?: string };
export type Section = { key: string; title: string; sheet: string; scope: string; multi: boolean; fields: Field[] };

const F = (key: string, label: string, o: Partial<Field> = {}): Field => ({ key, label, required: true, ...o });
const opt = (key: string, label: string, o: Partial<Field> = {}): Field => ({ key, label, required: false, ...o });

export const SECTIONS: Section[] = [
  { key: "focal", title: "My Profile", sheet: "My Profile", scope: "focal", multi: false, fields: [F("name", "Name"), F("designation", "Designation"), F("gender", "Gender"), F("dob", "Date of Birth", { kind: "date" }), F("cnic", "CNIC", { kind: "cnic", hint: "xxxxx-xxxxxxx-x" }), F("mobile", "Mobile No", { hint: "03xx-xxxxxxx" }), F("office", "Office No"), F("email", "Office Email", { kind: "email" }), F("address", "Address"), F("region", "Region"), F("city", "City")] },
  { key: "institute", title: "Institute's Profile — General Information", sheet: "Institute Profile", scope: "institute", multi: false, fields: [F("email", "Official Email", { kind: "email" }), F("phone", "Phone No", { hint: "9–20 characters" }), F("fax", "Fax No"), F("established", "Date of Establishment", { kind: "date" }), F("url", "Institute Web URL"), F("address", "Institute Address"), F("province", "Province"), F("city", "City")] },
  { key: "contacts", title: "Institute's Profile — Contact Information", sheet: "Contact Information", scope: "contact", multi: true, fields: [F("role", "Contact (Rector / Dean / University Registrar / Librarian, or Administrator / Librarian if affiliated)"), F("name", "Name"), F("designation", "Designation"), F("cnic", "CNIC", { kind: "cnic" }), F("phone", "Phone / Mobile No"), F("email", "Email", { kind: "email" }), F("fax", "Fax No"), opt("address", "Address (affiliated: compulsory)"), opt("province", "Province (affiliated: compulsory)"), opt("city", "City (affiliated: compulsory)")] },
  { key: "departments", title: "Departments & Programs — Departments", sheet: "Departments", scope: "department", multi: true, fields: [F("name", "Department Name"), F("category", "Department Category (Computing / Engineering)"), F("established", "Date of Establishment", { kind: "date" }), F("hodName", "Head of Department: Name"), F("hodCnic", "HOD CNIC", { kind: "cnic" }), F("hodMobile", "HOD Mobile No"), F("hodEmail", "HOD Email", { kind: "email" }), opt("hodLandline", "HOD Landline No"), opt("hodAddress", "HOD Address"), opt("hodProvince", "HOD Province"), opt("hodCity", "HOD City")] },
  { key: "programs", title: "Departments & Programs — Programs", sheet: "Programs", scope: "program", multi: true, fields: [F("name", "Program Name"), F("category", "Program Category"), F("dualEntry", "Dual Entry (Yes / No)", { kind: "yesno" }), F("department", "Department"), F("startDate", "Program Start Date", { kind: "date" }), F("credits", "Total Credit Hours", { kind: "number" })] },
  { key: "faculty", title: "Faculty Directory", sheet: "Faculty Directory", scope: "faculty", multi: true, fields: [F("type", "Faculty Type (Local / Foreign)", { list: "facultyType" }), F("name", "Name"), F("gender", "Gender", { list: "facultyGender" }), F("cnic", "CNIC / Passport No", { kind: "cnic", hint: "xxxxx-xxxxxxx-x (foreign: passport)" }), F("mobile", "Mobile No"), F("email", "Email", { kind: "email" }), F("address", "Address"), F("province", "Province", { list: "province" }), F("city", "City"), F("contract", "Contract Type", { list: "contractType" }), F("rank", "Academic Rank", { list: "academicRank" }), F("joining", "Joining Date", { kind: "date" }), opt("leaving", "Leaving Date", { kind: "date" }), F("degree", "Highest Degree Name"), F("degreeType", "Degree Type", { list: "degreeType" }), F("field", "Field of Study"), F("country", "Awarding Country"), F("university", "Name of University"), opt("foreignUniversity", "Name of Foreign University"), F("degreeStart", "Degree Start Date", { kind: "date" }), F("degreeEnd", "Degree End Date", { kind: "date" }), opt("honorific", "Honorific", { list: "honorific" }), F("dob", "Date of Birth", { kind: "date" }), opt("coreComputing", "Is Core Computing Teacher (Yes / No)", { kind: "yesno" })] },
  { key: "courses", title: "Course Catalog", sheet: "Course Catalog", scope: "course", multi: true, fields: [F("name", "Course Name"), F("type", "Course Type"), F("hecCourse", "Linked HEC Course"), F("credits", "Credit Hours", { kind: "number" })] },
  { key: "students", title: "Student Directory", sheet: "Student Directory", scope: "student", multi: true, fields: [F("name", "Student Name"), F("father", "Father Name"), F("gender", "Gender", { list: "facultyGender" }), F("admission", "Admission Date", { kind: "date" }), F("nationality", "Nationality"), F("cnic", "CNIC No", { kind: "cnic" }), opt("passport", "Passport No"), F("dob", "Date of Birth", { kind: "date", hint: "dd/mm/yyyy" }), opt("phone", "Phone No"), opt("email", "Email", { kind: "email" }), opt("domDistrict", "Domicile District"), opt("domProvince", "Domicile Province", { list: "province" }), F("address", "Mailing Address"), F("city", "City"), opt("sscDegree", "SSC Degree Name"), opt("sscBoard", "SSC Board Name"), opt("sscTotal", "SSC Total Marks", { kind: "number" }), opt("sscObtained", "SSC Obtained Marks", { kind: "number" }), F("hsscDegree", "HSSC Degree Name"), opt("hsscBoard", "HSSC Board Name"), F("hsscTotal", "HSSC Total Marks", { kind: "number" }), F("hsscObtained", "HSSC Obtained Marks", { kind: "number" }), F("hsscCode", "HSSC Degree Nomenclature (1 Intermediate with Math, 2 A Level with Math, 3 Intermediate with Pre-Medical)", { list: "hsscNomenclature" })] },
  { key: "form1", title: "Accreditation Application — I. Program Information Form", sheet: "I Program Information", scope: "form1", multi: false, fields: [F("details", "Details of the BS program under evaluation"), F("eligibility", "Admission eligibility policy"), F("criteria", "Admission criteria (HEC: at least 50% marks, Mathematics at intermediate)"), F("goals", "Program goals"), F("achieved", "Extent to which the objectives have been achieved"), F("review", "Frequency and process of review and revision"), F("problemSolving", "Problem-solving skills developed (summary)"), F("technologies", "Technologies taught (summary)"), F("standards", "The institute's assessment standards"), F("industry", "Alignment with industry trends"), F("emerging", "Emerging technologies taught")] },
  { key: "form1y", title: "Accreditation Application — I. Admissions and sections (last 5 years)", sheet: "I Admissions 5 years", scope: "form1y", multi: true, fields: [F("year", "Year"), F("admitted", "Total Students Admitted", { kind: "number" }), F("sections", "Total Sections", { kind: "number" }), F("avg", "Average Students per Section", { kind: "number" })] },
  { key: "form2", title: "Accreditation Application — II. Infrastructure Information Form", sheet: "II Infrastructure", scope: "form2", multi: false, fields: [F("roomsDedicated", "Lecture rooms: dedicated", { kind: "number" }), F("roomsShared", "Lecture rooms: shared", { kind: "number" }), F("roomSize", "Average lecture room size (sq. ft.)", { kind: "number" }), F("roomFacilities", "Instructional facilities in lecture rooms"), opt("roomOther", "Other facilities (heating, AC …)"), F("labs", "Total computing labs", { kind: "number" }), F("pcsPerLab", "Average computers per lab", { kind: "number" }), F("pcLife", "Average PC lifetime (years)", { kind: "number" }), F("labHours", "Total lab hours per week"), F("logicLab", "Logic design lab for CS students (Yes / No)", { kind: "yesno" }), F("fypLab", "Exclusive final-year lab for CS students (Yes / No)", { kind: "yesno" }), F("ratio1", "Students per computer (last year)", { kind: "number" }), F("ratio2", "Students per computer (year before)", { kind: "number" }), F("books", "Library: total books", { kind: "number" }), F("computingTitles", "Library: unique computing titles", { kind: "number" }), F("lms", "Library management system (Yes / No)", { kind: "yesno" }), F("hecDl", "Is connected to HEC Digital Library"), F("magazines", "Printed technical magazines", { kind: "number" }), F("ieeeAcm", "IEEE / ACM journals or proceedings (Yes / No)", { kind: "yesno" }), F("booksAdded1", "Computing books added to library (last year)", { kind: "number" }), F("booksAdded2", "Computing books added to library (year before)", { kind: "number" })] },
  { key: "form3", title: "Accreditation Application — III. General Information Form", sheet: "III General Information", scope: "form3", multi: false, fields: [F("offices", "Separate faculty offices", { kind: "number" }), ...["Is there any open area for students?", "Are there any facilities for outdoor and indoor sports?", "Is there any in-campus hostel facility provided by the institute?", "Is there facility of adequate and clean praying area?", "Is there any adequate common room?", "Is there facility of Wi-Fi in campus?", "Are there any societies in campus for extracurricular activities?", "Are there any yearly board of studies meetings?", "Are there any departmental meetings per semester?", "Does yearly calendar exist and is followed?", "Is teaching assistant support provided to faculty?", "Is placement and internship office being established in campus?"].map((l, i) => F(`q${i + 1}`, `${l} (Yes / No)`, { kind: "yesno" as const }))] },
  { key: "form4", title: "Accreditation Application — IV. Financial Information Form (PKR millions)", sheet: "IV Financial Information", scope: "form4", multi: true, fields: [F("year", "Year"), F("inst", "Annual institutional expenditure", { kind: "number" }), F("dept", "Annual computing department expenditure", { kind: "number" }), F("instRd", "Institutional research & faculty development", { kind: "number" }), F("deptRd", "Computing department research & faculty development", { kind: "number" }), F("library", "Library expenditure", { kind: "number" }), F("compBooks", "Computing books expenditure", { kind: "number" }), F("compFacilities", "Computing facilities expenditure", { kind: "number" })] },
  { key: "form5", title: "Accreditation Application — V. Courses Information Form", sheet: "V Courses Information", scope: "form5", multi: true, fields: [F("session", "Session"), F("year", "Year"), F("start", "Semester Start Date", { kind: "date" }), F("end", "Semester End Date", { kind: "date" }), F("course", "Course Name"), F("semester", "Offered Semester"), F("sectionsN", "No. of Sections", { kind: "number" }), F("teacher", "Teacher Name"), F("studentsN", "No. of Students", { kind: "number" })] },
];
export const sectionOf = (k: string) => SECTIONS.find((s) => s.key === k) || null;

/* ---------------- Formatting and checks ---------------- */

const d2 = (n: number) => String(n).padStart(2, "0");
export const ddmmyyyy = (d: Date | null | undefined) => (d ? `${d2(d.getUTCDate())}/${d2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` : "");
const termStart = (term: string, year: number) => new Date(Date.UTC(year, /spring/i.test(term) ? 1 : /summer/i.test(term) ? 5 : 8, 1));

export function problemOf(f: Field, v: string, lists = listsWith()): string | null {
  const x = (v || "").trim();
  if (!x) return f.required ? "missing" : null;
  if (f.kind === "cnic" && !/^\d{5}-?\d{7}-?\d$/.test(x) && !/^[A-Z0-9]{6,12}$/i.test(x)) return "CNIC should be 13 digits (xxxxx-xxxxxxx-x)";
  if (f.kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)) return "not an email address";
  if (f.kind === "yesno" && !/^(yes|no)$/i.test(x)) return "answer Yes or No";
  if (f.kind === "number" && isNaN(Number(x.replace(/,/g, "")))) return "should be a number";
  if (f.kind === "date" && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(x) && !/^\d{4}(-\d{2}-\d{2})?$/.test(x)) return "date as dd/mm/yyyy";
  if (f.list && !canon(f.list, x, lists)) return "not one of the NCEAC portal's choices";
  return null;
}

/* ---------------- What OBEHUB already knows ---------------- */

export type Row = { ref: string; values: Record<string, string> };
type Ctx = { chairmanId: string; program: string; batchId: string | null; focalId: string };

async function staffOf(chairmanId: string) {
  const lvl1 = await prisma.user.findMany({ where: { managedById: chairmanId }, select: { id: true } });
  return prisma.user.findMany({ where: { isActive: true, OR: [{ id: chairmanId }, { managedById: chairmanId }, { managedById: { in: lvl1.map((u) => u.id) } }] } as never, select: { id: true, name: true, email: true, role: true, departmentId: true, isVisitingPlaceholder: true } as never }) as unknown as Promise<{ id: string; name: string; email: string; role: string; departmentId: string | null; isVisitingPlaceholder?: boolean }[]>;
}
async function profilesOf(ids: string[]) {
  const ps = (await prisma.facultyProfile.findMany({ where: { userId: { in: ids.concat(["none"]) } } })) as unknown as { userId: string; designation: string | null; employmentType: string | null; dateOfJoining: Date | null; dateOfBirth: Date | null; gender: string | null; phone: string | null; address: string | null; cnic: string | null; specialization: string | null }[];
  return new Map(ps.map((p) => [p.userId, p]));
}

export async function systemRows(section: string, ctx: Ctx): Promise<Row[]> {
  const { chairmanId, program } = ctx;
  if (section === "focal") {
    const u = await prisma.user.findUnique({ where: { id: ctx.focalId }, select: { name: true, email: true } });
    const p = (await profilesOf([ctx.focalId])).get(ctx.focalId);
    return [{ ref: "focal", values: { name: u?.name || "", email: u?.email || "", designation: p?.designation || "", gender: p?.gender || "", dob: ddmmyyyy(p?.dateOfBirth), cnic: p?.cnic || "", mobile: p?.phone || "", address: p?.address || "" } }];
  }
  if (section === "institute") return [{ ref: "institute", values: {} }];
  if (section === "contacts") {
    const staff = await staffOf(chairmanId);
    const prof = await profilesOf(staff.map((s) => s.id));
    const head = staff.find((s) => s.id === chairmanId), dean = staff.find((s) => s.role === "DEAN"), lib = staff.find((s) => s.role === "LIBRARIAN");
    const row = (role: string, u?: { id: string; name: string; email: string }) => ({ ref: role, values: { role, name: u?.name || "", email: u?.email || "", designation: (u && prof.get(u.id)?.designation) || "", cnic: (u && prof.get(u.id)?.cnic) || "", phone: (u && prof.get(u.id)?.phone) || "", address: (u && prof.get(u.id)?.address) || "" } });
    const { instituteType } = await aasSettings(chairmanId);
    return instituteType === "AFFILIATED" ? [row("Administrator", head), row("Librarian", lib)] : [row("Rector", head), row("Dean", dean), row("University Registrar"), row("Librarian", lib)];
  }
  if (section === "departments") {
    const depts = await prisma.department.findMany({ where: { chairmanId }, select: { id: true, name: true } });
    const progs = await prisma.departmentProgram.findMany({ where: { chairmanId }, select: { departmentId: true, degreeProgram: true, accreditationBody: true } }).catch(() => [] as { departmentId: string; degreeProgram: string; accreditationBody: string | null }[]);
    const staff = await staffOf(chairmanId);
    const prof = await profilesOf(staff.map((s) => s.id));
    return depts.map((d) => {
      const bodies = progs.filter((p) => p.departmentId === d.id).map((p) => p.accreditationBody);
      const hod = staff.find((s) => s.role === "HEAD_OF_DEPARTMENT" && s.departmentId === d.id);
      const hp = hod ? prof.get(hod.id) : undefined;
      return { ref: d.id, values: { name: d.name, category: bodies.includes("PEC") ? "Engineering" : bodies.includes("NCEAC") ? "Computing" : "", hodName: hod?.name || "", hodEmail: hod?.email || "", hodCnic: hp?.cnic || "", hodMobile: hp?.phone || "", hodAddress: hp?.address || "" } };
    });
  }
  if (section === "programs") {
    const progs = await prisma.departmentProgram.findMany({ where: { chairmanId }, select: { degreeProgram: true, department: { select: { name: true } } } as never }).catch(() => []) as unknown as { degreeProgram: string; department?: { name: string } | null }[];
    const out: Row[] = [];
    for (const p of progs) {
      const first = await prisma.batch.findFirst({ where: { degreeProgram: p.degreeProgram, coordinator: { managedById: chairmanId } }, orderBy: [{ startYear: "asc" }], select: { startYear: true, startTerm: true } });
      const last = await prisma.batch.findFirst({ where: { degreeProgram: p.degreeProgram, coordinator: { managedById: chairmanId } }, orderBy: [{ startYear: "desc" }], select: { id: true } });
      const cs = last ? await prisma.course.findMany({ where: { batchId: last.id, isNonCredit: false, trackName: null }, select: { creditHours: true } }) : [];
      out.push({ ref: p.degreeProgram, values: { name: p.degreeProgram, department: p.department?.name || "", dualEntry: "No", startDate: first ? ddmmyyyy(termStart(first.startTerm, first.startYear)) : "", credits: cs.length ? String(countedCredits(cs)) : "" } });
    }
    return out;
  }
  if (section === "faculty") {
    const staff = (await staffOf(chairmanId)).filter((s) => ["INSTRUCTOR", "SUBJECT_EXPERT", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "DEAN", "OMC", "LAB_ENGINEER"].includes(s.role) && !s.isVisitingPlaceholder);
    const prof = await profilesOf(staff.map((s) => s.id));
    const edu = (await prisma.facultyRecord.findMany({ where: { userId: { in: staff.map((s) => s.id).concat(["none"]) }, kind: "EDUCATION" }, orderBy: [{ endYear: "desc" }] })) as { userId: string; title: string; organisation: string | null; startYear: number | null; endYear: number | null }[];
    const det = await staffDetails(staff.map((x) => x.id));
    return staff.map((s) => {
      const p = prof.get(s.id); const e = edu.find((x) => x.userId === s.id);
      const t = (e?.title || "").toLowerCase();
      return { ref: s.id, values: { type: "Local", name: s.name, email: s.email, gender: p?.gender || "", cnic: p?.cnic || "", mobile: p?.phone || "", address: p?.address || "", contract: canon("contractType", p?.employmentType) || p?.employmentType || "", rank: canon("academicRank", p?.designation) || p?.designation || "", joining: ddmmyyyy(p?.dateOfJoining), dob: ddmmyyyy(p?.dateOfBirth), degree: e?.title || "", degreeType: canon("degreeType", t) || "", field: p?.specialization || "", country: "Pakistan", university: e?.organisation || "", degreeStart: e?.startYear ? `01/09/${e.startYear}` : "", degreeEnd: e?.endYear ? `30/06/${e.endYear}` : "", ...nonEmpty(det.get(s.id)) } };
    });
  }
  if (section === "courses") {
    const leads = (await prisma.user.findMany({ where: { managedById: chairmanId, role: "PROGRAM_COORDINATOR" }, select: { id: true } })).map((u) => u.id);
    const cs = await prisma.course.findMany({ where: { coordinatorId: { in: leads.concat(["none"]) }, ...(program ? { batch: { degreeProgram: program } } : {}) }, select: { code: true, title: true, courseType: true, creditHours: true }, orderBy: { code: "asc" } });
    const seen = new Map<string, Row>();
    for (const c of cs) if (!seen.has(c.code)) seen.set(c.code, { ref: c.code, values: { name: `${c.code} ${c.title}`, type: c.courseType || "", credits: String(c.creditHours) } });
    return Array.from(seen.values());
  }
  if (section === "students") {
    if (!ctx.batchId) return [];
    const b = await prisma.batch.findUnique({ where: { id: ctx.batchId }, select: { startTerm: true, startYear: true } });
    const st = await prisma.student.findMany({ where: { batchId: ctx.batchId, status: { not: "WITHDRAWN" } } as never, select: { id: true, name: true, rollNumber: true, track: true }, orderBy: { rollNumber: "asc" } });
    const det = await studentDetails(st.map((x) => x.id));
    const leads = (await prisma.$queryRawUnsafe(`SELECT "studentId", "phone", "email", "city" FROM "AdmissionLead" WHERE "studentId" = ANY($1)`, st.map((x) => x.id)).catch(() => [])) as { studentId: string; phone: string | null; email: string | null; city: string | null }[];
    return st.map((x) => { const l = leads.find((y) => y.studentId === x.id); return { ref: x.rollNumber, values: { name: x.name, admission: b ? ddmmyyyy(termStart(b.startTerm, b.startYear)) : "", nationality: "Pakistani", phone: l?.phone || "", email: l?.email || "", city: l?.city || "", hsscCode: canon("hsscNomenclature", x.track) || "", ...nonEmpty(det.get(x.id)) } }; });
  }
  if (section === "form1") return [{ ref: program || "program", values: {} }];
  if (section === "form1y") {
    const bs = await prisma.batch.findMany({ where: { degreeProgram: program, coordinator: { managedById: chairmanId } }, select: { startYear: true, _count: { select: { students: true } } } as never, orderBy: { startYear: "desc" } }) as unknown as { startYear: number; _count: { students: number } }[];
    const by = new Map<number, number>(); for (const b of bs) by.set(b.startYear, (by.get(b.startYear) || 0) + b._count.students);
    const now = new Date().getUTCFullYear();
    return [0, 1, 2, 3, 4].map((i) => now - i).map((y) => ({ ref: String(y), values: { year: String(y), admitted: by.has(y) ? String(by.get(y)) : "" } }));
  }
  if (section === "form2") {
    const [rooms, labs, lib] = await Promise.all([
      prisma.room.findMany({ where: { chairmanId }, select: { type: true, departmentId: true, capacity: true } }).catch(() => [] as { type: string; departmentId: string | null; capacity: number }[]),
      adb.labInfo.findMany({ where: { chairmanId } }).catch(() => []) as Promise<{ computers: number; computersWorking: number }[]>,
      adb.libraryInfo.findUnique({ where: { chairmanId } }).catch(() => null) as Promise<{ totalVolumes: number; computingTitles: number; printJournals: number; databases: string | null; hasLibrarian: boolean } | null>,
    ]);
    const lecture = rooms.filter((r) => !/lab/i.test(r.type));
    const pcs = labs.reduce((t, l) => t + (l.computersWorking || l.computers || 0), 0);
    const leads = (await prisma.user.findMany({ where: { managedById: chairmanId, role: "PROGRAM_COORDINATOR" }, select: { id: true } })).map((u) => u.id);
    const studs = await prisma.student.count({ where: { batch: { coordinatorId: { in: leads.concat(["none"]) } }, status: "ACTIVE" } as never }).catch(() => 0);
    return [{ ref: "form2", values: { roomsDedicated: String(lecture.filter((r) => r.departmentId).length || ""), roomsShared: String(lecture.filter((r) => !r.departmentId).length || ""), labs: labs.length ? String(labs.length) : "", pcsPerLab: labs.length ? String(Math.round(pcs / labs.length)) : "", ratio1: pcs ? String(Math.round((10 * studs) / pcs) / 10) : "", books: lib?.totalVolumes ? String(lib.totalVolumes) : "", computingTitles: lib?.computingTitles ? String(lib.computingTitles) : "", magazines: lib ? String(lib.printJournals) : "", hecDl: lib?.databases && /hec/i.test(lib.databases) ? "Yes" : "", ieeeAcm: lib?.databases && /ieee|acm/i.test(lib.databases) ? "Yes" : "" } }];
  }
  if (section === "form3") {
    const year = new Date(Date.now() - 365 * 864e5);
    const bos = await adb.meetingMinutes.count({ where: { chairmanId, kind: "BOS", meetingDate: { gte: year } } }).catch(() => 0);
    const place = await adb.placement.count({}).catch(() => 0);
    return [{ ref: "form3", values: { q8: bos ? "Yes" : "", q12: place ? "Yes" : "" } }];
  }
  if (section === "form4") {
    const fe = (await adb.financeEntry.findMany({ where: { chairmanId, kind: "SPENT" } }).catch(() => [])) as { fiscalYear: string; category: string; amount: number }[];
    const years = Array.from(new Set(fe.map((e) => e.fiscalYear))).sort().reverse().slice(0, 5);
    const m = (xs: typeof fe) => { const t = xs.reduce((s, e) => s + e.amount, 0); return t ? String(Math.round(t / 1e4) / 100) : ""; };
    return years.map((y) => { const ys = fe.filter((e) => e.fiscalYear === y); return { ref: y, values: { year: y, inst: m(ys), instRd: m(ys.filter((e) => /research|development|training/i.test(e.category))), library: m(ys.filter((e) => /library|book/i.test(e.category))) } }; });
  }
  if (section === "form5") {
    const leads = (await prisma.user.findMany({ where: { managedById: chairmanId, role: "PROGRAM_COORDINATOR" }, select: { id: true } })).map((u) => u.id);
    const cs = await prisma.course.findMany({ where: { coordinatorId: { in: leads.concat(["none"]) }, isOffered: true, ...(program ? { batch: { degreeProgram: program } } : {}) }, select: { id: true, code: true, title: true, semesterNumber: true, offeredTermName: true, offeredTermYear: true, instructor: { select: { name: true } }, _count: { select: { studentEnrollments: true, scheduleSections: true } } } as never, orderBy: { code: "asc" } }) as unknown as { id: string; code: string; title: string; semesterNumber: number | null; offeredTermName: string | null; offeredTermYear: number | null; instructor: { name: string } | null; _count: { studentEnrollments: number; scheduleSections: number } }[];
    return cs.map((c) => ({ ref: c.id, values: { session: c.offeredTermName || "", year: c.offeredTermYear ? String(c.offeredTermYear) : "", course: `${c.code} ${c.title}`, semester: c.semesterNumber ? String(c.semesterNumber) : "", sectionsN: String(c._count.scheduleSections || 1), teacher: c.instructor?.name || "", studentsN: String(c._count.studentEnrollments) } }));
  }
  return [];
}

/* ---------------- Merged with what people typed ---------------- */

export function storeKey(section: string, ctx: { program: string; batchId: string | null }, ref: string) {
  const s = sectionOf(section)!;
  const per = ["form1", "form1y", "form5"].includes(section) ? `${ctx.program}|` : section === "students" ? `${ctx.batchId}|` : "";
  return { scope: s.scope, key: `${per}${ref}` };
}

export async function sectionRows(section: string, ctx: Ctx) {
  const sys = await systemRows(section, ctx);
  let stored: { key: string; dataJson: string }[] = [];
  try { stored = await adb.aasRecord.findMany({ where: { chairmanId: ctx.chairmanId, scope: sectionOf(section)!.scope } }); } catch { stored = []; }
  const byKey = new Map(stored.map((r) => [r.key, (() => { try { return JSON.parse(r.dataJson) as Record<string, string>; } catch { return {}; } })()]));
  const rows = sys.map((r) => ({ ref: r.ref, values: { ...r.values, ...(byKey.get(storeKey(section, ctx, r.ref).key) || {}) } }));
  // Rows people added in the workbook that the system does not know (e.g. extra contacts, older financial years).
  const prefix = storeKey(section, ctx, "").key;
  for (const [k, v] of Array.from(byKey.entries())) if (k.startsWith(prefix) && k.slice(prefix.length).startsWith("+") && !rows.some((r) => storeKey(section, ctx, r.ref).key === k)) rows.push({ ref: k.slice(prefix.length), values: v });
  return rows;
}

export function sectionGaps(section: string, rows: Row[]) {
  const s = sectionOf(section)!;
  let missing = 0, invalid = 0; const notes: string[] = [];
  for (const r of rows) for (const f of s.fields) { const p = problemOf(f, r.values[f.key] || ""); if (p === "missing") missing++; else if (p) { invalid++; if (notes.length < 5) notes.push(`${r.values.name || r.values.year || r.ref}: ${f.label} — ${p}`); } }
  return { rows: rows.length, missing, invalid, notes };
}

export async function programContext(chairmanId: string) {
  const progs = await prisma.departmentProgram.findMany({ where: { chairmanId }, select: { degreeProgram: true } }).catch(() => [] as { degreeProgram: string }[]);
  const out: string[] = [];
  for (const p of progs) { const { body } = await bodyOfProgram(chairmanId, p.degreeProgram); if (body === "NCEAC") out.push(p.degreeProgram); }
  return out;
}

/* ---------------- Settings and stored details ---------------- */

export type AasSettings = { focalId?: string; instituteType?: "CAMPUS" | "AFFILIATED"; visitType?: string };
export const VISIT_TYPES = ["Zero Visit", "Accreditation Visit", "Confirmatory Visit", "Change of Scope Visit"];
export async function aasSettings(chairmanId: string): Promise<AasSettings> {
  try { const r = await adb.aasRecord.findUnique({ where: { chairmanId_scope_key: { chairmanId, scope: "settings", key: "focal" } } }); const d = r ? JSON.parse(r.dataJson) : {}; return { focalId: d.userId, instituteType: d.instituteType === "AFFILIATED" ? "AFFILIATED" : "CAMPUS", visitType: d.visitType || "Accreditation Visit" }; } catch { return { instituteType: "CAMPUS", visitType: "Accreditation Visit" }; }
}
export const nonEmpty = (o: Record<string, string> | undefined) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => (v || "").trim()));
const parseJ = (s: string | null | undefined) => { try { return s ? (JSON.parse(s) as Record<string, string>) : {}; } catch { return {} as Record<string, string>; } };
export async function studentDetails(ids: string[]) {
  const rows = (await adb.studentDetail.findMany({ where: { studentId: { in: ids.concat(["none"]) } } }).catch(() => [])) as { studentId: string; dataJson: string }[];
  return new Map(rows.map((r) => [r.studentId, parseJ(r.dataJson)]));
}
export async function staffDetails(ids: string[]) {
  const rows = (await adb.staffDetail.findMany({ where: { userId: { in: ids.concat(["none"]) } } }).catch(() => [])) as { userId: string; dataJson: string }[];
  return new Map(rows.map((r) => [r.userId, parseJ(r.dataJson)]));
}
/** Merge values into a student's or staff member's stored details (only the AAS field keys of that section). */
export async function saveDetail(kind: "student" | "staff", id: string, vals: Record<string, string>, by: string) {
  const sec = sectionOf(kind === "student" ? "students" : "faculty")!;
  const clean = Object.fromEntries(Object.entries(vals).filter(([k]) => sec.fields.some((f) => f.key === k)).map(([k, v]) => [k, String(v ?? "").trim().slice(0, 400)]));
  const model = kind === "student" ? adb.studentDetail : adb.staffDetail;
  const where = kind === "student" ? { studentId: id } : { userId: id };
  const cur = await model.findUnique({ where });
  // A masked CNIC (35202-•••••••-3) sent back from a form means "unchanged".
  if (clean.cnic && clean.cnic.includes("•")) delete clean.cnic;
  const data = JSON.stringify({ ...parseJ(cur?.dataJson), ...clean });
  if (cur) await model.update({ where, data: { dataJson: data, updatedById: by, updatedAt: new Date() } });
  else await model.create({ data: { ...where, dataJson: data, updatedById: by } });
}
