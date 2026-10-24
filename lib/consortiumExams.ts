import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { cdb, rulesOn, type Centre } from "./consortium";
import { institutionOf } from "./consortiumAgreements";
import { centresOf, type Offering } from "./consortiumOfferings";
import type { Application } from "./consortiumApplications";

// Consortium phase 6: the exam-centre network. The host lists the centres it accepts on each course; the student's
// own university approves which centres its students may use (its own are approved automatically). A student sits the
// final exam only at a centre both approve. The centre's university records attendance (biometric / ID card), the
// invigilator, and the CCTV recording reference — HEC's ODL policy asks for proctored exams with recordings kept.

export type Booking = { applicationId: string; centreId: string; examOn: Date | null; seatNo: string | null; status: string; method: string | null; invigilator: string | null; recordingRef: string | null; markedAt: Date | null };

/** Centres a university lets its students use: its own active centres, plus other members' it has approved. */
export async function approvedCentres(chairmanId: string) {
  const own = ((await cdb.examCentre.findMany({ where: { chairmanId, status: "ACTIVE" }, select: { id: true } }).catch(() => [])) as { id: string }[]).map((c) => c.id);
  const ap = ((await cdb.consortiumCentreApproval.findMany({ where: { chairmanId, status: "APPROVED" }, select: { centreId: true } }).catch(() => [])) as { centreId: string }[]).map((c) => c.centreId);
  return new Set([...own, ...ap]);
}
/** Centres a student of `home` may choose for this offering. */
export async function usableCentres(home: string, o: Offering) {
  const { rules } = await rulesOn();
  const listed = centresOf(o);
  const ok = rules.centreBothApprove ? await approvedCentres(home) : null;
  const ids = listed.filter((id) => !ok || ok.has(id));
  return (await cdb.examCentre.findMany({ where: { id: { in: ids }, status: "ACTIVE" } })) as Centre[];
}
export async function setApproval(actorId: string, me: string, centreId: string, on: boolean, note?: string) {
  const c = (await cdb.examCentre.findUnique({ where: { id: centreId } })) as Centre | null;
  if (!c) throw new Error("Not found.");
  if (c.chairmanId === me) throw new Error("Your own centres are always approved for your students.");
  await cdb.consortiumCentreApproval.upsert({ where: { chairmanId_centreId: { chairmanId: me, centreId } }, create: { chairmanId: me, centreId, status: on ? "APPROVED" : "REVOKED", byId: actorId, note: note?.slice(0, 300) || null }, update: { status: on ? "APPROVED" : "REVOKED", byId: actorId, at: new Date(), note: note?.slice(0, 300) || null } });
  await writeAuditLog({ actorUserId: actorId, action: on ? "EXAM_CENTRE_APPROVED" : "EXAM_CENTRE_REVOKED", entityType: "ExamCentre", entityId: centreId, metadata: {} });
}

/** Give an accepted student a seat at their chosen centre (or the first usable one) on the course's exam date. */
export async function book(a: Application) {
  const o = (await cdb.consortiumOffering.findUnique({ where: { id: a.offeringId } })) as Offering | null;
  if (!o) return null;
  const usable = await usableCentres(a.homeChairmanId, o);
  const centre = usable.find((c) => c.id === a.examCentreId) || usable[0];
  if (!centre) return null;
  const course = await prisma.course.findUnique({ where: { id: o.courseId }, select: { finalStartDate: true } });
  const taken = (await cdb.consortiumExamBooking.count({ where: { centreId: centre.id, examOn: course?.finalStartDate ?? null } })) as number;
  if (centre.seats && taken >= centre.seats) return null;
  await cdb.consortiumExamBooking.upsert({ where: { applicationId: a.id }, create: { applicationId: a.id, centreId: centre.id, examOn: course?.finalStartDate ?? null, seatNo: `${centre.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "EXM"}-${String(taken + 1).padStart(3, "0")}` }, update: {} });
  return centre;
}
export async function changeCentre(studentId: string, appId: string, centreId: string) {
  const a = (await cdb.consortiumApplication.findUnique({ where: { id: appId } })) as Application | null;
  if (!a || a.studentId !== studentId || a.status !== "ACCEPTED") throw new Error("Not found.");
  const b = (await cdb.consortiumExamBooking.findUnique({ where: { applicationId: appId } })) as Booking | null;
  if (b?.status !== "BOOKED" && b) throw new Error("The exam has been held.");
  if (b?.examOn && b.examOn.getTime() - Date.now() < 3 * 86400000) throw new Error("Too close to the exam to change centre — ask the host university.");
  const o = (await cdb.consortiumOffering.findUnique({ where: { id: a.offeringId } })) as Offering;
  const c = (await usableCentres(a.homeChairmanId, o)).find((x) => x.id === centreId);
  if (!c) throw new Error("Choose a centre both universities approve.");
  const taken = (await cdb.consortiumExamBooking.count({ where: { centreId, examOn: b?.examOn ?? null } })) as number;
  if (c.seats && taken >= c.seats) throw new Error("That centre is full on the exam date.");
  await cdb.consortiumApplication.update({ where: { id: appId }, data: { examCentreId: centreId } });
  if (b) await cdb.consortiumExamBooking.update({ where: { applicationId: appId }, data: { centreId, seatNo: `${c.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "EXM"}-${String(taken + 1).padStart(3, "0")}` } });
  else await book({ ...a, examCentreId: centreId });
  return `Your exam is now at ${c.name}.`;
}
/** The centre's university records the sitting. */
export async function mark(user: { id: string; role: string; name: string }, appId: string, f: { present: boolean; method?: string; invigilator?: string; recordingRef?: string }) {
  const b = (await cdb.consortiumExamBooking.findUnique({ where: { applicationId: appId } })) as Booking | null;
  if (!b) throw new Error("Not found.");
  const c = (await cdb.examCentre.findUnique({ where: { id: b.centreId } })) as Centre;
  if ((await institutionOf(user)) !== c.chairmanId) throw new Error("Only the centre's university records attendance.");
  const { rules } = await rulesOn();
  if (f.present) {
    if (!["BIOMETRIC", "ID_CARD"].includes(f.method || "")) throw new Error("How was the student identified — biometric or ID card?");
    if (!f.invigilator?.trim()) throw new Error("Name the invigilator.");
    if (rules.examProctored && c.cctv && !f.recordingRef?.trim()) throw new Error(`Give the CCTV recording reference — it is kept ${rules.recordingYears} years.`);
  }
  await cdb.consortiumExamBooking.update({ where: { applicationId: appId }, data: { status: f.present ? "PRESENT" : "ABSENT", method: f.present ? f.method : null, invigilator: f.invigilator?.trim().slice(0, 120) || null, recordingRef: f.recordingRef?.trim().slice(0, 200) || null, markedById: user.id, markedAt: new Date() } });
  await writeAuditLog({ actorUserId: user.id, action: f.present ? "CONSORTIUM_EXAM_PRESENT" : "CONSORTIUM_EXAM_ABSENT", entityType: "ConsortiumExamBooking", entityId: appId, metadata: { centreId: b.centreId } });
  return f.present ? "Recorded present." : "Recorded absent.";
}
