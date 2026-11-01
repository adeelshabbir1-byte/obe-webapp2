import { prisma } from "./db";
import { allStored, saveSetting, setFlag } from "./scopedSettings";
import { notifyUsers } from "./notifications";

// One-person (or team) duties handed out by a head, shown to the person as their own "Working as" workspace:
//   • Affiliation office — the university's (or a college's) head names the one person who handles affiliation work;
//   • Examinations team — the Controller of Examinations adds people and gives each the programs they handle.
// Stored as an institute setting (who holds it) plus a flag on each person (so the menu finds it fast).
export type TeamMember = { userId: string; name: string; programs: string[] };
const J = <T>(s: string | null | undefined, d: T): T => { try { return s ? (JSON.parse(s) as T) : d; } catch { return d; } };

export async function affiliationOfficer(instituteId: string, side: "UNI" | "COLLEGE") {
  const v = (await allStored(instituteId).catch(() => [])).find((r) => r.key === `aff.officer.${side}` && r.scopeType === "INSTITUTE")?.value;
  return J<{ userId: string; name: string } | null>(v, null);
}
export async function setAffiliationOfficer(by: { id: string; name: string }, instituteId: string, side: "UNI" | "COLLEGE", userId: string) {
  const old = await affiliationOfficer(instituteId, side);
  if (old?.userId && old.userId !== userId) await setFlag(old.userId, "duty:affiliation", null);
  const u = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }) : null;
  await saveSetting(instituteId, "INSTITUTE", instituteId, `aff.officer.${side}`, JSON.stringify(u ? { userId: u.id, name: u.name } : null), by.id);
  if (u) {
    await setFlag(u.id, "duty:affiliation", `${side}:${instituteId}`);
    await notifyUsers([u.id], { kind: "ASSIGNMENT", title: `${by.name} named you the ${side === "UNI" ? "Affiliation office" : "college's affiliation focal person"}`, body: "Choose “Affiliation office” under Working as.", href: "/affiliation" }).catch(() => null);
  }
}
export async function examTeam(chairmanId: string) {
  return J<TeamMember[]>((await allStored(chairmanId).catch(() => [])).find((r) => r.key === "coe.team" && r.scopeType === "INSTITUTE")?.value, []);
}
export async function saveExamTeam(by: { id: string; name: string }, chairmanId: string, team: TeamMember[]) {
  const old = await examTeam(chairmanId);
  const clean = team.filter((m) => m.userId).map((m) => ({ userId: m.userId, name: m.name, programs: Array.from(new Set(m.programs)).filter(Boolean) }));
  for (const o of old) if (!clean.some((m) => m.userId === o.userId)) await setFlag(o.userId, "duty:coe", null);
  for (const m of clean) await setFlag(m.userId, "duty:coe", chairmanId);
  await saveSetting(chairmanId, "INSTITUTE", chairmanId, "coe.team", JSON.stringify(clean), by.id);
  const added = clean.filter((m) => !old.some((o) => o.userId === m.userId)).map((m) => m.userId);
  if (added.length) await notifyUsers(added, { kind: "ASSIGNMENT", title: `${by.name} added you to the Examinations team`, body: "Choose “Examinations office” under Working as.", href: "/controller" }).catch(() => null);
}
