import { randomBytes, randomUUID } from "crypto";
import { prisma } from "./db";
import { approverFor } from "./approvers";
import { notifyUsers } from "./notifications";
import { writeAuditLog } from "./audit";
import { titlesFor, applyTitles } from "./titles";

// Recruitment. A Head of Department asks to hire (it can start from the course assigner's hiring gaps); the request
// goes Dean → Institute Head → Finance (budget) through the approver resolver. The approved request becomes an
// advertisement with a public application form. Applications are checked against the HEC criteria for the
// designation and scored with the committee's weights; the selection board enters marks, recommends in merit order,
// and the Institute Head approves. The offer letter is generated; on joining the account and faculty profile are made.

export const rdb2 = prisma as unknown as Record<string, any>;
export const REC_HINT = "Run prisma/migration_recruitment.sql in Supabase first.";
export const DESIGNATIONS: Record<string, string> = { LECTURER: "Lecturer", ASSISTANT_PROFESSOR: "Assistant Professor", ASSOCIATE_PROFESSOR: "Associate Professor", PROFESSOR: "Professor", LAB_ENGINEER: "Lab Engineer" };
export const DEGREES: Record<string, string> = { PHD: "PhD", MS: "MS / MPhil (18 years)", MASTERS16: "Master's or BS (16 years)", BACHELORS16: "BE / BSc Engineering (16 years)", OTHER: "Other" };
const RANK: Record<string, number> = { OTHER: 0, BACHELORS16: 1, MASTERS16: 1, MS: 2, PHD: 3 };
export const PUB_POINTS: Record<string, number> = { W: 6, X: 4, Y: 2, OTHER: 1 };
// HEC criteria as we know them (the institute should check the current HEC notification).
export const HEC_RULES: Record<string, { degree: string; years: number; postPhd?: number; pubs: number; recentPubs: number; text: string }> = {
  LECTURER: { degree: "MASTERS16", years: 0, pubs: 0, recentPubs: 0, text: "Master's / BS (16 years of education) in the relevant field, first division (CGPA 3.0 or more)." },
  ASSISTANT_PROFESSOR: { degree: "PHD", years: 0, pubs: 0, recentPubs: 0, text: "PhD in the relevant field from an HEC-recognised university." },
  ASSOCIATE_PROFESSOR: { degree: "PHD", years: 10, postPhd: 5, pubs: 10, recentPubs: 4, text: "PhD; 10 years of teaching / research experience (or 5 years after the PhD); 10 research papers in HEC-recognised journals, 4 of them in the last 5 years." },
  PROFESSOR: { degree: "PHD", years: 15, postPhd: 10, pubs: 15, recentPubs: 5, text: "PhD; 15 years of teaching / research experience (or 10 years after the PhD); 15 research papers in HEC-recognised journals, 5 of them in the last 5 years." },
  LAB_ENGINEER: { degree: "BACHELORS16", years: 0, pubs: 0, recentPubs: 0, text: "BE / BS (16 years) in the relevant engineering or computing discipline." },
};
export const DEFAULT_WEIGHTS = { qualification: 25, experience: 20, publications: 25, interview: 30 };
export type Pub = { title: string; journal: string; year: number; category: string; doi?: string };
export type Application = { id: string; advertId: string; chairmanId: string; name: string; email: string; phone: string | null; highestDegree: string; degreeTitle: string | null; university: string | null; degreeYear: number | null; teachingYears: number; postPhdYears: number; industryYears: number; publicationsJson: string; experienceJson: string; cvName: string | null; eligible: boolean; eligibilityJson: string; override: boolean; overrideReason: string | null; status: string; offerSentAt: Date | null; joinedAt: Date | null; userId: string | null; submittedAt: Date };
export type Request = { id: string; chairmanId: string; departmentId: string | null; designation: string; area: string; positions: number; justification: string; raisedById: string; stage: string; status: string; budgetNote: string | null; createdAt: Date; decidedAt: Date | null };

/** The automatic HEC check for a designation. */
export function eligibility(designation: string, a: { highestDegree: string; teachingYears: number; postPhdYears: number; publicationsJson: string }) {
  const r = HEC_RULES[designation] || HEC_RULES.LECTURER;
  const pubs = (JSON.parse(a.publicationsJson || "[]") as Pub[]).filter((p) => p.category && p.category !== "OTHER");
  const recent = pubs.filter((p) => Number(p.year) >= new Date().getFullYear() - 5);
  const checks = [
    { label: `Qualification: ${DEGREES[r.degree]} or higher`, ok: (RANK[a.highestDegree] ?? 0) >= (RANK[r.degree] ?? 0), value: DEGREES[a.highestDegree] || a.highestDegree },
    ...(r.years ? [{ label: `Experience: ${r.years} years (or ${r.postPhd} after the PhD)`, ok: a.teachingYears >= r.years || a.postPhdYears >= (r.postPhd || 99), value: `${a.teachingYears} years (${a.postPhdYears} after the PhD)` }] : []),
    ...(r.pubs ? [{ label: `${r.pubs} papers in HEC-recognised journals`, ok: pubs.length >= r.pubs, value: `${pubs.length}` }, { label: `${r.recentPubs} of them in the last 5 years`, ok: recent.length >= r.recentPubs, value: `${recent.length}` }] : []),
  ];
  return { eligible: checks.every((c) => c.ok), checks };
}

/** The score with the committee's weights; the interview part is the board's average mark. */
export function score(a: Pick<Application, "highestDegree" | "teachingYears" | "industryYears" | "publicationsJson">, w: typeof DEFAULT_WEIGHTS, interview: number | null) {
  const pubs = JSON.parse(a.publicationsJson || "[]") as Pub[];
  const parts = {
    qualification: ({ PHD: 1, MS: 0.67, MASTERS16: 0.33, BACHELORS16: 0.33 } as Record<string, number>)[a.highestDegree] || 0,
    experience: Math.min(1, (a.teachingYears + a.industryYears * 0.5) / 15),
    publications: Math.min(1, pubs.reduce((t, p) => t + (PUB_POINTS[p.category] || 1), 0) / 30),
    interview: interview === null ? 0 : Math.max(0, Math.min(1, interview / 100)),
  };
  const total = Object.entries(parts).reduce((t, [k, v]) => t + v * ((w as Record<string, number>)[k] || 0), 0);
  return { total: Math.round(total * 10) / 10, parts };
}

// ---- Request to hire and its approval chain ----
export const STAGES = [{ stage: "DEAN", label: "Dean" }, { stage: "HEAD", label: "Institute Head" }, { stage: "FINANCE", label: "Finance (budget)" }];
/** Who decides a stage — never the person who asked, nor anyone holding their approvals by hand-over. */
export async function stageApprovers(r: Pick<Request, "chairmanId" | "departmentId" | "raisedById">, stage: string): Promise<string[]> {
  let ids: string[] = [];
  if (stage === "DEAN") ids = (await approverFor(r.chairmanId, "DEAN", { departmentId: r.departmentId })).ids;
  else if (stage === "HEAD") ids = (await approverFor(r.chairmanId, "INSTITUTE_HEAD")).ids;
  else if (stage === "FINANCE") { const f = await prisma.user.findMany({ where: { role: "FINANCE_OFFICER", isActive: true, OR: [{ managedById: r.chairmanId }, { managedBy: { managedById: r.chairmanId } }] }, select: { id: true } }); ids = f.length ? f.map((x) => x.id) : (await approverFor(r.chairmanId, "INSTITUTE_HEAD")).ids; }
  const { delegatesOf } = await import("./approvals/delegation");
  const forRaiser = new Set((await delegatesOf([r.raisedById])).get(r.raisedById) || []);
  return ids.filter((x) => x !== r.raisedById && !forRaiser.has(x));
}
/** Move to the next stage that has someone other than the person who raised it (a stage held by the raiser passes). */
async function advance(r: Request, from: number, by: string) {
  for (let i = from; i < STAGES.length; i++) {
    const ids = await stageApprovers(r, STAGES[i].stage);
    if (ids.length) {
      await rdb2.hiringRequest.update({ where: { id: r.id }, data: { stage: STAGES[i].stage } });
      await notifyUsers(ids, { kind: "REQUEST", title: `Request to hire: ${DESIGNATIONS[r.designation]} (${r.area}) — your approval`, body: r.justification.slice(0, 200), href: "/approvals" });
      return;
    }
    await rdb2.hiringApproval.create({ data: { id: randomUUID(), requestId: r.id, stage: STAGES[i].stage, byId: by, decision: "PASSED", note: "No one else holds this position" } });
  }
  await rdb2.hiringRequest.update({ where: { id: r.id }, data: { stage: "DONE", status: "APPROVED", decidedAt: new Date() } });
  await notifyUsers([r.raisedById], { kind: "REQUEST", title: `Approved: hire ${r.positions} ${DESIGNATIONS[r.designation]} (${r.area})`, body: "You can now advertise the position.", href: "/recruitment" });
}
export async function raiseRequest(by: { id: string }, chairmanId: string, departmentId: string | null, o: { designation: string; area: string; positions: number; justification: string }) {
  if (!DESIGNATIONS[o.designation]) throw new Error("Choose the designation.");
  if (o.area.length < 2 || o.justification.length < 10) throw new Error("Give the area of specialisation and a justification.");
  const r: Request = { id: randomUUID(), chairmanId, departmentId, designation: o.designation, area: o.area.slice(0, 200), positions: Math.max(1, Math.min(20, o.positions || 1)), justification: o.justification.slice(0, 3000), raisedById: by.id, stage: "DEAN", status: "PENDING", budgetNote: null, createdAt: new Date(), decidedAt: null };
  await rdb2.hiringRequest.create({ data: r });
  await writeAuditLog({ actorUserId: by.id, action: "HIRING_REQUESTED", entityType: "HiringRequest", entityId: r.id, metadata: { designation: o.designation } });
  await advance(r, 0, by.id);
  return r.id;
}
export async function decideRequest(by: { id: string }, id: string, approve: boolean, note: string) {
  const r = (await rdb2.hiringRequest.findUnique({ where: { id } })) as Request | null;
  if (!r || r.status !== "PENDING") throw new Error("This request is not waiting for a decision.");
  if (!(await stageApprovers(r, r.stage)).includes(by.id)) throw new Error("This request is waiting for someone else.");
  if (!approve && note.trim().length < 3) throw new Error("Say why it is not approved.");
  await rdb2.hiringApproval.create({ data: { id: randomUUID(), requestId: r.id, stage: r.stage, byId: by.id, decision: approve ? "APPROVED" : "REJECTED", note: note.slice(0, 1000) || null } });
  await writeAuditLog({ actorUserId: by.id, action: approve ? "HIRING_STAGE_APPROVED" : "HIRING_REJECTED", entityType: "HiringRequest", entityId: r.id, metadata: { stage: r.stage } });
  if (r.stage === "FINANCE" && approve) await rdb2.hiringRequest.update({ where: { id: r.id }, data: { budgetNote: note.slice(0, 500) || "Budget confirmed" } });
  if (!approve) { await rdb2.hiringRequest.update({ where: { id: r.id }, data: { status: "REJECTED", decidedAt: new Date() } }); await notifyUsers([r.raisedById], { kind: "REQUEST", title: `Not approved: hire ${DESIGNATIONS[r.designation]} (${r.area})`, body: note.slice(0, 200), href: "/recruitment" }); return; }
  await advance(r, STAGES.findIndex((s) => s.stage === r.stage) + 1, by.id);
}

/** The advertisement text, HEC-style, with the institute's own position titles. */
export async function advertText(r: Request, closeAt: Date) {
  const head = await prisma.user.findUnique({ where: { id: r.chairmanId }, select: { instituteName: true } });
  const dept = r.departmentId ? await prisma.department.findUnique({ where: { id: r.departmentId }, select: { name: true } }) : null;
  const titles = await titlesFor(r.chairmanId).catch(() => null);
  const t = (s: string) => (titles ? applyTitles(s, titles) : s);
  return [`${head?.instituteName || "The institute"} invites applications for the following position${r.positions > 1 ? "s" : ""}:`, "",
    `${DESIGNATIONS[r.designation]} — ${r.area}${dept ? `, ${dept.name}` : ""} (${r.positions} post${r.positions > 1 ? "s" : ""})`, "",
    "Eligibility (as per HEC criteria):", HEC_RULES[r.designation].text, "",
    "How to apply: fill the online application form (link below) with your CV, qualifications, experience and publications (with the HEC journal category).",
    `Last date: ${closeAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. Only shortlisted candidates will be called for the test / interview. No TA/DA is admissible.`, "",
    t("Institute Head") + `, ${head?.instituteName || ""}`].join("\n");
}
export const newToken = () => randomBytes(12).toString("base64url");

// ---- The board ----
export async function merit(advertId: string) {
  const ad = await rdb2.jobAdvert.findUnique({ where: { id: advertId } });
  const req = ad ? ((await rdb2.hiringRequest.findUnique({ where: { id: ad.requestId } })) as Request) : null;
  const apps = (await rdb2.jobApplication.findMany({ where: { advertId } })) as Application[];
  const board = await rdb2.selectionBoard.findUnique({ where: { advertId } });
  const marks = board ? ((await rdb2.boardMark.findMany({ where: { boardId: board.id } })) as { applicationId: string; memberId: string; marks: number; remarks: string | null }[]) : [];
  const w = { ...DEFAULT_WEIGHTS, ...(JSON.parse(ad?.weightsJson || "{}") as Partial<typeof DEFAULT_WEIGHTS>) };
  const rows = apps.map((a) => {
    const m = marks.filter((x) => x.applicationId === a.id);
    const interview = m.length ? m.reduce((t, x) => t + x.marks, 0) / m.length : null;
    const s = score(a, w, interview);
    return { a, interview: interview === null ? null : Math.round(interview * 10) / 10, marks: m, ...s, ok: a.eligible || a.override };
  }).sort((x, y) => Number(y.ok) - Number(x.ok) || y.total - x.total);
  return { ad, req, board, rows, weights: w, members: board ? (JSON.parse(board.membersJson || "[]") as string[]) : [] };
}

/** Joining: the account (role by designation) and the faculty profile, with the qualifications, experience and papers carried over. */
export async function join(by: { id: string }, applicationId: string, username: string, password: string) {
  const { hashPassword } = await import("./auth");
  const a = (await rdb2.jobApplication.findUnique({ where: { id: applicationId } })) as Application | null;
  if (!a || !["SELECTED", "OFFERED"].includes(a.status)) throw new Error("Only a selected candidate can join.");
  if (password.length < 8) throw new Error("The first password needs at least 8 characters (they change it when they sign in).");
  if (await prisma.user.findFirst({ where: { OR: [{ username }, { email: a.email }] } })) throw new Error("That username or the candidate's email is already in use.");
  const ad = await rdb2.jobAdvert.findUnique({ where: { id: a.advertId } }); const r = (await rdb2.hiringRequest.findUnique({ where: { id: ad.requestId } })) as Request;
  const u = await prisma.user.create({ data: { email: a.email, username, passwordHash: await hashPassword(password), name: a.name, role: r.designation === "LAB_ENGINEER" ? "LAB_ENGINEER" : "INSTRUCTOR", managedById: r.chairmanId, departmentId: r.departmentId, mustChangePassword: true } as never });
  await prisma.facultyProfile.create({ data: { userId: u.id, designation: DESIGNATIONS[r.designation], employmentType: "Permanent", dateOfJoining: new Date(), phone: a.phone, specialization: r.area } });
  const recs: Record<string, unknown>[] = [{ userId: u.id, kind: "EDUCATION", title: a.degreeTitle || DEGREES[a.highestDegree], organisation: a.university, endYear: a.degreeYear }];
  for (const e of JSON.parse(a.experienceJson || "[]") as { organisation: string; title: string; from?: number; to?: number }[]) recs.push({ userId: u.id, kind: "EXPERIENCE", title: e.title, organisation: e.organisation, startYear: Number(e.from) || null, endYear: Number(e.to) || null, category: "Academic" });
  for (const p of JSON.parse(a.publicationsJson || "[]") as Pub[]) recs.push({ userId: u.id, kind: "PUBLICATION", title: p.title, organisation: p.journal, startYear: Number(p.year) || null, category: p.category === "OTHER" ? "Other" : p.category, link: p.doi ? `https://doi.org/${p.doi}` : null });
  for (const d of recs) await prisma.facultyRecord.create({ data: d as never }).catch(() => {});
  await rdb2.jobApplication.update({ where: { id: a.id }, data: { status: "JOINED", joinedAt: new Date(), userId: u.id } });
  await writeAuditLog({ actorUserId: by.id, action: "CANDIDATE_JOINED", entityType: "User", entityId: u.id, metadata: { designation: r.designation } });
  return u.id;
}

/** The hiring record (NBEAC Appendix 4C and the registers): per advertisement — positions, applicants, shortlisted, selected, joined, days to hire. */
export async function hiringRecord(chairmanId: string) {
  const ads = (await rdb2.jobAdvert.findMany({ where: { chairmanId }, orderBy: { openFrom: "desc" } })) as { id: string; requestId: string; title: string; openFrom: Date; closeAt: Date }[];
  const out = [];
  for (const ad of ads) {
    const r = (await rdb2.hiringRequest.findUnique({ where: { id: ad.requestId } })) as Request | null;
    const apps = (await rdb2.jobApplication.findMany({ where: { advertId: ad.id }, select: { status: true, joinedAt: true, eligible: true, override: true } })) as { status: string; joinedAt: Date | null; eligible: boolean; override: boolean }[];
    const joined = apps.filter((x) => x.joinedAt).map((x) => new Date(x.joinedAt!).getTime());
    out.push({ title: ad.title, designation: r ? DESIGNATIONS[r.designation] : "", area: r?.area || "", positions: r?.positions || 0, advertised: ad.openFrom, applicants: apps.length, eligible: apps.filter((x) => x.eligible || x.override).length,
      shortlisted: apps.filter((x) => ["SHORTLISTED", "SELECTED", "NOT_SELECTED", "OFFERED", "JOINED", "DECLINED"].includes(x.status)).length, selected: apps.filter((x) => ["SELECTED", "OFFERED", "JOINED"].includes(x.status)).length,
      joined: joined.length, daysToHire: joined.length && r ? Math.round((Math.min(...joined) - new Date(r.createdAt).getTime()) / 864e5) : null });
  }
  return out;
}
