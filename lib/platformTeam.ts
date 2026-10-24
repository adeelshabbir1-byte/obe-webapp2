import crypto from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";

// The Super Admin's work, split into a platform team.
// - National curriculum teams, one per discipline area (Computing, Management Sciences, Engineering …): a Convener and
//   members, the National Subject Experts of that area. A team builds the area's national curricula (its councils and
//   programs are the builder scope) and is the area's National Releases committee; the Convener publishes releases.
// - Other platform roles, each opening only its own admin pages. Sensitive actions (rules-book versions, deleting
//   institutes, restoring backups) stay with the Super Admin.

export const pdb = prisma as unknown as Record<string, any>;
export const TEAM_HINT = "Platform team tables are not set up yet — run the latest migration (System Health → Run migrations).";

export type Area = "CURRICULUM" | "CONSORTIUM_ODL" | "REGULATIONS" | "BILLING" | "ONBOARDING" | "SUPPORT" | "SECURITY" | "SHARED_MODERATOR" | "ANALYTICS";
export const ROLES: Record<Exclude<Area, "CURRICULUM">, { label: string; does: string; pages: string[] }> = {
  CONSORTIUM_ODL: { label: "Consortium & ODL Manager", does: "Admits universities to the consortium, checks their HEC NOCs, agreements, MoUs, exam centres and sponsored industry accounts.", pages: ["/admin/consortium"] },
  REGULATIONS: { label: "Regulations Officer", does: "Keeps the National Regulations library: council notifications, versions, clauses, screenshots; publishes documents.", pages: ["/regulations"] },
  BILLING: { label: "Billing & Accounts", does: "Institute plans and licences, modules, invoices, payments, renewals.", pages: ["/admin/billing", "/admin/modules"] },
  ONBOARDING: { label: "Onboarding & Institute Success", does: "Account requests, new institutes and their Institute Heads, affiliations, the demo institute, the landing page.", pages: ["/admin/account-requests", "/admin/users", "/admin/affiliations", "/admin/demo", "/admin/landing-page"] },
  SUPPORT: { label: "Support Desk", does: "System feedback and help requests; password resets for Institute Heads.", pages: ["/admin/feedback", "/admin/users"] },
  SECURITY: { label: "Data, Security & Compliance Officer", does: "System Health and migrations, platform settings, audit; the only role besides the Super Admin allowed a CNIC look-up.", pages: ["/admin/system-health", "/admin/migrations", "/admin/platform-settings"] },
  SHARED_MODERATOR: { label: "Shared Courses Moderator", does: "Screens Shared Courses (spam, copyright, quality) before the national teams review them.", pages: ["/admin/shared-courses", "/public-library"] },
  ANALYTICS: { label: "Analytics (read-only)", does: "Platform-wide figures: institutes, people, courses, adoption, consortium activity.", pages: ["/admin/analytics"] },
};
const CURRICULUM_PAGES = ["/curricula/builder", "/curricula", "/admin/curricula", "/admin/master-experts", "/admin/curriculum-migration", "/national-bank", "/regulations"];

type U = { id: string; role: string; isPlatformExpert?: boolean | null };
export type Team = { id: string; name: string; councilsJson: string; programsJson: string; createdAt: Date };
export type Member = { teamId: string; userId: string; role: "CONVENER" | "MEMBER" };
const list = (s: string) => { try { return JSON.parse(s || "[]") as string[]; } catch { return []; } };

export async function rolesOf(userId: string): Promise<Area[]> {
  const rs = ((await pdb.platformRole.findMany({ where: { userId } }).catch(() => [])) as { role: Area }[]).map((r) => r.role);
  const inTeam = ((await pdb.platformTeamMember.count({ where: { userId } }).catch(() => 0)) as number) > 0;
  return inTeam ? Array.from(new Set<Area>([...rs, "CURRICULUM"])) : rs;
}
/** May this person use this admin area? The Super Admin always; a platform team member when given the role. */
export async function adminCan(user: U | null | undefined, area: Area | Area[]) {
  if (!user) return false;
  if (user.role === "SUPER_USER") return true;
  const want = Array.isArray(area) ? area : [area];
  const have = await rolesOf(user.id);
  return want.some((a) => have.includes(a));
}
/** Admin menu for a platform team member (the Super Admin keeps the full menu). */
export async function teamNav(user: U, all: { href: string; label: string }[]) {
  if (user.role === "SUPER_USER") return all;
  const have = await rolesOf(user.id);
  const pages = new Set<string>(["/platform"]);
  for (const a of have) for (const p of a === "CURRICULUM" ? CURRICULUM_PAGES : ROLES[a].pages) pages.add(p);
  const extra: { href: string; label: string }[] = [{ href: "/platform", label: "My Platform Roles" }];
  if (have.includes("ANALYTICS")) extra.push({ href: "/admin/analytics", label: "Platform Analytics" });
  return [...extra, ...all.filter((l) => pages.has(l.href))];
}

/** Builder scope from team membership: the councils and programs of every team the person is in. */
export async function teamScope(userId: string) {
  const ms = (await pdb.platformTeamMember.findMany({ where: { userId } }).catch(() => [])) as Member[];
  if (!ms.length) return null;
  const ts = (await pdb.platformTeam.findMany({ where: { id: { in: ms.map((m) => m.teamId) } } })) as Team[];
  const councils = new Set<string>(), programs = new Set<string>(); let allC = false, allP = false;
  for (const t of ts) { const c = list(t.councilsJson), p = list(t.programsJson); if (!c.length) allC = true; if (!p.length) allP = true; c.forEach((x) => councils.add(x)); p.forEach((x) => programs.add(x)); }
  return { councils: allC ? [] : Array.from(councils), programs: allP ? [] : Array.from(programs), convener: ms.some((m) => m.role === "CONVENER"), teams: ts.map((t) => t.name) };
}
export async function isConvener(userId: string) {
  return ((await pdb.platformTeamMember.count({ where: { userId, role: "CONVENER" } }).catch(() => 0)) as number) > 0;
}

// ---------------------------------------------------------------- Super Admin actions
export async function teams() {
  const ts = (await pdb.platformTeam.findMany({ orderBy: { name: "asc" } })) as Team[];
  const ms = (await pdb.platformTeamMember.findMany({})) as Member[];
  const users = await prisma.user.findMany({ where: { id: { in: ms.map((m) => m.userId).concat("none") } }, select: { id: true, name: true, email: true, organization: true } });
  return ts.map((t) => ({ ...t, councils: list(t.councilsJson), programs: list(t.programsJson), members: ms.filter((m) => m.teamId === t.id).map((m) => ({ ...m, user: users.find((u) => u.id === m.userId) || null })).sort((a, b) => Number(b.role === "CONVENER") - Number(a.role === "CONVENER")) }));
}
const csv = (v: unknown) => JSON.stringify(String(v || "").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 30));

export async function saveTeam(actorId: string, a: Record<string, unknown>) {
  const name = String(a.name || "").trim().slice(0, 80);
  if (!name) throw new Error("Give the team a name, e.g. Computing.");
  const id = a.id ? String(a.id) : null;
  if (id) await pdb.platformTeam.update({ where: { id }, data: { name, councilsJson: csv(a.councils), programsJson: csv(a.programs) } });
  else await pdb.platformTeam.create({ data: { id: crypto.randomUUID(), name, councilsJson: csv(a.councils), programsJson: csv(a.programs) } });
  await writeAuditLog({ actorUserId: actorId, action: "PLATFORM_TEAM_SAVED", entityType: "PlatformTeam", entityId: id || name });
  return id ? "Team saved." : `Team ${name} created. Add its Convener and National Subject Experts.`;
}
export async function deleteTeam(actorId: string, id: string) {
  await pdb.platformTeamMember.deleteMany({ where: { teamId: id } });
  await pdb.platformTeam.delete({ where: { id } });
  await writeAuditLog({ actorUserId: actorId, action: "PLATFORM_TEAM_DELETED", entityType: "PlatformTeam", entityId: id });
  return "Team removed (its people keep their accounts).";
}
export async function setMember(actorId: string, teamId: string, userId: string, role: string | null) {
  const u = await prisma.user.findFirst({ where: { id: userId, isPlatformExpert: true }, select: { id: true, name: true } });
  if (!u) throw new Error("Choose a National Subject Expert (a platform account).");
  if (!role) { await pdb.platformTeamMember.deleteMany({ where: { teamId, userId } }); await writeAuditLog({ actorUserId: actorId, action: "PLATFORM_TEAM_MEMBER_REMOVED", entityType: "PlatformTeam", entityId: teamId, metadata: { userId } }); return `${u.name} left the team.`; }
  const r = role === "CONVENER" ? "CONVENER" : "MEMBER";
  if (r === "CONVENER") await pdb.platformTeamMember.updateMany({ where: { teamId, role: "CONVENER" }, data: { role: "MEMBER" } });
  await pdb.platformTeamMember.upsert({ where: { teamId_userId: { teamId, userId } }, create: { teamId, userId, role: r }, update: { role: r } });
  await writeAuditLog({ actorUserId: actorId, action: "PLATFORM_TEAM_MEMBER_SET", entityType: "PlatformTeam", entityId: teamId, metadata: { userId, role: r } });
  return r === "CONVENER" ? `${u.name} is now the team's Convener.` : `${u.name} joined the team.`;
}
export async function setRole(actorId: string, userId: string, role: string, on: boolean) {
  if (!(role in ROLES)) throw new Error("Unknown role.");
  const u = await prisma.user.findFirst({ where: { id: userId, isPlatformExpert: true }, select: { id: true, name: true, mfaEnabled: true } });
  if (!u) throw new Error("Choose a platform account.");
  if (on) await pdb.platformRole.upsert({ where: { userId_role: { userId, role } }, create: { userId, role, createdById: actorId }, update: {} });
  else await pdb.platformRole.deleteMany({ where: { userId, role } });
  await writeAuditLog({ actorUserId: actorId, action: on ? "PLATFORM_ROLE_GIVEN" : "PLATFORM_ROLE_REMOVED", entityType: "User", entityId: userId, metadata: { role } });
  return `${u.name}: ${ROLES[role as keyof typeof ROLES].label} ${on ? "given" : "removed"}.${on && !u.mfaEnabled ? " They must set up two-factor sign-in before using it." : ""}`;
}
export async function people() {
  const us = await prisma.user.findMany({ where: { isPlatformExpert: true }, select: { id: true, name: true, email: true, organization: true, mfaEnabled: true, isActive: true }, orderBy: { name: "asc" } });
  const rs = (await pdb.platformRole.findMany({}).catch(() => [])) as { userId: string; role: string }[];
  return us.map((u) => ({ ...u, roles: rs.filter((r) => r.userId === u.id).map((r) => r.role) }));
}

/** The admin menu for whoever is on an admin page: the Super Admin's full menu, or a team member's own pages. */
export async function adminNavFor(user: U) {
  const { ADMIN_NAV } = await import("../components/adminNav");
  return teamNav(user, ADMIN_NAV);
}

// ---------------------------------------------------------------- per-team limits on the national curriculum admin pages
const nt = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Does a curriculum (council + program title) fall inside this person's team scope? The Super Admin: always. */
export async function inTeamScope(user: U, c: { authority: string; title: string; chairmanId?: string | null } | null) {
  if (!user || !c) return false;
  if (user.role === "SUPER_USER") return true;
  if (c.chairmanId) return false; // a university's own curriculum is not the national team's
  const sc = await teamScope(user.id);
  if (!sc) return false;
  return (!sc.councils.length || sc.councils.includes(c.authority)) && (!sc.programs.length || sc.programs.some((p) => nt(c.title).includes(nt(p))));
}
/** Guard for /admin/curricula/<id> pages and APIs: the CURRICULUM area and that curriculum inside the team's scope. */
export async function adminCurriculum(user: U | null | undefined, curriculumId: string | null | undefined) {
  if (!user || !(await adminCan(user, "CURRICULUM"))) return false;
  if (user.role === "SUPER_USER") return true;
  if (!curriculumId) return false;
  const c = await prisma.masterCurriculum.findUnique({ where: { id: curriculumId }, select: { authority: true, title: true, chairmanId: true } });
  return inTeamScope(user, c);
}
/** Prisma filter for lists of national curricula a team member may manage. */
export async function teamCurriculumWhere(user: U): Promise<Record<string, unknown>> {
  if (user.role === "SUPER_USER") return {};
  const sc = await teamScope(user.id);
  if (!sc) return { id: "none" };
  return { chairmanId: null, ...(sc.councils.length ? { authority: { in: sc.councils } } : {}), ...(sc.programs.length ? { OR: sc.programs.map((p) => ({ title: { contains: p, mode: "insensitive" } })) } : {}) };
}
