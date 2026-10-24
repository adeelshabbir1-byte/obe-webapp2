import { randomUUID, randomBytes } from "crypto";
import { prisma } from "./db";
import { hashPassword } from "./auth";
import { writeAuditLog } from "./audit";
import { cdb, isActiveMember, rulesOn } from "./consortium";
import { catalog, OFFER_ROLES, type Offering } from "./consortiumOfferings";
import { recognisedAt, editionOf, institutionOf, refresh, type Approvals } from "./consortiumAgreements";
import { findOwningChairmanId } from "./institutionCurriculum";

// Consortium phase 4: a student of a member university applies for another member's course.
//  1. The student applies from their own portal (seats, deadline and exam centre checked; the fee is the host's).
//  2. The host (Chairman / HoD / Program Coordinator) accepts → the student is enrolled in the host's course as a
//     visiting student (a record in the host's "Consortium visiting students" batch), so the host's attendance, marks
//     and CLO attainment work unchanged. The student gets a host portal sign-in, shown once in their own portal.
//  3. Credit at home: automatic when the course is already recognised; otherwise the home Subject Expert and
//     Chairman decide once — and their approval becomes a permanent equivalence for every later student.

export type Application = { id: string; offeringId: string; hostChairmanId: string; homeChairmanId: string; studentId: string; status: string; statement: string | null; hostNote: string | null; decidedAt: Date | null; wantsCredit: boolean; creditStatus: string; creditAsCourseId: string | null; creditApprovalsJson: string; creditNote: string | null; examCentreId: string | null; fee: number; currency: string; paymentRef: string | null; paymentStatus: string; hostStudentId: string | null; hostLogin: string | null; tempSecret: string | null; createdAt: Date };
const j = <T,>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };

export async function homeOfStudent(studentId: string) {
  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { batch: { select: { coordinatorId: true } } } });
  return s ? findOwningChairmanId(s.batch.coordinatorId) : null;
}

export async function apply(studentId: string, offeringId: string, f: { wantsCredit?: boolean; examCentreId?: string; statement?: string }) {
  const st = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true, status: true, name: true } });
  if (!st || st.status !== "ACTIVE") throw new Error("Only a currently enrolled student can apply.");
  const home = await homeOfStudent(studentId);
  if (!home || !(await isActiveMember(home))) throw new Error("Your university is not a consortium member.");
  const [o] = await catalog({ id: offeringId });
  if (!o) throw new Error("This course is not open to the consortium any more.");
  if (o.chairmanId === home) throw new Error("This is your own university's course — register for it in the usual way.");
  if (!o.open) throw new Error("Applications for this course have closed.");
  if (!o.seatsLeft) throw new Error("The course is full.");
  if (await cdb.consortiumApplication.findFirst({ where: { offeringId, studentId } })) throw new Error("You have already applied for this course.");
  if (o.centres.length && !o.centres.some((c) => c.id === f.examCentreId)) throw new Error("Choose where you will sit the final exam.");
  const rec = o.course.masterCourseId ? await recognisedAt(home, o.course.masterCourseId) : [];
  const creditStatus = rec.length ? "RECOGNISED" : f.wantsCredit ? "PENDING" : "NOT_REQUESTED";
  const id = randomUUID();
  await cdb.consortiumApplication.create({ data: { id, offeringId, hostChairmanId: o.chairmanId, homeChairmanId: home, studentId, status: "APPLIED", statement: f.statement?.trim().slice(0, 1000) || null, wantsCredit: !!f.wantsCredit || rec.length > 0, creditStatus, creditAsCourseId: rec[0] || null, examCentreId: f.examCentreId || null, fee: o.feePerCredit * o.course.creditHours, currency: o.currency, paymentStatus: o.feePerCredit ? "UNPAID" : "WAIVED" } });
  await writeAuditLog({ action: "CONSORTIUM_APPLIED_COURSE", entityType: "ConsortiumApplication", entityId: id, metadata: { studentId, offeringId, creditStatus } });
  return `Applied to ${o.university} for ${o.course.code} ${o.course.title}. ${creditStatus === "RECOGNISED" ? "It counts toward your degree." : creditStatus === "PENDING" ? "Your university will decide whether it counts toward your degree." : ""}`.trim();
}
export async function withdraw(studentId: string, appId: string) {
  const a = (await cdb.consortiumApplication.findUnique({ where: { id: appId } })) as Application | null;
  if (!a || a.studentId !== studentId) throw new Error("Not found.");
  if (a.status === "ACCEPTED" && a.hostStudentId) {
    const o = (await cdb.consortiumOffering.findUnique({ where: { id: a.offeringId } })) as Offering | null;
    if (o?.startsOn && o.startsOn < new Date()) throw new Error("Classes have started — ask the host university to withdraw you.");
    await prisma.studentEnrollment.updateMany({ where: { studentId: a.hostStudentId, courseId: o!.courseId }, data: { status: "WITHDRAWN", withdrawnAt: new Date(), withdrawnReason: "Withdrew from the consortium course" } });
  }
  await cdb.consortiumApplication.update({ where: { id: appId }, data: { status: "WITHDRAWN" } });
  return "Withdrawn.";
}
export async function claimPayment(studentId: string, appId: string, ref: string) {
  const a = (await cdb.consortiumApplication.findUnique({ where: { id: appId } })) as Application | null;
  if (!a || a.studentId !== studentId) throw new Error("Not found.");
  if (!ref.trim()) throw new Error("Give the transaction / receipt number.");
  await cdb.consortiumApplication.update({ where: { id: appId }, data: { paymentRef: ref.trim().slice(0, 120), paymentStatus: "CLAIMED" } });
  return "Sent to the host university to verify.";
}

// ------------------------------------------------------------------ Host side
async function hostCheck(user: { id: string; role: string }, a: Application) {
  const me = await institutionOf(user);
  if (me !== a.hostChairmanId || !(OFFER_ROLES.includes(user.role) || user.role === "FINANCE_OFFICER")) throw new Error("Only the host university decides.");
}
export async function hostDecide(user: { id: string; role: string }, appId: string, accept: boolean, note?: string) {
  const a = (await cdb.consortiumApplication.findUnique({ where: { id: appId } })) as Application | null;
  if (!a) throw new Error("Not found.");
  await hostCheck(user, a);
  if (user.role === "FINANCE_OFFICER") throw new Error("Finance verifies payments; admission is decided by the department.");
  if (a.status !== "APPLIED") throw new Error("Already decided.");
  if (!accept) {
    if (!note?.trim()) throw new Error("Say why, for the student.");
    await cdb.consortiumApplication.update({ where: { id: appId }, data: { status: "DECLINED", hostNote: note.trim().slice(0, 500), decidedById: user.id, decidedAt: new Date() } });
    return "Declined — the student sees your reason.";
  }
  const o = (await cdb.consortiumOffering.findUnique({ where: { id: a.offeringId } })) as Offering | null;
  if (!o) throw new Error("The listing is gone.");
  const taken = (await cdb.consortiumApplication.count({ where: { offeringId: o.id, status: "ACCEPTED" } })) as number;
  if (taken >= o.seats) throw new Error("All consortium seats are taken.");
  const course = await prisma.course.findUnique({ where: { id: o.courseId }, select: { id: true, coordinatorId: true } });
  const st = await prisma.student.findUnique({ where: { id: a.studentId }, select: { name: true, rollNumber: true } });
  if (!course || !st) throw new Error("Course or student not found.");
  // The host's batch for visiting students of this term (one per coordinator and term).
  const [termName, yr] = o.term.split(" ");
  const batchName = `Visiting ${o.term}`;
  const batch = await prisma.batch.upsert({ where: { coordinatorId_degreeProgram_batchName: { coordinatorId: course.coordinatorId, degreeProgram: "Consortium visiting students", batchName } }, create: { coordinatorId: course.coordinatorId, degreeProgram: "Consortium visiting students", batchName, startTerm: termName === "Spring" ? "Spring" : "Fall", startYear: Number(yr) || new Date().getFullYear() }, update: {} });
  const roll = `V-${randomBytes(4).toString("hex").toUpperCase()}`;
  const temp = randomBytes(6).toString("base64url");
  const hs = await prisma.student.create({ data: { batchId: batch.id, name: st.name, rollNumber: roll, passwordHash: await hashPassword(temp), mustChangePassword: true } });
  await prisma.studentEnrollment.create({ data: { studentId: hs.id, courseId: course.id } });
  await cdb.consortiumApplication.update({ where: { id: appId }, data: { status: "ACCEPTED", hostNote: note?.trim().slice(0, 500) || null, decidedById: user.id, decidedAt: new Date(), hostStudentId: hs.id, hostLogin: roll, tempSecret: temp } });
  await writeAuditLog({ actorUserId: user.id, action: "CONSORTIUM_STUDENT_ENROLLED", entityType: "ConsortiumApplication", entityId: appId, metadata: { hostStudentId: hs.id, courseId: course.id } });
  return `Accepted and enrolled as visiting student ${roll}. The student sees their sign-in for your portal in their own portal.`;
}
export async function verifyPayment(user: { id: string; role: string }, appId: string, ok: boolean) {
  const a = (await cdb.consortiumApplication.findUnique({ where: { id: appId } })) as Application | null;
  if (!a) throw new Error("Not found.");
  await hostCheck(user, a);
  await cdb.consortiumApplication.update({ where: { id: appId }, data: ok ? { paymentStatus: "VERIFIED", paymentVerifiedById: user.id, paymentVerifiedAt: new Date() } : { paymentStatus: "UNPAID", paymentRef: null } });
  return ok ? "Payment verified." : "Marked unpaid — the student is asked to pay again.";
}

// ------------------------------------------------------------------ Home side: does it count toward the degree?
export async function creditDecide(user: { id: string; role: string; name: string; secondaryRole?: string | null; tertiaryRole?: string | null; extraRoles?: string[] }, appId: string, ok: boolean, asCourseId?: string, note?: string) {
  const a = (await cdb.consortiumApplication.findUnique({ where: { id: appId } })) as Application | null;
  if (!a) throw new Error("Not found.");
  const me = await institutionOf(user);
  if (me !== a.homeChairmanId) throw new Error("Only the student's own university decides on credit.");
  if (a.creditStatus !== "PENDING") throw new Error("Nothing to decide.");
  const hats = [user.role, user.secondaryRole, user.tertiaryRole, ...(user.extraRoles || [])];
  const slot = user.role === "CHAIRMAN" ? "chair" : hats.includes("SUBJECT_EXPERT") ? "se" : null;
  if (!slot) throw new Error("A Subject Expert or the Chairman decides on credit.");
  if (!ok && !note?.trim()) throw new Error("Say why it does not count, for the student.");
  let as = a.creditAsCourseId;
  if (ok) {
    as = asCourseId || as;
    const mc = as ? await prisma.masterCourse.findUnique({ where: { id: as }, select: { masterCurriculum: { select: { chairmanId: true } } } }) : null;
    if (!mc) throw new Error("Choose which of your courses it counts as.");
  }
  const ap = j<Approvals>(a.creditApprovalsJson, {});
  ap[me] = { ...(ap[me] || {}), [slot]: { by: user.id, name: user.name, at: new Date().toISOString(), ok, note: note?.trim().slice(0, 500) || undefined } };
  const done = ap[me].se?.ok && ap[me].chair?.ok, no = ap[me].se?.ok === false || ap[me].chair?.ok === false;
  const creditStatus = no ? "DECLINED" : done ? "APPROVED" : "PENDING";
  await cdb.consortiumApplication.update({ where: { id: appId }, data: { creditApprovalsJson: JSON.stringify(ap), creditStatus, creditAsCourseId: as, creditNote: no ? note?.trim().slice(0, 500) || null : a.creditNote } });
  let permanent = "";
  if (creditStatus === "APPROVED") permanent = await makePermanent(user.id, a, as!, ap);
  await writeAuditLog({ actorUserId: user.id, action: ok ? "CONSORTIUM_CREDIT_APPROVED" : "CONSORTIUM_CREDIT_DECLINED", entityType: "ConsortiumApplication", entityId: appId, metadata: { as: slot, creditStatus } });
  return creditStatus === "APPROVED" ? `Counts toward the degree.${permanent}` : creditStatus === "DECLINED" ? "Recorded: it does not count — the student sees your reason." : "Your decision is recorded; the other approver decides next.";
}
/** A one-time credit approval becomes a standing equivalence (credit recognition), when both courses are on one edition. */
async function makePermanent(actorId: string, a: Application, homeCourseId: string, ap: Approvals) {
  const o = (await cdb.consortiumOffering.findUnique({ where: { id: a.offeringId } })) as Offering | null;
  const hc = o ? await prisma.course.findUnique({ where: { id: o.courseId }, select: { masterCourseId: true } }) : null;
  if (!hc?.masterCourseId) return " (one-off: the host course is not linked to a curriculum course, so no standing equivalence was made)";
  const [mine, theirs] = await Promise.all([homeCourseId, hc.masterCourseId].map((id) => prisma.masterCourse.findUnique({ where: { id }, select: { masterCurriculum: { select: { id: true, version: true } } } })));
  const e1 = mine && editionOf(mine.masterCurriculum.version), e2 = theirs && editionOf(theirs.masterCurriculum.version);
  if (!e1 || e1 !== e2) return ` (one-off: the two courses are on different curriculum editions${e1 && e2 ? ` — ${e1} and ${e2}` : ""}, which are never mixed in a standing equivalence)`;
  const parties = (await cdb.consortiumAgreementParty.findMany({ where: { chairmanId: { in: [a.homeChairmanId, a.hostChairmanId] } } })) as { agreementId: string; chairmanId: string }[];
  const shared = Array.from(new Set(parties.filter((p) => p.chairmanId === a.homeChairmanId).map((p) => p.agreementId))).filter((id) => parties.some((p) => p.agreementId === id && p.chairmanId === a.hostChairmanId));
  let ag = shared.length ? ((await cdb.consortiumAgreement.findFirst({ where: { id: { in: shared }, kind: "CREDIT_RECOGNITION", status: "ACTIVE", edition: e1 } })) as { id: string } | null) : null;
  if (!ag) {
    const { version } = await rulesOn();
    const id = randomUUID();
    await cdb.consortiumAgreement.create({ data: { id, kind: "CREDIT_RECOGNITION", title: `Credit recognition (${e1})`, edition: e1, status: "ACTIVE", rulesVersion: version || null, note: "Made from a student's credit request", createdById: actorId } });
    await cdb.consortiumAgreementParty.create({ data: { agreementId: id, chairmanId: a.homeChairmanId, role: "LEAD", curriculumId: mine!.masterCurriculum.id, status: "ACCEPTED", decidedById: actorId, decidedAt: new Date() } });
    await cdb.consortiumAgreementParty.create({ data: { agreementId: id, chairmanId: a.hostChairmanId, role: "PARTNER", curriculumId: theirs!.masterCurriculum.id, status: "ACCEPTED", decidedAt: new Date() } });
    ag = { id };
  }
  if (!(await cdb.consortiumEquivalence.findFirst({ where: { agreementId: ag.id, courseA: homeCourseId, courseB: hc.masterCourseId } }))) {
    const eid = randomUUID();
    await cdb.consortiumEquivalence.create({ data: { id: eid, agreementId: ag.id, courseA: homeCourseId, courseB: hc.masterCourseId, chairmanA: a.homeChairmanId, chairmanB: a.hostChairmanId, status: "APPROVED", evidenceJson: "{}", approvalsJson: JSON.stringify(ap), note: "From a student's credit request", createdById: actorId } });
    await refresh(eid); // the comparison, for the record
  }
  return " It is now a standing equivalence — later students get it automatically.";
}
