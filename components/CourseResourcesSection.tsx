import { prisma } from "../lib/db";
import { canEditResources, recommendTextbooks, TOOL_CATALOG, TOOL_CATEGORIES, toolSuggestions } from "../lib/courseResources";
import CourseResourcesEditor from "./CourseResourcesEditor";

/** Loads a course's tools and textbooks (with suggestions and the HEC pool's recommendations) for the editor. */
export default async function CourseResourcesSection({ courseId, user }: { courseId: string; user: { id: string } }) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, title: true, instructorId: true, subjectExpertId: true, coordinatorId: true, coordinator: { select: { managedById: true } } } });
  if (!course) return null;
  try {
    const [tools, chosen, suggestions, recommendations] = await Promise.all([
      prisma.courseTool.findMany({ where: { courseId }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
      prisma.courseTextbook.findMany({ where: { courseId }, orderBy: [{ kind: "desc" }, { createdAt: "asc" }] }),
      toolSuggestions({ id: course.id, title: course.title, chairmanId: course.coordinator.managedById || "" }),
      recommendTextbooks(course),
    ]);
    const books = new Map((await prisma.textbook.findMany({ where: { id: { in: chosen.map((c) => c.textbookId).concat(["none"]) } } })).map((b) => [b.id, b]));
    return (
      <CourseResourcesEditor
        courseId={course.id} canEdit={canEditResources(user, course)} catalog={TOOL_CATALOG} categories={TOOL_CATEGORIES} suggestions={suggestions} recommendations={recommendations}
        tools={tools.map((t) => ({ id: t.id, name: t.name, category: t.category, version: t.version }))}
        books={chosen.filter((c) => books.has(c.textbookId)).map((c) => { const b = books.get(c.textbookId)!; return { id: c.id, textbookId: b.id, kind: c.kind, title: b.title, authors: b.authors, edition: b.edition, publisher: b.publisher, year: b.year }; })}
      />
    );
  } catch {
    return <div className="err">Course tools and textbooks are not set up in the database yet — run prisma/migration_master_spec.sql in Supabase.</div>;
  }
}
