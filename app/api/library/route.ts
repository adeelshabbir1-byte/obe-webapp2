import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getAuthenticatedUser } from "../../../lib/session";
import { writeAuditLog } from "../../../lib/audit";
import { whoIs, str, num, dateOrNull } from "../../../lib/registers";
import { ldb, LIB_HINT, SUBJECTS, findMember, issue, returnCopy, renew, reserve, markLost, payFine, syncLibraryInfo, duesOf, policyOf, fineOf } from "../../../lib/library";

async function who() {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return null;
  const w = await whoIs(user as never);
  return w && (w.librarian || w.head) ? { user, w } : null;
}
const err = (e: unknown) => { const m = String((e as Error).message || e); return NextResponse.json({ error: /does not exist|Cannot read properties of undefined|Unknown arg/.test(m) ? LIB_HINT : m.slice(0, 300) }, { status: 400 }); };

/** GET ?member=<roll no / username> — the member, their loans, fines and holds (the Librarian). ?template=1 — the Excel import template. */
export async function GET(req: Request) {
  const me = await who();
  if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  if (q.get("template")) {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Catalogue");
    ws.addRow(["Title", "Authors", "ISBN", "Edition", "Publisher", "Year", "Subject", "Call number", "Kind (Print / E-book / Database)", "Link", "Accession numbers (comma separated)", "Location", "Price per copy (Rs)"]).font = { bold: true };
    ws.addRow(["Introduction to Algorithms", "Cormen, Leiserson, Rivest, Stein", "9780262046305", "4th", "MIT Press", 2022, "Computing", "005.1 COR", "Print", "", "ACC-1001, ACC-1002", "Shelf C-3", 14500]);
    ws.columns.forEach((c) => { c.width = 22; });
    return new NextResponse((await wb.xlsx.writeBuffer()) as ArrayBuffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="Library catalogue template.xlsx"' } });
  }
  const m = await findMember(me.w.chairmanId, q.get("member") || "");
  if (!m) return NextResponse.json({ error: "No student (roll number) or staff member (username or email) found." }, { status: 404 });
  const d = await duesOf(m.type, m.id); const p = await policyOf(me.w.chairmanId);
  const titles = new Map(((await ldb.libraryTitle.findMany({ where: { id: { in: d.loans.map((l) => l.titleId).concat(["none"]) } }, select: { id: true, title: true } })) as { id: string; title: string }[]).map((t) => [t.id, t.title]));
  return NextResponse.json({ member: m, books: d.books, fines: d.fines, loans: d.loans.filter((l) => !l.returnedAt || fineOf(l, p.finePerDay) > l.finePaid).map((l) => ({ ...l, title: titles.get(l.titleId) || "—", fineNow: fineOf(l, p.finePerDay) })) });
}

/**
 * POST JSON { action, ... } (the Librarian; the Institute Head may also act)
 *   issue { accessionNo, member }   return { accessionNo, damaged }   renew { loanId }   lost { loanId }   pay { loanId, amount, waive, note }
 *   title { id?, title, authors, isbn, edition, publisher, year, subject, callNumber, kind, url }   copies { titleId, accessionNos, location, price, acquiredAt }
 *   withdraw { copyId }   reserve { titleId, member }   policy { studentLimit, studentDays, staffLimit, staffDays, finePerDay, maxRenewals, holdDays }
 * POST multipart { file } — import the catalogue from Excel (the template's columns).
 */
export async function POST(req: Request) {
  const me = await who();
  if (!me) return NextResponse.json({ error: "Only the Librarian works the library desk." }, { status: 403 });
  const H = me.w.chairmanId, by = me.user.id;
  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    try {
      const f = (await req.formData()).get("file");
      if (!(f instanceof File)) return NextResponse.json({ error: "Choose the Excel file." }, { status: 400 });
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await f.arrayBuffer());
      const ws = wb.worksheets[0]; let titles = 0, copies = 0; const problems: string[] = [];
      const cell = (r: ExcelJS.Row, i: number) => { const v = r.getCell(i).value as unknown; return v === null || v === undefined ? "" : typeof v === "object" && v && "text" in (v as object) ? String((v as { text: string }).text) : String(v).trim(); };
      for (let i = 2; i <= ws.rowCount; i++) {
        const r = ws.getRow(i); const title = cell(r, 1); if (!title) continue;
        const kindRaw = cell(r, 9).toLowerCase(); const kind = kindRaw.startsWith("e") ? "EBOOK" : kindRaw.startsWith("d") ? "DATABASE" : "PRINT";
        const isbn = cell(r, 3).replace(/[^0-9Xx]/g, "") || null;
        let t = isbn ? await ldb.libraryTitle.findFirst({ where: { chairmanId: H, isbn } }) : await ldb.libraryTitle.findFirst({ where: { chairmanId: H, title: { equals: title, mode: "insensitive" } } });
        if (!t) { t = await ldb.libraryTitle.create({ data: { id: randomUUID(), chairmanId: H, title: title.slice(0, 300), authors: cell(r, 2) || null, isbn, edition: cell(r, 4) || null, publisher: cell(r, 5) || null, year: Number(cell(r, 6)) || null, subject: cell(r, 7) || "General", callNumber: cell(r, 8) || null, kind, url: cell(r, 10) || null } }); titles++; }
        for (const acc of cell(r, 11).split(/[,;\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean)) {
          try { await ldb.libraryCopy.create({ data: { id: randomUUID(), chairmanId: H, titleId: t.id, accessionNo: acc, location: cell(r, 12) || null, price: Number(cell(r, 13)) || null, acquiredAt: new Date() } }); copies++; }
          catch { problems.push(`row ${i}: accession ${acc} already used`); }
        }
      }
      await syncLibraryInfo(H);
      await writeAuditLog({ actorUserId: by, action: "LIBRARY_IMPORTED", entityType: "LibraryTitle", entityId: H, metadata: { titles, copies } });
      return NextResponse.json({ ok: true, titles, copies, problems: problems.slice(0, 20) });
    } catch (e) { return err(e); }
  }
  const b = await req.json().catch(() => ({}));
  try {
    switch (b.action) {
      case "issue": {
        const m = await findMember(H, str(b.member));
        if (!m) return NextResponse.json({ error: "No student (roll number) or staff member (username or email) found." }, { status: 404 });
        const r = await issue(H, by, str(b.accessionNo), m);
        await writeAuditLog({ actorUserId: by, action: "LIBRARY_ISSUED", entityType: "LibraryLoan", entityId: r.id, metadata: { accession: str(b.accessionNo), member: m.ref } });
        return NextResponse.json({ ok: true, message: `Issued to ${m.name} — due ${r.dueAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.` });
      }
      case "return": {
        const r = await returnCopy(H, by, str(b.accessionNo), b.damaged === true || b.damaged === "true" ? "DAMAGED" : "RETURNED");
        return NextResponse.json({ ok: true, message: `Returned by ${r.member?.name || "the member"}${r.fine ? ` — fine Rs ${r.fine.toLocaleString("en-PK")} to pay` : ""}.` });
      }
      case "renew": { const due = await renew(H, str(b.loanId), null); return NextResponse.json({ ok: true, message: `Renewed until ${due.toLocaleDateString("en-GB")}.` }); }
      case "lost": { const fine = await markLost(H, by, str(b.loanId)); await writeAuditLog({ actorUserId: by, action: "LIBRARY_LOST", entityType: "LibraryLoan", entityId: str(b.loanId), metadata: { fine } }); return NextResponse.json({ ok: true, message: `Marked lost — Rs ${fine.toLocaleString("en-PK")} to pay.` }); }
      case "pay": {
        const waive = b.waive === true || b.waive === "true";
        await payFine(H, str(b.loanId), num(b.amount) || 0, waive, str(b.note, 300));
        await writeAuditLog({ actorUserId: by, action: waive ? "LIBRARY_FINE_WAIVED" : "LIBRARY_FINE_PAID", entityType: "LibraryLoan", entityId: str(b.loanId), metadata: { amount: num(b.amount) || 0 } });
        return NextResponse.json({ ok: true });
      }
      case "title": {
        const title = str(b.title, 300); if (title.length < 2) return NextResponse.json({ error: "Give the title." }, { status: 400 });
        const data = { title, authors: str(b.authors, 300) || null, isbn: str(b.isbn).replace(/[^0-9Xx]/g, "") || null, edition: str(b.edition, 40) || null, publisher: str(b.publisher, 200) || null, year: num(b.year) || null, subject: SUBJECTS.includes(str(b.subject)) ? str(b.subject) : str(b.subject, 60) || "General", callNumber: str(b.callNumber, 60) || null, kind: ["PRINT", "EBOOK", "DATABASE"].includes(str(b.kind)) ? str(b.kind) : "PRINT", url: str(b.url, 500) || null };
        if (b.id) { const t = await ldb.libraryTitle.findUnique({ where: { id: str(b.id) } }); if (!t || t.chairmanId !== H) return NextResponse.json({ error: "Not found." }, { status: 404 }); await ldb.libraryTitle.update({ where: { id: t.id }, data }); }
        else await ldb.libraryTitle.create({ data: { id: randomUUID(), chairmanId: H, ...data } });
        await syncLibraryInfo(H);
        return NextResponse.json({ ok: true });
      }
      case "copies": {
        const t = await ldb.libraryTitle.findUnique({ where: { id: str(b.titleId) } });
        if (!t || t.chairmanId !== H) return NextResponse.json({ error: "Not found." }, { status: 404 });
        const accs = str(b.accessionNos, 2000).split(/[,;\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
        if (!accs.length) return NextResponse.json({ error: "Give the accession number(s)." }, { status: 400 });
        let n = 0; const dup: string[] = [];
        for (const acc of accs.slice(0, 200)) { try { await ldb.libraryCopy.create({ data: { id: randomUUID(), chairmanId: H, titleId: t.id, accessionNo: acc, location: str(b.location, 100) || null, price: num(b.price) || null, acquiredAt: dateOrNull(b.acquiredAt) || new Date() } }); n++; } catch { dup.push(acc); } }
        await syncLibraryInfo(H);
        return NextResponse.json({ ok: true, message: `${n} cop${n === 1 ? "y" : "ies"} added${dup.length ? `; already used: ${dup.join(", ")}` : ""}.` });
      }
      case "withdraw": {
        const c = await ldb.libraryCopy.findUnique({ where: { id: str(b.copyId) } });
        if (!c || c.chairmanId !== H) return NextResponse.json({ error: "Not found." }, { status: 404 });
        if (c.status === "ON_LOAN") return NextResponse.json({ error: "Return it first." }, { status: 400 });
        await ldb.libraryCopy.update({ where: { id: c.id }, data: { status: "WITHDRAWN" } }); await syncLibraryInfo(H);
        return NextResponse.json({ ok: true });
      }
      case "reserve": {
        const m = await findMember(H, str(b.member)); if (!m) return NextResponse.json({ error: "Member not found." }, { status: 404 });
        await reserve(H, str(b.titleId), m); return NextResponse.json({ ok: true, message: `Reserved for ${m.name}.` });
      }
      case "policy": {
        const n = (k: string, lo: number, hi: number, d: number) => Math.max(lo, Math.min(hi, Number(b[k]) || d));
        const data = { studentLimit: n("studentLimit", 1, 50, 3), studentDays: n("studentDays", 1, 120, 14), staffLimit: n("staffLimit", 1, 100, 10), staffDays: n("staffDays", 1, 365, 30), finePerDay: Math.max(0, Math.min(1000, Number(b.finePerDay) || 0)), maxRenewals: Math.max(0, Math.min(10, Number(b.maxRenewals) || 0)), holdDays: n("holdDays", 1, 14, 3), catalogueFigures: !(b.catalogueFigures === false || b.catalogueFigures === "false") };
        await ldb.libraryPolicy.upsert({ where: { chairmanId: H }, create: { chairmanId: H, ...data, updatedById: by }, update: { ...data, updatedById: by, updatedAt: new Date() } });
        await writeAuditLog({ actorUserId: by, action: "LIBRARY_RULES_SAVED", entityType: "LibraryPolicy", entityId: H, metadata: data });
        await syncLibraryInfo(H);
        return NextResponse.json({ ok: true });
      }
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) { return err(e); }
}
