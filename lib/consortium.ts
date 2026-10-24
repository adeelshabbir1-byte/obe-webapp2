import { randomUUID, randomBytes } from "crypto";
import { prisma } from "./db";
import { hashPassword } from "./auth";
import { writeAuditLog } from "./audit";

// OBEHUB Consortium — universities on one platform offering joint degrees, visiting / ODL courses and visiting-faculty
// posts. Phase 1: the Super Admin's rules book (HEC minimums), membership, NOCs, exam centres, and one identity per
// person (CNIC) with who vouches for each account. Design: project doc claude/OBEHUB-consortium-design.md.

export const cdb = prisma as unknown as Record<string, any>;
export const CONSORTIUM_HINT = "The Consortium needs prisma/migration_consortium.sql — run it in Supabase (or System Health).";

// ------------------------------------------------------------------ Rules book
// Every value a programme, agreement or course must meet. Universities may set stricter values, never weaker.
// `source` says where a value comes from, so the Super Admin knows which ones to confirm when HEC revises a policy.
export type RuleDef = { key: string; label: string; group: string; type: "number" | "bool"; def: number | boolean; unit?: string; source: string; stricter: "higher" | "lower" | "true" | null };
const ODL = "HEC ODL Policy 2024", JD = "HEC Dual, Double & Joint Degree Policy (May 2026)", UG = "HEC UG Education Policy v1.1", PF = "Platform default — confirm";
export const RULES: RuleDef[] = [
  { key: "minCreditsMajor", label: "Minimum credit hours, single major", group: "Degree", type: "number", def: 120, unit: "CH", source: UG, stricter: "higher" },
  { key: "minCreditsMinor", label: "Minimum credit hours, major + minor", group: "Degree", type: "number", def: 132, unit: "CH", source: PF, stricter: "higher" },
  { key: "minGeCredits", label: "General Education, minimum", group: "Degree", type: "number", def: 30, unit: "CH", source: UG, stricter: "higher" },
  { key: "maxSemesterLoad", label: "Maximum load per regular semester", group: "Degree", type: "number", def: 21, unit: "CH", source: UG, stricter: "lower" },
  { key: "minCgpaGraduate", label: "Minimum CGPA to graduate", group: "Degree", type: "number", def: 2, unit: "CGPA", source: UG, stricter: "higher" },
  { key: "minPartnerSharePct", label: "Joint degree: each partner teaches at least", group: "Joint degree", type: "number", def: 10, unit: "% of credit hours", source: PF, stricter: "higher" },
  { key: "internshipRequired", label: "Internship / field experience required", group: "Degree", type: "bool", def: true, source: UG, stricter: "true" },
  { key: "minHomeResidencyPct", label: "Minimum share of credits at the degree-awarding (home) university", group: "Residency", type: "number", def: 50, unit: "%", source: PF, stricter: "higher" },
  { key: "capstoneAtHome", label: "Capstone / final year project at the home university", group: "Residency", type: "bool", def: true, source: PF, stricter: "true" },
  { key: "mouMinYears", label: "Joint degree: agreement (MoU) at least", group: "Joint degree", type: "number", def: 5, unit: "years", source: JD, stricter: "higher" },
  { key: "jointNocRequired", label: "Joint degree: HEC NOC before launch", group: "Joint degree", type: "bool", def: true, source: JD, stricter: "true" },
  { key: "matrixRequired", label: "Joint degree: approved Credit Equivalency Matrix (outcomes, contact hours, assessment)", group: "Joint degree", type: "bool", def: true, source: JD, stricter: "true" },
  { key: "odlNocRequired", label: "ODL: institutional NOC needed to offer ODL", group: "ODL", type: "bool", def: true, source: ODL, stricter: "true" },
  { key: "odlNocMaxYears", label: "ODL: recognition valid for at most", group: "ODL", type: "number", def: 3, unit: "years", source: ODL, stricter: "lower" },
  { key: "odlMinF2FBatches", label: "ODL: face-to-face batches of the programme before ODL", group: "ODL", type: "number", def: 2, unit: "batches", source: ODL, stricter: "higher" },
  { key: "odlMinF2FPct", label: "ODL blended: credit hours face-to-face or live, at least", group: "ODL", type: "number", def: 34, unit: "%", source: ODL, stricter: "higher" },
  { key: "labsFaceToFace", label: "Labs / practicals face-to-face", group: "ODL", type: "bool", def: true, source: ODL, stricter: "true" },
  { key: "odlMaxPerSection", label: "ODL: students per section, at most", group: "ODL", type: "number", def: 50, unit: "students", source: PF, stricter: "lower" },
  { key: "examProctored", label: "Final exams proctored (on campus or approved centre)", group: "Exams", type: "bool", def: true, source: ODL, stricter: "true" },
  { key: "recordingYears", label: "Keep exam CCTV / recordings for at least", group: "Exams", type: "number", def: 3, unit: "years", source: ODL, stricter: "higher" },
  { key: "centreBothApprove", label: "An exam centre needs approval of both the host and the home university", group: "Exams", type: "bool", def: true, source: PF, stricter: "true" },
  { key: "maxVisitingSections", label: "Visiting faculty: sections at other universities per semester, at most", group: "Visiting faculty", type: "number", def: 2, unit: "sections", source: PF, stricter: "lower" },
  { key: "industryApplicants", label: "Industry experts (sponsored accounts) may be created and apply", group: "Identity", type: "bool", def: false, source: PF, stricter: null },
  { key: "sponsoredDays", label: "Sponsored account valid for", group: "Identity", type: "number", def: 365, unit: "days", source: PF, stricter: "lower" },
  { key: "sponsorCap", label: "Active sponsored accounts per university, at most", group: "Identity", type: "number", def: 10, unit: "accounts", source: PF, stricter: "lower" },
];
export type Rules = Record<string, number | boolean>;
export const DEFAULT_RULES: Rules = Object.fromEntries(RULES.map((r) => [r.key, r.def]));

type RuleSet = { id: string; version: number; label: string; effectiveFrom: Date; rulesJson: string; status: string; note: string | null; createdAt: Date };
export async function ruleSets() {
  return ((await cdb.consortiumRuleSet.findMany({ orderBy: { version: "desc" } })) as RuleSet[]).map((r) => ({ ...r, rules: { ...DEFAULT_RULES, ...safeJson(r.rulesJson) } as Rules }));
}
/** The rules in force on a date (default today): the newest active version that has taken effect; built-in defaults if none. */
export async function rulesOn(on = new Date()) {
  const r = (await cdb.consortiumRuleSet.findFirst({ where: { status: "ACTIVE", effectiveFrom: { lte: on } }, orderBy: { effectiveFrom: "desc" } }).catch(() => null)) as RuleSet | null;
  return { version: r?.version ?? 0, label: r?.label ?? "Built-in defaults", rules: { ...DEFAULT_RULES, ...(r ? safeJson(r.rulesJson) : {}) } as Rules };
}
export async function saveRuleSet(actorId: string, input: { label: string; effectiveFrom: string; note?: string; rules: Record<string, unknown> }) {
  const rules: Rules = {};
  for (const d of RULES) {
    const v = input.rules[d.key];
    if (d.type === "bool") rules[d.key] = v === true || v === "true" || v === "on";
    else { const n = Number(v); if (!Number.isFinite(n) || n < 0) throw new Error(`${d.label}: enter a number.`); rules[d.key] = n; }
  }
  const from = new Date(input.effectiveFrom);
  if (isNaN(from.getTime())) throw new Error("Give the date this version takes effect.");
  const last = (await cdb.consortiumRuleSet.findFirst({ orderBy: { version: "desc" } })) as RuleSet | null;
  const version = (last?.version || 0) + 1;
  await cdb.consortiumRuleSet.create({ data: { id: randomUUID(), version, label: input.label.trim().slice(0, 120) || `Version ${version}`, effectiveFrom: from, rulesJson: JSON.stringify(rules), status: "ACTIVE", note: input.note?.trim().slice(0, 500) || null, createdById: actorId } });
  await writeAuditLog({ actorUserId: actorId, action: "CONSORTIUM_RULES_VERSION", entityType: "ConsortiumRuleSet", entityId: String(version), metadata: { effectiveFrom: from.toISOString() } });
  return version;
}

/** Is a university's own value at least as strict as the rules book? */
export function stricterOk(d: RuleDef, own: number | boolean, base: number | boolean) {
  if (d.stricter === "higher") return Number(own) >= Number(base);
  if (d.stricter === "lower") return Number(own) <= Number(base);
  if (d.stricter === "true") return !base || own === true;
  return true;
}

// ------------------------------------------------------------------ Membership
export type Member = { chairmanId: string; status: string; country: string; city: string | null; website: string | null; hecRecognized: boolean; residencyJson: string; contactName: string | null; contactEmail: string | null; note: string | null; appliedAt: Date; decidedAt: Date | null; decisionNote: string | null };
export const memberOf = (chairmanId: string) => cdb.consortiumMember.findUnique({ where: { chairmanId } }).catch(() => null) as Promise<Member | null>;
export async function isActiveMember(chairmanId: string | null | undefined) { return !!chairmanId && (await memberOf(chairmanId))?.status === "ACTIVE"; }

export async function applyToJoin(actorId: string, chairmanId: string, f: { city?: string; website?: string; hecRecognized?: boolean; contactName?: string; contactEmail?: string; note?: string; country?: string }) {
  const m = await memberOf(chairmanId);
  const data = { country: (f.country || "PK").slice(0, 2).toUpperCase(), city: f.city?.slice(0, 80) || null, website: f.website?.slice(0, 200) || null, hecRecognized: !!f.hecRecognized, contactName: f.contactName?.slice(0, 120) || null, contactEmail: f.contactEmail?.slice(0, 160) || null, note: f.note?.slice(0, 800) || null };
  if (!data.hecRecognized && data.country === "PK") throw new Error("Only HEC-recognised universities can join. Tick the box once you are on HEC's list.");
  if (m && m.status !== "DECLINED") { await cdb.consortiumMember.update({ where: { chairmanId }, data }); return m.status === "ACTIVE" ? "Profile updated." : "Application updated."; }
  await cdb.consortiumMember.upsert({ where: { chairmanId }, create: { chairmanId, ...data, status: "APPLIED", appliedById: actorId }, update: { ...data, status: "APPLIED", appliedById: actorId, appliedAt: new Date(), decidedAt: null, decidedById: null, decisionNote: null } });
  await writeAuditLog({ actorUserId: actorId, action: "CONSORTIUM_APPLIED", entityType: "ConsortiumMember", entityId: chairmanId, metadata: {} });
  return "Application sent. The OBEHUB Super Admin admits universities to the consortium.";
}
export async function decideMember(actorId: string, chairmanId: string, status: "ACTIVE" | "SUSPENDED" | "DECLINED", note?: string) {
  if (!(await memberOf(chairmanId))) throw new Error("No application from this university.");
  await cdb.consortiumMember.update({ where: { chairmanId }, data: { status, decidedById: actorId, decidedAt: new Date(), decisionNote: note?.slice(0, 500) || null } });
  await writeAuditLog({ actorUserId: actorId, action: `CONSORTIUM_MEMBER_${status}`, entityType: "ConsortiumMember", entityId: chairmanId, metadata: { note: note || null } });
}
/** The university's own residency rules — each must be at least as strict as the rules book. */
export async function saveResidency(actorId: string, chairmanId: string, v: { minHomeResidencyPct?: unknown; capstoneAtHome?: unknown; majorsAtHome?: unknown; visitingNoc?: unknown }) {
  const { rules } = await rulesOn();
  const out = { minHomeResidencyPct: Number(v.minHomeResidencyPct), capstoneAtHome: v.capstoneAtHome === true, majorsAtHome: v.majorsAtHome === true, visitingNoc: v.visitingNoc === true };
  if (!Number.isFinite(out.minHomeResidencyPct) || out.minHomeResidencyPct > 100) throw new Error("Give the share of credits at your university (0–100).");
  for (const k of ["minHomeResidencyPct", "capstoneAtHome"] as const) {
    const d = RULES.find((r) => r.key === k)!;
    if (!stricterOk(d, out[k], rules[k])) throw new Error(`${d.label}: the consortium minimum is ${rules[k] === true ? "required" : `${rules[k]}${d.unit ? " " + d.unit : ""}`}; yours can be stricter, not weaker.`);
  }
  await cdb.consortiumMember.update({ where: { chairmanId }, data: { residencyJson: JSON.stringify(out) } });
  await writeAuditLog({ actorUserId: actorId, action: "CONSORTIUM_RESIDENCY", entityType: "ConsortiumMember", entityId: chairmanId, metadata: out });
}

// ------------------------------------------------------------------ NOCs
export const NOC_KINDS: [string, string][] = [["ODL_INSTITUTIONAL", "HEC ODL recognition (institutional NOC)"], ["JOINT_PROGRAMME", "HEC NOC — joint / dual / double degree programme"], ["ACCREDITATION", "Accreditation (NCEAC, NBEAC, PEC …)"], ["STATUTORY", "Statutory body approval"]];
export type Noc = { id: string; chairmanId: string; kind: string; number: string; programme: string | null; issuedOn: Date | null; expiresOn: Date | null; note: string | null };
export function nocState(n: { expiresOn: Date | null }, on = new Date()) {
  if (!n.expiresOn) return { state: "VALID", label: "valid (no expiry given)" };
  const days = Math.ceil((n.expiresOn.getTime() - on.getTime()) / 86400000);
  if (days < 0) return { state: "EXPIRED", label: `expired ${-days} day(s) ago` };
  if (days <= 90) return { state: "EXPIRING", label: `expires in ${days} day(s)` };
  return { state: "VALID", label: `valid until ${n.expiresOn.toISOString().slice(0, 10)}` };
}
export async function saveNoc(actorId: string, chairmanId: string, f: { id?: string; kind: string; number: string; programme?: string; issuedOn?: string; expiresOn?: string; note?: string }) {
  if (!NOC_KINDS.some(([k]) => k === f.kind)) throw new Error("Choose what the NOC is for.");
  if (!f.number?.trim()) throw new Error("Give the NOC / notification number.");
  const d = (s?: string) => (s ? new Date(s) : null);
  const issuedOn = d(f.issuedOn), expiresOn = d(f.expiresOn);
  if (f.kind === "ODL_INSTITUTIONAL") {
    const { rules } = await rulesOn();
    if (!expiresOn) throw new Error("ODL recognition has an expiry — enter it.");
    if (issuedOn && (expiresOn.getTime() - issuedOn.getTime()) / (365.25 * 86400000) > Number(rules.odlNocMaxYears) + 0.05) throw new Error(`HEC recognises ODL for at most ${rules.odlNocMaxYears} years — check the dates.`);
  }
  const data = { kind: f.kind, number: f.number.trim().slice(0, 120), programme: f.programme?.trim().slice(0, 160) || null, issuedOn, expiresOn, note: f.note?.trim().slice(0, 500) || null };
  if (f.id) { const x = (await cdb.consortiumNoc.findUnique({ where: { id: f.id } })) as Noc | null; if (!x || x.chairmanId !== chairmanId) throw new Error("Not found."); await cdb.consortiumNoc.update({ where: { id: f.id }, data }); }
  else await cdb.consortiumNoc.create({ data: { id: randomUUID(), chairmanId, createdById: actorId, ...data } });
  await writeAuditLog({ actorUserId: actorId, action: "CONSORTIUM_NOC_SAVED", entityType: "ConsortiumNoc", entityId: chairmanId, metadata: { kind: f.kind, number: data.number } });
}
/** Does the university hold a valid NOC of this kind today (optionally for a programme)? */
export async function hasValidNoc(chairmanId: string, kind: string, programme?: string) {
  const xs = (await cdb.consortiumNoc.findMany({ where: { chairmanId, kind } }).catch(() => [])) as Noc[];
  return xs.some((n) => nocState(n).state !== "EXPIRED" && (!programme || !n.programme || n.programme.toLowerCase() === programme.toLowerCase()));
}

// ------------------------------------------------------------------ Exam centres
export type Centre = { id: string; chairmanId: string; campusId: string | null; name: string; city: string | null; address: string | null; seats: number; cctv: boolean; biometric: boolean; status: string };
export async function saveCentre(actorId: string, chairmanId: string, f: { id?: string; name: string; city?: string; address?: string; seats?: unknown; cctv?: unknown; biometric?: unknown; campusId?: string; status?: string }) {
  if (!f.name?.trim()) throw new Error("Name the exam centre.");
  const data = { name: f.name.trim().slice(0, 120), city: f.city?.trim().slice(0, 80) || null, address: f.address?.trim().slice(0, 300) || null, seats: Math.max(0, Math.round(Number(f.seats) || 0)), cctv: f.cctv === true, biometric: f.biometric === true, campusId: f.campusId || null, status: f.status === "CLOSED" ? "CLOSED" : "ACTIVE" };
  if (f.id) { const x = (await cdb.examCentre.findUnique({ where: { id: f.id } })) as Centre | null; if (!x || x.chairmanId !== chairmanId) throw new Error("Not found."); await cdb.examCentre.update({ where: { id: f.id }, data }); }
  else await cdb.examCentre.create({ data: { id: randomUUID(), chairmanId, ...data } });
  await writeAuditLog({ actorUserId: actorId, action: "EXAM_CENTRE_SAVED", entityType: "ExamCentre", entityId: chairmanId, metadata: { name: data.name } });
}
/** What the rules book asks of an exam centre that this one does not have. */
export function centreGaps(c: Centre, rules: Rules) {
  const g: string[] = [];
  if (rules.examProctored && !c.cctv) g.push("no CCTV (HEC ODL policy asks for CCTV / recording)");
  if (rules.examProctored && !c.biometric) g.push("no biometric / ID-based attendance");
  if (!c.seats) g.push("seats not given");
  return g;
}

// ------------------------------------------------------------------ Identity (CNIC) and affiliation
/** 13 digits, written 12345-1234567-1. Returns the digits, or null if it is not a CNIC. */
export function normCnic(s: string | null | undefined) {
  const d = String(s || "").replace(/\D/g, "");
  return d.length === 13 ? d : null;
}
export const fmtCnic = (d: string) => `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
export const maskCnic = (d: string) => `•••••-•••••${d.slice(10, 12)}-${d.slice(12)}`;

export type Affiliation = { userId: string; personId: string; chairmanId: string; kind: string; status: string; employer: string | null; designation: string | null; highestDegree: string | null; hecAttestationNo: string | null; reason: string | null; expiresAt: Date | null; createdAt: Date };
async function personFor(cnic: string, name: string) {
  const p = (await cdb.consortiumPerson.findUnique({ where: { cnic } })) as { id: string } | null;
  if (p) return p.id;
  const id = randomUUID();
  await cdb.consortiumPerson.create({ data: { id, cnic, name: name.slice(0, 120) } });
  return id;
}
/** Register a faculty member of this institute in the consortium under their CNIC (from their profile or given). */
export async function registerEmployee(actorId: string, chairmanId: string, userId: string, cnicIn?: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
  if (!u) throw new Error("Person not found.");
  const prof = await prisma.facultyProfile.findUnique({ where: { userId }, select: { cnic: true } }).catch(() => null);
  const cnic = normCnic(cnicIn || prof?.cnic);
  if (!cnic) throw new Error(`${u.name}: no valid CNIC (13 digits) on the profile.`);
  const personId = await personFor(cnic, u.name);
  const prev = (await cdb.consortiumAffiliation.findUnique({ where: { userId } })) as Affiliation | null;
  if (prev && prev.personId !== personId) throw new Error(`${u.name} is already registered under a different CNIC — ask the Super Admin to correct it.`);
  if (prev) { if (prev.status !== "ACTIVE" && prev.kind === "EMPLOYEE") await cdb.consortiumAffiliation.update({ where: { userId }, data: { status: "ACTIVE" } }); return false; }
  await cdb.consortiumAffiliation.create({ data: { userId, personId, chairmanId, kind: "EMPLOYEE", status: "ACTIVE", createdById: actorId } });
  if (cnicIn && !prof?.cnic) await prisma.facultyProfile.upsert({ where: { userId }, create: { userId, cnic: fmtCnic(cnic) }, update: { cnic: fmtCnic(cnic) } }).catch(() => null);
  return true;
}
/** Employment ended: the account no longer counts as vouched for by this institute. */
export async function endAffiliation(actorId: string, chairmanId: string, userId: string) {
  const a = (await cdb.consortiumAffiliation.findUnique({ where: { userId } })) as Affiliation | null;
  if (!a || a.chairmanId !== chairmanId) throw new Error("Not found.");
  await cdb.consortiumAffiliation.update({ where: { userId }, data: { status: a.kind === "SPONSORED" ? "REVOKED" : "ENDED" } });
  if (a.kind === "SPONSORED") await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
  await writeAuditLog({ actorUserId: actorId, action: a.kind === "SPONSORED" ? "SPONSORED_ACCOUNT_REVOKED" : "AFFILIATION_ENDED", entityType: "User", entityId: userId, metadata: {} });
}

/** A Chairman vouches for an industry expert: creates their account, valid for the rules book's period. */
export async function sponsor(actorId: string, chairmanId: string, f: { name: string; email: string; cnic: string; employer: string; designation?: string; highestDegree?: string; hecAttestationNo?: string; reason: string }) {
  const { rules } = await rulesOn();
  if (!rules.industryApplicants) throw new Error("Industry experts are not open yet — the Super Admin switches this on in the rules book.");
  const cnic = normCnic(f.cnic);
  if (!cnic) throw new Error("CNIC must be 13 digits (12345-1234567-1).");
  for (const [k, l] of [["name", "Name"], ["email", "Email"], ["employer", "Current employer"], ["reason", "Why your university vouches for this person"]] as const) if (!String(f[k] || "").trim()) throw new Error(`${l} is required.`);
  const active = (await cdb.consortiumAffiliation.count({ where: { chairmanId, kind: "SPONSORED", status: "ACTIVE" } })) as number;
  if (active >= Number(rules.sponsorCap)) throw new Error(`Your university already sponsors ${active} active account(s) — the consortium limit is ${rules.sponsorCap}.`);
  const email = f.email.trim().toLowerCase().slice(0, 160);
  if (await prisma.user.findFirst({ where: { OR: [{ email }, { username: email }] } })) throw new Error("An account with this email already exists.");
  const personId = await personFor(cnic, f.name.trim());
  // The same person may already be vouched for here.
  const mine = (await cdb.consortiumAffiliation.findFirst({ where: { personId, chairmanId, status: "ACTIVE" } })) as Affiliation | null;
  if (mine) throw new Error("This person already has an active account at your university.");
  const temp = randomBytes(6).toString("base64url");
  const u = await prisma.user.create({ data: { email, username: email, passwordHash: await hashPassword(temp), name: f.name.trim().slice(0, 120), role: "INSTRUCTOR", managedById: chairmanId, mustChangePassword: true, canTeach: true, organization: f.employer.trim().slice(0, 120) } });
  const expiresAt = new Date(Date.now() + Number(rules.sponsoredDays) * 86400000);
  await cdb.consortiumAffiliation.create({ data: { userId: u.id, personId, chairmanId, kind: "SPONSORED", status: "ACTIVE", employer: f.employer.trim().slice(0, 120), designation: f.designation?.trim().slice(0, 120) || null, highestDegree: f.highestDegree?.trim().slice(0, 160) || null, hecAttestationNo: f.hecAttestationNo?.trim().slice(0, 60) || null, reason: f.reason.trim().slice(0, 500), expiresAt, createdById: actorId } });
  await writeAuditLog({ actorUserId: actorId, action: "SPONSORED_ACCOUNT_CREATED", entityType: "User", entityId: u.id, metadata: { employer: f.employer, expiresAt: expiresAt.toISOString() } });
  return { username: email, temp, expiresAt };
}
export async function renewSponsored(actorId: string, chairmanId: string, userId: string) {
  const { rules } = await rulesOn();
  const a = (await cdb.consortiumAffiliation.findUnique({ where: { userId } })) as Affiliation | null;
  if (!a || a.chairmanId !== chairmanId || a.kind !== "SPONSORED") throw new Error("Not found.");
  const expiresAt = new Date(Date.now() + Number(rules.sponsoredDays) * 86400000);
  await cdb.consortiumAffiliation.update({ where: { userId }, data: { status: "ACTIVE", expiresAt } });
  await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
  await writeAuditLog({ actorUserId: actorId, action: "SPONSORED_ACCOUNT_RENEWED", entityType: "User", entityId: userId, metadata: { expiresAt: expiresAt.toISOString() } });
  return expiresAt;
}
/** At sign-in: a sponsored account past its date lapses (the account is switched off until the sponsor renews it). */
export async function sponsoredLapsed(userId: string) {
  const a = (await cdb.consortiumAffiliation.findUnique({ where: { userId } }).catch(() => null)) as Affiliation | null;
  if (!a || a.kind !== "SPONSORED") return false;
  if (a.status !== "ACTIVE") return true;
  if (a.expiresAt && a.expiresAt < new Date()) {
    await cdb.consortiumAffiliation.update({ where: { userId }, data: { status: "EXPIRED" } }).catch(() => null);
    return true;
  }
  return false;
}

/** Super Admin: every account of one person, across institutes. */
export async function lookupPerson(cnicIn: string) {
  const cnic = normCnic(cnicIn);
  if (!cnic) throw new Error("CNIC must be 13 digits.");
  const p = (await cdb.consortiumPerson.findUnique({ where: { cnic } })) as { id: string; name: string } | null;
  if (!p) return null;
  const affs = (await cdb.consortiumAffiliation.findMany({ where: { personId: p.id }, orderBy: { createdAt: "asc" } })) as Affiliation[];
  const users = await prisma.user.findMany({ where: { id: { in: affs.map((a) => a.userId) } }, select: { id: true, name: true, email: true, role: true, isActive: true } });
  const heads = await prisma.user.findMany({ where: { id: { in: affs.map((a) => a.chairmanId) } }, select: { id: true, instituteName: true, name: true } });
  return { name: p.name, cnic: fmtCnic(cnic), accounts: affs.map((a) => ({ ...a, user: users.find((u) => u.id === a.userId) || null, institute: heads.find((h) => h.id === a.chairmanId)?.instituteName || heads.find((h) => h.id === a.chairmanId)?.name || "—" })) };
}

function safeJson(s: string) { try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; } }
export const residencyOf = (m: Member | null) => ({ minHomeResidencyPct: null as number | null, capstoneAtHome: false, majorsAtHome: false, visitingNoc: false, ...(m ? safeJson(m.residencyJson) : {}) }) as { minHomeResidencyPct: number | null; capstoneAtHome: boolean; majorsAtHome: boolean; visitingNoc: boolean };

const FACULTY_ROLES = ["INSTRUCTOR", "SUBJECT_EXPERT", "LAB_ENGINEER", "LAB_MANAGER", "PROGRAM_COORDINATOR", "PROGRAM_LEAD", "HEAD_OF_DEPARTMENT", "DEAN", "DEPARTMENT_COORDINATOR", "OMC", "COURSE_ASSIGNER"];
/** Everyone in this institute who can teach (walks the managedBy chain down three levels). */
export async function myPeople(chairmanId: string) {
  const ids = new Set<string>(); let frontier = [chairmanId];
  for (let i = 0; i < 4 && frontier.length; i++) {
    const xs = await prisma.user.findMany({ where: { managedById: { in: frontier } }, select: { id: true, role: true, isVisitingPlaceholder: true } });
    frontier = xs.map((x) => x.id);
    for (const x of xs) if (FACULTY_ROLES.includes(x.role) && !x.isVisitingPlaceholder) ids.add(x.id);
  }
  return Array.from(ids);
}
