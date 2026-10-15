import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { writeAuditLog } from "../../../lib/audit";
import { canEditResources, courseKey, TOOL_CATEGORIES, upsertTextbook } from "../../../lib/courseResources";

const str = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

// A course's tools (software, languages, environments) and textbooks. Adding a book also adds it to the shared pool.
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return bad("not logged in", 401);
  const b = await req.json().catch(() => ({}));
  const course = await prisma.course.findUnique({ where: { id: str(b.courseId, 60) }, select: { id: true, title: true, instructorId: true, subjectExpertId: true, coordinatorId: true } });
  if (!course) return bad("course not found", 404);
  if (!canEditResources(user, course)) return bad("Only the course's teacher, its Subject Expert or its Program Lead can change this.", 403);
  try {
    switch (String(b.action || "")) {
      case "addTool": {
        const name = str(b.name, 80);
        if (!name) return bad("Name the tool.");
        const category = TOOL_CATEGORIES[b.category] ? b.category : "OTHER";
        const row = await prisma.courseTool.upsert({ where: { courseId_name: { courseId: course.id, name } }, create: { courseId: course.id, name, category, version: str(b.version, 40) || null, addedById: user.id }, update: { category, version: str(b.version, 40) || null } });
        return NextResponse.json({ tool: row });
      }
      case "removeTool": {
        await prisma.courseTool.deleteMany({ where: { id: str(b.id, 60), courseId: course.id } });
        return NextResponse.json({ ok: true });
      }
      case "addTextbook": {
        const kind = b.kind === "REFERENCE" ? "REFERENCE" : "TEXT";
        let textbookId = str(b.textbookId, 60);
        const subject = courseKey(course.title);
        if (textbookId) {
          const book = await prisma.textbook.findUnique({ where: { id: textbookId } });
          if (!book) return bad("book not found", 404);
          if (!book.subjects.includes(subject)) await prisma.textbook.update({ where: { id: book.id }, data: { subjects: [...book.subjects, subject] } });
        } else {
          const title = str(b.title, 300);
          if (title.length < 3) return bad("Enter the book's title.");
          const year = Number(b.year) || null;
          textbookId = (await upsertTextbook({ title, authors: str(b.authors, 300) || null, edition: str(b.edition, 40) || null, publisher: str(b.publisher, 160) || null, year: year && year > 1900 && year < 2100 ? year : null, isbn: str(b.isbn, 20) || null }, subject, { createdById: user.id })).id;
        }
        const row = await prisma.courseTextbook.upsert({ where: { courseId_textbookId: { courseId: course.id, textbookId } }, create: { courseId: course.id, textbookId, kind, addedById: user.id }, update: { kind } });
        await writeAuditLog({ actorUserId: user.id, action: "COURSE_TEXTBOOK_ADDED", entityType: "Course", entityId: course.id, metadata: { textbookId, kind } });
        return NextResponse.json({ textbook: row });
      }
      case "removeTextbook": {
        await prisma.courseTextbook.deleteMany({ where: { id: str(b.id, 60), courseId: course.id } });
        return NextResponse.json({ ok: true });
      }
      default:
        return bad("unknown action");
    }
  } catch (e) {
    const msg = String((e as Error)?.message || "");
    if (msg.includes("does not exist")) return bad("Run prisma/migration_master_spec.sql in Supabase first.", 500);
    console.error("course-resources", msg);
    return bad("Could not save.", 500);
  }
}
