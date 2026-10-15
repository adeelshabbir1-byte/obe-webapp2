import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";

// Student societies and clubs, their office bearers and their events. Student Affairs (and the Institute Head) keep the
// list of societies; each society's faculty advisor keeps its own office bearers and events; management can look.

export const SOCIETY_CATEGORIES: Record<string, string> = { TECHNICAL: "Technical / professional", SPORTS: "Sports", LITERARY: "Literary / debating", CULTURAL: "Cultural / arts", COMMUNITY: "Community service", RELIGIOUS: "Religious", OTHER: "Other" };
export const EVENT_CATEGORIES = ["Workshop", "Seminar / talk", "Competition", "Sports event", "Cultural event", "Community service", "Trip / visit", "Fundraising", "Meeting", "Other"];
export const POSITIONS = ["President", "Vice President", "General Secretary", "Joint Secretary", "Treasurer", "Media / PR", "Event Manager", "Executive Member", "Member"];
const VIEW = ["STUDENT_AFFAIRS", "CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR", "INSTRUCTOR", "SUBJECT_EXPERT", "OMC"];

type Who = { id: string; role: string; managedById: string | null };
export async function activitiesScope(user: Who) {
  if (!VIEW.includes(user.role)) return null;
  const chairmanId = user.role === "CHAIRMAN" ? user.id : await chairmanIdFor(user);
  if (!chairmanId) return null;
  return { chairmanId, manageAll: user.role === "STUDENT_AFFAIRS" || user.role === "CHAIRMAN" };
}
/** Student Affairs and the Institute Head look after every society; an advisor looks after their own. */
export const canEditSociety = (user: { id: string }, manageAll: boolean, society: { advisorId: string | null }) => manageAll || society.advisorId === user.id;

/** The current academic session, e.g. "2025-26" (sessions start in August). */
export function sessionNow(d = new Date()) {
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}

export async function societiesOf(chairmanId: string) {
  const societies = await prisma.studentSociety.findMany({ where: { chairmanId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  const ids = societies.map((s) => s.id).concat(["none"]);
  const [members, events] = await Promise.all([
    prisma.societyMember.groupBy({ by: ["societyId"], where: { societyId: { in: ids } }, _count: { _all: true } }),
    // Events that happened or are approved; proposals still waiting (or declined) are not counted.
    prisma.societyEvent.findMany({ where: { societyId: { in: ids }, status: { in: ["APPROVED", "COMPLETED"] } }, select: { societyId: true, eventDate: true, participants: true, category: true } }),
  ]);
  return { societies, members, events };
}
