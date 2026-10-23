import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { EXAM_CONTROLLER, setExamController } from "./academicRules";

// Institute duties held as a hat (User.extraRoles): the Controller of Examinations and the QEC In-charge.
export const QEC_INCHARGE = "QEC_INCHARGE";
export const DUTIES: Record<string, { label: string; href: string; what: string }> = {
  [EXAM_CONTROLLER]: { label: "Controller of Examinations", href: "/academic-rules", what: "You set the CGPA limits and the minimum attendance for exams, and approve student status changes." },
  [QEC_INCHARGE]: { label: "QEC In-charge", href: "/evaluations/questionnaires", what: "You set the student feedback questionnaires, the feedback window and the minimum number of answers." },
};

const staff = (chairmanId: string) => ({ OR: [{ id: chairmanId }, { managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] });

export async function dutyHolders(chairmanId: string, duty: string) {
  return prisma.user.findMany({ where: { AND: [staff(chairmanId), { extraRoles: { has: duty }, isActive: true }] }, select: { id: true, name: true } });
}

/** Give or take a duty. The Controller of Examinations is one person (giving it to someone takes it from the last holder). */
export async function setDuty(chairmanId: string, duty: string, userId: string, on: boolean) {
  if (!DUTIES[duty]) throw new Error("Unknown duty.");
  const u = await prisma.user.findFirst({ where: { AND: [staff(chairmanId), { id: userId }] }, select: { id: true, extraRoles: true } });
  if (!u) throw new Error("Choose someone of this institute.");
  if (duty === EXAM_CONTROLLER && on) return setExamController(chairmanId, userId);
  const roles = new Set(u.extraRoles || []);
  if (on) roles.add(duty); else roles.delete(duty);
  await prisma.user.update({ where: { id: u.id }, data: { extraRoles: Array.from(roles) } });
  if (on) await notifyUsers([u.id], { kind: "ROLE", title: `You are the ${DUTIES[duty].label}`, body: DUTIES[duty].what, href: DUTIES[duty].href });
}
