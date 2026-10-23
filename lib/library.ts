import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { notifyStudents } from "./studentNotices";

// Library circulation. The catalogue holds titles; each printed title has copies with accession numbers (the barcode
// or QR on the book). Students and staff borrow within the Librarian's limits; overdue loans earn a fine per day.
// Outstanding books or fines block the library clearance for a degree and for leaving / transferring. The catalogue
// keeps the institute's LibraryInfo figures (titles, computing titles, volumes, e-books) up to date automatically.

export const ldb = prisma as unknown as Record<string, any>;
export const LIB_HINT = "Run prisma/migration_library_circulation.sql in Supabase first.";
export const SUBJECTS = ["Computing", "Business", "Mathematics", "Engineering", "Sciences", "Social sciences", "Languages", "Islamic studies", "General"];
export const COMPUTING = /comput|software|information tech|data sci|artificial|programming|^cs\b|^it\b/i;
export type Policy = { studentLimit: number; studentDays: number; staffLimit: number; staffDays: number; finePerDay: number; maxRenewals: number; holdDays: number; catalogueFigures: boolean };
export const DEFAULT_POLICY: Policy = { studentLimit: 3, studentDays: 14, staffLimit: 10, staffDays: 30, finePerDay: 20, maxRenewals: 2, holdDays: 3, catalogueFigures: true };
export type Title = { id: string; chairmanId: string; title: string; authors: string | null; isbn: string | null; edition: string | null; publisher: string | null; year: number | null; subject: string; callNumber: string | null; kind: string; url: string | null; createdAt: Date };
export type Copy = { id: string; chairmanId: string; titleId: string; accessionNo: string; location: string | null; status: string; price: number | null; acquiredAt: Date | null };
export type Loan = { id: string; chairmanId: string; copyId: string; titleId: string; memberType: "STUDENT" | "STAFF"; memberId: string; issuedAt: Date; dueAt: Date; returnedAt: Date | null; renewals: number; fine: number; finePaid: number; fineWaived: boolean; note: string | null; outcome: string | null; remindedAt: Date | null };
export type Member = { type: "STUDENT" | "STAFF"; id: string; name: string; ref: string };

export async function policyOf(chairmanId: string): Promise<Policy> {
  try { const p = await ldb.libraryPolicy.findUnique({ where: { chairmanId } }); return p ? { ...DEFAULT_POLICY, ...p } : DEFAULT_POLICY; } catch { return DEFAULT_POLICY; }
}
const dayMs = 864e5;
/** The fine a loan has earned so far (or earned, once returned). */
export const fineOf = (l: Pick<Loan, "dueAt" | "returnedAt" | "fine" | "fineWaived">, perDay: number, now = new Date()) => {
  if (l.fineWaived) return 0;
  if (l.returnedAt) return l.fine;
  const late = Math.floor((now.getTime() - new Date(l.dueAt).getTime()) / dayMs);
  return late > 0 ? late * perDay : 0;
};

/** Find a member by roll number (student) or by username / email / exact name (staff), within the institute. */
export async function findMember(chairmanId: string, q: string): Promise<Member | null> {
  const t = q.trim();
  if (!t) return null;
  const st = await prisma.student.findFirst({ where: { rollNumber: { equals: t, mode: "insensitive" }, batch: { coordinator: { managedById: chairmanId } } }, select: { id: true, name: true, rollNumber: true } });
  if (st) return { type: "STUDENT", id: st.id, name: st.name, ref: st.rollNumber };
  const u = await prisma.user.findFirst({ where: { isActive: true, OR: [{ username: { equals: t, mode: "insensitive" } }, { email: { equals: t, mode: "insensitive" } }, { name: { equals: t, mode: "insensitive" } }], AND: [{ OR: [{ id: chairmanId }, { managedById: chairmanId }, { managedBy: { managedById: chairmanId } }] }] }, select: { id: true, name: true, username: true } });
  return u ? { type: "STAFF", id: u.id, name: u.name, ref: u.username } : null;
}
export async function memberById(type: "STUDENT" | "STAFF", id: string): Promise<Member | null> {
  if (type === "STUDENT") { const s = await prisma.student.findUnique({ where: { id }, select: { id: true, name: true, rollNumber: true } }); return s ? { type, id, name: s.name, ref: s.rollNumber } : null; }
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, username: true } }); return u ? { type, id, name: u.name, ref: u.username } : null;
}

/** What a member still owes the library: books not returned and unpaid fines. */
export async function duesOf(type: "STUDENT" | "STAFF", id: string) {
  try {
    const loans = (await ldb.libraryLoan.findMany({ where: { memberType: type, memberId: id } })) as Loan[];
    if (!loans.length) return { books: 0, fines: 0, loans: [] as Loan[] };
    const p = await policyOf(loans[0].chairmanId);
    const open = loans.filter((l) => !l.returnedAt);
    const fines = loans.reduce((t, l) => t + Math.max(0, fineOf(l, p.finePerDay) - l.finePaid), 0);
    return { books: open.length, fines: Math.round(fines), loans };
  } catch { return { books: 0, fines: 0, loans: [] as Loan[] }; }
}
/** For clearance (degrees, leaving, transfer): a plain sentence of what is outstanding, or null when clear. */
export async function libraryBlock(studentId: string): Promise<string | null> {
  const d = await duesOf("STUDENT", studentId);
  if (!d.books && !d.fines) return null;
  return `Library: ${[d.books ? `${d.books} book(s) not returned` : "", d.fines ? `fines of Rs ${d.fines.toLocaleString("en-PK")} unpaid` : ""].filter(Boolean).join(" and ")}. The Librarian must clear these first.`;
}

async function copyByAccession(chairmanId: string, accessionNo: string) {
  return (await ldb.libraryCopy.findUnique({ where: { chairmanId_accessionNo: { chairmanId, accessionNo: accessionNo.trim().toUpperCase() } } })) as Copy | null;
}
const day = (d: Date) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const tell = async (m: Member, chairmanId: string, title: string, body: string, href: string) => {
  if (m.type === "STUDENT") await notifyStudents([m.id], { kind: "LIBRARY", title, body, href: "/student/library" }, chairmanId);
  else await notifyUsers([m.id], { kind: "LIBRARY", title, body, href });
};

/** Issue a copy to a member (within their limit, no overdue books, not held for someone else). */
export async function issue(chairmanId: string, by: string, accessionNo: string, m: Member) {
  const c = await copyByAccession(chairmanId, accessionNo);
  if (!c) throw new Error(`No copy with accession number ${accessionNo}.`);
  if (c.status === "ON_LOAN") throw new Error("This copy is already on loan — return it first.");
  if (["LOST", "WITHDRAWN", "DAMAGED"].includes(c.status)) throw new Error(`This copy is marked ${c.status.toLowerCase()}.`);
  const p = await policyOf(chairmanId);
  const d = await duesOf(m.type, m.id);
  const limit = m.type === "STUDENT" ? p.studentLimit : p.staffLimit;
  if (d.books >= limit) throw new Error(`${m.name} already has ${d.books} book(s) — the limit is ${limit}.`);
  if (d.loans.some((l) => !l.returnedAt && new Date(l.dueAt) < new Date())) throw new Error(`${m.name} has an overdue book. Return it first.`);
  const holds = (await ldb.libraryHold.findMany({ where: { titleId: c.titleId, status: { in: ["WAITING", "READY"] } }, orderBy: { createdAt: "asc" } })) as { id: string; memberType: string; memberId: string; status: string }[];
  const mine = holds.find((h) => h.memberType === m.type && h.memberId === m.id);
  const free = await ldb.libraryCopy.count({ where: { titleId: c.titleId, status: "AVAILABLE" } });
  if (c.status === "ON_HOLD" && holds[0] && !mine && holds[0].status === "READY") throw new Error("This copy is kept for the member who reserved it.");
  if (!mine && holds.length && free <= holds.filter((h) => h.status === "WAITING").length && c.status !== "AVAILABLE") throw new Error("All copies are reserved by others.");
  const due = new Date(Date.now() + (m.type === "STUDENT" ? p.studentDays : p.staffDays) * dayMs); due.setHours(23, 59, 0, 0);
  const id = randomUUID();
  await ldb.libraryLoan.create({ data: { id, chairmanId, copyId: c.id, titleId: c.titleId, memberType: m.type, memberId: m.id, dueAt: due, issuedById: by } });
  await ldb.libraryCopy.update({ where: { id: c.id }, data: { status: "ON_LOAN" } });
  if (mine) await ldb.libraryHold.update({ where: { id: mine.id }, data: { status: "DONE" } });
  return { id, dueAt: due };
}

/** Return a copy. Damaged copies are set aside; the fine (if late) is fixed at return. A waiting reservation is told. */
export async function returnCopy(chairmanId: string, by: string, accessionNo: string, outcome: "RETURNED" | "DAMAGED" = "RETURNED") {
  const c = await copyByAccession(chairmanId, accessionNo);
  if (!c) throw new Error(`No copy with accession number ${accessionNo}.`);
  const loan = (await ldb.libraryLoan.findFirst({ where: { copyId: c.id, returnedAt: null } })) as Loan | null;
  if (!loan) throw new Error("This copy is not on loan.");
  const p = await policyOf(chairmanId);
  const now = new Date();
  const fine = fineOf(loan, p.finePerDay, now);
  await ldb.libraryLoan.update({ where: { id: loan.id }, data: { returnedAt: now, fine, outcome, returnedById: by } });
  const next = outcome === "DAMAGED" ? null : ((await ldb.libraryHold.findFirst({ where: { titleId: c.titleId, status: "WAITING" }, orderBy: { createdAt: "asc" } })) as { id: string; memberType: "STUDENT" | "STAFF"; memberId: string } | null);
  await ldb.libraryCopy.update({ where: { id: c.id }, data: { status: outcome === "DAMAGED" ? "DAMAGED" : next ? "ON_HOLD" : "AVAILABLE" } });
  if (next) {
    await ldb.libraryHold.update({ where: { id: next.id }, data: { status: "READY", readyAt: now } });
    const m = await memberById(next.memberType, next.memberId); const t = await ldb.libraryTitle.findUnique({ where: { id: c.titleId } });
    if (m) await tell(m, chairmanId, `Your reserved book is ready: ${t?.title || "a book"}`, `Collect it within ${p.holdDays} day(s).`, "/library-desk");
  }
  return { fine, member: await memberById(loan.memberType, loan.memberId) };
}

export async function renew(chairmanId: string, loanId: string, who: { type: "STUDENT" | "STAFF"; id: string } | null) {
  const l = (await ldb.libraryLoan.findUnique({ where: { id: loanId } })) as Loan | null;
  if (!l || l.chairmanId !== chairmanId || l.returnedAt) throw new Error("Not found.");
  if (who && (who.type !== l.memberType || who.id !== l.memberId)) throw new Error("Not found.");
  const p = await policyOf(chairmanId);
  if (l.renewals >= p.maxRenewals) throw new Error(`Already renewed ${l.renewals} time(s) — the limit is ${p.maxRenewals}. Return it to the library.`);
  if (new Date(l.dueAt) < new Date()) throw new Error("This book is overdue — return it (and pay the fine) instead.");
  if (await ldb.libraryHold.count({ where: { titleId: l.titleId, status: "WAITING" } })) throw new Error("Someone has reserved this book, so it cannot be renewed.");
  const due = new Date(new Date(l.dueAt).getTime() + (l.memberType === "STUDENT" ? p.studentDays : p.staffDays) * dayMs);
  await ldb.libraryLoan.update({ where: { id: l.id }, data: { dueAt: due, renewals: l.renewals + 1 } });
  return due;
}

export async function reserve(chairmanId: string, titleId: string, m: { type: "STUDENT" | "STAFF"; id: string }) {
  const t = (await ldb.libraryTitle.findUnique({ where: { id: titleId } })) as Title | null;
  if (!t || t.chairmanId !== chairmanId || t.kind !== "PRINT") throw new Error("Not found.");
  if (await ldb.libraryHold.count({ where: { titleId, memberType: m.type, memberId: m.id, status: { in: ["WAITING", "READY"] } } })) throw new Error("You have already reserved this book.");
  if (await ldb.libraryCopy.count({ where: { titleId, status: "AVAILABLE" } })) throw new Error("A copy is on the shelf — just ask at the counter.");
  await ldb.libraryHold.create({ data: { id: randomUUID(), chairmanId, titleId, memberType: m.type, memberId: m.id } });
}

/** A lost book: the loan closes with the copy's price added to the fine. */
export async function markLost(chairmanId: string, by: string, loanId: string) {
  const l = (await ldb.libraryLoan.findUnique({ where: { id: loanId } })) as Loan | null;
  if (!l || l.chairmanId !== chairmanId || l.returnedAt) throw new Error("Not found.");
  const c = (await ldb.libraryCopy.findUnique({ where: { id: l.copyId } })) as Copy;
  const p = await policyOf(chairmanId);
  const fine = fineOf(l, p.finePerDay) + (c?.price || 0);
  await ldb.libraryLoan.update({ where: { id: l.id }, data: { returnedAt: new Date(), fine, outcome: "LOST", returnedById: by } });
  await ldb.libraryCopy.update({ where: { id: l.copyId }, data: { status: "LOST" } });
  return fine;
}
export async function payFine(chairmanId: string, loanId: string, amount: number, waive: boolean, note: string) {
  const l = (await ldb.libraryLoan.findUnique({ where: { id: loanId } })) as Loan | null;
  if (!l || l.chairmanId !== chairmanId) throw new Error("Not found.");
  if (waive) { await ldb.libraryLoan.update({ where: { id: l.id }, data: { fineWaived: true, note: note.slice(0, 300) || "Waived" } }); return; }
  if (!(amount > 0)) throw new Error("Give the amount paid.");
  await ldb.libraryLoan.update({ where: { id: l.id }, data: { finePaid: l.finePaid + amount, note: note.slice(0, 300) || l.note } });
}

/** Keep LibraryInfo (used by the NCEAC/NBEAC library tables and readiness checks) in step with the catalogue. */
export async function syncLibraryInfo(chairmanId: string) {
  try {
    if (!(await policyOf(chairmanId)).catalogueFigures) return null; // the Librarian keeps the typed figures for now
    const titles = (await ldb.libraryTitle.findMany({ where: { chairmanId }, select: { id: true, subject: true, kind: true } })) as { id: string; subject: string; kind: string }[];
    if (!titles.length) return null;
    const print = titles.filter((t) => t.kind === "PRINT");
    const volumes = await ldb.libraryCopy.count({ where: { chairmanId, status: { notIn: ["LOST", "WITHDRAWN"] } } });
    const data = { totalTitles: print.length, computingTitles: print.filter((t) => COMPUTING.test(t.subject)).length, totalVolumes: volumes, ebooks: titles.filter((t) => t.kind === "EBOOK").length };
    await prisma.libraryInfo.upsert({ where: { chairmanId }, create: { chairmanId, ...data }, update: data });
    return data;
  } catch { return null; }
}

/** Reports: collection by subject, most borrowed (12 months), loans per program, new additions and money spent this year. */
export async function libraryReport(chairmanId: string) {
  const year = new Date().getFullYear(), since = new Date(Date.now() - 365 * dayMs);
  const [titles, copies, loans] = await Promise.all([
    ldb.libraryTitle.findMany({ where: { chairmanId }, select: { id: true, title: true, subject: true, kind: true, createdAt: true } }) as Promise<{ id: string; title: string; subject: string; kind: string; createdAt: Date }[]>,
    ldb.libraryCopy.findMany({ where: { chairmanId }, select: { titleId: true, status: true, price: true, acquiredAt: true, createdAt: true } }) as Promise<{ titleId: string; status: string; price: number | null; acquiredAt: Date | null; createdAt: Date }[]>,
    ldb.libraryLoan.findMany({ where: { chairmanId, issuedAt: { gte: since } }, select: { titleId: true, memberType: true, memberId: true, returnedAt: true, dueAt: true } }) as Promise<{ titleId: string; memberType: string; memberId: string; returnedAt: Date | null; dueAt: Date }[]>,
  ]);
  const bySubject = new Map<string, { titles: number; volumes: number }>();
  for (const t of titles) { const e = bySubject.get(t.subject) || { titles: 0, volumes: 0 }; e.titles++; e.volumes += copies.filter((c) => c.titleId === t.id && !["LOST", "WITHDRAWN"].includes(c.status)).length; bySubject.set(t.subject, e); }
  const counts = new Map<string, number>(); for (const l of loans) counts.set(l.titleId, (counts.get(l.titleId) || 0) + 1);
  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, n]) => ({ title: titles.find((t) => t.id === id)?.title || "—", loans: n }));
  const studentIds = Array.from(new Set(loans.filter((l) => l.memberType === "STUDENT").map((l) => l.memberId)));
  const prog = new Map((await prisma.student.findMany({ where: { id: { in: studentIds.concat(["none"]) } }, select: { id: true, batch: { select: { degreeProgram: true } } } })).map((s) => [s.id, s.batch.degreeProgram]));
  const byProgram = new Map<string, number>(); for (const l of loans) { const k = l.memberType === "STAFF" ? "Staff" : prog.get(l.memberId) || "Other"; byProgram.set(k, (byProgram.get(k) || 0) + 1); }
  const newCopies = copies.filter((c) => new Date(c.acquiredAt || c.createdAt).getFullYear() === year);
  return {
    titles: titles.length, volumes: copies.filter((c) => !["LOST", "WITHDRAWN"].includes(c.status)).length, onLoan: copies.filter((c) => c.status === "ON_LOAN").length,
    overdue: loans.filter((l) => !l.returnedAt && new Date(l.dueAt) < new Date()).length,
    bySubject: Array.from(bySubject.entries()).sort((a, b) => b[1].titles - a[1].titles).map(([subject, v]) => ({ subject, ...v })),
    top, byProgram: Array.from(byProgram.entries()).sort((a, b) => b[1] - a[1]).map(([program, n]) => ({ program, loans: n })),
    newThisYear: newCopies.length, spentThisYear: Math.round(newCopies.reduce((t, c) => t + (c.price || 0), 0)), year,
  };
}

/** Daily: overdue reminders (once every 3 days per loan) and holds not collected in time go to the next person. */
export async function remindLibrary(now = new Date()) {
  try {
    const overdue = (await ldb.libraryLoan.findMany({ where: { returnedAt: null, dueAt: { lt: now }, OR: [{ remindedAt: null }, { remindedAt: { lt: new Date(now.getTime() - 3 * dayMs) } }] }, take: 2000 })) as Loan[];
    const titles = new Map(((await ldb.libraryTitle.findMany({ where: { id: { in: overdue.map((l) => l.titleId).concat(["none"]) } }, select: { id: true, title: true } })) as { id: string; title: string }[]).map((t) => [t.id, t.title]));
    for (const l of overdue) {
      const p = await policyOf(l.chairmanId); const m = await memberById(l.memberType, l.memberId); if (!m) continue;
      await tell(m, l.chairmanId, `Overdue library book: ${titles.get(l.titleId) || "a book"}`, `Due on ${day(l.dueAt)}. Fine so far Rs ${fineOf(l, p.finePerDay, now)} (Rs ${p.finePerDay} a day).`, "/library-desk");
      await ldb.libraryLoan.update({ where: { id: l.id }, data: { remindedAt: now } });
    }
    // Reserved copies not collected within the hold days pass to the next reservation (or back to the shelf).
    const stale = (await ldb.libraryHold.findMany({ where: { status: "READY" } })) as { id: string; chairmanId: string; titleId: string; readyAt: Date }[];
    for (const h of stale) {
      const p = await policyOf(h.chairmanId);
      if (now.getTime() - new Date(h.readyAt).getTime() < p.holdDays * dayMs) continue;
      await ldb.libraryHold.update({ where: { id: h.id }, data: { status: "CANCELLED" } });
      const next = await ldb.libraryHold.findFirst({ where: { titleId: h.titleId, status: "WAITING" }, orderBy: { createdAt: "asc" } });
      if (next) await ldb.libraryHold.update({ where: { id: next.id }, data: { status: "READY", readyAt: now } });
      else { const c = await ldb.libraryCopy.findFirst({ where: { titleId: h.titleId, status: "ON_HOLD" } }); if (c) await ldb.libraryCopy.update({ where: { id: c.id }, data: { status: "AVAILABLE" } }); }
    }
    return overdue.length;
  } catch { return 0; }
}
