import { randomUUID } from "crypto";
import { prisma } from "./db";
import { DEMO_HEAD } from "./demoInstitute";
import { rdb } from "./registers";
import { eligibility, newToken } from "./recruitment";

// Dream University's recruitment: an Assistant Professor (Data Science) fully through — approved, advertised, five
// applicants checked and scored, a board's marks, the VC's approval (one selected, offer letter ready); a Lecturer
// (Marketing) request waiting for the VC; an Associate Professor (AI) advertisement open with two applicants; and a
// 2025 hire (joined) so the hiring record shows the time to hire.

const PDF = Buffer.from("%PDF-1.1\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n").toString("base64");
const d = (days: number) => new Date(Date.now() + days * 864e5);

export async function campusRecruitment() {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!head) throw new Error("Build the demo institute first.");
  const H = head.id;
  try { if (await rdb.hiringRequest.count({ where: { chairmanId: H } })) return ["Recruitment demo already there"]; } catch { throw new Error("Run prisma/migration_recruitment.sql first."); }
  const users = await prisma.user.findMany({ where: { username: { in: ["dream.hod.cs", "dream.hod.bba", "dream.dean", "dream.finance", "dream.t3", "dream.t10"] } }, select: { id: true, username: true, departmentId: true } });
  const u = (x: string) => users.find((y) => y.username === x);
  const hodCs = u("dream.hod.cs")!, hodBba = u("dream.hod.bba")!, dean = u("dream.dean")!, fin = u("dream.finance");
  const req = async (o: { by: typeof hodCs; designation: string; area: string; positions: number; justification: string; stage: string; status: string; days: number; approvals: [string, string | undefined, string][] }) => {
    const id = randomUUID();
    await rdb.hiringRequest.create({ data: { id, chairmanId: H, departmentId: o.by.departmentId, designation: o.designation, area: o.area, positions: o.positions, justification: o.justification, raisedById: o.by.id, stage: o.stage, status: o.status, createdAt: d(o.days), decidedAt: o.status === "APPROVED" ? d(o.days + 12) : null, budgetNote: o.status === "APPROVED" ? "Within the 2026-27 faculty budget (head 05-Salaries)" : null } });
    let k = 2; for (const [stage, byId, note] of o.approvals) if (byId) await rdb.hiringApproval.create({ data: { id: randomUUID(), requestId: id, stage, byId, decision: "APPROVED", note, at: d(o.days + (k += 3)) } });
    return id;
  };
  const advert = async (requestId: string, title: string, text: string, open: number, close: number, status: string) => { const id = randomUUID(); await rdb.jobAdvert.create({ data: { id, chairmanId: H, requestId, title, text, openFrom: d(open), closeAt: d(close), token: newToken(), status, weightsJson: JSON.stringify({ qualification: 25, experience: 20, publications: 25, interview: 30 }), createdById: H } }); return id; };
  const apply = async (advertId: string, designation: string, o: { name: string; email: string; degree: string; title: string; uni: string; year: number; teach: number; post: number; ind: number; pubs: [string, string, number, string][]; status: string; override?: string; days: number }) => {
    const publicationsJson = JSON.stringify(o.pubs.map(([title, journal, year, category]) => ({ title, journal, year, category })));
    const el = eligibility(designation, { highestDegree: o.degree, teachingYears: o.teach, postPhdYears: o.post, publicationsJson });
    const id = randomUUID();
    await rdb.jobApplication.create({ data: { id, advertId, chairmanId: H, name: o.name, email: o.email, phone: "0300-0000000", highestDegree: o.degree, degreeTitle: o.title, university: o.uni, degreeYear: o.year, teachingYears: o.teach, postPhdYears: o.post, industryYears: o.ind, publicationsJson, experienceJson: JSON.stringify([{ organisation: "Previous university", title: "Lecturer", from: o.year - o.teach, to: 2026 }]), cvName: `${o.name} CV.pdf`, cvType: "application/pdf", cvData: PDF, eligible: el.eligible, eligibilityJson: JSON.stringify(el.checks), override: !!o.override, overrideReason: o.override || null, status: o.status, submittedAt: d(o.days) } });
    return id;
  };
  const P = (n: number, cat: string, y = 2024): [string, string, number, string][] => Array.from({ length: n }, (_, i) => [`Paper ${i + 1} on machine learning`, cat === "W" ? "IEEE Access" : cat === "X" ? "Mehran University Research Journal" : "Pakistan Journal of Science", y - (i % 6), cat]);

  // 1. Assistant Professor (Data Science) — all the way to the VC's approval.
  const r1 = await req({ by: hodCs, designation: "ASSISTANT_PROFESSOR", area: "Data Science", positions: 1, justification: "Four data-science electives without a regular teacher; the student-to-PhD-faculty ratio is below the NCEAC norm.", stage: "DONE", status: "APPROVED", days: -60, approvals: [["DEAN", dean?.id, "Supported"], ["HEAD", H, "Approved"], ["FINANCE", fin?.id, "Budget confirmed"]] });
  const a1 = await advert(r1, "Assistant Professor — Data Science", "Dream University invites applications for Assistant Professor (Data Science), Department of Computing. Eligibility (HEC): PhD in the relevant field from an HEC-recognised university.", -45, -25, "CLOSED");
  const apps = [
    await apply(a1, "ASSISTANT_PROFESSOR", { name: "Dr. Sadia Rehman", email: "sadia.r@example.com", degree: "PHD", title: "PhD Computer Science", uni: "NUST", year: 2022, teach: 6, post: 3, ind: 1, pubs: [...P(4, "W"), ...P(3, "X")], status: "SELECTED", days: -40 }),
    await apply(a1, "ASSISTANT_PROFESSOR", { name: "Dr. Kamran Shah", email: "kamran.s@example.com", degree: "PHD", title: "PhD Data Science", uni: "FAST-NUCES", year: 2023, teach: 4, post: 2, ind: 2, pubs: [...P(2, "W"), ...P(2, "Y")], status: "NOT_SELECTED", days: -38 }),
    await apply(a1, "ASSISTANT_PROFESSOR", { name: "Dr. Hira Javed", email: "hira.j@example.com", degree: "PHD", title: "PhD Statistics", uni: "University of the Punjab", year: 2021, teach: 7, post: 4, ind: 0, pubs: [...P(1, "W"), ...P(4, "X")], status: "NOT_SELECTED", days: -35 }),
    await apply(a1, "ASSISTANT_PROFESSOR", { name: "Mr. Usman Ali", email: "usman.a@example.com", degree: "MS", title: "MS Computer Science", uni: "COMSATS", year: 2019, teach: 5, post: 0, ind: 3, pubs: P(2, "Y"), status: "NOT_SHORTLISTED", days: -33 }),
    await apply(a1, "ASSISTANT_PROFESSOR", { name: "Ms. Ayesha Noor", email: "ayesha.n@example.com", degree: "MS", title: "MS Data Science (PhD thesis submitted)", uni: "LUMS", year: 2020, teach: 4, post: 0, ind: 1, pubs: [...P(3, "W")], status: "NOT_SELECTED", override: "PhD thesis submitted and defended; degree notification awaited — the committee accepts her for interview.", days: -30 }),
  ];
  const board = randomUUID(); const members = [dean?.id, hodCs.id, u("dream.t3")?.id].filter((x): x is string => !!x);
  await rdb.selectionBoard.create({ data: { id: board, advertId: a1, membersJson: JSON.stringify(members), interviewAt: d(-15), venue: "Committee Room, Admin Block", recommendationJson: JSON.stringify([apps[0]]), recommendedAt: d(-12), approvedById: H, approvedAt: d(-10) } });
  const marks: number[][] = [[86, 82, 88], [74, 70, 76], [68, 72, 65], [], [79, 75, 81]];
  for (let i = 0; i < apps.length; i++) for (let j = 0; j < marks[i].length && j < members.length; j++) await rdb.boardMark.create({ data: { id: randomUUID(), boardId: board, applicationId: apps[i], memberId: members[j], marks: marks[i][j], remarks: marks[i][j] >= 80 ? "Strong research plan and teaching demo" : null } });

  // 2. Lecturer (Marketing) — the Dean has approved; waiting for the VC.
  await req({ by: hodBba, designation: "LECTURER", area: "Marketing", positions: 2, justification: "Two sections of Principles of Marketing and Consumer Behaviour are taught by visiting faculty; NBEAC expects full-time faculty for core courses.", stage: "HEAD", status: "PENDING", days: -6, approvals: [["DEAN", dean?.id, "Recommended"]] });

  // 3. Associate Professor (AI) — open, two applicants so far.
  const r3 = await req({ by: hodCs, designation: "ASSOCIATE_PROFESSOR", area: "Artificial Intelligence", positions: 1, justification: "Senior faculty for the BS Artificial Intelligence program (no Associate Professor yet).", stage: "DONE", status: "APPROVED", days: -30, approvals: [["DEAN", dean?.id, "Supported"], ["HEAD", H, "Approved"], ["FINANCE", fin?.id, "Budget confirmed"]] });
  const a3 = await advert(r3, "Associate Professor — Artificial Intelligence", "Dream University invites applications for Associate Professor (Artificial Intelligence). Eligibility (HEC): PhD; 10 years of teaching / research experience (or 5 after the PhD); 10 papers in HEC-recognised journals, 4 in the last 5 years.", -10, 20, "OPEN");
  await apply(a3, "ASSOCIATE_PROFESSOR", { name: "Dr. Faisal Mehmood", email: "faisal.m@example.com", degree: "PHD", title: "PhD Artificial Intelligence", uni: "University of Manchester", year: 2016, teach: 11, post: 8, ind: 0, pubs: [...P(8, "W"), ...P(5, "X")], status: "APPLIED", days: -5 });
  await apply(a3, "ASSOCIATE_PROFESSOR", { name: "Dr. Nida Aslam", email: "nida.a@example.com", degree: "PHD", title: "PhD Computer Science", uni: "UET Lahore", year: 2021, teach: 6, post: 4, ind: 0, pubs: [...P(3, "W"), ...P(2, "Y")], status: "APPLIED", days: -3 });

  // 4. A 2025 hire that joined (for the hiring record's time to hire).
  const r4 = await req({ by: hodCs, designation: "LECTURER", area: "Software Engineering", positions: 1, justification: "Growth of the BSCS intake.", stage: "DONE", status: "APPROVED", days: -300, approvals: [["DEAN", dean?.id, "Supported"], ["HEAD", H, "Approved"], ["FINANCE", fin?.id, "Budget confirmed"]] });
  const a4 = await advert(r4, "Lecturer — Software Engineering", "Dream University invites applications for Lecturer (Software Engineering).", -285, -265, "CLOSED");
  const j = await apply(a4, "LECTURER", { name: "Mr. Hamza Tariq", email: "hamza.t.demo@example.com", degree: "MS", title: "MS Software Engineering", uni: "NUST", year: 2023, teach: 1, post: 0, ind: 2, pubs: P(1, "Y"), status: "JOINED", days: -280 });
  await rdb.jobApplication.update({ where: { id: j }, data: { joinedAt: d(-230), userId: u("dream.t10")?.id || null } });
  return ["Assistant Professor (Data Science): approved, advertised, 5 applicants scored, board marks, VC approved — Dr. Sadia Rehman selected (offer letter ready)", "Lecturer (Marketing): waiting for the VC in My Approvals", "Associate Professor (AI): advertisement open with 2 applicants", "a 2025 Lecturer hire that joined (hiring record)"];
}
