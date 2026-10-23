import { randomUUID } from "crypto";
import { prisma } from "./db";
import { DEMO_HEAD } from "./demoInstitute";
import { rdb } from "./registers";
import { syncEvidence } from "./counselling";
import { notifyStudents } from "./studentNotices";

// Dream University, Prompt 2 batch 2: the help desk (a support person, answer times, and requests in every state)
// and counselling (Student Affairs as the student counsellor, weekly times, visits held this year with confidential
// notes, an upcoming booking and a call-in from the Early Warning list). Each part is skipped when already there.

const d = (daysFromNow: number, hour = 11) => { const x = new Date(); x.setDate(x.getDate() + daysFromNow); x.setHours(hour, 0, 0, 0); return x; };

export async function campusSupport() {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!head) throw new Error("Build the demo institute first.");
  const H = head.id;
  const users = await prisma.user.findMany({ where: { username: { in: ["dream.sa", "dream.t3", "dream.t5", "dream.t6", "dream.b2", "dream.hod.cs", "dream.omc"] } }, select: { id: true, username: true, name: true, role: true } });
  const u = (x: string) => users.find((y) => y.username === x);
  const done: string[] = [];

  // Help desk: Student Affairs also answers local requests; answer times per priority.
  try {
    if (!(await rdb.helpDeskSetting.count({ where: { chairmanId: H } })) && u("dream.sa")) {
      await rdb.helpDeskSetting.create({ data: { chairmanId: H, supportUserIds: JSON.stringify([u("dream.sa")!.id]), slaHoursJson: JSON.stringify({ URGENT: 4, HIGH: 24, NORMAL: 48, LOW: 120 }), updatedById: H } });
      done.push("help desk: Student Affairs as the support person, answer times set");
    }
    const tickets: [string, string, string, string, string, string, number, string | null, string | null, string][] = [
      ["dream.t5", "COURSES", "Marks of Quiz 3 not saving for CS-205", "When I press Save on the marks sheet for Quiz 3 the page shows a red message and the marks disappear after reload.", "BUG", "URGENT", -0.3, null, null, "OPEN"],
      ["dream.t6", "REGISTRATION", "Wrong roll number for a student", "Student Ali Raza appears as DRM-CS-24-031 but his card says DRM-CS-24-013. Please correct it.", "DATA_CORRECTION", "NORMAL", -1, "data", null, "IN_PROGRESS"],
      ["dream.b2", "TECHNICAL", "Export the attendance sheet to Excel", "It would help if the attendance page had an Excel download for the whole term.", "FEATURE", "LOW", -9, "attendance, export", "Added an Excel download on the attendance page.", "RESOLVED"],
    ];
    for (const [who, desk, subject, body, category, priority, days, tags, fix, status] of tickets) {
      const r = u(who); if (!r || (await prisma.helpTicket.count({ where: { subject, chairmanId: H } }))) continue;
      const created = new Date(Date.now() + days * 864e5);
      const recipients = desk === "TECHNICAL" ? (await prisma.user.findMany({ where: { role: "SUPER_USER", isActive: true }, select: { id: true } })).map((x) => x.id) : [u("dream.omc")?.id, u("dream.sa")?.id].filter((x): x is string => !!x);
      const t = await prisma.helpTicket.create({ data: { chairmanId: H, desk, subject, body, page: desk === "COURSES" ? "/instructor/courses" : "/attendance", status, requesterUserId: r.id, requesterName: r.name, requesterRole: r.role, recipientIds: JSON.stringify(recipients), assignedToId: status === "OPEN" ? null : recipients[0] || null, createdAt: created, lastActivityAt: created, resolvedAt: status === "RESOLVED" ? new Date(created.getTime() + 5 * 864e5) : null } });
      const sla = { URGENT: 4, HIGH: 24, NORMAL: 48, LOW: 120 }[priority] || 48;
      await rdb.helpTicketExtra.create({ data: { ticketId: t.id, category, priority, browser: "Chrome 129 on Windows", pageUrl: `https://obehub.example${t.page}`, slaDueAt: new Date(created.getTime() + sla * 3600_000), firstResponseAt: status === "OPEN" ? null : new Date(created.getTime() + 3 * 3600_000), tags: tags || "", fixNote: fix, releaseRef: fix ? "2026.10.14" : null } });
      if (status !== "OPEN") await prisma.helpTicketMessage.create({ data: { ticketId: t.id, authorUserId: recipients[0] || null, authorName: status === "RESOLVED" ? "OBEHUB support" : u("dream.omc")?.name || "OMC", body: status === "RESOLVED" ? "Thanks for the idea — it is now on the attendance page (Download Excel)." : "Checking the admission record; I will correct it today.", createdAt: new Date(created.getTime() + 3 * 3600_000) } });
      done.push(`help request: ${subject} (${status.toLowerCase().replace("_", " ")})`);
    }
  } catch { throw new Error("Run prisma/migration_help_desk.sql first."); }

  // Counselling.
  try {
    const sa = u("dream.sa"), adv = u("dream.t3");
    if (sa && !(await rdb.counsellorProfile.count({ where: { userId: sa.id } }))) { await rdb.counsellorProfile.create({ data: { userId: sa.id, chairmanId: H, isCounsellor: true, byRequest: true, designatedById: H } }); done.push(`${sa.name} designated student counsellor (also takes requests)`); }
    const students = await prisma.student.findMany({ where: { batch: { advisorId: adv?.id || "none" } }, select: { id: true, name: true }, orderBy: { rollNumber: "asc" }, take: 14 });
    if (adv && sa && students.length >= 6 && !(await rdb.counsellingBooking.count({ where: { chairmanId: H } }))) {
      const slot = async (who: string, at: Date, mode = "IN_PERSON", place = "Room B-12") => { const id = randomUUID(); await rdb.counsellingSlot.create({ data: { id, chairmanId: H, counsellorId: who, startsAt: at, endsAt: new Date(at.getTime() + 30 * 60_000), mode, place } }); return id; };
      // Weekly times for the next four weeks.
      for (let w = 0; w < 4; w++) { await slot(adv.id, d(2 + 7 * w, 11)); await slot(adv.id, d(2 + 7 * w, 12)); await slot(sa.id, d(3 + 7 * w, 14), "EITHER", "Student Affairs office / Google Meet"); await slot(sa.id, d(3 + 7 * w, 15), "EITHER", "Student Affairs office / Google Meet"); }
      // Visits held this year (counts feed the program evidence), with confidential notes.
      const held: [number, string, string, number, string][] = [
        [0, "ACADEMIC", "t3", -150, "Struggling with Data Structures; agreed a weekly study plan and peer tutoring."], [1, "CAREER", "sa", -120, "Wants a software testing internship; shared the placement office list."],
        [2, "PERSONAL", "sa", -95, "Stress before mid-terms; breathing exercises discussed, follow-up arranged."], [3, "ACADEMIC", "t3", -60, "Low attendance in two courses because of travel; advised hostel options."],
        [0, "ACADEMIC", "t3", -30, "Follow-up: grades improving, keep the plan."], [4, "CAREER", "sa", -21, "Asked about MS abroad; explained GRE timing and scholarships."],
        [5, "PERSONAL", "sa", -12, "Family matter; referred to the visiting psychologist."], [1, "ACADEMIC", "t3", -5, "Prerequisite question for Spring registration."],
      ];
      for (const [si, kind, who, days, note] of held) {
        const c = who === "t3" ? adv : sa; const at = d(days, 11);
        const sid = await slot(c.id, at); const bid = randomUUID();
        await rdb.counsellingBooking.create({ data: { id: bid, chairmanId: H, studentId: students[si].id, counsellorId: c.id, slotId: sid, kind, mode: "IN_PERSON", startsAt: at, status: "DONE", doneAt: at, source: si === 3 ? "EARLY_WARNING" : "SELF", followUpDate: kind === "PERSONAL" ? d(days + 14) : null, createdAt: new Date(at.getTime() - 3 * 864e5) } });
        await rdb.counsellingNote.create({ data: { id: randomUUID(), bookingId: bid, authorId: c.id, kind, notes: note, createdAt: at } });
      }
      // An upcoming booking, a request to the counsellor and a call-in from the Early Warning list.
      const up = await slot(adv.id, d(1, 10));
      await rdb.counsellingBooking.create({ data: { id: randomUUID(), chairmanId: H, studentId: students[6].id, counsellorId: adv.id, slotId: up, kind: "ACADEMIC", mode: "IN_PERSON", startsAt: d(1, 10), status: "BOOKED", reason: "Choosing electives for next term", source: "SELF" } });
      await rdb.counsellingBooking.create({ data: { id: randomUUID(), chairmanId: H, studentId: students[7].id, counsellorId: sa.id, kind: "CAREER", mode: "ONLINE", status: "REQUESTED", reason: "Any evening next week — CV review", source: "SELF" } });
      await rdb.counsellingBooking.create({ data: { id: randomUUID(), chairmanId: H, studentId: students[8].id, counsellorId: adv.id, kind: "ACADEMIC", status: "CALLED_IN", reason: "Attendance below 75% in two courses — let's talk.", source: "EARLY_WARNING", calledById: adv.id } });
      await notifyStudents([students[8].id], { kind: "COUNSELLING", title: `${adv.name} would like to see you`, body: "Please pick a counselling time. Attendance below 75% in two courses — let's talk.", href: "/student/counselling" });
      await notifyStudents([students[6].id], { kind: "COUNSELLING", title: `Counselling booked for tomorrow 10:00`, body: "In person · Room B-12", href: "/student/counselling" });
      const n = await syncEvidence(H);
      done.push(`counselling: 8 visits held this year, 1 upcoming booking, 1 request, 1 call-in; ${n} program-evidence record(s) updated`);
    }
  } catch (e) { throw new Error(`Run prisma/migration_counselling.sql first (${String((e as Error).message || e).slice(0, 100)}).`); }
  return done.length ? done : ["Help desk and counselling demo already there"];
}
