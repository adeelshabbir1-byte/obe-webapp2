import { prisma } from "./db";

// Turns a raw action code ("TEMPLATE_APPROVED") into a readable phrase
// ("Template Approved") for a plain-language activity log — keeping a
// small set of acronyms that would otherwise be mangled by title-casing.
const KEEP_UPPER = new Set(["PLO", "PLOS", "CLO", "CLOS", "HEC", "SE", "CQI", "AI", "OMC", "ID"]);

export function formatActionLabel(action: string): string {
  return action
    .split("_")
    .map((word) => (KEEP_UPPER.has(word) ? word : word.charAt(0) + word.slice(1).toLowerCase()))
    .join(" ");
}

/**
 * Resolves a batch of (entityType, entityId) pairs from AuditLog rows into
 * human-readable labels (a course's code + title, a curriculum's name,
 * etc.) in as few queries as one per entity type, rather than one lookup
 * per row. Falls back to a shortened id for any type this doesn't know
 * how to label, or any id that's since been deleted.
 */
export async function resolveEntityLabels(
  entries: { entityType: string | null; entityId: string | null }[]
): Promise<Map<string, string>> {
  const idsByType = new Map<string, Set<string>>();
  for (const e of entries) {
    if (!e.entityType || !e.entityId) continue;
    if (!idsByType.has(e.entityType)) idsByType.set(e.entityType, new Set());
    idsByType.get(e.entityType)!.add(e.entityId);
  }

  const labels = new Map<string, string>();
  const key = (type: string, id: string) => `${type}:${id}`;

  const courseIds = Array.from(idsByType.get("Course") || []);
  if (courseIds.length > 0) {
    const rows = await prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, code: true, title: true } });
    for (const r of rows) labels.set(key("Course", r.id), `${r.code} — ${r.title}`);
  }

  const masterCourseIds = Array.from(idsByType.get("MasterCourse") || []);
  if (masterCourseIds.length > 0) {
    const rows = await prisma.masterCourse.findMany({ where: { id: { in: masterCourseIds } }, select: { id: true, code: true, title: true } });
    for (const r of rows) labels.set(key("MasterCourse", r.id), `${r.code} — ${r.title}`);
  }

  const masterCurriculumIds = Array.from(idsByType.get("MasterCurriculum") || []);
  if (masterCurriculumIds.length > 0) {
    const rows = await prisma.masterCurriculum.findMany({ where: { id: { in: masterCurriculumIds } }, select: { id: true, title: true, degreeProgram: true, version: true } });
    for (const r of rows) labels.set(key("MasterCurriculum", r.id), `${r.degreeProgram || r.title} (${r.version})`);
  }

  const ploIds = Array.from(idsByType.get("PLO") || []);
  if (ploIds.length > 0) {
    const rows = await prisma.pLO.findMany({ where: { id: { in: ploIds } }, select: { id: true, number: true, title: true } });
    for (const r of rows) labels.set(key("PLO", r.id), `PLO-${r.number}: ${r.title}`);
  }

  const batchIds = Array.from(idsByType.get("Batch") || []);
  if (batchIds.length > 0) {
    const rows = await prisma.batch.findMany({ where: { id: { in: batchIds } }, select: { id: true, degreeProgram: true, batchName: true } });
    for (const r of rows) labels.set(key("Batch", r.id), `${r.degreeProgram} — ${r.batchName}`);
  }

  const syncGroupIds = Array.from(idsByType.get("CourseContentSyncGroup") || []);
  if (syncGroupIds.length > 0) {
    const rows = await prisma.courseContentSyncGroup.findMany({ where: { id: { in: syncGroupIds } }, select: { id: true, name: true } });
    for (const r of rows) labels.set(key("CourseContentSyncGroup", r.id), r.name);
  }

  const equivGroupIds = Array.from(idsByType.get("CourseEquivalenceGroup") || []);
  if (equivGroupIds.length > 0) {
    const rows = await prisma.courseEquivalenceGroup.findMany({ where: { id: { in: equivGroupIds } }, select: { id: true, name: true } });
    for (const r of rows) labels.set(key("CourseEquivalenceGroup", r.id), r.name);
  }

  const studentIds = Array.from(idsByType.get("Student") || []);
  if (studentIds.length > 0) {
    const rows = await prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true, rollNumber: true } });
    for (const r of rows) labels.set(key("Student", r.id), `${r.name} (${r.rollNumber})`);
  }

  const userIds = Array.from(idsByType.get("User") || []);
  if (userIds.length > 0) {
    const rows = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, role: true } });
    for (const r of rows) labels.set(key("User", r.id), `${r.name} (${r.role})`);
  }

  const cqiIds = Array.from(idsByType.get("CqiRecord") || []);
  if (cqiIds.length > 0) {
    const rows = await prisma.cqiRecord.findMany({ where: { id: { in: cqiIds } }, select: { id: true, sourceReference: true, finding: true } });
    for (const r of rows) labels.set(key("CqiRecord", r.id), r.sourceReference || r.finding.slice(0, 40));
  }

  return labels;
}

// A short "key: value, key: value" rendering of a log row's metadata JSON,
// skipping ids (too cryptic to be useful in a printed report) and any
// wrapped-up count-only fields that read fine on their own.
export function formatMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const obj = metadata as Record<string, unknown>;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") continue;
    if (/Id$/.test(k)) continue; // raw ids aren't meaningful without a resolved label
    const label = k.replace(/([A-Z])/g, " $1").toLowerCase().trim();
    parts.push(`${label}: ${v}`);
  }
  return parts.join(", ");
}
