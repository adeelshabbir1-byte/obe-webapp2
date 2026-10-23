import { randomUUID } from "crypto";
import { prisma } from "./db";
import { DEMO_HEAD } from "./demoInstitute";
import { saveTitles } from "./titles";
import { setDuty, QEC_INCHARGE } from "./duties";
import { saveQuestion, saveSettings, allQuestions } from "./questionnaires";
import { raise, decide } from "./studentStatus";

// Dream University: position titles, the organisation chart (with an acting Dean and a vacant position), the QEC
// In-charge and a second version of the feedback questionnaires, student feedback with real variety (a strict batch, a
// generous batch, a teacher always low on one question, a teacher who improved after a workshop), and student status
// changes at every stage. Safe to run again: each part is skipped when it is already there.

const db = prisma as unknown as Record<string, any>;
const d = (s: string) => new Date(`${s}T00:00:00Z`);
function rng(seed: string) { let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export async function campusGovernance() {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true, name: true, role: true } });
  if (!head) throw new Error("Build the demo institute first.");
  const users = await prisma.user.findMany({ where: { OR: [{ id: head.id }, { managedById: head.id }, { managedBy: { managedById: head.id } }] }, select: { id: true, name: true, role: true, username: true, departmentId: true, facultyId: true, leadProgram: true } });
  const by = (u: string) => users.find((x) => x.username === u);
  const done: string[] = [];

  // 1. Titles: the head of the institute is the Vice Chancellor; QEC has a Director.
  if (!(await db.instituteTitle.count({ where: { chairmanId: head.id } }).catch(() => 1))) {
    await saveTitles(head.id, [{ key: "INSTITUTE_HEAD", title: "Vice Chancellor", enabled: true }, { key: "QEC_INCHARGE", title: "Director QEC", enabled: true }, { key: "HEAD_OF_DEPARTMENT", title: "Chairman", enabled: true }], head.id);
    done.push("titles");
  }

  // 2. QEC In-charge: a senior teacher.
  const qec = by("dream.t3");
  if (qec && !(await prisma.user.count({ where: { id: qec.id, extraRoles: { has: QEC_INCHARGE } } }))) { await setDuty(head.id, QEC_INCHARGE, qec.id, true); done.push("QEC In-charge"); }

  // 3. Organisation chart with the institute's titles, an acting Dean (on Umrah leave) and a vacant coordinator post.
  if (!(await db.orgPosition.count({ where: { chairmanId: head.id } }).catch(() => 1))) {
    const [faculties, depts, programs] = await Promise.all([
      prisma.faculty.findMany({ where: { chairmanId: head.id }, select: { id: true, name: true } }),
      prisma.department.findMany({ where: { chairmanId: head.id }, select: { id: true, name: true, facultyId: true } }),
      prisma.departmentProgram.findMany({ where: { chairmanId: head.id }, select: { degreeProgram: true, departmentId: true } }),
    ]);
    const rows: Record<string, unknown>[] = [];
    const add = (r: Record<string, unknown>) => { const id = randomUUID(); rows.push({ id, chairmanId: head.id, orderIndex: rows.length, coversJson: "[]", ...r }); return id; };
    const root = add({ title: "Vice Chancellor", role: "NONE", holderId: head.id });
    const deanPos = new Map<string, string>();
    for (const f of faculties) deanPos.set(f.id, add({ title: `Dean, ${f.name}`, role: "DEAN", facultyId: f.id, parentId: root, holderId: users.find((u) => u.role === "DEAN" && u.facultyId === f.id)?.id || null }));
    add({ title: "Controller of Examinations", role: "EXAM_CONTROLLER", parentId: root, holderId: by("dream.omc")?.id || null });
    add({ title: "Director QEC", role: "QEC_INCHARGE", parentId: root, holderId: qec?.id || null });
    for (const dpt of depts) {
      const hod = add({ title: `Chairman, ${dpt.name}`, role: "HEAD_OF_DEPARTMENT", departmentId: dpt.id, parentId: (dpt.facultyId && deanPos.get(dpt.facultyId)) || root, holderId: users.find((u) => u.role === "HEAD_OF_DEPARTMENT" && u.departmentId === dpt.id)?.id || null });
      if (/Computing/.test(dpt.name)) add({ title: `Program Coordinator, ${dpt.name}`, role: "DEPARTMENT_COORDINATOR", departmentId: dpt.id, parentId: hod, holderId: null });
      for (const p of programs.filter((x) => x.departmentId === dpt.id)) add({ title: `Program Lead, ${p.degreeProgram}`, role: "PROGRAM_LEAD", departmentId: dpt.id, program: p.degreeProgram, parentId: hod, holderId: users.find((u) => u.leadProgram === p.degreeProgram)?.id || null });
    }
    add({ title: "OMC Member", role: "OMC", parentId: root, holderId: by("dream.omc")?.id || null });
    await db.orgPosition.createMany({ data: rows });
    for (const r of rows.filter((x) => x.holderId)) await db.orgPositionLog.create({ data: { positionId: r.id, title: r.title, userId: r.holderId, action: "ASSIGNED", byId: head.id, at: d("2025-08-01") } });
    const dean = rows.find((r) => r.role === "DEAN");
    const actor = by("dream.hod.bba");
    if (dean && actor) {
      const now = new Date();
      await db.orgActing.create({ data: { id: randomUUID(), chairmanId: head.id, positionId: dean.id, userId: actor.id, fromDate: new Date(now.getTime() - 2 * 864e5), toDate: new Date(now.getTime() + 12 * 864e5), reason: "Dean on Umrah leave", byId: head.id } });
      await db.orgPositionLog.create({ data: { positionId: dean.id, title: dean.title, userId: actor.id, action: "ACTING", byId: head.id, reason: "Dean on Umrah leave" } }).catch(() => null);
    }
    done.push("organisation chart");
  }

  // 4. Questionnaires, version 2: clearer wording, weights, a new question, the window.
  if (!(await db.feedbackQuestion.count({ where: { chairmanId: head.id } }).catch(() => 1))) {
    const by3 = qec?.id || head.id;
    const t = await allQuestions(head.id, "TEACHER");
    for (const q of t) {
      const text = q.key === "clear" ? "The teacher explained concepts clearly, with examples" : q.text;
      const weight = q.key === "clear" || q.key === "fair" ? 2 : q.key === "prepared" || q.key === "covered" ? 1.5 : 1;
      await saveQuestion(head.id, "TEACHER", { key: q.key, text, group: q.group, weight, order: q.order, fdpTopic: q.fdpTopic }, by3);
    }
    await saveQuestion(head.id, "TEACHER", { text: "The teacher shared lecture material and results on time", group: "Delivery", weight: 1, fdpTopic: "Using the LMS and OBEHUB in teaching" }, by3);
    await saveSettings(head.id, { fromWeek: 12, toWeek: 14, minResponses: 5 }, by3);
    done.push("questionnaires v2 and window");
  }

  // 5. Feedback with variety. Marked by a note in the FDP session made for it.
  const marker = await db.fdpSession.findFirst({ where: { chairmanId: head.id, title: "Teaching skills: explaining concepts clearly" } }).catch(() => null);
  if (!marker) {
    const t4 = by("dream.t4"), t5 = by("dream.t5");
    const ai = await prisma.batch.findFirst({ where: { coordinator: { managedById: head.id }, degreeProgram: { contains: "Artificial" } }, select: { id: true } });
    const bba = await prisma.batch.findFirst({ where: { coordinator: { managedById: head.id }, degreeProgram: { contains: "BBA" } }, select: { id: true } });
    const instCourses = await prisma.course.findMany({ where: { coordinator: { managedById: head.id } }, select: { id: true } });
    const rows = (await db.courseEvaluation.findMany({ where: { kind: "TEACHER", courseId: { in: instCourses.map((c) => c.id).concat("none") } }, select: { id: true, courseId: true, answersJson: true } })) as { id: string; courseId: string; answersJson: string }[];
    const courses = new Map((await prisma.course.findMany({ where: { id: { in: Array.from(new Set(rows.map((r) => r.courseId))) } }, select: { id: true, instructorId: true, batchId: true, offeredTermName: true, offeredTermYear: true } })).map((c) => [c.id, c]));
    const clamp = (v: number) => Math.max(1, Math.min(5, Math.round(v)));
    const newKey = (await allQuestions(head.id, "TEACHER")).find((q) => q.text.startsWith("The teacher shared"))?.key;
    for (const r of rows) {
      const c = courses.get(r.courseId); if (!c) continue;
      let a: Record<string, number> = {}; try { a = JSON.parse(r.answersJson); } catch { continue; }
      const rand = rng(`fb-${r.id}`);
      const spring26 = c.offeredTermName === "Spring" && c.offeredTermYear === 2026;
      const after = (c.offeredTermYear || 0) > 2026 || spring26 || (c.offeredTermYear === 2026 && c.offeredTermName === "Fall");
      for (const k of Object.keys(a)) {
        let v = a[k];
        if (spring26 && c.batchId === ai?.id) v -= 0.9 + rand() * 0.4; // a strict batch
        if (spring26 && c.batchId === bba?.id) v += 0.6 + rand() * 0.3; // a generous batch
        if (c.instructorId === t4?.id && k === "available") v = 2 + rand() * 1.2; // always low on office hours
        if (c.instructorId === t5?.id && k === "clear") v = after ? 4 + rand() * 1 : 1.8 + rand() * 1; // improved after the workshop
        a[k] = clamp(v);
      }
      if (newKey) a[newKey] = clamp((a.prepared || 4) + (rand() - 0.5));
      await db.courseEvaluation.update({ where: { id: r.id }, data: { answersJson: JSON.stringify(a) } });
    }
    // The workshop that helped, the invitation from feedback and the attendance.
    const sid = randomUUID();
    await db.fdpSession.create({ data: { id: sid, chairmanId: head.id, title: "Teaching skills: explaining concepts clearly", kind: "WORKSHOP", topic: "Teaching skills: explaining concepts clearly", date: d("2026-01-20"), hours: 6, facilitator: "Director QEC", venue: "Seminar Room A", status: "HELD", reason: "Low student feedback on clarity", createdById: head.id, createdAt: new Date() } });
    if (t5) {
      await db.feedbackFdpInvite.create({ data: { id: randomUUID(), chairmanId: head.id, sessionId: sid, userId: t5.id, questionKey: "clear", scoreBefore: 2.3, invitedAt: d("2026-01-05") } }).catch(() => null);
      await db.fdpAttendance.create({ data: { id: randomUUID(), sessionId: sid, userId: t5.id, attended: true, certificateNo: "FDP-2026-0900", createdAt: new Date() } }).catch(() => null);
    }
    // An upcoming workshop on office hours, for the teacher who is always low on it.
    await db.fdpSession.create({ data: { id: randomUUID(), chairmanId: head.id, title: "Student mentoring and office hours", kind: "WORKSHOP", topic: "Student mentoring and office hours", date: new Date(Date.now() + 20 * 864e5), hours: 3, facilitator: "Director QEC", venue: "Seminar Room B", status: "PLANNED", createdById: head.id, createdAt: new Date() } });
    done.push("feedback variety and workshops");
  }

  // 6. Student status changes: one applied (left), one waiting for the Controller (freeze), one transfer in waiting for the
  // Chairman, and one transfer out applied (with its pack).
  if (!(await db.studentStatusRequest.count({ where: { chairmanId: head.id } }).catch(() => 1))) {
    const lead = by("dream.lead.cs"), leadAi = by("dream.lead.ai"), leadBba = by("dream.lead.bba"), hodCs = by("dream.hod.cs"), hodBba = by("dream.hod.bba"), ctrl = by("dream.omc");
    const pick = async (leadId: string | undefined, skip: number) => leadId ? prisma.student.findFirst({ where: { status: "ACTIVE", batch: { coordinatorId: leadId } }, orderBy: { rollNumber: "desc" }, skip, select: { id: true } }) : null;
    const asUser = (u: typeof lead) => ({ id: u!.id, role: u!.role, name: u!.name });
    const s1 = await pick(lead?.id, 0), s2 = await pick(leadAi?.id, 0), s3 = await pick(leadBba?.id, 0), s4 = await pick(lead?.id, 1);
    if (lead && hodCs && ctrl && s1) {
      const id = await raise(asUser(lead), { studentId: s1.id, type: "LEFT", effectiveDate: d("2026-09-20"), reason: "Family moved abroad (financial reasons)" });
      await decide(asUser(hodCs), id, true, "Counselled; student's decision is final.");
      await decide(asUser(ctrl), id, true, "Dues cleared by Finance.", { feeCleared: true });
    }
    if (leadAi && s2) await raise(asUser(leadAi), { studentId: s2.id, type: "FREEZE", effectiveDate: new Date(), reason: "Medical: surgery and recovery", freezeSemesters: 1 }).then(async (id) => { const hodAi = by("dream.hod.cs"); if (hodAi) await decide(asUser(hodAi), id, true, "Medical certificate seen."); });
    if (leadBba && s3) await raise(asUser(leadBba), { studentId: s3.id, type: "TRANSFER_IN", effectiveDate: new Date(), reason: "Joined from COMSATS University (BBA) in semester 3", otherInstitute: "COMSATS University Islamabad", credits: [{ code: "MGT-101", title: "Principles of Management", creditHours: 3, grade: "B+", toCode: "" }, { code: "ACC-101", title: "Financial Accounting", creditHours: 3, grade: "A-", toCode: "" }, { code: "ECO-101", title: "Microeconomics", creditHours: 3, grade: "C-", toCode: "" }] });
    if (lead && hodCs && ctrl && s4) {
      const id = await raise(asUser(lead), { studentId: s4.id, type: "TRANSFER_OUT", effectiveDate: d("2026-08-25"), reason: "Admission to NUST (BS Software Engineering)", otherInstitute: "NUST Islamabad" });
      await decide(asUser(hodCs), id, true, "");
      await decide(asUser(ctrl), id, true, "Transcript and outlines pack issued.");
    }
    void hodBba;
    done.push("student status changes");
  }
  return done;
}
