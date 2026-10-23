import { prisma } from "./db";
import { DEMO_HEAD } from "./demoInstitute";
import { rdb } from "./registers";
import { verify, verifyPath } from "./signoff";
import { transcriptDoc, fdpCertificateDoc, statusLetterDoc } from "./signoffDocs";

// Dream University's signed documents: official transcripts issued by the Controller of Examinations (one withdrawn
// and re-issued), FDP certificates, the letters for applied status changes, and a few checks in the verification log.
// Documents already issued keep their numbers, so running it again adds nothing new.
export async function campusSignoff() {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!head) throw new Error("Build the demo institute first.");
  const H = head.id;
  try { await rdb.signedDocument.count(); } catch { throw new Error("Run prisma/migration_signoff.sql first."); }
  const exam = await prisma.user.findUnique({ where: { username: "dream.omc" }, select: { id: true } });
  const issuer = { userId: exam?.id || H, exam: !!exam };
  const before = await rdb.signedDocument.count({ where: { chairmanId: H } });
  const done: string[] = [];
  const students = await prisma.student.findMany({ where: { rollNumber: { in: ["DRM-CS-24-010", "DRM-CS-24-011", "DRM-AI-24-005", "DRM-BB-24-004"] } }, select: { id: true, rollNumber: true } });
  const issued: { docNo: string; hash: string }[] = [];
  for (const s of students) { const d = await transcriptDoc(H, s.id, issuer); if (d?.issued) issued.push({ docNo: d.issued.docNo, hash: d.issued.hash }); }
  // One transcript withdrawn (issued with a mistake) — the next print gets a fresh number.
  const ai = students.find((s) => s.rollNumber === "DRM-AI-24-005");
  if (ai && !(await rdb.signedDocument.count({ where: { chairmanId: H, sourceRef: `transcript:${ai.id}`, revokedAt: { not: null } } }))) {
    const d = await rdb.signedDocument.findFirst({ where: { chairmanId: H, sourceRef: `transcript:${ai.id}`, revokedAt: null } });
    if (d) { await rdb.signedDocument.update({ where: { id: d.id }, data: { revokedAt: new Date(), revokedById: issuer.userId, revokeReason: "Issued before a grade change was approved; replaced by a new copy." } }); await transcriptDoc(H, ai.id, issuer); done.push(`transcript ${d.docNo} withdrawn and re-issued`); }
  }
  const t4 = await prisma.user.findUnique({ where: { username: "dream.t4" }, select: { id: true } });
  const atts = t4 ? ((await rdb.fdpAttendance.findMany({ where: { userId: t4.id, attended: true }, take: 2 }).catch(() => [])) as { id: string }[]) : [];
  for (const a of atts) await fdpCertificateDoc(a.id, t4?.id || null);
  const reqs = (await rdb.studentStatusRequest.findMany({ where: { chairmanId: H, status: { in: ["APPROVED", "APPLIED"] } }, take: 3 }).catch(() => [])) as { id: string }[];
  for (const r of reqs) await statusLetterDoc(r.id, issuer.userId);
  // A few checks: an employer scanning a genuine transcript, and a copy whose code was tampered with.
  if (!(await rdb.documentVerification.count({ where: { docNo: { in: issued.map((i) => i.docNo).concat(["none"]) } } })) && issued[0]) {
    await verify(issued[0].docNo, issued[0].hash.slice(0, 16), { userAgent: "Employer (QR scan)" });
    if (issued[1]) await verify(issued[1].docNo, issued[1].hash.slice(0, 16), { userAgent: "Employer (QR scan)" });
    await verify(issued[0].docNo, "deadbeefdeadbeef", { userAgent: "Edited copy" });
    done.push("4 verification checks");
  }
  const after = await rdb.signedDocument.count({ where: { chairmanId: H } });
  done.unshift(`${after - before} new signed document(s) (${after} in all)${issued[0] ? `; try ${verifyPath(issued[0].docNo, issued[0].hash)}` : ""}`);
  return done;
}
