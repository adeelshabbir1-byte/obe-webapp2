import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { EXAM_CONTROLLER, setExamController } from "./academicRules";

// Institute duties held as a hat (User.extraRoles): the Controller of Examinations and the QEC In-charge.
export const QEC_INCHARGE = "QEC_INCHARGE";
export const OMC_CONVENER = "OMC_CONVENER";
export const DUTIES: Record<string, { label: string; href: string; what: string }> = {
  [EXAM_CONTROLLER]: { label: "Controller of Examinations", href: "/controller", what: "You run the exams: sessions, date sheets, seating, debarred lists and admit cards; you publish approved results, handle re-checking and grade changes, transcripts, degrees and standing lists; you set the CGPA limits and the minimum attendance for exams." },
  [QEC_INCHARGE]: { label: "QEC Convener", href: "/evaluations/questionnaires", what: "You head the Quality Enhancement Cell: feedback questionnaires and windows, surveys, QAA self-assessment, IPE and the quality registers." },
  IT_MANAGER: { label: "IT Manager", href: "/chairman/backups", what: "You run the institute's IT: backups, the subscription and its invoices, the Moodle link and the SMS / WhatsApp gateway." },
  [OMC_CONVENER]: { label: "OMC Convener", href: "/omc/convener", what: "You lead your department's OMC: share out course reviews among the members, decide when they disagree, and receive OMC escalations." },
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
  if (duty === "IT_MANAGER" && on) for (const h of await dutyHolders(chairmanId, duty)) if (h.id !== userId) { const x = await prisma.user.findUnique({ where: { id: h.id }, select: { extraRoles: true } }); await prisma.user.update({ where: { id: h.id }, data: { extraRoles: (x?.extraRoles || []).filter((r) => r !== duty) } }); }
  const roles = new Set(u.extraRoles || []);
  if (on) roles.add(duty); else roles.delete(duty);
  // The OMC Convener is also an OMC member (keeps the OMC pages); taking the duty away leaves the membership alone.
  await prisma.user.update({ where: { id: u.id }, data: { extraRoles: Array.from(roles), ...(duty === OMC_CONVENER && on ? { omcHat: true } : {}) } as never });
  if (on) await notifyUsers([u.id], { kind: "ROLE", title: `You are the ${DUTIES[duty].label}`, body: DUTIES[duty].what, href: DUTIES[duty].href });
}
