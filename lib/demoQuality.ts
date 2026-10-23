import { randomUUID } from "crypto";
import { prisma } from "./db";
import { DEMO_HEAD } from "./demoInstitute";
import { qadb } from "./qaOffice";
import { xdb } from "./examController";

// Dream University: the Quality Office registers and the Controller of Examinations' work, so every new page has data.
export async function campusQuality() {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!head) throw new Error("Build the demo institute first.");
  const H = head.id;
  try { if (await qadb.qaRecord.count({ where: { chairmanId: H } })) return ["Quality Office demo already there"]; } catch { throw new Error("Run prisma/migration_qa_office.sql first."); }
  const by = H;
  const add = async (kind: string, data: Record<string, unknown>, refId: string | null = null) => { const id = randomUUID(); await qadb.qaRecord.create({ data: { id, chairmanId: H, kind, refId, dataJson: JSON.stringify(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]))), createdById: by, updatedById: by } }); return id; };
  const y = new Date().getFullYear();
  const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const depts = await prisma.department.findMany({ where: { chairmanId: H }, select: { id: true, name: true } });
  const cs = depts.find((d) => /comput/i.test(d.name)) || depts[0];
  const lead = await prisma.user.findFirst({ where: { managedById: H, role: "PROGRAM_COORDINATOR" }, select: { id: true } });
  const progs = Array.from(new Set((await prisma.batch.findMany({ where: { coordinator: { managedById: H } }, select: { degreeProgram: true } })).map((b) => b.degreeProgram)));
  const out: string[] = [];

  await add("QA_PROFILE", { name: "Quality Enhancement Cell, Dream University", vision: "A culture of quality in every program and office of the university.", mission: "To assure and improve the quality of teaching, learning, research and services through self-assessment, feedback and follow-up, in line with HEC's quality framework.", functions: "Program self-assessments; IPE; feedback surveys; quality awareness; PQR registrations; reports to HEC QAA.", ipeTeam: "Dr. Convener — QEC Convener (lead)\nDean of Computing — member\nRegistrar — member\nTreasurer — member\nStudent representative — member" });
  const prop = await add("PROGRAM_PROPOSAL", { programName: "BS Data Science", shortCode: "BSDS", level: "UG16", departmentId: cs?.id || "", leadId: lead?.id || "", council: "NCEAC", launchTerm: `Fall ${y + 1}`, seats: 50, demand: "Strong demand from software houses and banks; 300+ enquiries in the last admission cycle.", faculty: "6 existing CS faculty can teach the core; 2 new posts in statistics and machine learning.", labs: "Existing computing labs; one GPU lab to be set up (budgeted).", budget: 18000000, status: "In approval" });
  await add("STAGES", { FEASIBILITY_date: day(-120), FEASIBILITY_minute: "QEC/FS/12", FEASIBILITY_decision: "Approved", BOS_date: day(-90), BOS_minute: "BOS-CS-2026-03 item 4", BOS_decision: "Approved", BOF_date: day(-60), BOF_minute: "BOF-COMP-2026-02 item 7", BOF_decision: "Approved", AC_date: day(-20), AC_minute: "AC-41 item 11", AC_decision: "Approved", NOC_note: "NOC applied; HEC visit expected next month" }, prop);
  out.push("A new program proposal (BS Data Science) through Academic Council, waiting for the HEC NOC");
  for (const p of progs) await add("PQR", { program: p, nqfLevel: "6", credits: /BBA/.test(p) ? 136 : 133, regNo: /BBA/.test(p) ? "" : `PQR-6-${Math.floor(10000 + Math.random() * 89999)}`, status: /BBA/.test(p) ? "Submitted" : "Registered", registeredOn: /BBA/.test(p) ? "" : day(-400), renewalDue: /BBA/.test(p) ? "" : day(1400) });
  out.push(`${progs.length} PQR registrations`);
  await add("CITIZEN", { ticketNo: "PMDU-2026-118734", receivedOn: day(-12), complainant: "Parent of a BS CS student", subject: "Delay in result of Fall semester", details: "Result of semester 3 not shown on the portal.", departmentId: cs?.id || "", handler: "Controller of Examinations", replyBy: day(-2), status: "In progress" });
  await add("CITIZEN", { ticketNo: "PMDU-2026-109221", receivedOn: day(-40), complainant: "Student", subject: "Hostel fee refund", details: "Refund after leaving the hostel not received.", handler: "Treasurer", replyBy: day(-30), status: "Replied", response: "Refund processed through the bank on the 15th.", repliedOn: day(-31) });
  out.push("2 Citizen Portal complaints (one overdue)");
  for (const [t, d, a, n] of [["OBE and your transcript — what CLOs and GAs mean", -70, "Students", 140], ["Self-assessment report writing for QA staff", -45, "QA staff", 12], ["How course feedback improves teaching", -15, "Students", 95]] as const) await add("AWARENESS", { title: t, date: day(d), audience: a, facilitator: "QEC Convener", attendees: n });
  out.push("3 quality awareness sessions");
  await add("RANKING", { ranking: "HEC", year: y - 1, faculty: 48, phdFaculty: 19, students: 1650, intlStudents: 4, intlFaculty: 1, publications: 61, citations: 410, employers: 37, graduates: 290, employed: 214, status: "Submitted" });
  await add("RANKING", { ranking: "QS Asia", year: y, faculty: 52, phdFaculty: 22, students: 1720, intlStudents: 6, intlFaculty: 2, publications: 70, citations: 488, employers: 41, status: "Collecting" });
  out.push("Rankings data for HEC and QS Asia");
  const rev = await add("DEPT_REVIEW", { departmentId: cs?.id || "", year: y, reviewer: "Prof. External Reviewer, a public sector university", visitDate: day(-30), teaching: "OBE fully in place; CLO attainment used in CQI. Too few industry guest lectures.", research: "Publications rising; few funded projects.", staffing: "Student-teacher ratio within NCEAC limit; two posts vacant.", resources: "Labs adequate; GPU resources needed for AI courses.", results: "Pass rates good except Calculus and Discrete Structures.", overall: "Satisfactory", status: "Actions in progress" });
  for (const [a, o, d, s] of [["Fill the two vacant faculty posts", "Head of Department", day(60), "Open"], ["Set up the GPU lab", "Director IT", day(120), "Open"], ["Remedial classes for Calculus", "Program Lead", day(-5), "Done"]] as const) await add("ACTION", { action: a, owner: o, due: d, status: s }, rev);
  out.push("A department review with its action plan");
  await add("AFFILIATE", { name: "Dream College of Commerce", city: "Sargodha", principal: "Prof. Principal", status: "Renewal due", affiliatedOn: day(-1100), renewalDue: day(20), programs: "BBA (Hons), ADP Commerce", lastInspection: day(-300), inspection: "Library short of titles; otherwise compliant." });
  const plan = await add("QA_PLAN", { year: y, targets: "All programs' SARs this year; IPE self-assessment complete; feedback response rate above 70%.", budget: 1500000, status: "Approved" });
  for (const [a, o, d, s] of [["Program SARs for BS CS and BBA", "QEC Convener", day(-10), "Done"], ["IPE self-assessment report", "IPE team", day(45), "Open"], ["Student feedback drive (two weeks)", "QEC members", day(15), "Open"]] as const) await add("ACTION", { action: a, owner: o, due: d, status: s }, plan);
  for (const [n, a] of [[2, "Approve the five-year strategic plan with measurable targets"], [7, "Add a backup power line for the data centre"], [10, "Publish the QEC annual report on the website"]] as const) await add("ACTION", { action: a, owner: "Institute Head", due: day(90), status: "Open" }, `IPE-${n}`);
  out.push("QA plan, an affiliated college and IPE actions");

  // Controller of Examinations: publish two approved results with a re-checking window and one re-check request.
  try {
    const approved = (await xdb.courseResult.findMany({ where: { status: "APPROVED", courseId: { in: (await prisma.course.findMany({ where: { coordinator: { managedById: H }, isOffered: true }, select: { id: true } })).map((c) => c.id) } }, take: 2, select: { courseId: true } })) as { courseId: string }[];
    for (const r of approved) await xdb.resultPublication.upsert({ where: { courseId: r.courseId }, create: { courseId: r.courseId, chairmanId: H, publishedById: H, recheckUntil: new Date(Date.now() + 7 * 864e5) }, update: {} });
    const en = approved[0] ? await prisma.studentEnrollment.findFirst({ where: { courseId: approved[0].courseId }, select: { studentId: true } }) : null;
    if (en) await xdb.resultRecheck.upsert({ where: { courseId_studentId: { courseId: approved[0].courseId, studentId: en.studentId } }, create: { id: randomUUID(), chairmanId: H, courseId: approved[0].courseId, studentId: en.studentId, reason: "I think Q3 of the final paper was not counted in my total." }, update: {} });
    out.push(`${approved.length} result(s) published with a re-checking request`);
  } catch { out.push("Controller demo skipped — run prisma/migration_exam_controller.sql"); }
  return out;
}

/** Dream University on two campuses, fee payment details and clearance rules, and a student's reported payment. */
export async function campusMultiFees() {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!head) throw new Error("Build the demo institute first.");
  const H = head.id;
  const db = prisma as unknown as Record<string, any>;
  const out: string[] = [];
  try {
    if (!(await db.campus.count({ where: { chairmanId: H } }))) {
      const id = randomUUID();
      await db.campus.create({ data: { id, chairmanId: H, name: "City Campus", city: "Lahore", code: "CC" } });
      const bba = await prisma.batch.findMany({ where: { coordinator: { managedById: H }, degreeProgram: { contains: "BBA" } }, select: { id: true } });
      for (const b of bba) await db.campusLink.upsert({ where: { kind_refId: { kind: "BATCH", refId: b.id } }, create: { kind: "BATCH", refId: b.id, campusId: id }, update: { campusId: id } });
      const rooms = await prisma.room.findMany({ where: { chairmanId: H }, select: { id: true }, orderBy: { name: "desc" }, take: 3 });
      for (const r of rooms) await db.campusLink.upsert({ where: { kind_refId: { kind: "ROOM", refId: r.id } }, create: { kind: "ROOM", refId: r.id, campusId: id }, update: { campusId: id } });
      out.push(`City Campus with ${bba.length} BBA batch(es) and ${rooms.length} rooms`);
    }
    await db.financeSetting.upsert({ where: { chairmanId: H }, create: { chairmanId: H, bankJson: JSON.stringify({ bank: "Bank Alfalah", branch: "Gulberg, Lahore", title: "Dream University Fee Account", account: "0123-4567890-1", iban: "PK36ALFH0123004567890123", jazzcash: "Till 00123456", easypaisa: "Till 7654321", onebill: "DREAMUNI" }), blockAdmitCard: true, blockRegistration: false, blockDegree: true, minDue: 5000 }, update: {} });
    out.push("Fee payment details; admit cards and degrees held for dues above Rs 5,000");
    const inv = (await db.feeInvoice.findFirst({ where: { chairmanId: H, status: "UNPAID" }, select: { id: true, studentId: true, amount: true } })) as { id: string; studentId: string; amount: number } | null;
    if (inv && !(await db.paymentClaim.count({ where: { invoiceId: inv.id } }))) {
      await db.paymentClaim.create({ data: { id: randomUUID(), chairmanId: H, invoiceId: inv.id, studentId: inv.studentId, amount: Math.round(inv.amount / 2), method: "JAZZCASH", reference: `JC${Date.now().toString().slice(-9)}`, paidOn: new Date() } });
      out.push("A JazzCash payment reported by a student, waiting for Finance");
    }
  } catch { throw new Error("Run prisma/migration_batch5.sql first."); }
  return out;
}
