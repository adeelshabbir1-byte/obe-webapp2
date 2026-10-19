import { randomBytes, randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers, holdersOf } from "./notifications";
import { hashPassword } from "./auth";

// Alumni as a voice in the program.
//  • A faculty member sends an alumnus a request (update their details / answer a few questions) as a personal link.
//    Each reply earns that faculty member towards the "Alumni Connector" badge (1, 5, 10, 25 replies).
//  • Every alumnus has a personal link to the alumni corner: suggest changes to the curriculum or to a course, or offer
//    a workshop or talk. Suggestions are open to every faculty member, who can comment; the Program Lead / HOD (or the
//    course's subject expert) marks them taken up or not, and Student Affairs / the HOD accepts a workshop with a date.
//  • An alumnus can be made an Industry Subject Expert: a separate SE login, outside the teaching pool, for their courses.

const adb = prisma as unknown as Record<string, any>;
export const ALUMNI_HINT = "The alumni corner needs prisma/migration_alumni_voice.sql — run it in Supabase.";
export const TIERS = [1, 5, 10, 25, 50];
const token = () => randomBytes(18).toString("base64url");

export async function alumniLink(alumniId: string): Promise<string> {
  const row = await adb.alumniAccess.findUnique({ where: { alumniId } });
  if (row) return row.token;
  const t = token();
  await adb.alumniAccess.create({ data: { id: randomUUID(), alumniId, token: t, createdAt: new Date() } });
  return t;
}
export async function alumniByToken(t: string) {
  const row = await adb.alumniAccess.findUnique({ where: { token: t } }).catch(() => null);
  return row ? prisma.alumni.findUnique({ where: { id: row.alumniId } }) : null;
}

/** A faculty member's request to one alumnus; returns the link to send. */
export async function createRequest(alumniId: string, by: string, message: string, questions: string[]) {
  const t = token();
  await adb.alumniRequest.create({ data: { id: randomUUID(), alumniId, requestedById: by, token: t, message, questionsJson: JSON.stringify(questions.slice(0, 10)), createdAt: new Date() } });
  return t;
}
export async function requestByToken(t: string) {
  return adb.alumniRequest.findUnique({ where: { token: t } }).catch(() => null) as Promise<{ id: string; alumniId: string; requestedById: string; message: string; questionsJson: string; respondedAt: Date | null; answersJson: string | null } | null>;
}

/** The alumnus replies: answers, plus any update to email / employer / job title / further degree. Awards the badge. */
export async function answerRequest(t: string, answers: Record<string, string>, update: { email?: string; employer?: string; jobTitle?: string; degree?: string }) {
  const r = await requestByToken(t);
  if (!r) throw new Error("This link is not valid.");
  if (r.respondedAt) throw new Error("Already answered — thank you!");
  await adb.alumniRequest.update({ where: { id: r.id }, data: { respondedAt: new Date(), answersJson: JSON.stringify({ answers, update }) } });
  const al = await prisma.alumni.findUnique({ where: { id: r.alumniId }, select: { chairmanId: true, name: true } });
  if (update.email && /@/.test(update.email)) await prisma.alumni.update({ where: { id: r.alumniId }, data: { email: update.email.slice(0, 160) } }).catch(() => {});
  await awardConnector(r.requestedById, al?.chairmanId || "");
  await notifyUsers([r.requestedById], { kind: "ALUMNI", title: `${al?.name} answered your request`, href: "/alumni-voice" });
}

/** Alumni Connector badge tiers for the faculty member whose requests alumni answered. */
export async function awardConnector(userId: string, chairmanId: string) {
  const n = await adb.alumniRequest.count({ where: { requestedById: userId, respondedAt: { not: null } } });
  const tier = TIERS.filter((x) => n >= x).pop();
  if (!tier) return;
  const y = new Date().getFullYear();
  await prisma.recognitionBadge.create({ data: { chairmanId, userId, term: String(y), badgeKey: "ALUMNI_CONNECTOR", title: `Alumni Connector — ${tier} repl${tier === 1 ? "y" : "ies"}`, reason: `${n} alumni answered requests this faculty member sent.` } }).catch(() => {}); // already has this tier
}

export async function connectorCounts(userIds: string[]) {
  const rows = (await adb.alumniRequest.findMany({ where: { requestedById: { in: userIds.concat(["none"]) } }, select: { requestedById: true, respondedAt: true } }).catch(() => [])) as { requestedById: string; respondedAt: Date | null }[];
  const m = new Map<string, { sent: number; answered: number }>();
  for (const r of rows) { const x = m.get(r.requestedById) || { sent: 0, answered: 0 }; x.sent++; if (r.respondedAt) x.answered++; m.set(r.requestedById, x); }
  return m;
}

/* ---------------- Suggestions and workshop offers ---------------- */

export type Voice = { id: string; chairmanId: string; alumniId: string; kind: string; program: string | null; courseCode: string | null; title: string; text: string; preferredDates: string | null; audience: string | null; status: string; reply: string | null; scheduledFor: Date | null; decidedById: string | null; createdAt: Date };

export async function addVoice(alumniId: string, d: { kind: "SUGGESTION" | "WORKSHOP"; program?: string | null; courseCode?: string | null; title: string; text: string; preferredDates?: string | null; audience?: string | null }) {
  const al = await prisma.alumni.findUnique({ where: { id: alumniId }, select: { chairmanId: true, name: true, degreeProgram: true } });
  if (!al) throw new Error("Not found.");
  await adb.alumniVoice.create({ data: { id: randomUUID(), chairmanId: al.chairmanId, alumniId, kind: d.kind, program: d.program || al.degreeProgram, courseCode: d.courseCode || null, title: d.title, text: d.text, preferredDates: d.preferredDates || null, audience: d.audience || null, status: "OPEN", createdAt: new Date() } });
  const leads = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: al.chairmanId, leadProgram: d.program || al.degreeProgram }, select: { id: true } });
  const to = d.kind === "WORKSHOP" ? [...(await holdersOf(al.chairmanId, "STUDENT_AFFAIRS")), ...leads.map((l) => l.id)] : leads.map((l) => l.id);
  await notifyUsers(to, { kind: "ALUMNI", title: `${d.kind === "WORKSHOP" ? "Workshop offer" : "Suggestion"} from alumnus ${al.name}`, body: d.title, href: "/alumni-voice" });
}

export async function voicesOf(where: Record<string, unknown>): Promise<Voice[] | null> {
  try { return await adb.alumniVoice.findMany({ where, orderBy: { createdAt: "desc" }, take: 300 }); } catch { return null; }
}
export async function commentsOf(voiceIds: string[]) {
  try { return (await adb.alumniVoiceComment.findMany({ where: { voiceId: { in: voiceIds.concat(["none"]) } }, orderBy: { createdAt: "asc" } })) as { id: string; voiceId: string; authorName: string; text: string; createdAt: Date }[]; } catch { return []; }
}
export async function comment(voiceId: string, by: { id: string; name: string }, text: string) {
  await adb.alumniVoiceComment.create({ data: { id: randomUUID(), voiceId, authorId: by.id, authorName: by.name, text, createdAt: new Date() } });
}
export async function decideVoice(voiceId: string, status: string, reply: string | null, scheduledFor: Date | null, by: string) {
  await adb.alumniVoice.update({ where: { id: voiceId }, data: { status, reply, scheduledFor, decidedById: by, decidedAt: new Date() } });
}

/* ---------------- Industry Subject Expert ---------------- */

/** Create a separate SE login for an alumnus (outside the teaching pool), under a Program Lead. Returns the temporary password. */
export async function makeIndustrySe(alumniId: string, leadId: string, email: string, by: string) {
  const al = await prisma.alumni.findUnique({ where: { id: alumniId } });
  const lead = await prisma.user.findUnique({ where: { id: leadId }, select: { id: true, role: true, departmentId: true, managedById: true } });
  if (!al || !lead || lead.role !== "PROGRAM_COORDINATOR" || lead.managedById !== al.chairmanId) throw new Error("Choose the Program Lead.");
  if (!/@/.test(email)) throw new Error("An email is needed for the login.");
  const username = `ise.${al.rollNumber.toLowerCase().replace(/[^a-z0-9]+/g, "")}`.slice(0, 40);
  if (await prisma.user.findFirst({ where: { OR: [{ email }, { username }] } })) throw new Error("A login with that email already exists.");
  const pass = randomBytes(6).toString("base64url");
  const emp = await prisma.alumniEmployment.findFirst({ where: { alumniId, endDate: null }, include: { employer: { select: { organizationName: true } } } }).catch(() => null);
  const u = await prisma.user.create({ data: { email, username, passwordHash: await hashPassword(pass), name: al.name, role: "SUBJECT_EXPERT", managedById: lead.id, departmentId: lead.departmentId, mustChangePassword: true, canTeach: false, organization: emp?.employer?.organizationName || "Industry (alumnus)" } as never });
  await adb.industryExpert.create({ data: { id: randomUUID(), userId: u.id, alumniId, createdById: by, createdAt: new Date() } }).catch(() => {});
  // Bringing an alumnus in as an Industry SE counts for the faculty member who connected them.
  const asker = await adb.alumniRequest.findFirst({ where: { alumniId, respondedAt: { not: null } }, orderBy: { respondedAt: "asc" } }).catch(() => null);
  if (asker) await prisma.recognitionBadge.create({ data: { chairmanId: al.chairmanId, userId: asker.requestedById, term: String(new Date().getFullYear()), badgeKey: "ALUMNI_CONNECTOR", title: `Brought in Industry SE: ${al.name}`, reason: "An alumnus they connected became an Industry Subject Expert." } }).catch(() => {});
  return { username, password: pass };
}

export async function industryExperts(alumniIds: string[]) {
  try { return new Map(((await adb.industryExpert.findMany({ where: { alumniId: { in: alumniIds.concat(["none"]) } } })) as { alumniId: string; userId: string }[]).map((r) => [r.alumniId, r.userId])); } catch { return new Map<string, string>(); }
}
