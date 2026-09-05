import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";

type AclUser = { id: string; role: string; managedById: string | null };

async function getRule(chairmanId: string, reportId: string, userId: string, role: string) {
  // Individual rule wins over role rule if both exist.
  const rules = await prisma.reportAccessRule.findMany({
    where: {
      chairmanId, reportId,
      OR: [{ subjectType: "USER", subjectValue: userId }, { subjectType: "ROLE", subjectValue: role }],
    },
  });
  return rules.find((r) => r.subjectType === "USER") || rules.find((r) => r.subjectType === "ROLE") || null;
}

/** Chairman and Super User always have full access — they're the ones who
 * set these rules, and shouldn't be able to lock themselves out. */
function isExempt(role: string) {
  return role === "CHAIRMAN" || role === "SUPER_USER";
}

export async function canViewReport(user: AclUser, reportId: string): Promise<boolean> {
  if (isExempt(user.role)) return true;
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return true;
  const rule = await getRule(chairmanId, reportId, user.id, user.role);
  return rule ? rule.canView : true; // no rule set → default open
}

export async function canEditReport(user: AclUser, reportId: string): Promise<boolean> {
  if (isExempt(user.role)) return true;
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return true;
  const rule = await getRule(chairmanId, reportId, user.id, user.role);
  return rule ? rule.canEdit : true;
}
