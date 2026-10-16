import { prisma } from "../db";
import { holdersOf } from "../notifications";
import type { HelpViewer } from "./access";
import type { DeskKey } from "./deskList";

// Help-desk routing: a request goes to the people who can actually act on it, not to a general inbox.
// Whoever is picked can reply; the Institute Head sees every request of the institute, and the platform's
// Super Users see the technical ones of every institute.

export { DESKS, deskOf, deskForCategory, type DeskKey } from "./deskList";

const activeIds = async (where: Record<string, unknown>) => (await prisma.user.findMany({ where: { ...where, isActive: true }, select: { id: true } })).map((u) => u.id);
const superUsers = () => activeIds({ role: "SUPER_USER" });

/** OMC members: OMC logins and teachers wearing the OMC hat (whose account sits under a Program Lead). */
async function omcMembers(ih: string): Promise<string[]> {
  const leads = await activeIds({ role: "PROGRAM_COORDINATOR", managedById: ih });
  return activeIds({ OR: [{ role: "OMC", managedById: ih }, { omcHat: true, managedById: { in: [ih, ...leads] } }] });
}

/** Department of a staff member: their own, or (for teachers) the department of the Program Lead who onboarded them. */
async function departmentOf(v: HelpViewer): Promise<string | null> {
  if (v.departmentId) return v.departmentId;
  if (v.kind === "staff" && v.managedById) {
    const m = await prisma.user.findUnique({ where: { id: v.managedById }, select: { departmentId: true } });
    return m?.departmentId || null;
  }
  return null;
}

/** The users a request to this desk goes to. Never empty while the institute has a head; never the requester. */
export async function recipientsFor(v: HelpViewer, desk: DeskKey): Promise<string[]> {
  const ih = v.chairmanId;
  const dept = await departmentOf(v);
  const hod = async () => (dept && ih ? activeIds({ role: "HEAD_OF_DEPARTMENT", departmentId: dept, managedById: ih }) : []);
  const leadsOfDept = async () => (dept && ih ? activeIds({ role: "PROGRAM_COORDINATOR", departmentId: dept, managedById: ih }) : []);
  const studentLead = v.kind === "student" && v.coordinatorId ? [v.coordinatorId] : [];
  let ids: string[] = [];

  switch (desk) {
    case "ACCOUNT":
      if (v.kind === "student") ids = studentLead;
      else if (v.role === "CHAIRMAN") ids = await superUsers();
      else if (v.managedById) {
        const m = await prisma.user.findUnique({ where: { id: v.managedById }, select: { id: true, isActive: true } });
        ids = m?.isActive ? [m.id] : [];
      }
      break;
    case "COURSES":
      ids = v.kind === "student" ? studentLead : ih ? await omcMembers(ih) : [];
      break;
    case "REGISTRATION":
      ids = v.kind === "student" ? [...studentLead, ...(v.advisorId ? [v.advisorId] : [])] : await leadsOfDept();
      break;
    case "EXAMS":
      ids = v.kind === "student" ? studentLead : await hod();
      break;
    case "FYP": {
      const heads = dept ? (await prisma.fypStaff.findMany({ where: { departmentId: dept, role: "HEAD" }, select: { userId: true } }).catch(() => [])).map((x) => x.userId) : [];
      ids = heads.length ? heads : await hod();
      break;
    }
    case "FINANCE": ids = ih ? await holdersOf(ih, "FINANCE_OFFICER") : []; break;
    case "LIBRARY": ids = ih ? await holdersOf(ih, "LIBRARIAN") : []; break;
    case "FACILITIES": ids = ih ? await holdersOf(ih, "FACILITIES_MANAGER") : []; break;
    case "STUDENT_AFFAIRS": ids = ih ? await holdersOf(ih, "STUDENT_AFFAIRS") : []; break;
    case "TECHNICAL": ids = await superUsers(); break;
  }
  ids = Array.from(new Set(ids)).filter((id) => id !== v.id);
  if (!ids.length && ih && ih !== v.id) ids = [ih];
  if (!ids.length) ids = (await superUsers()).filter((id) => id !== v.id);
  return ids;
}
