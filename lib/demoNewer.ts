import { randomUUID } from "crypto";
import { prisma } from "./db";
import { hashPassword } from "./auth";
import { DEMO_HEAD, DEMO_PASSWORD } from "./demoInstitute";

// Demo data for the newest features (Nov 2026), added to Dream Institute as extra "Make demo ready" steps — each part is
// safe to run again (it clears what it made before). People: an Affiliation office, a Treasurer, an affiliated college
// (Dream College Sahiwal) with its own head; jobs and the exam team. Then the year allocation plan, committee members,
// a full affiliation year, and a joint degree plus a single ODL course.
const db = prisma as unknown as Record<string, any>;
export const NEWER_PARTS = ["people", "allocation", "committees", "affiliation", "collab"] as const;
export const COLLEGE_HEAD = "dream.college";
const day = (n: number) => new Date(Date.now() + n * 864e5);
const iso = (n: number) => day(n).toISOString().slice(0, 10);

async function head() { const h = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true, name: true, managedById: true } }); if (!h) throw new Error("Build the demo institute first."); return h; }
async function u(username: string) { return prisma.user.findUnique({ where: { username }, select: { id: true, name: true, role: true, managedById: true, departmentId: true, extraRoles: true } }); }
async function must(username: string) { const x = await u(username); if (!x) throw new Error(`Demo user ${username} is missing — run the earlier steps first.`); return x; }

export async function newerPart(part: string, superUserId: string): Promise<string> {
  const h = await head();
  const H = { id: h.id, role: "CHAIRMAN", name: h.name };
  switch (part) {
    case "people": {
      const dept = await prisma.department.findFirst({ where: { chairmanId: h.id }, select: { id: true } });
      const hash = await hashPassword(DEMO_PASSWORD);
      const mk = async (username: string, name: string, role: string, extra: Record<string, unknown>) => (await u(username)) || prisma.user.create({ data: { id: randomUUID(), username, email: `${username}@dreaminstitute.demo`, passwordHash: hash, name, role, mustChangePassword: false, ...extra } as never });
      await mk("dream.affiliation", "Mr. Saad Hussain (Director Affiliation)", "INSTRUCTOR", { managedById: h.id, departmentId: dept?.id });
      await mk("dream.treasurer", "Mr. Tariq Mehmood (Treasurer)", "FINANCE_OFFICER", { managedById: h.id });
      await mk(COLLEGE_HEAD, "Prof. Rubina Khalid", "CHAIRMAN", { managedById: h.managedById || superUserId, instituteName: "Dream College Sahiwal (DEMO)" });
      const col = await must(COLLEGE_HEAD), aff = await must("dream.affiliation"), tr = await must("dream.treasurer");
      await (await import("./curriculumLibrary")).setAffiliation(h.id, col.id, h.id, "Demo affiliated college");
      const D = await import("./dutyAssign");
      await D.setAffiliationOfficer(H, h.id, "UNI", aff.id);
      const ids = async (...names: string[]) => (await Promise.all(names.map(u))).filter(Boolean).map((x) => x!.id);
      await (await import("./affJobs")).saveJobs(H, h.id, { OFFICE: await ids("dream.affiliation"), INSPECTOR: await ids("dream.qec", "dream.hod.cs"), COMMITTEE: await ids("dream.dean"), AUTHORITY: [h.id], REGISTRAR: await ids("dream.affiliation"), CONTROLLER: await ids("dream.controller"), TREASURER: [tr.id] });
      const progs = Array.from(new Set((await prisma.batch.findMany({ where: { coordinator: { managedById: h.id } }, select: { degreeProgram: true } })).map((b) => b.degreeProgram))).sort();
      const team = (await Promise.all(["dream.instructor", "dream.labeng"].map(u))).filter(Boolean).map((x, i) => ({ userId: x!.id, name: x!.name, programs: progs.filter((_, j) => j % 2 === i) }));
      await D.saveExamTeam(H, h.id, team);
      return `Affiliation office, Treasurer, Dream College Sahiwal (login ${COLLEGE_HEAD}), 7 affiliation jobs, exam team of ${team.length}`;
    }
    case "allocation": {
      const lead = await must("dream.lead.cs"), hod = await must("dream.hod.cs");
      const Y = await import("./yearPlan");
      const L = { id: lead.id, role: lead.role, managedById: lead.managedById, departmentId: lead.departmentId, name: lead.name };
      const old = await Y.getPlan(L, h.id);
      if (old) await db.allocationPlan.delete({ where: { id: old.id } }).catch(() => null);
      const n = await Y.startFromForecast(L, h.id);
      const p = await Y.getPlan(L, h.id);
      if (!p) return "No forecast rows (no batches yet).";
      await Y.submit(L, p, true);
      const p2 = await Y.getPlan(L, h.id);
      await Y.decide({ id: hod.id, role: hod.role, name: hod.name }, p2!, true);
      return `Year plan ${Y.yearLabelNow()}: ${n} rows, submitted by the Program Lead and approved by the HOD`;
    }
    case "committees": {
      const E = await import("./committeeEngine"), M = await import("./committeeMeta");
      const bos = (await db.cmtCommittee.findFirst({ where: { chairmanId: h.id, type: "BOS" } }).catch(() => null)) as { id: string; chairmanId: string } | null;
      if (!bos) return "No BOS yet (run the BOS step first).";
      const members = await E.membersOf(bos.id);
      if (!members.some((m) => m.external)) await E.addMember(H, bos.id, { name: "Dr. Imran Qureshi", organisation: "University of the Punjab", email: "imran.qureshi@example.edu", external: true });
      const sec = await u("dream.lead.cs");
      if (sec) await E.addMember(H, bos.id, { userId: sec.id }).catch(() => null);
      const all = await E.membersOf(bos.id);
      const meta = await M.metaOf(h.id, bos.id);
      meta.secretaryId = sec?.id; meta.secretaryName = sec?.name;
      meta.rules = [{ role: "External expert", min: 2 }, { role: "Member", min: 3 }];
      all.forEach((m, i) => { meta.roles[m.id] = { role: m.external ? "External expert" : m.userId === sec?.id ? "Secretary" : "Member", from: iso(-300), until: i === 0 ? iso(20) : iso(400) }; });
      meta.history = [{ at: day(-60).toISOString(), by: h.name, out: "Dr. Former Member", in: sec?.id || "", note: "Term ended" }];
      await M.saveMeta(h.id, bos.id, meta, h.id);
      return `BOS: ${all.length} members with roles and terms (one ending in 20 days), Secretary, composition rule (2 external experts — 1 short)`;
    }
    case "affiliation": {
      const col = await must(COLLEGE_HEAD), aff = await must("dream.affiliation");
      const old = ((await db.affRecord.findMany({ where: { universityId: h.id }, select: { id: true } })) || []) as { id: string }[];
      await db.affEvent.deleteMany({ where: { recordId: { in: old.map((x) => x.id).concat("none") } } });
      await db.affRecord.deleteMany({ where: { universityId: h.id } });
      const rec = async (kind: string, status: string, title: string, data: Record<string, unknown>, collegeId: string | null = col.id, by = aff.id) => {
        const id = randomUUID();
        await db.affRecord.create({ data: { id, universityId: h.id, collegeId, kind, status, title, dataJson: JSON.stringify(data), createdById: by, updatedAt: new Date() } });
        await db.affEvent.create({ data: { id: randomUUID(), recordId: id, byId: by, action: "CREATED" } });
        if (status !== "SUBMITTED" && status !== "SCHEDULED") await db.affEvent.create({ data: { id: randomUUID(), recordId: id, byId: by, action: `STATUS ${status}` } });
        return id;
      };
      await rec("APPLICATION", "APPROVED", "Renewal of affiliation 2026", { type: "Renewal", programs: "BS Computer Science", seats: 120, facilities: "3 labs, 120 PCs, library 6,000 titles", faculty: "18 (4 PhD)", visitDate: iso(-90), team: "Dr. Ayesha Malik, Dr. Bilal Ahmed", score: 78, report: "Labs adequate; library needs more journals.", authority: "Syndicate", validUntil: iso(700) }, col.id, col.id);
      await rec("APPLICATION", "VISIT_SET", "New program: BS Artificial Intelligence", { type: "New program", programs: "BS Artificial Intelligence", seats: 60, facilities: "1 GPU lab (30 PCs)", faculty: "6 (1 PhD)", visitDate: iso(12), team: "Dr. Ayesha Malik" }, col.id, col.id);
      const centre = await rec("CENTRE", "DECLARED", "Dream College Sahiwal — Lab test centre", { type: "Lab tests", capacity: 40, software: "Python, VS Code, MySQL; UPS 2 h", city: "Sahiwal", validUntil: iso(365) }, col.id, col.id);
      const ex1 = await rec("EXAMINER", "APPROVED", "Dr. Kashif Raza", { institute: "UET Lahore", city: "Lahore", designation: "Associate Professor", payScale: 20, courses: "CS-201 CS-301", qualification: "PhD Computer Science", bank: "HBL ****1234" }, null);
      await rec("EXAMINER", "APPROVED", "Dr. Hina Shah", { institute: "Dream College Sahiwal (DEMO)", city: "Sahiwal", designation: "Assistant Professor", payScale: 19, courses: "CS-201", qualification: "PhD" }, null);
      await rec("EXAMINER", "APPROVED", "Dr. Usman Ali", { institute: "BZU Multan", city: "Multan", designation: "Professor", payScale: 21, courses: "CS-201 CS-202", relatives: "" }, null);
      const marks = Array.from({ length: 30 }, (_, i) => ({ roll: `DCS-24-${String(i + 1).padStart(3, "0")}`, mark: 10 + ((i * 7) % 15), ext: true, int: true }));
      const s1 = await rec("SESSION", "MARKS_AGREED", "CS-201 lab test — session 1", { type: "Lab test", courseCode: "CS-201", centreId: centre, date: iso(-20), slot: "09:00–12:00", students: 90, externalId: ex1, internal: "Mr. Bilal Ahmad", condition: "38 of 40 PCs working; internet stable; UPS tested.", unfairMeans: "None", marks });
      await rec("SESSION", "SCHEDULED", "CS-202 lab test", { type: "Lab test", courseCode: "CS-202", centreId: centre, date: iso(10), slot: "09:00–12:00", students: 60 });
      await rec("CLAIM", "PAID", "Dr. Kashif Raza — CS-201 lab test", { examinerId: ex1, sessionId: s1, role: "External examiner", students: 30, paperSet: 1, fromCity: "Lahore", toCity: "Sahiwal", depart: `${iso(-21)}T07:00`, return: `${iso(-20)}T19:00`, transport: "Own car", km: 170, payScale: 20, nights: 1 }, null);
      await rec("CLAIM", "SUBMITTED", "Mr. Bilal Ahmad — internal examiner", { sessionId: s1, role: "Internal examiner", students: 30 }, null);
      const notice = await rec("NOTICE", "SENT", "Fall 2026 final exam schedule", { text: "Finals run 12–23 January. Send short-attendance lists by 5 January.", deadline: iso(30), colleges: "All" }, null);
      await (await import("./scopedSettings")).setFlag(col.id, `aff:ack:${notice}`, new Date().toISOString()).catch(() => null);
      await rec("FACULTY", "APPROVED", "Mr. Bilal Ahmad — CS-201, CS-202", { teacher: "Mr. Bilal Ahmad", courses: "CS-201 CS-202", qualification: "MS Computer Science", experience: 6, validUntil: iso(300) }, col.id, col.id);
      await rec("FEE", "PAID", "Affiliation fee 2026", { head: "Affiliation", amount: 250000, due: iso(-60), challan: "UNI-2026-0145", paidOn: iso(-55) }, col.id);
      await rec("FEE", "DUE", "Exam fee — Fall 2026 (240 students)", { head: "Exam fee", amount: 240 * 1500, due: iso(15), challan: "UNI-2026-0210" }, col.id);
      await rec("ACCREDITATION", "ACCREDITED", "NCEAC — BS Computer Science", { program: "BS Computer Science", council: "NCEAC", visit: iso(-200), level: "Category W (3 years)", validUntil: iso(900), verified: "yes" }, col.id, col.id);
      await rec("FINAL_PAPER", "RELEASED", "CS-201 final (central paper)", { course: "CS-201", mode: "University sets (central paper)", disclosure: "Topic list disclosed", topics: "L1–L28, excluding L12", releaseDate: iso(-3), examDate: `${iso(60)} 3 hours`, paper: "secure://vault/cs201-final" }, null);
      const key = (await import("./examLogistics")).codeScripts(marks.map((m) => m.roll));
      await rec("MARKING", "MARKING", "CS-201 final — answer sheets", { course: "CS-201", marker: "Dr. Usman Ali", markerInstitute: "BZU Multan", maxMarks: 60, key, marks: Object.fromEntries(Object.keys(key).slice(0, 12).map((c, i) => [c, 30 + (i * 3) % 25])) }, col.id);
      await rec("RECHECK", "APPLIED", "Re-marking — DCS-24-017, CS-201", { student: "DCS-24-017", course: "CS-201", type: "Re-marking", fee: 1000 }, col.id, col.id);
      return "16 affiliation records (applications, centre, 3 examiners, sessions with agreed marks, claims, notice, faculty approval, fees, NCEAC, final paper, coded marking, re-check)";
    }
    case "collab": {
      const C = await import("./collab");
      await db.collabProgramme.deleteMany({ where: { chairmanId: h.id } });
      const se = await must("dream.se"), ins = await must("dream.instructor");
      const jid = await C.createProg(H, h.id, "JOINT", "BS Computer Science — joint degree with UET Lahore");
      const get = async (id: string) => (await db.collabProgramme.findUnique({ where: { id } })) as import("./collab").Prog;
      const cur = await prisma.masterCurriculum.findMany({ where: { chairmanId: h.id }, select: { id: true, degreeProgram: true }, take: 4 });
      const cem = cur.length >= 2 ? await C.draftCem(cur[0].id, cur[1].id) : [];
      const checks = Object.fromEntries(C.DDJD_CHECKS.map(([k], i) => [k, { done: i < 12, note: i < 12 ? "On file" : "" }]));
      const moc = Object.fromEntries(C.MOC_ITEMS.filter(([k]) => k !== "q" && k !== "r").map(([k, label]) => [k, `${label}: agreed — see the joint scheme of studies, clause ${k}.`]));
      await C.saveData(await get(jid), { partners: [{ name: "University of Engineering & Technology, Lahore", country: "Pakistan", recognised: true }], checks, moc, cem: cem.slice(0, 20).map((r, i) => ({ ...r, ok: r.ok || i % 5 !== 0, assessment: "Mid 30 · Final 50 · Sessional 20" })), mocFrom: iso(-30), mocUntil: iso(5 * 365 + 30), moderationPct: 20, fees: "Rs 145,000 per semester for 8 semesters; Rs 25,000 admission (once).", feeCapPct: 10, focal: "Dr. Ayesha Malik — Dream Institute; Dr. Kashif Raza — UET Lahore", kpis: { enrolment: 86, graduation: 68, satisfaction: 82, employability: 77 } });
      await C.assignOwner(H, await get(jid), se.id, se.name);
      const course = await prisma.course.findFirst({ where: { coordinator: { managedById: h.id }, isOffered: true }, select: { id: true, code: true } });
      const oid = await C.createProg(H, h.id, "ODL_COURSE", "Single online course (blended) for consortium students");
      await C.saveData(await get(oid), { courses: course ? [{ code: course.code, mode: "BLENDED", ch: 3, teacher: ins.name }] : [], checks: Object.fromEntries(C.ODL_CHECKS.map(([k], i) => [k, { done: i % 3 !== 2 }])), nocNo: "HEC/ODL/2026/117", nocDate: iso(-40), nocUntil: iso(3 * 365), seats: 60 });
      if (course) {
        const rows = await prisma.lectureRow.findMany({ where: { courseId: course.id, source: "SE" }, select: { lectureNumber: true } });
        await C.saveModes(await get(oid), h.id, course.id, course.code, Object.fromEntries(rows.map((r) => [String(r.lectureNumber), r.lectureNumber % 4 === 0 ? "F2F" : r.lectureNumber % 4 === 1 ? "LIVE" : "REC"])));
      }
      await C.assignOwner(H, await get(oid), ins.id, ins.name);
      return `Joint degree (lead: ${se.name}, ${cem.length} matrix lines) and a blended ODL course (lead: ${ins.name})`;
    }
  }
  throw new Error(`Unknown part ${part}.`);
}
