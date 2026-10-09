import { prisma } from "./db";

export const EXPENSE_CATEGORIES = ["Salaries and benefits", "Laboratory equipment and upgrades", "Library and digital resources", "Faculty development and training", "Research and grants", "Infrastructure and maintenance", "Student activities and societies", "Other"];
export const INCOME_CATEGORIES = ["Tuition and fees", "Government grants", "Research grants", "Donations and endowments", "Other income"];
export const ACTIVITY_CATEGORIES = ["Sports", "Cultural and arts", "Technical competition", "Workshop or seminar", "Community service", "Student society", "Industry visit or trip", "Other"];

/** Pakistan's fiscal year runs July to June, e.g. "2025-26". */
export function fiscalYearNow(d = new Date()) {
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
}
export function recentFiscalYears(n = 5) {
  const cur = parseInt(fiscalYearNow().slice(0, 4), 10);
  return Array.from({ length: n }, (_, i) => { const y = cur - i; return `${y}-${String((y + 1) % 100).padStart(2, "0")}`; });
}

/** Students and computers for one department (or the whole institute when departmentId is null). */
export async function labRatio(chairmanId: string, departmentId: string | null) {
  const [labs, students] = await Promise.all([
    prisma.labInfo.findMany({ where: { chairmanId, ...(departmentId ? { departmentId } : {}) } }),
    prisma.student.count({ where: { batch: { coordinator: { managedById: chairmanId, ...(departmentId ? { departmentId } : {}) } } } }),
  ]);
  const computers = labs.reduce((n, l) => n + l.computers, 0);
  const working = labs.reduce((n, l) => n + l.computersWorking, 0);
  const seats = labs.reduce((n, l) => n + l.seats, 0);
  return { labs: labs.length, computers, working, seats, students, perComputer: working > 0 ? Math.round((students / working) * 10) / 10 : null };
}

type Who = { id: string; role: string; managedById: string | null; departmentId?: string | null; facultyId?: string | null };
/** Which labs a person may see, and whether they may change them. */
export async function labScope(user: Who) {
  const { chairmanIdFor } = await import("./reportScope");
  if (user.role === "CHAIRMAN") return { chairmanId: user.id, departmentIds: null as string[] | null, canEdit: true };
  const chairmanId = await chairmanIdFor({ id: user.id, role: user.role, managedById: user.managedById });
  // A Lab Manager made by the Institute Head has no department and looks after the labs of every department.
  if (user.role === "LAB_MANAGER") return { chairmanId, departmentIds: user.departmentId ? [user.departmentId] : null, canEdit: true };
  if (["PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "DEPARTMENT_COORDINATOR"].includes(user.role)) return { chairmanId, departmentIds: user.departmentId ? [user.departmentId] : [], canEdit: false };
  if (user.role === "DEAN") {
    const ds = await prisma.department.findMany({ where: { chairmanId, facultyId: user.facultyId || "none" }, select: { id: true } });
    return { chairmanId, departmentIds: ds.map((d) => d.id), canEdit: false };
  }
  return null;
}

/** The library record: the Librarian, the Lab Manager and the Institute Head may change it; others in management may look. */
export async function libraryScope(user: Who) {
  if (user.role === "LIBRARIAN") return { chairmanId: user.managedById || "", departmentIds: null as string[] | null, canEdit: !!user.managedById };
  return labScope(user);
}
/** Finance: the Finance Officer and the Institute Head enter the figures. Nobody else sees them. */
export function financeScope(user: Who) {
  if (user.role === "CHAIRMAN") return { chairmanId: user.id, canEdit: true };
  if (user.role === "FINANCE_OFFICER" && user.managedById) return { chairmanId: user.managedById, canEdit: true };
  return null;
}
