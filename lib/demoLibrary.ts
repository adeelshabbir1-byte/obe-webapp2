import { randomUUID } from "crypto";
import { prisma } from "./db";
import { DEMO_HEAD } from "./demoInstitute";
import { rdb } from "./registers";

// Dream University's library circulation: part of the collection catalogued (so the typed library figures are kept
// for now — "catalogue complete" is switched off under Rules), books on loan to students and staff, one overdue with a
// fine (it blocks that student's library clearance), a late return with the fine paid, and a reservation.

const T: [string, string, string, string, number, string, string, number, number][] = [
  // title, authors, isbn, publisher, year, subject, call no., copies, price
  ["Introduction to Algorithms (4th ed.)", "Cormen, Leiserson, Rivest, Stein", "9780262046305", "MIT Press", 2022, "Computing", "005.1 COR", 3, 14500],
  ["Database System Concepts (7th ed.)", "Silberschatz, Korth, Sudarshan", "9780078022159", "McGraw-Hill", 2019, "Computing", "005.74 SIL", 3, 9800],
  ["Operating System Concepts (10th ed.)", "Silberschatz, Galvin, Gagne", "9781119800361", "Wiley", 2021, "Computing", "005.43 SIL", 2, 10500],
  ["Computer Networking: A Top-Down Approach (8th ed.)", "Kurose, Ross", "9780136681557", "Pearson", 2021, "Computing", "004.6 KUR", 2, 11200],
  ["Artificial Intelligence: A Modern Approach (4th ed.)", "Russell, Norvig", "9780134610993", "Pearson", 2020, "Computing", "006.3 RUS", 1, 13800],
  ["Software Engineering (10th ed.)", "Sommerville", "9780133943030", "Pearson", 2015, "Computing", "005.1 SOM", 2, 8700],
  ["Clean Code", "Robert C. Martin", "9780132350884", "Prentice Hall", 2008, "Computing", "005.1 MAR", 2, 6500],
  ["Discrete Mathematics and Its Applications (8th ed.)", "Kenneth Rosen", "9781259676512", "McGraw-Hill", 2018, "Mathematics", "511 ROS", 3, 9200],
  ["Calculus: Early Transcendentals (9th ed.)", "James Stewart", "9781337613927", "Cengage", 2020, "Mathematics", "515 STE", 2, 12400],
  ["Principles of Marketing (18th ed.)", "Kotler, Armstrong", "9780134492513", "Pearson", 2020, "Business", "658.8 KOT", 3, 7900],
  ["Financial Management: Theory and Practice", "Brigham, Ehrhardt", "9781337902601", "Cengage", 2019, "Business", "658.15 BRI", 2, 11600],
  ["Organizational Behavior (18th ed.)", "Robbins, Judge", "9780134729329", "Pearson", 2018, "Business", "302.35 ROB", 2, 8400],
  ["Principles of Economics", "N. Gregory Mankiw", "9780357038314", "Cengage", 2020, "Business", "330 MAN", 2, 9100],
  ["Technical Communication", "Mike Markel", "9781319058616", "Bedford", 2018, "Languages", "808 MAR", 2, 5600],
];

export async function campusLibrary() {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!head) throw new Error("Build the demo institute first.");
  const H = head.id;
  try { if (await rdb.libraryTitle.count({ where: { chairmanId: H } })) return ["Library demo already there"]; } catch { throw new Error("Run prisma/migration_library_circulation.sql first."); }
  const lib = await prisma.user.findFirst({ where: { username: "dream.librarian" }, select: { id: true } });
  await rdb.libraryPolicy.upsert({ where: { chairmanId: H }, create: { chairmanId: H, catalogueFigures: false, updatedById: lib?.id || H }, update: { catalogueFigures: false } });
  let acc = 1001;
  const copyOf: string[][] = [];
  for (const [title, authors, isbn, publisher, year, subject, call, n, price] of T) {
    const id = randomUUID();
    await rdb.libraryTitle.create({ data: { id, chairmanId: H, title, authors, isbn, publisher, year, subject, callNumber: call, kind: "PRINT" } });
    const ids: string[] = [];
    for (let i = 0; i < n; i++) { const cid = randomUUID(); await rdb.libraryCopy.create({ data: { id: cid, chairmanId: H, titleId: id, accessionNo: `DU-${acc++}`, location: subject === "Business" ? "Shelf B" : "Shelf C", price, acquiredAt: new Date(year >= 2021 ? "2026-02-15" : "2023-09-01") } }); ids.push(cid); }
    copyOf.push(ids);
  }
  await rdb.libraryTitle.create({ data: { id: randomUUID(), chairmanId: H, title: "HEC Digital Library (IEEE, ACM, Springer, Elsevier)", subject: "General", kind: "DATABASE", url: "https://www.digitallibrary.edu.pk" } });
  await rdb.libraryTitle.create({ data: { id: randomUUID(), chairmanId: H, title: "Python for Everybody", authors: "Charles Severance", subject: "Computing", kind: "EBOOK", url: "https://www.py4e.com/book" } });

  const students = await prisma.student.findMany({ where: { rollNumber: { in: ["DRM-CS-24-010", "DRM-CS-24-011", "DRM-CS-24-012", "DRM-CS-24-018", "DRM-BB-24-004"] } }, select: { id: true, rollNumber: true } });
  const sid = (r: string) => students.find((s) => s.rollNumber === r)?.id;
  const t4 = await prisma.user.findFirst({ where: { username: "dream.t4" }, select: { id: true } });
  const titleIds = (await rdb.libraryTitle.findMany({ where: { chairmanId: H, kind: "PRINT" }, orderBy: { createdAt: "asc" }, select: { id: true } })) as { id: string }[];
  const d = (days: number) => { const x = new Date(Date.now() + days * 864e5); x.setHours(23, 59, 0, 0); return x; };
  const loan = async (ti: number, ci: number, type: "STUDENT" | "STAFF", member: string | undefined, issued: number, due: number, returned?: number, fine = 0, paid = 0) => {
    if (!member) return;
    await rdb.libraryLoan.create({ data: { id: randomUUID(), chairmanId: H, copyId: copyOf[ti][ci], titleId: titleIds[ti].id, memberType: type, memberId: member, issuedAt: d(issued), dueAt: d(due), returnedAt: returned === undefined ? null : d(returned), fine, finePaid: paid, outcome: returned === undefined ? null : "RETURNED", issuedById: lib?.id || H } });
    if (returned === undefined) await rdb.libraryCopy.update({ where: { id: copyOf[ti][ci] }, data: { status: "ON_LOAN" } });
  };
  await loan(0, 0, "STUDENT", sid("DRM-CS-24-010"), -9, 5);
  await loan(1, 0, "STUDENT", sid("DRM-CS-24-011"), -20, -6); // overdue: Rs 120 so far — blocks the library clearance
  await loan(7, 0, "STUDENT", sid("DRM-CS-24-012"), -40, -26, -22, 80, 80); // returned 4 days late, fine paid
  await loan(4, 0, "STUDENT", sid("DRM-BB-24-004"), -3, 11); // the only AI book is out …
  await loan(2, 0, "STAFF", t4?.id, -12, 18);
  await loan(3, 0, "STAFF", t4?.id, -12, 18);
  if (sid("DRM-CS-24-018")) await rdb.libraryHold.create({ data: { id: randomUUID(), chairmanId: H, titleId: titleIds[4].id, memberType: "STUDENT", memberId: sid("DRM-CS-24-018")!, status: "WAITING" } }); // … so it is reserved
  return [`${T.length} printed titles (${copyOf.flat().length} copies), an online database and an e-book catalogued`, "6 loans (one overdue with a fine), a late return with the fine paid, a reservation", "Catalogue figures switched off under Rules (the collection is still being entered), so the typed library figures are kept"];
}
