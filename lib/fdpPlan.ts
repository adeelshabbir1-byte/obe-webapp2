import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";
import { notifyUsers } from "./notifications";
import { markAttendance } from "./fdp";
import { checkPlan, daysOf, planHours, fmtTime, PROVISION_LABEL, type Plan } from "./fdpPlanCore";

// FDP trainings over several days (Prompt 10, section 7): start and end dates with times per day, what the university
// provides (transport, food, residence, TA/DA, registration fee, official on-duty status with its letter), nominations
// the teacher's HOD approves, attendance per day and an uploaded certificate. Attendance feeds the existing FDP hours
// (teacher profile, council report, accreditation evidence).

const db = prisma as unknown as Record<string, any>;
type Who = { id: string; role: string; name: string; managedById: string | null; departmentId?: string | null };

export async function planOf(sessionId: string): Promise<Plan | null> {
  const r = await db.fdpSessionPlan?.findUnique({ where: { sessionId } }).catch(() => null);
  try { return r ? (JSON.parse(r.planJson) as Plan) : null; } catch { return null; }
}
async function session(chairmanId: string, sessionId: string) {
  const s = await db.fdpSession.findUnique({ where: { id: sessionId } });
  if (!s || s.chairmanId !== chairmanId) throw new Error("Training not found.");
  return s as { id: string; title: string; date: Date; hours: number; venue: string | null; facilitator: string | null; kind: string };
}

/** Dates, per-day times and provisions; the session's date and hours follow the days. */
export async function savePlan(chairmanId: string, sessionId: string, p: Plan, by: string) {
  await session(chairmanId, sessionId);
  const probs = checkPlan(p);
  if (probs.length) throw new Error(probs.join(" "));
  const days = daysOf(p);
  const plan: Plan = { ...p, days: p.same ? [] : days };
  await db.fdpSessionPlan.upsert({ where: { sessionId }, create: { sessionId, planJson: JSON.stringify(plan), updatedById: by }, update: { planJson: JSON.stringify(plan), updatedById: by, updatedAt: new Date() } });
  await db.fdpSession.update({ where: { id: sessionId }, data: { date: new Date(`${p.startDate}T00:00:00Z`), hours: planHours(p) } });
  return { days: days.length, hours: planHours(p) };
}

/** HODs who approve a teacher's nomination: the HOD of the teacher's department (else the Institute Head). */
async function approversOf(chairmanId: string, userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { departmentId: true } });
  const hods = u?.departmentId ? await prisma.user.findMany({ where: { role: "HEAD_OF_DEPARTMENT" as never, departmentId: u.departmentId, isActive: true }, select: { id: true } }) : [];
  return hods.length ? hods.map((h) => h.id) : [chairmanId];
}
export async function nominate(chairmanId: string, sessionId: string, userIds: string[], by: Who) {
  const s = await session(chairmanId, sessionId);
  let n = 0;
  for (const userId of Array.from(new Set(userIds))) {
    if (await db.fdpNomination.findFirst({ where: { sessionId, userId } })) continue;
    await db.fdpNomination.create({ data: { id: randomUUID(), sessionId, userId, status: "PENDING", nominatedById: by.id } });
    const name = (await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name || "A teacher";
    await notifyUsers(await approversOf(chairmanId, userId), { kind: "FDP", title: `Approve a nomination: ${name} for "${s.title}"`, body: `${by.name} nominated ${name}.`, href: "/fdp", exceptId: by.id }).catch(() => null);
    n++;
  }
  return n;
}
export async function decideNomination(chairmanId: string, nominationId: string, approve: boolean, reason: string, by: Who) {
  const nom = await db.fdpNomination.findUnique({ where: { id: nominationId } });
  if (!nom) throw new Error("Nomination not found.");
  const s = await session(chairmanId, nom.sessionId);
  if (!(await approversOf(chairmanId, nom.userId)).includes(by.id) && by.role !== "CHAIRMAN") throw new Error("Only the teacher's Head of Department approves the nomination.");
  if (!approve && reason.trim().length < 3) throw new Error("Give the reason.");
  await db.fdpNomination.update({ where: { id: nominationId }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: by.id, decidedAt: new Date(), reason: reason.trim().slice(0, 500) || null } });
  await notifyUsers([nom.userId], { kind: "FDP", title: approve ? `You are nominated for "${s.title}"` : `Nomination for "${s.title}" not approved`, body: approve ? "Your on-duty letter is on the FDP page." : reason, href: "/fdp" }).catch(() => null);
  await writeAuditLog({ actorUserId: by.id, action: approve ? "FDP_NOMINATION_APPROVED" : "FDP_NOMINATION_REJECTED", entityType: "FdpSession", entityId: s.id, metadata: { userId: nom.userId } });
}
/** Attendance for one day; anyone present on a day counts as having attended (hours and certificate number). */
export async function dayAttendance(chairmanId: string, sessionId: string, date: string, present: string[], by: string) {
  await session(chairmanId, sessionId);
  const approved = ((await db.fdpNomination.findMany({ where: { sessionId, status: "APPROVED" } })) as { userId: string }[]).map((n) => n.userId);
  const keep = present.filter((u) => approved.includes(u) || !approved.length);
  await db.fdpDayAttendance.deleteMany({ where: { sessionId, date } });
  if (keep.length) await db.fdpDayAttendance.createMany({ data: keep.map((userId) => ({ id: randomUUID(), sessionId, userId, date, markedById: by })) });
  const all = Array.from(new Set(((await db.fdpDayAttendance.findMany({ where: { sessionId }, select: { userId: true } })) as { userId: string }[]).map((x) => x.userId)));
  await markAttendance(chairmanId, sessionId, all);
  return keep.length;
}
export async function saveCertificate(chairmanId: string, sessionId: string, userId: string, file: File, by: Who) {
  await session(chairmanId, sessionId);
  if (by.id !== userId && !["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"].includes(by.role)) throw new Error("Upload your own certificate.");
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > 5_000_000) throw new Error("The file is too big (5 MB at most).");
  let ref: string;
  try { const { storePrivate } = await import("./sampleStorage"); ref = await storePrivate(buf, file.name, file.type || "application/pdf", "fdp-certificates"); }
  catch { if (buf.length > 1_500_000) throw new Error("File storage is not set up; files over 1.5 MB cannot be kept."); ref = `data:${file.type || "application/pdf"};base64,${buf.toString("base64")}`; }
  await db.fdpCertificate.deleteMany({ where: { sessionId, userId } });
  await db.fdpCertificate.create({ data: { id: randomUUID(), sessionId, userId, fileName: file.name.slice(0, 200), fileRef: ref, uploadedById: by.id } });
}
export async function certificateFile(sessionId: string, userId: string) {
  const c = await db.fdpCertificate.findFirst({ where: { sessionId, userId } });
  if (!c) return null;
  const { readStored } = await import("./sampleStorage");
  const f = await readStored(c.fileRef);
  return f ? { ...f, name: c.fileName as string } : null;
}

/** Everything the FDP page shows for one training. */
export async function detailsOf(sessionIds: string[]) {
  const [plans, noms, days, certs] = await Promise.all([
    db.fdpSessionPlan?.findMany({ where: { sessionId: { in: sessionIds.concat("none") } } }).catch(() => []) || [],
    db.fdpNomination?.findMany({ where: { sessionId: { in: sessionIds.concat("none") } } }).catch(() => []) || [],
    db.fdpDayAttendance?.findMany({ where: { sessionId: { in: sessionIds.concat("none") } } }).catch(() => []) || [],
    db.fdpCertificate?.findMany({ where: { sessionId: { in: sessionIds.concat("none") } }, select: { sessionId: true, userId: true, fileName: true } }).catch(() => []) || [],
  ]);
  return { plans: plans as { sessionId: string; planJson: string }[], noms: noms as { id: string; sessionId: string; userId: string; status: string; reason: string | null }[], days: days as { sessionId: string; userId: string; date: string }[], certs: certs as { sessionId: string; userId: string; fileName: string }[] };
}

/** The official on-duty letter (PDF) for a nominated teacher. */
export async function onDutyLetter(chairmanId: string, sessionId: string, userId: string) {
  const s = await session(chairmanId, sessionId);
  const p = await planOf(sessionId);
  const [u, head] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, department_: { select: { name: true } } } }),
    prisma.user.findUnique({ where: { id: chairmanId }, select: { instituteName: true, name: true } }),
  ]);
  const prof = await db.facultyProfile?.findUnique({ where: { userId }, select: { designation: true } }).catch(() => null);
  const nom = await db.fdpNomination?.findFirst({ where: { sessionId, userId } }).catch(() => null);
  const { PdfDoc } = await import("./pdfDoc");
  const pdf = await PdfDoc.create(`${head?.instituteName || ""} — on-duty letter`);
  const today = new Date().toISOString().slice(0, 10);
  pdf.title(head?.instituteName || "Office order", `Office order · ${today}`);
  pdf.text("Subject: Official duty for faculty development", { bold: true, gap: 8 });
  const days = p ? daysOf(p) : [];
  const when = days.length ? (days.length === 1 ? `on ${days[0].date}` : `from ${days[0].date} to ${days[days.length - 1].date}`) : `on ${s.date.toISOString().slice(0, 10)}`;
  pdf.text(`${u?.name || "The teacher"}${prof?.designation ? `, ${prof.designation}` : ""}${u?.department_?.name ? `, ${u.department_.name}` : ""}, is hereby allowed to attend "${s.title}"${s.venue ? ` at ${s.venue}` : ""} ${when}, and will be treated as on official duty for these days.`, { gap: 6 });
  if (days.length) pdf.table([["Day", 120], ["From", 90], ["To", 90]], days.map((d) => [d.date, fmtTime(d.start), fmtTime(d.end)]), { size: 9 });
  const prov = p?.provisions;
  if (prov) {
    const rows = (Object.keys(PROVISION_LABEL) as (keyof typeof PROVISION_LABEL)[]).filter((k) => prov[k]).map((k) => [PROVISION_LABEL[k], String(prov[k])]);
    if (rows.length) { pdf.text("The university provides:", { bold: true, gap: 6 }); pdf.kv(rows as [string, string][]); }
    if (prov.notes) pdf.note(prov.notes);
  }
  if (nom?.status === "APPROVED") pdf.note("The nomination has been approved by the Head of Department.");
  pdf.text(" ", { gap: 30 });
  pdf.text("Head of Department: ______________________          Date: __________", { size: 9.5 });
  return { bytes: await pdf.save(), name: `on-duty-${(u?.name || "teacher").replace(/[^A-Za-z0-9]+/g, "-")}.pdf` };
}
