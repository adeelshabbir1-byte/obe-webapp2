import { prisma } from "./db";
import { OVERVIEW_ROLES, leadsInScope } from "./readinessScope";
import { chairmanIdFor } from "./reportScope";

export const CRITERIA: Record<number, string> = {
  1: "Program Objectives (POs)", 2: "Graduate Attributes (GAs)", 3: "Curriculum and Learning Process", 4: "Students", 5: "Faculty and Support Staff",
  6: "Facilities and Infrastructure", 7: "Institutional Support and Financial Resources", 8: "Steps to Improve the Program", 9: "Industrial Linkages",
};
export const MEETING_KINDS: Record<string, string> = { OMC: "OMC meeting", BOS: "BOS meeting", BPF: "BPF meeting", FACULTY: "Faculty meeting", IAB: "Industrial advisory board", OTHER: "Other meeting" };
export const FILE_ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR", "LAB_MANAGER", "LIBRARIAN", "FINANCE_OFFICER", "STUDENT_AFFAIRS"];
export const MEETING_ROLES = ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR", "PROGRAM_COORDINATOR"];
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "text/plain", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"];

type Who = { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null };
export type ScopeLead = { id: string; name: string; leadProgram: string | null };

/** Whose files and minutes a person may see: managers see their programs; a Program Lead sees their own; others see what they added themselves. */
export async function fileScope(user: Who) {
  const chairmanId = await chairmanIdFor({ id: user.id, role: user.role, managedById: user.managedById });
  let leads: ScopeLead[] = [];
  let all = false;
  if (OVERVIEW_ROLES.includes(user.role)) {
    leads = (await leadsInScope(user)).leads.map((l) => ({ id: l.id, name: l.name, leadProgram: l.leadProgram }));
    all = true;
  } else if (user.role === "PROGRAM_COORDINATOR") {
    const me = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, leadProgram: true } });
    if (me) leads = [{ id: me.id, name: me.name, leadProgram: me.leadProgram }];
    all = true;
  }
  const leadIds = leads.map((l) => l.id);
  /** Prisma filter for rows the person may see. */
  const visible = (createdField: "uploadedById" | "createdById") =>
    all ? { chairmanId, OR: [{ leadId: { in: leadIds.length ? leadIds : ["none"] } }, { leadId: null }] } : { chairmanId, [createdField]: user.id };
  return { chairmanId, leads, leadIds, all, visible };
}

/** Files and minutes for the printed Self-Assessment Report of one program. */
export async function sarExtras(chairmanId: string, leadId: string) {
  const [files, meetings] = await Promise.all([
    prisma.evidenceFile.findMany({ where: { chairmanId, OR: [{ leadId }, { leadId: null }] } as never, select: { id: true, title: true, criterion: true, fileName: true, createdAt: true }, orderBy: [{ criterion: "asc" }, { createdAt: "asc" }] }),
    prisma.meetingMinutes.findMany({ where: { chairmanId, OR: [{ leadId }, { leadId: null }] } as never, select: { id: true, kind: true, title: true, meetingDate: true, fileName: true }, orderBy: { meetingDate: "asc" } }),
  ]);
  return { files: files as unknown as { id: string; title: string; criterion: number | null; fileName: string; createdAt: Date }[], meetings: meetings as unknown as { id: string; kind: string; title: string; meetingDate: Date; fileName: string | null }[] };
}
