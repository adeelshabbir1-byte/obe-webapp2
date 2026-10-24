import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { cdb, rulesOn, isActiveMember, memberOf, residencyOf, type Affiliation } from "./consortium";
import { institutionOf } from "./consortiumAgreements";
import { OFFER_ROLES, labOf, terms } from "./consortiumOfferings";
import { titleKey } from "./curriculumContent";
import { computeCoAttainment } from "./attainmentLevels";
import { findOwningChairmanId } from "./institutionCurriculum";

// Consortium phase 5: the visiting-faculty board. A member posts a course it has no teacher for; registered faculty
// of other member universities (and, once switched on, industry experts a Chairman sponsors) apply. The host sees a
// profile built from the platform — qualifications, how often the person taught this course or its equivalent, and,
// only if the applicant agrees, their sections' CLO attainment and student feedback — plus a timetable-clash and
// load check against the applicant's own teaching. If the applicant's university asks for a NOC, it decides first.

export type Vacancy = { id: string; chairmanId: string; courseId: string; term: string; mode: string; schedule: string | null; pay: number | null; payBasis: string | null; showPay: boolean; requirements: string | null; deadline: Date | null; status: string; filledByUserId: string | null; createdAt: Date };
export type VApp = { id: string; vacancyId: string; applicantId: string; homeChairmanId: string; status: string; coverNote: string | null; shareJson: string; nocStatus: string; nocNote: string | null; hostNote: string | null; createdAt: Date };
const j = <T,>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };

export async function postVacancy(actor: { id: string; role: string }, me: string, f: Record<string, unknown>) {
  if (!OFFER_ROLES.includes(actor.role)) throw new Error("The Chairman, Head of Department or a Program Coordinator posts teaching vacancies.");
  if (!(await isActiveMember(me))) throw new Error("Your university must be an active consortium member.");
  const s = (k: string, n = 300) => (typeof f[k] === "string" ? (f[k] as string).trim().slice(0, n) : "");
  const id = s("id", 60);
  const prev = id ? ((await cdb.consortiumVacancy.findUnique({ where: { id } })) as Vacancy | null) : null;
  if (id && (!prev || prev.chairmanId !== me)) throw new Error("Not found.");
  const courseId = prev?.courseId || s("courseId", 60);
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { coordinatorId: true, code: true } });
  if (!c || (await findOwningChairmanId(c.coordinatorId)) !== me) throw new Error("Choose one of your university's courses.");
  const term = s("term", 20);
  if (!/^(Spring|Summer|Fall) \d{4}$/.test(term)) throw new Error("Choose the term.");
  const data = { term, mode: s("mode", 20) === "ONLINE" ? "ONLINE" : "ON_CAMPUS", schedule: s("schedule") || null, pay: f.pay === "" || f.pay == null ? null : Math.max(0, Math.round(Number(f.pay))) || null, payBasis: s("payBasis", 30) || null, showPay: f.showPay !== false, requirements: s("requirements", 1500) || null, deadline: s("deadline") ? new Date(s("deadline")) : null, status: ["OPEN", "CLOSED", "FILLED"].includes(String(f.status)) ? String(f.status) : prev?.status || "OPEN" };
  if (prev) await cdb.consortiumVacancy.update({ where: { id: prev.id }, data });
  else await cdb.consortiumVacancy.create({ data: { id: randomUUID(), chairmanId: me, courseId, ...data, createdById: actor.id } });
  await writeAuditLog({ actorUserId: actor.id, action: prev ? "VACANCY_UPDATED" : "VACANCY_POSTED", entityType: "ConsortiumVacancy", entityId: courseId, metadata: { term } });
  return prev ? "Saved." : `Posted — faculty of member universities can see ${c.code} and apply.`;
}

/** Who vouches for this person, and may they apply for teaching posts? */
export async function eligibility(userId: string) {
  const { rules } = await rulesOn();
  const a = (await cdb.consortiumAffiliation.findUnique({ where: { userId } }).catch(() => null)) as Affiliation | null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { canTeach: true, isActive: true } });
  if (!a || a.status !== "ACTIVE") return { ok: false as const, why: "Your university has not registered you in the consortium yet (by CNIC). Ask your Chairman — Consortium page." };
  if (a.kind === "SPONSORED" && !rules.industryApplicants) return { ok: false as const, why: "Industry experts cannot apply yet." };
  if (a.kind === "SPONSORED" && a.expiresAt && a.expiresAt < new Date()) return { ok: false as const, why: "Your sponsored account has lapsed — ask your sponsor to renew it." };
  if (!u?.canTeach || !u.isActive) return { ok: false as const, why: "Your account is not a teaching account." };
  if (!(await isActiveMember(a.chairmanId))) return { ok: false as const, why: "Your university is not an active consortium member." };
  return { ok: true as const, home: a.chairmanId, kind: a.kind, aff: a };
}

export async function applyVacancy(user: { id: string }, vacancyId: string, f: { coverNote?: string; shareAttainment?: boolean; shareFeedback?: boolean }) {
  const e = await eligibility(user.id);
  if (!e.ok) throw new Error(e.why);
  const v = (await cdb.consortiumVacancy.findUnique({ where: { id: vacancyId } })) as Vacancy | null;
  if (!v || v.status !== "OPEN") throw new Error("This post is no longer open.");
  if (v.chairmanId === e.home) throw new Error("This is your own university's post — your Course Assigner allocates it.");
  if (v.deadline && v.deadline < new Date(new Date().toDateString())) throw new Error("Applications have closed.");
  if (await cdb.consortiumVacancyApplication.findFirst({ where: { vacancyId, applicantId: user.id } })) throw new Error("You have already applied.");
  const { rules } = await rulesOn();
  const mine = (await cdb.consortiumVacancyApplication.findMany({ where: { applicantId: user.id, status: "ACCEPTED" } })) as VApp[];
  const sameTerm = mine.length ? ((await cdb.consortiumVacancy.count({ where: { id: { in: mine.map((x) => x.vacancyId) }, term: v.term } })) as number) : 0;
  if (sameTerm >= Number(rules.maxVisitingSections)) throw new Error(`You already teach ${sameTerm} section(s) at other universities in ${v.term} — the consortium limit is ${rules.maxVisitingSections}.`);
  const needNoc = !!(residencyOf(await memberOf(e.home)) as { visitingNoc?: boolean }).visitingNoc;
  const id = randomUUID();
  await cdb.consortiumVacancyApplication.create({ data: { id, vacancyId, applicantId: user.id, homeChairmanId: e.home, status: "APPLIED", coverNote: f.coverNote?.trim().slice(0, 1500) || null, shareJson: JSON.stringify({ attainment: !!f.shareAttainment, feedback: !!f.shareFeedback }), nocStatus: needNoc ? "PENDING" : "NOT_REQUIRED" } });
  await writeAuditLog({ actorUserId: user.id, action: "VACANCY_APPLIED", entityType: "ConsortiumVacancyApplication", entityId: id, metadata: { vacancyId } });
  return needNoc ? "Applied. Your university asks for a NOC to teach elsewhere — your Chairman decides first; the host sees the application meanwhile." : "Applied. The host university will be in touch.";
}

// ------------------------------------------------------------------ The applicant's profile, from the platform
type Entry = { dayOfWeek: string; startHour: number; endHour: number };
async function entriesFor(where: { courseId?: string; instructorId?: string }) {
  const secs = await prisma.scheduleSection.findMany({ where, select: { id: true, course: { select: { code: true } } } });
  if (!secs.length) return [] as (Entry & { code: string })[];
  const es = await prisma.timetableEntry.findMany({ where: { scheduleSectionId: { in: secs.map((s) => s.id) } }, select: { dayOfWeek: true, startHour: true, endHour: true, scheduleSectionId: true, timetableRunId: true }, orderBy: { timetableRun: { createdAt: "desc" } } });
  const latest = es[0]?.timetableRunId; // the newest timetable only
  return es.filter((e) => e.timetableRunId === latest).map((e) => ({ ...e, code: secs.find((s) => s.id === e.scheduleSectionId)?.course?.code || "" }));
}
const hh = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
export async function profile(applicantId: string, share: { attainment?: boolean; feedback?: boolean }, vacancyCourseId: string) {
  const [u, prof, recs, aff, vc] = await Promise.all([
    prisma.user.findUnique({ where: { id: applicantId }, select: { id: true, name: true, email: true, specialization: true, organization: true } }),
    prisma.facultyProfile.findUnique({ where: { userId: applicantId }, select: { designation: true, specialization: true, verifiedAt: true, photo: true } }).catch(() => null),
    prisma.facultyRecord.findMany({ where: { userId: applicantId, kind: { in: ["EDUCATION", "EXPERIENCE", "PUBLICATION"] } }, select: { kind: true, title: true, organisation: true, startYear: true, endYear: true }, orderBy: { endYear: "desc" } }),
    cdb.consortiumAffiliation.findUnique({ where: { userId: applicantId } }) as Promise<Affiliation | null>,
    prisma.course.findUnique({ where: { id: vacancyCourseId }, select: { title: true, masterCourseId: true, creditHours: true, hasLab: true, labPct: true } }),
  ]);
  const taught = await prisma.course.findMany({ where: { instructorId: applicantId }, select: { id: true, code: true, title: true, masterCourseId: true, offeredTermName: true, offeredTermYear: true, batch: { select: { batchName: true } } }, orderBy: [{ offeredTermYear: "desc" }], take: 200 });
  const k = vc ? titleKey(vc.title) : "";
  const relevant = taught.filter((c) => (vc?.masterCourseId && c.masterCourseId === vc.masterCourseId) || titleKey(c.title) === k);
  const edu = recs.filter((r) => r.kind === "EDUCATION");
  const degree = edu.map((r) => r.title).find((t) => /ph\.?\s?d|doctor/i.test(t)) ? "PhD" : edu.map((r) => r.title).find((t) => /\b(ms|m\.s|mphil|m\.phil|master|msc|m\.sc|me|meng)\b/i.test(t)) ? "MS / MPhil" : edu.length ? "Below MS" : "Not on record";
  const expYears = recs.filter((r) => r.kind === "EXPERIENCE").reduce((t, r) => t + Math.max(0, (r.endYear || new Date().getFullYear()) - (r.startYear || r.endYear || new Date().getFullYear())), 0);
  let attainment: number | null = null, feedback: { avg: number; n: number } | null = null;
  if (share.attainment && relevant.length) {
    const pcts: number[] = [];
    for (const c of relevant.slice(0, 3)) { const r = await computeCoAttainment(c.id).catch(() => null); for (const x of r?.rows || []) if (Number.isFinite(x.actualPct)) pcts.push(x.actualPct); }
    attainment = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
  }
  if (share.feedback && relevant.length) {
    const evs = ((await cdb.courseEvaluation.findMany({ where: { courseId: { in: relevant.map((c) => c.id) }, kind: "TEACHER" }, select: { answersJson: true } }).catch(() => [])) as { answersJson: string }[]);
    const nums: number[] = [];
    for (const e of evs) { const v = j<unknown>(e.answersJson, {}); const vals = Array.isArray(v) ? v : Object.values(v as object); for (const x of vals) { const n = typeof x === "number" ? x : typeof x === "object" && x && "value" in (x as object) ? Number((x as { value: unknown }).value) : NaN; if (n >= 1 && n <= 5) nums.push(n); } }
    feedback = nums.length ? { avg: Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10, n: evs.length } : null;
  }
  // Timetable clash with what the applicant already teaches (both timetables on OBEHUB).
  const [mine, theirs] = await Promise.all([entriesFor({ courseId: vacancyCourseId }), entriesFor({ instructorId: applicantId })]);
  const clashes = mine.flatMap((a) => theirs.filter((b) => b.dayOfWeek === a.dayOfWeek && a.startHour < b.endHour && b.startHour < a.endHour).map((b) => `${a.dayOfWeek} ${hh(Math.max(a.startHour, b.startHour))}–${hh(Math.min(a.endHour, b.endHour))} (their ${b.code})`));
  const now = await prisma.course.count({ where: { instructorId: applicantId, isOffered: true } });
  const score = (degree === "PhD" ? 30 : degree === "MS / MPhil" ? 20 : 0) + Math.min(relevant.length, 5) * 8 + (attainment != null ? Math.min(20, Math.round(attainment / 5)) : 0) + (feedback ? Math.round(feedback.avg * 2) : 0) - (clashes.length ? 15 : 0);
  return { user: u, designation: prof?.designation || null, specialization: prof?.specialization || u?.specialization || null, verified: !!prof?.verifiedAt, degree, education: edu.slice(0, 4), expYears, publications: recs.filter((r) => r.kind === "PUBLICATION").length, taughtCount: taught.length, relevant: relevant.map((c) => `${c.code} ${c.offeredTermName || ""} ${c.offeredTermYear || ""}`.trim()), attainment, feedback, clashes, timetableKnown: mine.length > 0 && theirs.length > 0, teachingNow: now, sponsored: aff?.kind === "SPONSORED" ? { employer: aff.employer, reason: aff.reason } : null, score, lab: vc ? labOf(vc) : 0 };
}

// ------------------------------------------------------------------ Decisions
export async function nocDecide(user: { id: string; role: string }, appId: string, ok: boolean, note?: string) {
  const a = (await cdb.consortiumVacancyApplication.findUnique({ where: { id: appId } })) as VApp | null;
  if (!a) throw new Error("Not found.");
  if (user.role !== "CHAIRMAN" || user.id !== a.homeChairmanId) throw new Error("The applicant's own Chairman gives the NOC.");
  if (a.nocStatus !== "PENDING") throw new Error("Nothing to decide.");
  if (!ok && !note?.trim()) throw new Error("Say why, for the teacher.");
  await cdb.consortiumVacancyApplication.update({ where: { id: appId }, data: { nocStatus: ok ? "APPROVED" : "DECLINED", nocById: user.id, nocAt: new Date(), nocNote: note?.trim().slice(0, 500) || null, ...(ok ? {} : { status: "WITHDRAWN" }) } });
  await writeAuditLog({ actorUserId: user.id, action: ok ? "VISITING_NOC_GRANTED" : "VISITING_NOC_REFUSED", entityType: "ConsortiumVacancyApplication", entityId: appId, metadata: {} });
  return ok ? "NOC given." : "NOC refused — the application is withdrawn.";
}
export async function hostAct(user: { id: string; role: string }, appId: string, act: "shortlist" | "offer" | "reject", note?: string) {
  const a = (await cdb.consortiumVacancyApplication.findUnique({ where: { id: appId } })) as VApp | null;
  if (!a) throw new Error("Not found.");
  const v = (await cdb.consortiumVacancy.findUnique({ where: { id: a.vacancyId } })) as Vacancy;
  if ((await institutionOf(user)) !== v.chairmanId || !OFFER_ROLES.includes(user.role)) throw new Error("Only the host university decides.");
  if (v.status !== "OPEN") throw new Error("This post is closed.");
  if (act === "offer" && a.nocStatus === "PENDING") throw new Error("The teacher's own university has not given its NOC yet.");
  if (act === "offer" && (await cdb.consortiumVacancyApplication.count({ where: { vacancyId: v.id, status: "OFFERED" } }))) throw new Error("You have already offered this course to someone — wait for their answer.");
  if (act === "reject" && !note?.trim()) throw new Error("Say why, for the teacher.");
  const status = act === "shortlist" ? "SHORTLISTED" : act === "offer" ? "OFFERED" : "REJECTED";
  await cdb.consortiumVacancyApplication.update({ where: { id: appId }, data: { status, hostNote: note?.trim().slice(0, 500) || null, decidedById: user.id, decidedAt: new Date() } });
  await writeAuditLog({ actorUserId: user.id, action: `VACANCY_${status}`, entityType: "ConsortiumVacancyApplication", entityId: appId, metadata: {} });
  return act === "offer" ? "Offer sent — the teacher accepts or declines from their Teaching posts page." : act === "shortlist" ? "Shortlisted." : "Declined.";
}
/** The teacher answers an offer. Accepting makes them the instructor of the host's course (that course only). */
export async function answerOffer(user: { id: string }, appId: string, accept: boolean) {
  const a = (await cdb.consortiumVacancyApplication.findUnique({ where: { id: appId } })) as VApp | null;
  if (!a || a.applicantId !== user.id) throw new Error("Not found.");
  if (a.status !== "OFFERED") throw new Error("There is no open offer.");
  const v = (await cdb.consortiumVacancy.findUnique({ where: { id: a.vacancyId } })) as Vacancy;
  if (!accept) {
    await cdb.consortiumVacancyApplication.update({ where: { id: appId }, data: { status: "DECLINED" } });
    return "Declined.";
  }
  const e = await eligibility(user.id);
  if (!e.ok) throw new Error(e.why);
  await prisma.course.update({ where: { id: v.courseId }, data: { instructorId: user.id, instructorResponse: "ACCEPTED" } });
  await cdb.consortiumVacancyApplication.update({ where: { id: appId }, data: { status: "ACCEPTED" } });
  await cdb.consortiumVacancy.update({ where: { id: v.id }, data: { status: "FILLED", filledByUserId: user.id } });
  await cdb.consortiumVacancyApplication.updateMany({ where: { vacancyId: v.id, id: { not: appId }, status: { in: ["APPLIED", "SHORTLISTED"] } }, data: { status: "REJECTED", hostNote: "The course has been filled." } });
  await writeAuditLog({ actorUserId: user.id, action: "VISITING_FACULTY_ASSIGNED", entityType: "Course", entityId: v.courseId, metadata: { vacancyId: v.id } });
  return "Accepted — the course now appears under your courses, with the host's CLOs, lecture plan and course file.";
}
export { terms };
