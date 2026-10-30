import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { requisitions } from "../../../../lib/courseResources";
import { withErrors } from "../../../../lib/apiHandler";

const LIBRARY_ROLES = ["LIBRARIAN", "CHAIRMAN"];
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const int = (v: unknown) => Math.max(0, Math.min(100000, Math.round(Number(v) || 0)));
const csvCell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

// The textbook requisition list as a spreadsheet (CSV) for purchase orders.
async function GET_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !LIBRARY_ROLES.includes(user.role)) return bad("forbidden", 403);
  const q = req.nextUrl.searchParams;
  const r = await requisitions(await chairmanIdFor(user), q.get("which") === "next" ? "next" : "current", Math.max(1, Number(q.get("per")) || 10), q.get("ref") === "1");
  const lines = [["Title", "Authors", "Edition", "Publisher", "ISBN", "Courses", "Students", "Copies recommended", "In stock", "Ordered", "Received", "To order", "Status", "Note"].join(",")];
  for (const x of r.rows) lines.push([x.title, x.authors, x.edition, x.publisher, x.isbn, x.courses.map((c) => `${c.code} (${c.program})`).join("; "), x.students, x.recommended, x.inStock, x.ordered, x.received, x.shortfall, x.status, x.note].map(csvCell).join(","));
  return new NextResponse(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="textbook-requisition-${r.term.replace(/\s+/g, "-")}.csv"` } });
}

// The librarian records stock, orders and receipts for a book in a term.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !LIBRARY_ROLES.includes(user.role)) return bad("Only the librarian (or the Institute Head) updates requisitions.", 403);
  const b = await req.json().catch(() => ({}));
  const chairmanId = await chairmanIdFor(user);
  const term = typeof b.term === "string" ? b.term.trim().slice(0, 30) : "";
  const textbookId = typeof b.textbookId === "string" ? b.textbookId : "";
  if (!term || !textbookId) return bad("Missing the term or book.");
  const status = ["PENDING", "ORDERED", "RECEIVED", "NOT_NEEDED"].includes(b.status) ? b.status : "PENDING";
  const data = { inStock: int(b.inStock), ordered: int(b.ordered), received: int(b.received), status, note: typeof b.note === "string" ? b.note.trim().slice(0, 300) || null : null, updatedById: user.id };
  try {
    const row = await prisma.libraryRequisition.upsert({ where: { chairmanId_term_textbookId: { chairmanId, term, textbookId } }, create: { chairmanId, term, textbookId, ...data }, update: data });
    return NextResponse.json({ requisition: row });
  } catch {
    return bad("Run prisma/migration_master_spec.sql in Supabase first.", 500);
  }
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
