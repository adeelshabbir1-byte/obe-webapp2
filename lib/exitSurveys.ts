import crypto from "crypto";
import { prisma } from "./db";

export const exdb = prisma as unknown as Record<string, any>;
export type Q = { key: string; label: string; type: "rating" | "choice" | "text" | "yesno"; options?: string[] };
export type Form = { title: string; intro: string; questions: Q[] };
const R = (key: string, label: string): Q => ({ key, label, type: "rating" });

export const FORMS: Record<string, Form> = {
  STUDENT_EXIT: { title: "Student Exit Survey (leaving before completing the degree)", intro: "We are sorry to see you go. Your honest answers help us improve for other students. Answers are seen only by the quality office.",
    questions: [
      { key: "reason", label: "Main reason for leaving", type: "choice", options: ["Fees / financial", "Academic difficulty", "Personal or family", "Health", "Transfer to another university", "Got a job", "Program not what I expected", "Other"] },
      { key: "reason2", label: "Any other reason (optional)", type: "text" },
      R("teaching", "Quality of teaching"), R("advising", "Help from advisors and counselling"), R("facilities", "Labs, library and facilities"), R("admin", "Administration and student services"), R("fees", "Fee structure and financial support"),
      { key: "couldHelp", label: "What could we have done to help you stay?", type: "text" },
      { key: "return", label: "Would you consider coming back later?", type: "yesno" },
    ] },
  FACULTY_EXIT: { title: "Faculty Exit Interview", intro: "Thank you for your service. Please tell us frankly why you are leaving; this is read by the Institute Head and HR only.",
    questions: [
      { key: "reason", label: "Main reason for leaving", type: "choice", options: ["Better pay elsewhere", "Higher studies", "Career growth / promotion", "Workload", "Work environment / management", "Relocation / family", "Contract ended", "Retirement", "Other"] },
      { key: "reason2", label: "Please explain (optional)", type: "text" },
      R("pay", "Pay and benefits"), R("workload", "Teaching load and duties"), R("research", "Support for research"), R("development", "Training and professional development"), R("management", "Leadership and management"), R("facilities", "Office, labs and facilities"), R("colleagues", "Relations with colleagues"), R("students", "Quality of students"),
      { key: "improve", label: "What should the institute change?", type: "text" },
      { key: "rejoin", label: "Would you rejoin in future?", type: "yesno" },
    ] },
  STAFF_EXIT: { title: "Staff Exit Interview", intro: "Thank you for your service. Your answers are read by the Institute Head and HR only.",
    questions: [
      { key: "reason", label: "Main reason for leaving", type: "choice", options: ["Better pay elsewhere", "Career growth", "Workload", "Work environment / management", "Relocation / family", "Contract ended", "Retirement", "Other"] },
      { key: "reason2", label: "Please explain (optional)", type: "text" },
      R("pay", "Pay and benefits"), R("workload", "Workload and hours"), R("training", "Training"), R("management", "Supervision and management"), R("environment", "Work environment"),
      { key: "improve", label: "What should the institute change?", type: "text" },
      { key: "rejoin", label: "Would you rejoin in future?", type: "yesno" },
    ] },
};
export const KIND_LABEL: Record<string, string> = { STUDENT_EXIT: "Student leaving", FACULTY_EXIT: "Faculty", STAFF_EXIT: "Staff" };
const TEACHING = ["INSTRUCTOR", "SUBJECT_EXPERT", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEAN", "LAB_ENGINEER", "OMC", "DEPARTMENT_COORDINATOR"];
export const employeeKind = (role: string) => (TEACHING.includes(role) ? "FACULTY_EXIT" : "STAFF_EXIT");

/** Create (or reuse the pending) exit survey for a person; returns its link path. */
export async function createExit(chairmanId: string, kind: string, subjectId: string, subjectName: string, sentById?: string) {
  const pending = (await exdb.exitSurvey.findFirst({ where: { chairmanId, kind, subjectId, submittedAt: null } }).catch(() => null)) as { token: string } | null;
  if (pending) return `/exit/${pending.token}`;
  const token = crypto.randomBytes(18).toString("base64url");
  await exdb.exitSurvey.create({ data: { chairmanId, kind, subjectId, subjectName, token, sentById: sentById || null } });
  return `/exit/${token}`;
}
export const appBase = () => process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");

/** A student marked as left / dropped gets the exit survey; a graduate gets the graduating exit survey, when the Program Lead has one. */
export async function onStudentStatus(studentId: string, status: string, byUserId: string) {
  try {
    const st = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, name: true, batch: { select: { coordinatorId: true, coordinator: { select: { managedById: true } } } } } });
    if (!st) return;
    const cid = st.batch.coordinator.managedById || "";
    const { alertStudents } = await import("./messaging");
    if (status === "LEFT" || status === "DROPPED") {
      const link = await createExit(cid, "STUDENT_EXIT", st.id, st.name, byUserId);
      await alertStudents(cid, [st.id], "BROADCAST", "Please tell us why you are leaving", `${appBase()}${link}`, false);
    } else if (status === "GRADUATED") {
      const tpl = await prisma.surveyTemplate.findFirst({ where: { coordinatorId: st.batch.coordinatorId, stakeholderType: "STUDENT", title: { startsWith: "Graduating Student Exit Survey" } }, orderBy: { createdAt: "desc" } });
      if (!tpl || (await prisma.surveyResponse.count({ where: { surveyTemplateId: tpl.id, studentId: st.id } }))) return;
      const token = crypto.randomBytes(18).toString("base64url");
      await prisma.surveyResponse.create({ data: { surveyTemplateId: tpl.id, token, respondentType: "STUDENT", respondentLabel: st.name, studentId: st.id } });
      await alertStudents(cid, [st.id], "BROADCAST", "Congratulations! Please fill the graduating student survey", `${appBase()}/survey/${token}`, false);
    }
  } catch { /* best effort */ }
}

/** An employee marked as leaving gets the faculty / staff exit interview (notification and, if set up, SMS / WhatsApp). */
export async function onEmployeeLeft(userId: string, chairmanId: string, byUserId: string) {
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true } });
    if (!u) return;
    const link = await createExit(chairmanId, employeeKind(u.role), u.id, u.name, byUserId);
    const { notifyUsers } = await import("./notifications");
    await notifyUsers([u.id], { kind: "ASSIGNMENT", title: "Exit interview", body: "Please fill the short exit interview before your last day.", href: link });
    const ph = await prisma.facultyProfile.findUnique({ where: { userId: u.id }, select: { phone: true } });
    if (ph?.phone) { const { sendAlert } = await import("./messaging"); await sendAlert(chairmanId, "BROADCAST", [{ to: ph.phone }], "Exit interview", `${appBase()}${link}`, false); }
  } catch { /* best effort */ }
}
