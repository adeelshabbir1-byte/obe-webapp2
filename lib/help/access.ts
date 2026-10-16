import { prisma } from "../db";
import { getAuthenticatedUser } from "../session";
import { getAuthenticatedStudent } from "../studentSession";
import { chairmanIdFor } from "../reportScope";
import { BUILTIN_ARTICLES } from "./content";
import { STUDENT, type HelpArticle, type HelpCategory } from "./types";

// Who is using the help center: a staff member (in their current role) or a student, and which institute they belong
// to. The institute decides which of its own articles they see and where their help requests go.

export const KB_EDITORS = ["CHAIRMAN", "SUPER_USER"];

export type HelpViewer =
  | { kind: "staff"; id: string; name: string; role: string; chairmanId: string | null; departmentId: string | null; managedById: string | null; email: string | null }
  | { kind: "student"; id: string; name: string; role: typeof STUDENT; chairmanId: string | null; departmentId: string | null; batchId: string; coordinatorId: string | null; advisorId: string | null };

/** The signed-in person. The student portal asks for "student" first, so someone signed in to both gets the right one. */
export async function helpViewer(prefer: "staff" | "student" = "staff"): Promise<HelpViewer | null> {
  const asStaff = async (): Promise<HelpViewer | null> => {
    const u = await getAuthenticatedUser();
    if (!u || !u.mfaVerified) return null;
    const chairmanId = u.role === "SUPER_USER" ? null : (await chairmanIdFor(u)) || null;
    return { kind: "staff", id: u.realUserId || u.id, name: u.name, role: u.role, chairmanId, departmentId: u.departmentId || null, managedById: u.managedById || null, email: u.email || null };
  };
  const asStudent = async (): Promise<HelpViewer | null> => {
    const s = await getAuthenticatedStudent();
    if (!s) return null;
    const batch = await prisma.batch.findUnique({ where: { id: s.batchId }, select: { coordinatorId: true, advisorId: true } });
    const lead = batch?.coordinatorId ? await prisma.user.findUnique({ where: { id: batch.coordinatorId }, select: { id: true, role: true, managedById: true, departmentId: true } }) : null;
    return { kind: "student", id: s.id, name: s.name, role: STUDENT, chairmanId: lead ? (await chairmanIdFor(lead)) || null : null, departmentId: lead?.departmentId || null, batchId: s.batchId, coordinatorId: batch?.coordinatorId || null, advisorId: batch?.advisorId || null };
  };
  return prefer === "student" ? (await asStudent()) || (await asStaff()) : (await asStaff()) || (await asStudent());
}

/** The requester of a help request, rebuilt from the ticket (used when a request is forwarded to another desk). */
export async function viewerById(kind: "staff" | "student", id: string, role: string): Promise<HelpViewer | null> {
  if (kind === "staff") {
    const u = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, managedById: true, departmentId: true, email: true } });
    if (!u) return null;
    const asRole = { ...u, role: role || u.role };
    const chairmanId = u.role === "SUPER_USER" ? null : (await chairmanIdFor(asRole)) || null;
    return { kind: "staff", id: u.id, name: u.name, role: asRole.role, chairmanId, departmentId: u.departmentId, managedById: u.managedById, email: u.email };
  }
  const s = await prisma.student.findUnique({ where: { id }, select: { id: true, name: true, batchId: true, batch: { select: { coordinatorId: true, advisorId: true } } } });
  if (!s) return null;
  const lead = s.batch?.coordinatorId ? await prisma.user.findUnique({ where: { id: s.batch.coordinatorId }, select: { id: true, role: true, managedById: true, departmentId: true } }) : null;
  return { kind: "student", id: s.id, name: s.name, role: STUDENT, chairmanId: lead ? (await chairmanIdFor(lead)) || null : null, departmentId: lead?.departmentId || null, batchId: s.batchId, coordinatorId: s.batch?.coordinatorId || null, advisorId: s.batch?.advisorId || null };
}

export const canEditArticles = (v: HelpViewer | null) => !!v && v.kind === "staff" && KB_EDITORS.includes(v.role);

const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

type ArticleRow = { id: string; chairmanId: string | null; kind: string; category: string; title: string; summary: string; stepsJson: string | null; whoCan: string | null; affects: string | null; roles: string; pages: string; keywords: string; href: string | null; published: boolean };

export function rowToArticle(r: ArticleRow): HelpArticle {
  let steps: string[] | undefined;
  try { const s = r.stepsJson ? JSON.parse(r.stepsJson) : null; steps = Array.isArray(s) ? s.filter((x): x is string => typeof x === "string") : undefined; } catch { steps = undefined; }
  return {
    key: `a-${r.id}`, id: r.id, kind: r.kind === "GUIDE" ? "guide" : "faq", category: r.category as HelpCategory, title: r.title, summary: r.summary, steps,
    who: r.whoCan || undefined, affects: r.affects || undefined, roles: split(r.roles), pages: split(r.pages), keywords: split(r.keywords), href: r.href || undefined,
    source: r.chairmanId ? "institute" : "platform",
  };
}

/** Built-in articles plus the published ones of the platform and of this institute. A missing table (migration not run yet) just means none. */
export async function articlesFor(chairmanId: string | null, opts: { includeDrafts?: boolean } = {}): Promise<HelpArticle[]> {
  const rows = await prisma.helpArticle.findMany({
    where: { OR: [{ chairmanId: null }, ...(chairmanId ? [{ chairmanId }] : [])], ...(opts.includeDrafts ? {} : { published: true }) },
    orderBy: { updatedAt: "desc" },
  }).catch(() => [] as ArticleRow[]);
  return [...rows.map(rowToArticle), ...BUILTIN_ARTICLES];
}
