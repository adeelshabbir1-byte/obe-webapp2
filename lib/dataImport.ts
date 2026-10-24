import { randomUUID } from "crypto";
import { prisma } from "./db";
import { hashPassword } from "./auth";
import { getGradingScaleForBatch } from "./gradingScaleLookup";
import { norm } from "./excelRead";
import { writeAuditLog } from "./audit";

// The Data Import hub: upload a template OR your own spreadsheet, match its columns to ours, see every row's problem
// in a dry run, then import. Imports only ADD rows (rows that already exist are skipped), so the same file can be
// uploaded again safely; each import is logged with the ids it created so it can be undone.

export const idb = prisma as unknown as Record<string, any>;
export const IMPORT_HINT = "The import log needs prisma/migration_data_import.sql — run it in Supabase.";

export type Field = { key: string; label: string; required?: boolean; aliases: string[]; example: string | number; note?: string };
export type Target = { batchId?: string; leadId?: string };
export type Ctx = { chairmanId: string; userId: string; target: Target };
type Row = Record<string, string>;
type Prepared = { ok: { row: number; data: Record<string, unknown> }[]; errors: { row: number; message: string }[]; skipped: { row: number; message: string }[] };
export type Kind = {
  key: string; title: string; what: string; needs: ("batch" | "lead")[]; model: string; fields: Field[];
  prepare: (rows: { row: number; v: Row }[], ctx: Ctx) => Promise<Prepared>;
  /** Writes the prepared rows itself (create or update); returns the ids it created (for undo) and how many it updated. */
  custom?: (ok: { row: number; data: Record<string, unknown> }[], ctx: Ctx) => Promise<{ createdIds: string[]; updated: number }>;
  /** Removes what hangs off a created row before the row itself is deleted on undo. */
  undoExtra?: (ids: string[]) => Promise<void>;
};

const num = (s: string) => { const n = Number(String(s).replace(/[,%\s]/g, "")); return Number.isFinite(n) ? n : NaN; };
const TERM = (s: string) => { const t = s.trim().toLowerCase(); return t.startsWith("f") ? "Fall" : t.startsWith("sp") ? "Spring" : t.startsWith("su") ? "Summer" : ""; };

async function batchOf(ctx: Ctx) {
  if (!ctx.target.batchId) throw new Error("Choose the batch first.");
  const b = await prisma.batch.findFirst({ where: { id: ctx.target.batchId, coordinator: { managedById: ctx.chairmanId } }, select: { id: true, coordinatorId: true, degreeProgram: true, startTerm: true, startYear: true } });
  if (!b) throw new Error("That batch is not in your institute.");
  return b;
}

export const KINDS: Kind[] = [
  {
    key: "students", title: "Students", what: "Students of one batch (enrolled-students lists from admissions work as they are).", needs: ["batch"], model: "student",
    fields: [
      { key: "rollNumber", label: "Roll number", required: true, aliases: ["roll", "roll no", "roll number", "registration no", "reg no", "reg number", "student id", "enrollment no"], example: "2026-CS-001" },
      { key: "name", label: "Name", required: true, aliases: ["name", "student name", "full name"], example: "Ali Khan" },
      { key: "semester", label: "Current semester", aliases: ["semester", "current semester", "sem"], example: 1, note: "Optional; defaults to 1." },
    ],
    async prepare(rows, ctx) {
      const b = await batchOf(ctx);
      const have = new Set((await prisma.student.findMany({ where: { batch: { coordinator: { managedById: ctx.chairmanId } } }, select: { rollNumber: true } })).map((s) => s.rollNumber.toLowerCase()));
      const out: Prepared = { ok: [], errors: [], skipped: [] };
      for (const { row, v } of rows) {
        const r = v.rollNumber?.trim(), n = v.name?.trim();
        if (!r || !n) { out.errors.push({ row, message: "Roll number and name are both needed." }); continue; }
        if (have.has(r.toLowerCase())) { out.skipped.push({ row, message: `${r} already exists` }); continue; }
        const sem = v.semester ? num(v.semester) : 1;
        if (!Number.isInteger(sem) || sem < 1 || sem > 12) { out.errors.push({ row, message: `Semester "${v.semester}" is not 1–12.` }); continue; }
        have.add(r.toLowerCase());
        out.ok.push({ row, data: { id: randomUUID(), batchId: b.id, rollNumber: r, name: n, currentSemesterNumber: sem } });
      }
      return out;
    },
  },
  {
    key: "faculty", title: "Faculty logins only (under a Program Lead)", what: "Teachers and Subject Experts with their login IDs (first password 12345678; they must change it).", needs: ["lead"], model: "user",
    fields: [
      { key: "name", label: "Name", required: true, aliases: ["name", "faculty name", "teacher", "full name"], example: "Dr. Ayesha Malik" },
      { key: "username", label: "Login ID", required: true, aliases: ["login", "login id", "username", "user name", "employee id", "emp id", "employee no"], example: "ayesha.malik" },
      { key: "role", label: "Role", aliases: ["role", "type"], example: "Instructor", note: "Instructor or Subject Expert; defaults to Instructor." },
      { key: "email", label: "Email", aliases: ["email", "e mail", "email address"], example: "ayesha@uni.edu.pk" },
    ],
    async prepare(rows, ctx) {
      if (!ctx.target.leadId) throw new Error("Choose the Program Lead the faculty will work under.");
      const lead = await prisma.user.findFirst({ where: { id: ctx.target.leadId, managedById: ctx.chairmanId, role: "PROGRAM_COORDINATOR" }, select: { id: true, departmentId: true } });
      if (!lead) throw new Error("That Program Lead is not in your institute.");
      const users = await prisma.user.findMany({ select: { username: true, email: true } });
      const un = new Set(users.map((u) => u.username.toLowerCase())), em = new Set(users.map((u) => u.email.toLowerCase()));
      const hash = await hashPassword("12345678");
      const out: Prepared = { ok: [], errors: [], skipped: [] };
      for (const { row, v } of rows) {
        const name = v.name?.trim(), u = v.username?.trim().toLowerCase().replace(/\s+/g, ".");
        if (!name || !u) { out.errors.push({ row, message: "Name and login ID are both needed." }); continue; }
        if (un.has(u)) { out.skipped.push({ row, message: `Login ID ${u} already exists` }); continue; }
        const rl = norm(v.role || "instructor");
        const role = /subject|expert|\bse\b/.test(rl) ? "SUBJECT_EXPERT" : /instructor|teacher|lecturer|faculty|^$/.test(rl) ? "INSTRUCTOR" : null;
        if (!role) { out.errors.push({ row, message: `Role "${v.role}" — use Instructor or Subject Expert.` }); continue; }
        let email = (v.email || "").trim().toLowerCase();
        if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { out.errors.push({ row, message: `Email "${v.email}" is not valid.` }); continue; }
        if (!email) email = `${u}@faculty.local`;
        if (em.has(email)) { out.skipped.push({ row, message: `Email ${email} already used` }); continue; }
        un.add(u); em.add(email);
        out.ok.push({ row, data: { id: randomUUID(), name, username: u, email, role, passwordHash: hash, mustChangePassword: true, managedById: lead.id, departmentId: lead.departmentId } });
      }
      return out;
    },
  },
  {
    key: "faculty-details", title: "Faculty with full details (NCEAC Teacher Data format)", needs: [], model: "user",
    what: "One row per teacher, as in NCEAC's “Teacher Data” file plus a Department column. New teachers get an account (first password 12345678); existing ones (same email) are updated. Fills the profile and the NCEAC portal details in one go.",
    fields: [
      { key: "email", label: "Email Address", required: true, aliases: ["email address", "email", "e mail", "official email", "account email"], example: "ayesha.malik@uni.edu.pk" },
      { key: "name", label: "Name", required: true, aliases: ["name", "teacher name", "faculty name", "full name"], example: "Dr. Ayesha Malik" },
      { key: "department", label: "Department", required: true, aliases: ["department", "dept", "department name"], example: "Computer Science" },
      { key: "role", label: "Role", aliases: ["role", "type"], example: "Instructor", note: "Instructor or Subject Expert; defaults to Instructor." },
      { key: "employeeCode", label: "Employee ID", aliases: ["employee id", "employee code", "emp id", "employee no"], example: "EMP-0142" },
      { key: "gender", label: "Gender", aliases: ["gender", "sex"], example: "Female" },
      { key: "cnic", label: "CNIC", aliases: ["cnic", "cnic number", "cnic passport no", "cnic no"], example: "35202-1234567-8" },
      { key: "dob", label: "Date of Birth", aliases: ["date of birth", "dob", "birth date"], example: "1985-03-14" },
      { key: "mobile", label: "Phone Number", aliases: ["phone number", "phone", "mobile", "mobile no", "contact"], example: "0300-1234567" },
      { key: "personalEmail", label: "Email (contact)", aliases: ["personal email", "contact email", "email"], example: "ayesha@gmail.com", note: "The Teacher Data file's second Email column." },
      { key: "address", label: "Address", aliases: ["address", "mailing address"], example: "House 12, Model Town" },
      { key: "province", label: "Province", aliases: ["province"], example: "Punjab" },
      { key: "city", label: "City", aliases: ["city"], example: "Lahore" },
      { key: "contract", label: "Contract Type", aliases: ["contract type", "contract", "employment type", "job type"], example: "Permanent" },
      { key: "rank", label: "Academic Rank", aliases: ["academic rank", "rank", "designation"], example: "Assistant Professor" },
      { key: "joining", label: "Joining Date", aliases: ["joining date", "date of joining", "joined"], example: "2019-09-01" },
      { key: "leaving", label: "Leaving Date", aliases: ["leaving date"], example: "" },
      { key: "degree", label: "Degree Name", aliases: ["degree name", "highest degree", "degree", "qualification"], example: "PhD Computer Science" },
      { key: "degreeType", label: "Degree Type", aliases: ["degree type"], example: "PhD" },
      { key: "field", label: "Field of Study", aliases: ["field of study", "field", "specialization", "specialisation"], example: "Machine Learning" },
      { key: "country", label: "Degree Awarded Country", aliases: ["degree awarded country", "awarding country", "country"], example: "Pakistan" },
      { key: "university", label: "Degree Awarded Institute", aliases: ["degree awarded institute", "university", "institute", "name of university"], example: "University of the Punjab" },
      { key: "degreeStart", label: "Degree Start Date", aliases: ["degree start date"], example: "2012-09-01" },
      { key: "degreeEnd", label: "Degree End Date", aliases: ["degree end date"], example: "2016-06-30" },
    ],
    async prepare(rows, ctx) {
      const depts = await prisma.department.findMany({ where: { chairmanId: ctx.chairmanId }, select: { id: true, name: true } });
      const dept = (s: string) => { const n = norm(s); return depts.find((d) => norm(d.name) === n) || depts.find((d) => n && (norm(d.name).includes(n) || n.includes(norm(d.name)))) || null; };
      const users = await prisma.user.findMany({ select: { id: true, email: true, username: true, managedById: true, managedBy: { select: { managedById: true } } } });
      const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
      const taken = new Set(users.map((u) => u.username.toLowerCase()));
      const seen = new Set<string>();
      const { parseDate, cnicOf } = await import("./nceacLists");
      const out: Prepared = { ok: [], errors: [], skipped: [] };
      for (const { row, v } of rows) {
        const email = (v.email || "").trim().toLowerCase(), name = (v.name || "").trim();
        if (!email || !name) { out.errors.push({ row, message: "Email and name are both needed." }); continue; }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { out.errors.push({ row, message: `Email "${v.email}" is not valid.` }); continue; }
        if (seen.has(email)) { out.skipped.push({ row, message: `${email} appears twice in the file` }); continue; }
        const d = dept(v.department || "");
        if (!d) { out.errors.push({ row, message: `Department "${v.department}" — use one of: ${depts.map((x) => x.name).join(", ")}.` }); continue; }
        const ex = byEmail.get(email);
        if (ex && ex.managedById !== ctx.chairmanId && ex.managedBy?.managedById !== ctx.chairmanId) { out.errors.push({ row, message: `${email} belongs to another institute's account.` }); continue; }
        const dates: Record<string, string> = {};
        let bad = "";
        for (const k of ["dob", "joining", "leaving", "degreeStart", "degreeEnd"]) { if (!v[k]) continue; const dt = parseDate(v[k]); if (!dt) { bad = `${k === "dob" ? "Date of Birth" : k} "${v[k]}" is not a date.`; break; } dates[k] = dt.toISOString().slice(0, 10); }
        if (bad) { out.errors.push({ row, message: bad }); continue; }
        if (v.cnic && !cnicOf(v.cnic) && !/^[A-Z0-9]{6,12}$/i.test(v.cnic.trim())) { out.errors.push({ row, message: `CNIC "${v.cnic}" — use 35202-1234567-8 (or a passport number).` }); continue; }
        const rl = norm(v.role || "");
        seen.add(email);
        let username = ex?.username || email.split("@")[0].replace(/[^a-z0-9._-]/g, "");
        if (!ex) { let u = username, i = 1; while (taken.has(u)) u = `${username}${++i}`; username = u; taken.add(u); }
        out.ok.push({ row, data: { id: ex?.id || randomUUID(), existing: !!ex, email, name, username, departmentId: d.id, role: /subject|expert/.test(rl) ? "SUBJECT_EXPERT" : "INSTRUCTOR", cnic: v.cnic ? (cnicOf(v.cnic) || v.cnic.trim()) : "", ...Object.fromEntries(["employeeCode", "gender", "mobile", "personalEmail", "address", "province", "city", "contract", "rank", "degree", "degreeType", "field", "country", "university"].map((k) => [k, (v[k] || "").trim()])), ...dates } });
      }
      return out;
    },
    async custom(ok, ctx) {
      const hash = await hashPassword("12345678");
      const { saveDetail } = await import("./aas");
      const createdIds: string[] = []; let updated = 0;
      const emp = (c: string) => (/visit|part/i.test(c) ? "Visiting" : /contract|adhoc|ad hoc|tenure/i.test(c) ? "Contract" : c ? "Permanent" : undefined);
      for (const { data: d } of ok) {
        const s = (k: string) => String(d[k] || "");
        const dt = (k: string) => (s(k) ? new Date(s(k)) : undefined);
        const profile: Record<string, unknown> = Object.fromEntries(Object.entries({ cnic: s("cnic") || undefined, dateOfBirth: dt("dob"), gender: s("gender") || undefined, phone: s("mobile") || undefined, address: s("address") || undefined, employmentType: emp(s("contract")), designation: s("rank") || undefined, dateOfJoining: dt("joining"), employeeCode: s("employeeCode") || undefined, specialization: s("field") || undefined }).filter(([, x]) => x !== undefined));
        if (d.existing) {
          await prisma.user.update({ where: { id: s("id") }, data: { name: s("name"), departmentId: s("departmentId") } });
          updated++;
        } else {
          await prisma.user.create({ data: { id: s("id"), email: s("email"), username: s("username"), name: s("name"), passwordHash: hash, role: s("role"), managedById: ctx.chairmanId, departmentId: s("departmentId"), mustChangePassword: true } as never });
          createdIds.push(s("id"));
        }
        await prisma.facultyProfile.upsert({ where: { userId: s("id") }, create: { userId: s("id"), ...profile } as never, update: profile as never });
        await saveDetail("staff", s("id"), Object.fromEntries(Object.entries({ name: s("name"), gender: s("gender"), cnic: s("cnic"), dob: s("dob"), mobile: s("mobile"), email: s("personalEmail") || s("email"), address: s("address"), province: s("province"), city: s("city"), contract: s("contract"), rank: s("rank"), joining: s("joining"), leaving: s("leaving"), degree: s("degree"), degreeType: s("degreeType"), field: s("field"), country: s("country"), university: s("university"), degreeStart: s("degreeStart"), degreeEnd: s("degreeEnd") }).filter(([, x]) => x)), ctx.userId).catch(() => null);
        if (s("degree") && !(await prisma.facultyRecord.findFirst({ where: { userId: s("id"), kind: "EDUCATION", title: s("degree") } }))) {
          await prisma.facultyRecord.create({ data: { userId: s("id"), kind: "EDUCATION", title: s("degree"), organisation: s("university") || null, startYear: s("degreeStart") ? Number(s("degreeStart").slice(0, 4)) : null, endYear: s("degreeEnd") ? Number(s("degreeEnd").slice(0, 4)) : null, category: s("degreeType") || null } as never });
        }
      }
      return { createdIds, updated };
    },
    async undoExtra(ids) {
      await prisma.facultyRecord.deleteMany({ where: { userId: { in: ids } } });
      await prisma.facultyProfile.deleteMany({ where: { userId: { in: ids } } });
      await idb.staffDetail.deleteMany({ where: { userId: { in: ids } } }).catch(() => null);
    },
  },
  {
    key: "transcripts", title: "Past transcripts (earlier semesters' grades)", what: "One row per student per course. Feeds CGPA, degree audit, prediction and graduation figures.", needs: ["batch"], model: "studentTranscriptRecord",
    fields: [
      { key: "rollNumber", label: "Roll number", required: true, aliases: ["roll", "roll no", "roll number", "registration no", "reg no", "student id"], example: "2022-CS-014" },
      { key: "courseCode", label: "Course code", required: true, aliases: ["course code", "code", "course no", "subject code"], example: "CS101" },
      { key: "courseTitle", label: "Course title", required: true, aliases: ["course title", "title", "course name", "subject", "course"], example: "Programming Fundamentals" },
      { key: "creditHours", label: "Credit hours", required: true, aliases: ["credit hours", "ch", "cr hrs", "credits", "credit"], example: 3 },
      { key: "grade", label: "Grade", required: true, aliases: ["grade", "letter grade", "final grade"], example: "B+" },
      { key: "termName", label: "Term", required: true, aliases: ["term", "term name", "session", "semester term", "season"], example: "Fall", note: "Fall, Spring or Summer (\"Fall 2022\" also works)." },
      { key: "termYear", label: "Year", aliases: ["year", "term year"], example: 2022, note: "Not needed when the Term column already has the year." },
      { key: "totalPct", label: "Marks %", aliases: ["marks", "total", "percentage", "marks %", "total %", "score"], example: 78 },
    ],
    async prepare(rows, ctx) {
      const b = await batchOf(ctx);
      const scale = await getGradingScaleForBatch(b.coordinatorId, b);
      const gpa = new Map(scale.map((g) => [g.letter.toUpperCase(), g.gpaValue]));
      const st = new Map((await prisma.student.findMany({ where: { batchId: b.id }, select: { id: true, rollNumber: true } })).map((s) => [s.rollNumber.toLowerCase(), s.id]));
      const ex = new Set((await prisma.studentTranscriptRecord.findMany({ where: { studentId: { in: Array.from(st.values()).concat("none") } }, select: { studentId: true, courseCode: true, termName: true, termYear: true } })).map((r) => `${r.studentId}|${r.courseCode.toUpperCase()}|${r.termName}|${r.termYear}`));
      const out: Prepared = { ok: [], errors: [], skipped: [] };
      for (const { row, v } of rows) {
        const sid = st.get((v.rollNumber || "").trim().toLowerCase());
        if (!sid) { out.errors.push({ row, message: `Roll number "${v.rollNumber}" is not in this batch (import the students first).` }); continue; }
        const code = (v.courseCode || "").trim().toUpperCase(), ch = num(v.creditHours), grade = (v.grade || "").trim().toUpperCase();
        const term = TERM(v.termName || ""), year = v.termYear ? num(v.termYear) : num((v.termName || "").replace(/\D+/g, ""));
        if (!code || !v.courseTitle?.trim()) { out.errors.push({ row, message: "Course code and title are needed." }); continue; }
        if (!Number.isInteger(ch) || ch < 0 || ch > 6) { out.errors.push({ row, message: `Credit hours "${v.creditHours}" is not 0–6.` }); continue; }
        if (!term) { out.errors.push({ row, message: `Term "${v.termName}" — use Fall, Spring or Summer.` }); continue; }
        if (!Number.isInteger(year) || year < 1990 || year > 2100) { out.errors.push({ row, message: "Year is missing or wrong." }); continue; }
        if (!grade) { out.errors.push({ row, message: "Grade is missing." }); continue; }
        if (scale.length && grade !== "W" && grade !== "I" && !gpa.has(grade)) { out.errors.push({ row, message: `Grade "${grade}" is not on this batch's grading scale (${scale.map((g) => g.letter).join(", ")}).` }); continue; }
        const k = `${sid}|${code}|${term}|${year}`;
        if (ex.has(k)) { out.skipped.push({ row, message: `${v.rollNumber} ${code} ${term} ${year} already imported` }); continue; }
        ex.add(k);
        const pct = v.totalPct ? num(v.totalPct) : 0;
        out.ok.push({ row, data: { id: randomUUID(), studentId: sid, coordinatorId: b.coordinatorId, courseCode: code, courseTitle: v.courseTitle.trim(), creditHours: ch, courseType: "Core", termName: term, termYear: year, totalPct: Number.isFinite(pct) ? pct : 0, cloAttainmentJson: "[]", ploAttainmentJson: "[]", grade, gpaPoints: grade === "W" || grade === "I" ? null : gpa.get(grade) ?? null } });
      }
      return out;
    },
  },
  {
    key: "rooms", title: "Rooms and labs", what: "Class rooms and labs with seats (used by the timetable and exam seating).", needs: [], model: "room",
    fields: [
      { key: "name", label: "Room name", required: true, aliases: ["room", "room name", "name", "room no", "lab"], example: "Room 204" },
      { key: "type", label: "Type", aliases: ["type", "room type", "kind"], example: "Lecture", note: "Lecture or Lab; defaults to Lecture." },
      { key: "capacity", label: "Seats", required: true, aliases: ["capacity", "seats", "seating", "strength"], example: 50 },
    ],
    async prepare(rows, ctx) {
      const have = new Set((await prisma.room.findMany({ where: { chairmanId: ctx.chairmanId }, select: { name: true } })).map((r) => r.name.toLowerCase()));
      const out: Prepared = { ok: [], errors: [], skipped: [] };
      for (const { row, v } of rows) {
        const n = (v.name || "").trim(), cap = num(v.capacity);
        if (!n) { out.errors.push({ row, message: "Room name is missing." }); continue; }
        if (!Number.isInteger(cap) || cap < 1 || cap > 2000) { out.errors.push({ row, message: `Seats "${v.capacity}" is not a number.` }); continue; }
        if (have.has(n.toLowerCase())) { out.skipped.push({ row, message: `${n} already exists` }); continue; }
        have.add(n.toLowerCase());
        out.ok.push({ row, data: { id: randomUUID(), chairmanId: ctx.chairmanId, name: n, type: /lab/i.test(v.type || "") ? "LAB" : "LECTURE", capacity: cap } });
      }
      return out;
    },
  },
  {
    key: "alumni", title: "Alumni", what: "Graduates of earlier years (for alumni surveys, PEO attainment and graduate figures).", needs: [], model: "alumni",
    fields: [
      { key: "name", label: "Name", required: true, aliases: ["name", "alumni name", "graduate", "full name"], example: "Usman Ali" },
      { key: "rollNumber", label: "Roll number", required: true, aliases: ["roll", "roll no", "roll number", "registration no", "reg no"], example: "2018-CS-033" },
      { key: "degreeProgram", label: "Degree program", required: true, aliases: ["program", "degree", "degree program", "programme"], example: "BS Computer Science" },
      { key: "graduationYear", label: "Graduation year", required: true, aliases: ["graduation year", "year", "passing year", "batch year"], example: 2022 },
      { key: "email", label: "Email", aliases: ["email", "e mail"], example: "usman@gmail.com" },
    ],
    async prepare(rows, ctx) {
      const have = new Set((await prisma.alumni.findMany({ where: { chairmanId: ctx.chairmanId }, select: { rollNumber: true } })).map((r) => r.rollNumber.toLowerCase()));
      const out: Prepared = { ok: [], errors: [], skipped: [] };
      for (const { row, v } of rows) {
        const r = (v.rollNumber || "").trim(), y = num(v.graduationYear);
        if (!v.name?.trim() || !r || !v.degreeProgram?.trim()) { out.errors.push({ row, message: "Name, roll number and program are needed." }); continue; }
        if (!Number.isInteger(y) || y < 1950 || y > 2100) { out.errors.push({ row, message: `Graduation year "${v.graduationYear}" is wrong.` }); continue; }
        if (have.has(r.toLowerCase())) { out.skipped.push({ row, message: `${r} already exists` }); continue; }
        have.add(r.toLowerCase());
        out.ok.push({ row, data: { id: randomUUID(), chairmanId: ctx.chairmanId, name: v.name.trim(), rollNumber: r, degreeProgram: v.degreeProgram.trim(), graduationYear: y, email: v.email?.trim() || null, addedById: ctx.userId, status: "APPROVED", reviewedById: ctx.userId } });
      }
      return out;
    },
  },
  {
    key: "employers", title: "Employers", what: "Organisations that hire your graduates (for employer surveys).", needs: [], model: "employer",
    fields: [
      { key: "organizationName", label: "Organisation", required: true, aliases: ["organisation", "organization", "company", "employer", "organization name"], example: "Systems Ltd" },
      { key: "contactName", label: "Contact person", aliases: ["contact", "contact name", "contact person", "hr"], example: "Ms. Hina" },
      { key: "contactEmail", label: "Contact email", aliases: ["email", "contact email", "e mail"], example: "hr@systems.com" },
    ],
    async prepare(rows, ctx) {
      const have = new Set((await prisma.employer.findMany({ where: { chairmanId: ctx.chairmanId }, select: { organizationName: true } })).map((r) => r.organizationName.toLowerCase()));
      const out: Prepared = { ok: [], errors: [], skipped: [] };
      for (const { row, v } of rows) {
        const n = (v.organizationName || "").trim();
        if (!n) { out.errors.push({ row, message: "Organisation is missing." }); continue; }
        if (have.has(n.toLowerCase())) { out.skipped.push({ row, message: `${n} already exists` }); continue; }
        have.add(n.toLowerCase());
        out.ok.push({ row, data: { id: randomUUID(), chairmanId: ctx.chairmanId, organizationName: n, contactName: v.contactName?.trim() || null, contactEmail: v.contactEmail?.trim() || null, status: "APPROVED", reviewedById: ctx.userId } });
      }
      return out;
    },
  },
];

/** Importers that already exist elsewhere (shown on the hub so everything is in one place). */
export const OTHER_IMPORTERS = [
  { title: "Whole curriculum (scheme, GAs, courses, CLOs with GA mapping, lecture topics)", href: "/admin/curricula", template: "curriculum-workbook" },
  { title: "CLOs with PLO/GA mapping for many courses", href: "/clo-bulk-import", template: "official-clos" },
  { title: "Graduate attributes (PLOs) of a batch", href: "/coordinator/plos", template: "plos" },
  { title: "Students across many batches (admissions file)", href: "/coordinator/bulk-student-upload", template: "students" },
  { title: "Marks from an LMS gradebook (Moodle, Classroom)", href: "/instructor/courses", template: "lms-gradebook" },
  { title: "Student and guardian mobile numbers", href: "/chairman/messaging", template: "messaging-contacts" },
];

export const kindOf = (k: string) => KINDS.find((x) => x.key === k) || null;

/** The heading row: the first of the top 15 rows that matches the most known headings. */
export function headerRow(grid: string[][], kind: Kind) {
  let best = 0, bi = 0;
  grid.slice(0, 15).forEach((r, i) => {
    const n = kind.fields.filter((f) => r.some((c) => f.aliases.includes(norm(c)) || norm(c) === norm(f.label))).length;
    if (n > best) { best = n; bi = i; }
  });
  return bi;
}

/** Guess which column fills each field (exact alias first, then contains). */
export function autoMap(headers: string[], kind: Kind): Record<string, number> {
  const m: Record<string, number> = {};
  const used = new Set<number>();
  for (const f of kind.fields) {
    let i = headers.findIndex((h, j) => !used.has(j) && (f.aliases.includes(norm(h)) || norm(h) === norm(f.label)));
    if (i < 0) i = headers.findIndex((h, j) => !used.has(j) && norm(h) && f.aliases.some((a) => a.length > 3 && norm(h).includes(a)));
    if (i >= 0) { m[f.key] = i; used.add(i); }
  }
  return m;
}

export function mappedRows(grid: string[][], hi: number, map: Record<string, number>) {
  return grid.slice(hi + 1).map((r, i) => ({ row: hi + i + 2, v: Object.fromEntries(Object.entries(map).filter(([, c]) => c >= 0).map(([k, c]) => [k, (r[c] || "").trim()])) as Row }))
    .filter((r) => Object.values(r.v).some((x) => x));
}

export async function dryRun(kind: Kind, rows: { row: number; v: Row }[], ctx: Ctx, map: Record<string, number>) {
  const missing = kind.fields.filter((f) => f.required && !(map[f.key] >= 0)).map((f) => f.label);
  if (missing.length) throw new Error(`Match a column to: ${missing.join(", ")}.`);
  return kind.prepare(rows, ctx);
}

/** Write the prepared rows in chunks and log the import. */
export async function commit(kind: Kind, fileName: string, rows: { row: number; v: Row }[], ctx: Ctx, map: Record<string, number>) {
  const p = await dryRun(kind, rows, ctx, map);
  const data = p.ok.map((o) => o.data);
  let createdIds: string[], updated = 0;
  if (kind.custom) ({ createdIds, updated } = await kind.custom(p.ok, ctx));
  else {
    for (let i = 0; i < data.length; i += 500) await idb[kind.model].createMany({ data: data.slice(i, i + 500), skipDuplicates: true });
    createdIds = data.map((d) => String(d.id));
  }
  const id = randomUUID();
  await idb.importLog.create({ data: { id, chairmanId: ctx.chairmanId, kind: kind.key, fileName: fileName.slice(0, 200), targetJson: JSON.stringify(ctx.target), rows: rows.length, created: createdIds.length, skipped: p.skipped.length + p.errors.length, createdIdsJson: JSON.stringify(createdIds), byId: ctx.userId } }).catch(() => null);
  await writeAuditLog({ actorUserId: ctx.userId, action: "DATA_IMPORTED", entityType: "ImportLog", entityId: id, metadata: { kind: kind.key, created: createdIds.length, updated, skipped: p.skipped.length, errors: p.errors.length } as never });
  return { id, created: createdIds.length, updated, skipped: p.skipped.length, errors: p.errors };
}

/** Undo: delete what the import created (rows that other records now depend on are kept and counted). */
export async function undo(chairmanId: string, by: string, logId: string) {
  const log = (await idb.importLog.findFirst({ where: { id: logId, chairmanId } })) as { kind: string; createdIdsJson: string; status: string } | null;
  if (!log) throw new Error("Import not found.");
  if (log.status === "UNDONE") throw new Error("Already undone.");
  const kind = kindOf(log.kind)!;
  const ids = JSON.parse(log.createdIdsJson) as string[];
  if (kind.undoExtra) await kind.undoExtra(ids).catch(() => null);
  let removed = 0, kept = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const part = ids.slice(i, i + 500);
    try { removed += (await idb[kind.model].deleteMany({ where: { id: { in: part } } })).count; }
    catch { for (const x of part) { try { await idb[kind.model].delete({ where: { id: x } }); removed++; } catch { kept++; } } }
  }
  await idb.importLog.update({ where: { id: logId }, data: { status: "UNDONE", undoneAt: new Date() } });
  await writeAuditLog({ actorUserId: by, action: "DATA_IMPORT_UNDONE", entityType: "ImportLog", entityId: logId, metadata: { removed, kept } as never });
  return { removed, kept };
}
