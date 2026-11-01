import { prisma } from "./db";
import { loadTeams, type Team } from "./courseTeams";
import { notifyUsers } from "./notifications";
import { writeAuditLog } from "./audit";

// Course Lead chosen automatically (Adeel prompt §36). For each course team this term, in order, among its teachers:
//  1. the SE of the base course (or of the course itself) who teaches a section;
//  2. last term's Course Lead of this course, teaching it again;
//  3. the one who has taught this course the most terms;
//  4. ties: alphabetical (designation / service years once recorded).
// A lead set by a person (assignedById ≠ "system") is kept; if he leaves the team the rule picks again and the person
// who set him is told. Rows the rule set carry assignedById = "system".
export const SYSTEM = "system";

export async function pickLead(team: Team, chairmanId: string): Promise<{ leadId: string; reason: string } | null> {
  const ids = new Set(team.teachers.map((t) => t.id));
  if (!ids.size) return null;
  const courses = await prisma.course.findMany({ where: { id: { in: team.rows.map((r) => r.courseId) } }, select: { subjectExpertId: true, contentSyncMember: { select: { group: { select: { members: { where: { isBase: true }, select: { course: { select: { subjectExpertId: true } } } } } } } } } });
  for (const c of courses) {
    const baseSe = c.contentSyncMember?.group.members[0]?.course.subjectExpertId || c.subjectExpertId;
    if (baseSe && ids.has(baseSe)) return { leadId: baseSe, reason: "SE of the base course" };
  }
  const prefix = team.key.split("|")[0] + "|";
  const before = await prisma.courseLead.findMany({ where: { chairmanId, teamKey: { startsWith: prefix }, NOT: { teamKey: team.key } }, orderBy: { createdAt: "desc" }, take: 3 });
  const prev = before.find((b) => ids.has(b.leadId));
  if (prev) return { leadId: prev.leadId, reason: "Course Lead last term" };
  const taught = await prisma.course.groupBy({ by: ["instructorId"], where: { code: team.code, instructorId: { in: Array.from(ids) } }, _count: { _all: true } });
  const best = taught.sort((a, b) => b._count._all - a._count._all)[0];
  if (best?.instructorId && best._count._all > 1) return { leadId: best.instructorId, reason: `Taught it ${best._count._all} times` };
  const first = team.teachers.slice().sort((a, b) => a.name.localeCompare(b.name))[0];
  return { leadId: first.id, reason: "First of the team (no SE or previous lead)" };
}

/** Fill in missing leads for an institute; re-pick when the lead left the team. Returns the reasons per team. */
export async function ensureAutoLeads(chairmanId: string) {
  const teams = await loadTeams(chairmanId);
  const rows = new Map((await prisma.courseLead.findMany({ where: { chairmanId } })).map((r) => [r.teamKey, r]));
  const reasons: Record<string, string> = {};
  for (const t of teams) {
    const cur = rows.get(t.key);
    const stillThere = cur && t.teachers.some((x) => x.id === cur.leadId);
    if (cur && stillThere) { if (cur.assignedById === SYSTEM) reasons[t.key] = (await pickLead(t, chairmanId))?.reason || "auto"; continue; }
    const p = await pickLead(t, chairmanId);
    if (!p) continue;
    await prisma.courseLead.upsert({ where: { chairmanId_teamKey: { chairmanId, teamKey: t.key } }, create: { chairmanId, teamKey: t.key, leadId: p.leadId, assignedById: SYSTEM }, update: { leadId: p.leadId, assignedById: SYSTEM } });
    reasons[t.key] = p.reason;
    await writeAuditLog({ action: "COURSE_LEAD_AUTO", entityType: "Course", entityId: t.rows[0].courseId, metadata: { teamKey: t.key, leadId: p.leadId, reason: p.reason } }).catch(() => null);
    if (cur && cur.assignedById !== SYSTEM) await notifyUsers([cur.assignedById], { kind: "COURSE_LEAD", title: `${t.code}: the Course Lead you named left the course`, body: `The system chose a new lead (${p.reason}). Keep it or switch on Course Leads.`, href: "/course-leads" }).catch(() => null);
  }
  return reasons;
}
