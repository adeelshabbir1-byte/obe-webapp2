import { prisma } from "./db";
import { allStored, getFlag, saveSetting, setFlag } from "./scopedSettings";
import { notifyUsers } from "./notifications";
import { JOBS, holdersText, may, type Holder } from "./affJobsCore";

// The university's affiliation jobs, stored as setting "aff.jobs" = { JOB: [{ userId, name }] } (lib/affJobsCore.ts).
export async function jobsOf(universityId: string): Promise<Record<string, Holder[]>> {
  const v = (await allStored(universityId).catch(() => [])).find((r) => r.key === "aff.jobs" && r.scopeType === "INSTITUTE")?.value;
  try { return v ? (JSON.parse(v) as Record<string, Holder[]>) : {}; } catch { return {}; }
}
export async function saveJobs(by: { id: string; name: string }, universityId: string, next: Record<string, string[]>) {
  const old = await jobsOf(universityId);
  const ids = Array.from(new Set(Object.values(next).flat().filter(Boolean)));
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const jobs: Record<string, Holder[]> = {};
  for (const j of Object.keys(JOBS)) jobs[j] = (next[j] || []).map((id) => users.find((u) => u.id === id)).filter((u): u is { id: string; name: string } => !!u).map((u) => ({ userId: u.id, name: u.name }));
  await saveSetting(universityId, "INSTITUTE", universityId, "aff.jobs", JSON.stringify(jobs), by.id);
  // Holders get the Affiliation office workspace; people who lost every job lose it (unless they are the office itself).
  const now = new Set(Object.values(jobs).flat().map((h) => h.userId));
  const before = new Set(Object.values(old).flat().map((h) => h.userId));
  const officer = (await (await import("./dutyAssign")).affiliationOfficer(universityId, "UNI"))?.userId;
  for (const id of Array.from(now)) if ((await getFlag(id, "duty:affiliation")) !== `UNI:${universityId}`) await setFlag(id, "duty:affiliation", `UNI:${universityId}`);
  for (const id of Array.from(before)) if (!now.has(id) && id !== officer) await setFlag(id, "duty:affiliation", null);
  const added = Array.from(now).filter((id) => !before.has(id));
  if (added.length) await notifyUsers(added, { kind: "ASSIGNMENT", title: `${by.name} gave you an affiliation job`, body: "Choose “Affiliation office” under Working as.", href: "/affiliation" }).catch(() => null);
}
/** Throws unless this person may do the job at this university. */
export async function requireJob(user: { id: string; role?: string; extraRoles?: string[] | null }, universityId: string, job: string) {
  const jobs = await jobsOf(universityId);
  const officer = (await (await import("./dutyAssign")).affiliationOfficer(universityId, "UNI"))?.userId;
  const fallback = ["DEAN", "HEAD_OF_DEPARTMENT"].includes(String(user.role)) || user.id === officer;
  if (!may(job, { id: user.id, role: String(user.role || ""), extraRoles: user.extraRoles }, jobs, fallback)) throw new Error(`This step is for the ${holdersText(job, jobs)}.`);
}
