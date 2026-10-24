import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { cdb } from "./consortium";
import { institutionOf } from "./consortiumAgreements";
import type { Application } from "./consortiumApplications";
import type { Offering } from "./consortiumOfferings";

// Consortium phase 7: results come home. When the host has the visiting student's result on its transcript (its usual
// end-of-term snapshot), the home university copies it onto the student's own transcript: the host's letter grade and
// percentage, the grade points converted under the agreement's grade map (else the home grading scale's value for that
// letter, else the host's points), the CLO attainment, and "taken at <host>" in the title. A course that does not count
// toward the degree comes home with 0 credit hours, so the transcript shows it without affecting the CGPA.

type Rec = { id: string; studentId: string; coordinatorId: string; courseCode: string; courseTitle: string; creditHours: number; courseType: string; termName: string; termYear: number; totalPct: number; grade: string; gpaPoints: number | null; cloAttainmentJson: string; ploAttainmentJson: string };
const j = <T,>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };

/** Grade-point map for the home university under the agreement that recognises this course, if one sets it. */
async function agreementMap(a: Application): Promise<Record<string, number> | null> {
  const parties = (await cdb.consortiumAgreementParty.findMany({ where: { chairmanId: { in: [a.homeChairmanId, a.hostChairmanId] } } })) as { agreementId: string; chairmanId: string }[];
  const ids = Array.from(new Set(parties.filter((p) => p.chairmanId === a.homeChairmanId).map((p) => p.agreementId))).filter((id) => parties.some((p) => p.agreementId === id && p.chairmanId === a.hostChairmanId));
  const ags = (await cdb.consortiumAgreement.findMany({ where: { id: { in: ids }, status: "ACTIVE" } })) as { gradeMapJson: string }[];
  for (const g of ags) { const m = j<Record<string, Record<string, number>>>(g.gradeMapJson, {})[a.homeChairmanId]; if (m && Object.keys(m).length) return m; }
  return null;
}
export function convert(letter: string, hostPoints: number | null, map: Record<string, number> | null, homeScale: Map<string, number>) {
  const L = letter.trim().toUpperCase();
  if (map && Number.isFinite(map[L])) return { points: map[L], basis: "agreement grade map" };
  if (homeScale.has(L)) return { points: homeScale.get(L)!, basis: "home grading scale" };
  return { points: hostPoints, basis: "host grade points" };
}

export async function status(a: Application) {
  if (a.status !== "ACCEPTED" || !a.hostStudentId) return { state: "NOT_ENROLLED" as const };
  const t = (await cdb.consortiumTransfer.findUnique({ where: { applicationId: a.id } }).catch(() => null)) as { homePoints: number | null; hostGrade: string; basis: string } | null;
  if (t) return { state: "TRANSFERRED" as const, t };
  const o = (await cdb.consortiumOffering.findUnique({ where: { id: a.offeringId } })) as Offering;
  const c = await prisma.course.findUnique({ where: { id: o.courseId }, select: { code: true } });
  const rec = c ? await prisma.studentTranscriptRecord.findFirst({ where: { studentId: a.hostStudentId, courseCode: c.code }, orderBy: { snapshotAt: "desc" } }) : null;
  if (!rec || rec.grade === "IT" || rec.grade === "I") return { state: "WAITING" as const };
  return { state: "READY" as const, rec };
}

export async function transfer(user: { id: string; role: string }, appId: string) {
  const a = (await cdb.consortiumApplication.findUnique({ where: { id: appId } })) as Application | null;
  if (!a) throw new Error("Not found.");
  if ((await institutionOf(user)) !== a.homeChairmanId) throw new Error("The student's own university brings the result in.");
  const s = await status(a);
  if (s.state === "TRANSFERRED") throw new Error("Already on the student's transcript.");
  if (s.state !== "READY") throw new Error(s.state === "WAITING" ? "The host university has not published the result yet." : "The student was not enrolled.");
  const rec = s.rec as Rec;
  const home = await prisma.student.findUnique({ where: { id: a.studentId }, select: { batch: { select: { coordinatorId: true } } } });
  if (!home) throw new Error("Student not found.");
  const counts = a.creditStatus === "APPROVED" || a.creditStatus === "RECOGNISED";
  const hc = counts && a.creditAsCourseId ? await prisma.masterCourse.findUnique({ where: { id: a.creditAsCourseId }, select: { code: true, title: true, creditHours: true, category: true } }) : null;
  const host = await prisma.user.findUnique({ where: { id: a.hostChairmanId }, select: { instituteName: true, name: true } });
  const scale = new Map((await prisma.gradingScale.findMany({ where: { coordinatorId: home.batch.coordinatorId }, orderBy: [{ effectiveFromYear: "desc" }] })).map((g) => [g.letter.toUpperCase(), g.gpaValue]));
  const cv = convert(rec.grade, rec.gpaPoints, await agreementMap(a), scale);
  const created = await prisma.studentTranscriptRecord.create({ data: {
    studentId: a.studentId, coordinatorId: home.batch.coordinatorId,
    courseCode: hc?.code || rec.courseCode, courseTitle: `${hc?.title || rec.courseTitle} — taken at ${host?.instituteName || host?.name || "a consortium university"}${hc ? "" : " (not for credit)"}`,
    creditHours: hc ? hc.creditHours : 0, courseType: hc?.category || "Consortium (not for credit)",
    termName: rec.termName, termYear: rec.termYear, totalPct: rec.totalPct, grade: rec.grade, gpaPoints: cv.points,
    cloAttainmentJson: rec.cloAttainmentJson, ploAttainmentJson: "[]",
  } });
  await cdb.consortiumTransfer.create({ data: { applicationId: a.id, hostRecordId: rec.id, homeRecordId: created.id, hostGrade: rec.grade, hostPoints: rec.gpaPoints, homePoints: cv.points, basis: cv.basis, byId: user.id } });
  await writeAuditLog({ actorUserId: user.id, action: "CONSORTIUM_RESULT_TRANSFERRED", entityType: "StudentTranscriptRecord", entityId: created.id, metadata: { applicationId: a.id, grade: rec.grade, points: cv.points, basis: cv.basis } });
  return `On the transcript: ${rec.grade}${cv.points != null ? ` (${cv.points} points, by ${cv.basis})` : ""}${hc ? ` as ${hc.code}` : ", not for credit"}.`;
}

/** Save the home university's letter → grade-point map in an agreement. */
export async function saveGradeMap(user: { id: string; role: string }, agreementId: string, text: string) {
  const me = await institutionOf(user);
  if (user.role !== "CHAIRMAN") throw new Error("The Chairman sets the grade conversion.");
  const parties = (await cdb.consortiumAgreementParty.findMany({ where: { agreementId } })) as { chairmanId: string }[];
  if (!parties.some((p) => p.chairmanId === me)) throw new Error("Not found.");
  const map: Record<string, number> = {};
  for (const part of text.split(/[,;\n]+/)) {
    const m = part.trim().match(/^([A-Za-z][+-]?)\s*[=:]\s*(\d(?:\.\d+)?)$/);
    if (!part.trim()) continue;
    if (!m) throw new Error(`"${part.trim()}" — write it as A=4.0, A-=3.67, …`);
    map[m[1].toUpperCase()] = Number(m[2]);
  }
  const ag = (await cdb.consortiumAgreement.findUnique({ where: { id: agreementId } })) as { gradeMapJson: string };
  const all = j<Record<string, Record<string, number>>>(ag.gradeMapJson, {});
  all[me!] = map;
  await cdb.consortiumAgreement.update({ where: { id: agreementId }, data: { gradeMapJson: JSON.stringify(all) } });
  await writeAuditLog({ actorUserId: user.id, action: "CONSORTIUM_GRADE_MAP", entityType: "ConsortiumAgreement", entityId: agreementId, metadata: map });
  return `Grade conversion saved (${Object.keys(map).length} letters).`;
}
