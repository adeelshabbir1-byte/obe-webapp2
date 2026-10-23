import { randomUUID } from "crypto";
import { prisma } from "./db";
import { DEMO_HEAD } from "./demoInstitute";
import { rdb } from "./registers";
import { openRefundCase } from "./feeRefunds";
import { nextSerial } from "./degrees";

// Dream University's institute registers (items 11–20): a QAA self-assessment of BBA at the implementation stage,
// plagiarism checks, a degree register for the 2022 graduates with verification requests, committees (one short of a
// chair), refund cases for the students who left, three students with accommodations, policies with their approval
// trail (one with a gap), study leave / scholarship / grants, and the benefit plans. Each part is skipped when it is
// already there, so running it again changes nothing.

const d = (s: string) => new Date(`${s}T00:00:00Z`);

export async function campusRegisters() {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!head) throw new Error("Build the demo institute first.");
  const H = head.id;
  const users = await prisma.user.findMany({ where: { username: { startsWith: "dream." } }, select: { id: true, username: true, name: true } });
  const u = (x: string) => users.find((y) => y.username === x);
  const done: string[] = [];
  const has = async (model: string, where: Record<string, unknown>) => { try { return (await rdb[model].count({ where })) > 0; } catch { return true; } };

  // 11. QAA self-assessment of BBA, at the implementation stage.
  if (!(await has("qaaCycle", { chairmanId: H }))) {
    const id = randomUUID();
    await rdb.qaaCycle.create({ data: { id, chairmanId: H, program: "BBA (Hons)", title: "Self-assessment 2026", createdById: H, ptFormedAt: d("2026-03-02"), sarDueAt: d("2026-05-31"), sarSubmittedAt: d("2026-05-28"), atVisitAt: d("2026-07-09"), atReportAt: d("2026-07-24"), planApprovedAt: d("2026-08-12"),
      programTeamJson: JSON.stringify([{ userId: u("dream.lead.bba")?.id, name: u("dream.lead.bba")?.name, role: "Convener" }, { userId: u("dream.b4")?.id, name: u("dream.b4")?.name, role: "Member" }, { userId: u("dream.b1")?.id, name: u("dream.b1")?.name, role: "Member" }]),
      assessmentTeamJson: JSON.stringify([{ name: "Dr. Kashif Mehmood", role: "Chair", organisation: "Dream University (Computing)" }, { name: "Prof. Rubina Khan", role: "External member", organisation: "Quaid-i-Azam University" }, { name: u("dream.t3")?.name, role: "QEC representative" }]),
      documentsJson: JSON.stringify([{ label: "Self-Assessment Report (BBA) 2026", url: "/accreditation/nbeac", at: "2026-05-28T00:00:00Z" }, { label: "Assessment Team report", url: "/qaa", at: "2026-07-24T00:00:00Z" }]),
      atSummary: "Strengths: committed faculty, active case-study teaching, good industry links. Areas to improve: course files are not complete for every course; the PEO survey response from employers is low; the student–teacher ratio in two sections exceeds 40; the CQI loop is not documented for every course." } });
    const acts = [
      ["Course files are incomplete for several courses.", "Complete the course file of every course (Course Files page) and check each semester.", "dream.lead.bba", "2026-11-30", 60, "IN_PROGRESS"],
      ["Low employer response to the PEO survey.", "Send the employer survey through the placement office and follow up by phone.", "dream.b4", "2026-10-15", 30, "IN_PROGRESS"],
      ["Two sections exceed 40 students.", "Split the large sections from Spring 2027 (timetable).", "dream.hod.bba", "2027-01-15", 0, "OPEN"],
      ["CQI not documented for every course.", "Record a CQI action for each course below its CLO target.", "dream.b1", "2026-09-30", 100, "DONE"],
    ] as const;
    for (const [finding, action, owner, due, pct, status] of acts) await rdb.qaaAction.create({ data: { id: randomUUID(), cycleId: id, finding, action, ownerId: u(owner)?.id || null, dueDate: d(due), progressPct: pct, status, doneAt: status === "DONE" ? d("2026-09-25") : null, progressNote: pct ? "Work under way; see the department meeting minutes." : null } });
    done.push("QAA self-assessment of BBA with 4 actions");
  }

  // 12. Plagiarism records.
  if (!(await has("plagiarismRecord", { chairmanId: H }))) {
    const recs = [
      ["FYP", "Smart attendance system using face recognition", "DRM-CS-18-001, DRM-CS-18-002", "BS Computer Science", 8, 2, "ACCEPTED", null, "dream.t3"],
      ["FYP", "Urdu text summarisation with transformers", "DRM-CS-18-003, DRM-CS-18-004", "BS Computer Science", 14, 4, "ACCEPTED", null, "dream.t6"],
      ["FYP", "Inventory app for small retailers", "DRM-CS-18-005", "BS Computer Science", 23, 9, "REVISE", "Chapter 2 rewritten with citations; re-checked at 12%.", "dream.t4"],
      ["PAPER", "A survey of federated learning for health records", "Dr. Iqra Mirza", null, 11, 3, "ACCEPTED", null, null],
      ["FYP", "Microfinance demand in rural Punjab", "DRM-BB-18-011", "BBA (Hons)", 31, 18, "MISCONDUCT", "Referred to the discipline committee; the project was graded F.", "dream.b2"],
      ["THESIS", "Customer loyalty in Pakistani telecom", "MS scholar (2025)", "BBA (Hons)", 17, 4, "ACCEPTED", null, "dream.b4"],
    ] as const;
    for (const [kind, title, authors, program, sim, single, decision, action, sup] of recs) await rdb.plagiarismRecord.create({ data: { id: randomUUID(), chairmanId: H, kind, title, authors, program, similarityPct: sim, singleSourcePct: single, thresholdPct: 19, decision, actionTaken: action, supervisorId: sup ? u(sup)?.id || null : null, checkedAt: d(kind === "PAPER" ? "2026-03-11" : "2025-06-20"), createdById: u("dream.t3")?.id || H } });
    done.push("6 plagiarism records");
  }

  // 13. Degree register for the 2022 graduates (issued before OBEHUB), a convocation and verification requests.
  if (!(await has("degreeIssue", { chairmanId: H }))) {
    const conv = randomUUID();
    await rdb.convocation.create({ data: { id: conv, chairmanId: H, title: "3rd Convocation", date: d("2022-12-15"), venue: "Main Auditorium" } });
    await rdb.convocation.create({ data: { id: randomUUID(), chairmanId: H, title: "4th Convocation", date: d("2027-01-20"), venue: "Main Auditorium" } });
    const alumni = await prisma.alumni.findMany({ where: { chairmanId: H, graduationYear: 2022 }, orderBy: { rollNumber: "asc" }, take: 12, select: { name: true, rollNumber: true, degreeProgram: true } });
    let first = "";
    for (const a of alumni) {
      const serial = await nextSerial(H, 2022);
      if (!first) first = serial;
      await rdb.degreeIssue.create({ data: { id: randomUUID(), chairmanId: H, rollNumber: a.rollNumber, studentName: a.name, program: a.degreeProgram, degreeTitle: a.degreeProgram, cgpa: Math.round((2.6 + ((a.rollNumber.charCodeAt(a.rollNumber.length - 1) % 10) / 10) * 1.2) * 100) / 100, serialNo: serial, issuedAt: d("2022-11-30"), convocationId: conv, issuedById: H } });
    }
    const a0 = alumni[0], a1 = alumni[1];
    if (a0) await rdb.degreeVerification.create({ data: { id: randomUUID(), chairmanId: H, requesterKind: "HEC", requesterName: "HEC Degree Attestation Section", reference: "DAS-2026-44871", serialNo: first, rollNumber: a0.rollNumber, studentName: a0.name, receivedAt: d("2026-09-02"), degreeIssueId: (await rdb.degreeIssue.findFirst({ where: { chairmanId: H, serialNo: first } }))?.id, response: "VERIFIED", responseNote: "Verified against the degree register.", respondedAt: d("2026-09-04"), respondedById: H, createdById: H } });
    if (a1) await rdb.degreeVerification.create({ data: { id: randomUUID(), chairmanId: H, requesterKind: "EMPLOYER", requesterName: "Systems Limited, Lahore", reference: "HR/BGC/1092", rollNumber: a1.rollNumber, studentName: `${a1.name.split(" ")[0]} Ahmed`, receivedAt: d("2026-10-10"), degreeIssueId: (await rdb.degreeIssue.findFirst({ where: { chairmanId: H, rollNumber: a1.rollNumber } }))?.id, createdById: H } });
    await rdb.degreeVerification.create({ data: { id: randomUUID(), chairmanId: H, requesterKind: "EMPLOYER", requesterName: "NetSol Technologies", reference: "VER-7781", rollNumber: "DRM-CS-17-099", studentName: "Ali Raza", receivedAt: d("2026-10-18"), createdById: H } });
    done.push(`degree register (${alumni.length} graduates of 2022), 2 convocations, 3 verification requests`);
  }

  // 15. Committees (before 17: the disability focal person keeps the register).
  if (!(await has("committee", { chairmanId: H }))) {
    const add = async (kind: string, name: string, policyRef: string, members: [string | null, string, string, string | null, string | null][], start = "2025-09-01", end = "2027-08-31") => {
      const id = randomUUID();
      await rdb.committee.create({ data: { id, chairmanId: H, kind, name, policyRef, termStart: d(start), termEnd: d(end) } });
      for (const [user, name2, role, gender, org] of members) await rdb.committeeMember.create({ data: { id: randomUUID(), committeeId: id, userId: user ? u(user)?.id || null : null, name: user ? u(user)?.name || name2 : name2, role, gender, organisation: org, fromDate: d(start) } });
      return id;
    };
    const har = await add("HARASSMENT", "Inquiry Committee on Harassment", "Notification DU/REG/2025/118", [["dream.hod.bba", "", "CHAIR", "Female", null], ["dream.t6", "", "MEMBER", "Male", null], [null, "Ms. Sadia Rehman (advocate)", "EXTERNAL", "Female", "Islamabad Bar"]]);
    await rdb.committeeMeeting.create({ data: { id: randomUUID(), committeeId: har, date: d("2026-02-18"), agenda: "Case HAR-2026-001: hearing of both parties", decisions: "Inquiry completed; warning issued; counselling arranged.", attendees: 3, createdById: H } });
    await rdb.committeeCase.create({ data: { id: randomUUID(), committeeId: har, caseNo: "HAR-2026-001", receivedAt: d("2026-02-02"), category: "Verbal", status: "CLOSED", outcome: "Written warning to the respondent; both parties counselled.", closedAt: d("2026-02-25"), createdById: H } });
    await rdb.committeeCase.create({ data: { id: randomUUID(), committeeId: har, caseNo: "HAR-2026-002", receivedAt: d("2026-09-15"), category: "Online / electronic", status: "INQUIRY", notes: "Screenshots received; hearing to be scheduled.", createdById: H } });
    await add("GRIEVANCE", "Student Grievance Committee", "Notification DU/REG/2025/119", [["dream.sa", "", "SECRETARY", "Female", null], ["dream.b2", "", "MEMBER", "Female", null], ["dream.t9", "", "MEMBER", "Female", null]]);
    const dis = await add("DISABILITY", "Disability Focal Person", "HEC Policy for Students with Disabilities (2021)", [["dream.t3", "", "FOCAL", "Female", null]]);
    await rdb.committeeMeeting.create({ data: { id: randomUUID(), committeeId: dis, date: d("2026-08-28"), agenda: "Accommodations for the Fall 2026 midterms", decisions: "Exam office to arrange a ground-floor room and a reader for two students.", attendees: 1, createdById: H } });
    done.push("3 committees with meetings and cases");
  }

  // 16. Refund cases for students whose leaving was applied.
  try {
    const left = await rdb.studentStatusRequest.findMany({ where: { chairmanId: H, status: "APPLIED", type: { in: ["LEFT", "DROPPED", "TRANSFER_OUT"] } } });
    // Their Fall 2026 fee invoice (paid) and the term's first day of classes, so each refund is worked out properly.
    for (const r of left) {
      const st = await prisma.student.findUnique({ where: { id: r.studentId }, select: { batch: { select: { degreeProgram: true, coordinatorId: true } } } });
      if (!st) continue;
      if (!(await prisma.semesterDates.findFirst({ where: { coordinatorId: st.batch.coordinatorId, degreeProgram: st.batch.degreeProgram, termName: "Fall", termYear: 2026 } }))) await prisma.semesterDates.create({ data: { coordinatorId: st.batch.coordinatorId, degreeProgram: st.batch.degreeProgram, termName: "Fall", termYear: 2026, semesterStartDate: d("2026-09-14"), midtermStartDate: d("2026-11-02"), midtermEndDate: d("2026-11-07"), finalStartDate: d("2027-01-04"), finalEndDate: d("2027-01-15") } });
      if (!(await prisma.feeInvoice.count({ where: { studentId: r.studentId } }))) {
        const lines = [{ name: "Tuition fee", amount: 95000, account: "4000" }, { name: "Lab fee", amount: 8000, account: "4020" }, { name: "Examination fee", amount: 4000, account: "4020" }, { name: "Security deposit (refundable)", amount: 10000, account: "2100" }];
        const amount = lines.reduce((t, l) => t + l.amount, 0);
        await prisma.feeInvoice.create({ data: { chairmanId: H, studentId: r.studentId, termName: "Fall", termYear: 2026, linesJson: JSON.stringify(lines), amount, paid: amount, status: "PAID", dueDate: d("2026-09-10") } });
      }
      // A refund case worked out before the invoice existed is worked out again.
      await rdb.feeRefundCase.deleteMany({ where: { statusRequestId: r.id, status: "PENDING", dayNo: null } });
    }
    let n = 0;
    for (const r of left) if (await openRefundCase(r, H)) n++;
    if (n) {
      const first = await rdb.feeRefundCase.findFirst({ where: { chairmanId: H, refundAmount: { gt: 0 }, status: "PENDING" }, orderBy: { createdAt: "asc" } });
      if (first && !(await rdb.feeRefundCase.count({ where: { chairmanId: H, status: "PAID" } }))) await rdb.feeRefundCase.update({ where: { id: first.id }, data: { status: "PAID", decidedById: u("dream.finance")?.id || H, decidedAt: d("2026-10-05"), paidAt: d("2026-10-12"), paymentRef: "CHQ 004512" } });
      done.push(`${n} fee refund case(s)`);
    }
  } catch { /* status changes or refunds not set up */ }

  // 17. Students with accommodations.
  if (!(await has("disabilityRecord", { chairmanId: H }))) {
    const st = await prisma.student.findMany({ where: { batch: { coordinator: { managedById: H } }, status: "ACTIVE" } as never, orderBy: { rollNumber: "asc" }, take: 40, select: { id: true } });
    const pick = [st[3], st[17], st[31]].filter(Boolean);
    const recs = [["Visual impairment", 25, "front row", "large print papers, soft copies of slides", "screen magnifier"], ["Physical / mobility", 0, "ground-floor room, accessible desk", null, null], ["Learning difficulty (e.g. dyslexia)", 25, "separate quiet room for exams", "papers in a clear font", "reader on request"]] as const;
    for (const [i, s] of pick.entries()) { const [category, extra, seating, materials, assistive] = recs[i]; await rdb.disabilityRecord.create({ data: { studentId: s.id, chairmanId: H, category, details: "Medical certificate seen and kept by the focal person.", extraTimePct: extra, seating, materials, assistive, verified: i !== 2, validUntil: d("2027-06-30"), recordedById: u("dream.t3")?.id || H } }); }
    done.push(`${pick.length} students with accommodations`);
  }

  // 18. Policies and curriculum with their approval trail.
  if (!(await has("policyDoc", { chairmanId: H }))) {
    const doc = async (kind: string, title: string, program: string | null, versions: [string, string | null, string | null, string | null, string | null, string | null, string | null, string, string][]) => {
      const id = randomUUID();
      await rdb.policyDoc.create({ data: { id, chairmanId: H, kind, title, program, createdById: H } });
      for (const [v, bm, bmin, bd, am, amin, ad, eff, sum] of versions) await rdb.policyVersion.create({ data: { id: randomUUID(), docId: id, version: v, bosMeeting: bm, bosMinute: bmin, bosDate: bd ? d(bd) : null, acMeeting: am, acMinute: amin, acDate: ad ? d(ad) : null, effectiveFrom: d(eff), summary: sum, link: "https://example.edu.pk/policies", createdById: H } });
    };
    await doc("POLICY", "Examination and Evaluation Policy", null, [["1.0", "9th BoS", "9.4", "2021-03-10", "15th AC", "15.7", "2021-04-02", "2021-09-01", "First version."], ["2.0", "14th BoS", "14.2", "2024-02-20", "22nd AC", "22.3", "2024-03-15", "2024-09-01", "Relative grading rules; re-sit policy; external examiner for final papers."]]);
    await doc("POLICY", "Plagiarism Policy", null, [["1.0", null, null, null, "16th AC", "16.11", "2021-10-05", "2022-01-01", "Adopts the HEC Plagiarism Policy with the 19% limit."]]);
    await doc("CURRICULUM", "BS Computer Science Scheme of Studies", "BS Computer Science", [["2023", "12th BoS", "12.1", "2023-05-18", null, null, null, "2023-09-01", "Aligned with the HEC BS CS curriculum 2023 and the UG Education Policy."]]);
    await doc("POLICY", "Student Grievance Policy", null, [["1.0", "13th BoS", "13.6", "2023-11-08", "20th AC", "20.9", "2023-12-01", "2024-01-01", "Timelines for grievances; appeal to the Vice Chancellor."]]);
    done.push("4 policies / curricula with approval trails (one waiting for Academic Council)");
  }

  // 19. Faculty development funding.
  if (!(await has("fdpFunding", { chairmanId: H }))) {
    const f1 = randomUUID();
    await rdb.fdpFunding.create({ data: { id: f1, chairmanId: H, userId: u("dream.t4")!.id, kind: "STUDY_LEAVE", sponsor: "HEC", sponsorName: "HEC Faculty Development Program", purpose: "PhD Computer Science", place: "Universiti Teknologi Malaysia", country: "Malaysia", feeAmount: 3200000, stipendAmount: 4800000, travelAmount: 350000, sanctionedAt: d("2024-07-20"), startDate: d("2024-09-01"), expectedReturn: d("2028-08-31"), bondYears: 5, status: "ACTIVE", createdById: H } });
    await rdb.fdpProgress.create({ data: { id: randomUUID(), fundingId: f1, term: "Spring 2025", report: "Completed 4 courses (CGPA 3.75); literature review submitted.", submittedById: u("dream.t4")!.id, submittedAt: d("2025-07-05"), reviewNote: "Good progress.", reviewedById: H } });
    await rdb.fdpProgress.create({ data: { id: randomUUID(), fundingId: f1, term: "Spring 2026", report: "Comprehensive exam passed; first conference paper accepted.", submittedById: u("dream.t4")!.id, submittedAt: d("2026-07-02") } });
    await rdb.fdpFunding.create({ data: { id: randomUUID(), chairmanId: H, userId: u("dream.t3")!.id, kind: "SCHOLARSHIP", sponsor: "INSTITUTE", purpose: "PhD Data Science", place: "University of Leeds", country: "United Kingdom", feeAmount: 5500000, stipendAmount: 6200000, travelAmount: 420000, sanctionedAt: d("2019-08-01"), startDate: d("2019-10-01"), expectedReturn: d("2023-09-30"), actualReturn: d("2023-08-15"), bondYears: 3, status: "RETURNED", createdById: H } });
    await rdb.fdpFunding.create({ data: { id: randomUUID(), chairmanId: H, userId: u("dream.t5")!.id, kind: "CONFERENCE", sponsor: "INSTITUTE", purpose: "IEEE ICET 2026 — paper presentation", place: "Islamabad", country: "Pakistan", feeAmount: 45000, travelAmount: 18000, sanctionedAt: d("2026-04-10"), startDate: d("2026-05-15"), status: "COMPLETED", createdById: H } });
    await rdb.fdpFunding.create({ data: { id: randomUUID(), chairmanId: H, userId: u("dream.b4")!.id, kind: "TRAINING", sponsor: "HEC", sponsorName: "HEC NAHE", purpose: "Outcome-based education master trainer course", place: "NAHE, Islamabad", country: "Pakistan", feeAmount: 0, travelAmount: 12000, otherAmount: 8000, sanctionedAt: d("2025-11-02"), startDate: d("2025-11-20"), status: "COMPLETED", createdById: H } });
    done.push("study leave, a scholarship and 2 grants");
  }

  // 20. Benefit plans.
  if (!(await has("benefitPlan", { chairmanId: H }))) {
    const staff = await prisma.user.findMany({ where: { isActive: true, OR: [{ id: H }, { managedById: H }, { managedBy: { managedById: H } }] }, select: { id: true, role: true } });
    const plan = async (kind: string, name: string, extra: Record<string, unknown>, who: string[], amount?: number) => { const id = randomUUID(); await rdb.benefitPlan.create({ data: { id, chairmanId: H, kind, name, ...extra } }); for (const uid of who) await rdb.benefitEnrolment.create({ data: { id: randomUUID(), planId: id, userId: uid, amount: amount ?? null, startDate: d("2025-07-01") } }); return id; };
    const all = staff.filter((s) => s.role !== "SUPER_USER").map((s) => s.id);
    const health = await plan("HEALTH", "Group health insurance", { provider: "State Life Insurance", policyNo: "GH-2025-0423", coverage: "Hospitalisation, maternity, day-care procedures", limitAmount: 500000, dependants: "spouse and up to 3 children", premium: 2400000, employerSharePct: 100, employeeSharePct: 0, eligibility: "All regular employees from the first day", renewalDate: new Date(Date.now() + 20 * 864e5) }, all);
    await plan("PROVIDENT_FUND", "Contributory provident fund", { provider: "Dream University Employees Trust", coverage: "Monthly contribution of basic pay, paid out on leaving or retirement", employerSharePct: 10, employeeSharePct: 10, eligibility: "Regular employees after confirmation" }, all.slice(0, Math.ceil(all.length * 0.8)));
    await plan("FEE_CONCESSION", "Children's fee concession", { coverage: "50% tuition concession for employees' children at Dream University", eligibility: "Regular employees with 2+ years of service" }, [u("dream.t3")?.id, u("dream.b1")?.id].filter((x): x is string => !!x));
    await plan("TRANSPORT", "Transport allowance", { coverage: "Monthly allowance or university bus", eligibility: "All employees" }, all, 8000);
    const t3 = u("dream.t3")?.id;
    if (t3) { await rdb.benefitClaim.create({ data: { id: randomUUID(), planId: health, userId: t3, date: d("2026-08-14"), amount: 86000, description: "Hospital admission (day care) — Shifa International", status: "PAID", decidedById: u("dream.finance")?.id || H, decidedAt: d("2026-08-28") } }); }
    const b1 = u("dream.b1")?.id;
    if (b1) await rdb.benefitClaim.create({ data: { id: randomUUID(), planId: health, userId: b1, date: d("2026-10-03"), amount: 42000, description: "Maternity — spouse", status: "SUBMITTED" } });
    done.push("4 benefit plans with enrolments and 2 claims");
  }
  return done.length ? done : ["already there"];
}
