import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { writeAuditLog } from "../../../../lib/audit";
import { canEditArticles, helpViewer } from "../../../../lib/help/access";
import { CATEGORIES, EVERYONE, STUDENT } from "../../../../lib/help/types";

const txt = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const ROLE_VALUES = new Set([EVERYONE, STUDENT, "SUPER_USER", "CHAIRMAN", "PROGRAM_COORDINATOR", "SUBJECT_EXPERT", "INSTRUCTOR", "OMC", "COURSE_ASSIGNER", "HEAD_OF_DEPARTMENT", "DEAN", "DEPARTMENT_COORDINATOR", "LAB_ENGINEER", "LAB_MANAGER", "LIBRARIAN", "FINANCE_OFFICER", "STUDENT_AFFAIRS", "FACILITIES_MANAGER"]);
const list = (v: unknown, max: number) => (Array.isArray(v) ? v : String(v ?? "").split(",")).map((x) => txt(x, 80).replace(/,/g, " ")).filter(Boolean).slice(0, max);
const MISSING = "Your own help articles need prisma/migration_help_center.sql to be run in Supabase first.";

// POST — create or update one of the institute's own help articles (the Super User writes them for every institute).
// body: { id?, kind: GUIDE|FAQ, category, title, summary, steps[], whoCan, affects, roles[], pages[], keywords[], href, published, sourceTicketId? }
export async function POST(req: NextRequest) {
  const v = await helpViewer("staff");
  if (!v || !canEditArticles(v)) return NextResponse.json({ error: "Only the Institute Head (or the platform's Super User) writes help articles." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const scope = v.role === "SUPER_USER" ? null : v.id;
  const kind = b.kind === "GUIDE" ? "GUIDE" : "FAQ";
  const category = CATEGORIES.some((c) => c.key === b.category) ? String(b.category) : "help";
  const title = txt(b.title, 200), summary = txt(b.summary, 3000);
  if (title.length < 5 || summary.length < 10) return NextResponse.json({ error: "Give a title (the question, or the task) and the answer." }, { status: 400 });
  const steps = (Array.isArray(b.steps) ? b.steps : []).map((s: unknown) => txt(s, 600)).filter(Boolean).slice(0, 15);
  const roles = list(b.roles, 20).filter((r) => ROLE_VALUES.has(r));
  const pages = list(b.pages, 10).filter((p) => p.startsWith("/"));
  const href = typeof b.href === "string" && b.href.trim().startsWith("/") && !b.href.trim().startsWith("//") ? b.href.trim().slice(0, 300) : null;
  const data = {
    kind, category, title, summary, stepsJson: steps.length ? JSON.stringify(steps) : null, whoCan: txt(b.whoCan, 1000) || null, affects: txt(b.affects, 1000) || null,
    roles: roles.join(","), pages: pages.join(","), keywords: list(b.keywords, 25).join(","), href, published: b.published !== false, updatedById: v.id,
  };
  try {
    if (b.id) {
      const row = await prisma.helpArticle.findUnique({ where: { id: String(b.id) } });
      if (!row || row.chairmanId !== scope) return NextResponse.json({ error: "not found" }, { status: 404 });
      await prisma.helpArticle.update({ where: { id: row.id }, data });
      await writeAuditLog({ actorUserId: v.id, action: "HELP_ARTICLE_UPDATED", entityType: "HelpArticle", entityId: row.id });
      return NextResponse.json({ ok: true, id: row.id });
    }
    let sourceTicketId: string | null = null;
    if (b.sourceTicketId) {
      const t = await prisma.helpTicket.findUnique({ where: { id: String(b.sourceTicketId) }, select: { id: true, chairmanId: true, desk: true } });
      if (t && (t.chairmanId === scope || (scope === null && t.desk === "TECHNICAL"))) sourceTicketId = t.id;
    }
    const row = await prisma.helpArticle.create({ data: { ...data, chairmanId: scope, createdById: v.id, sourceTicketId } });
    await writeAuditLog({ actorUserId: v.id, action: "HELP_ARTICLE_CREATED", entityType: "HelpArticle", entityId: row.id, metadata: { fromTicket: sourceTicketId } });
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: MISSING }, { status: 503 });
  }
}

// DELETE ?id= — remove one of the institute's own articles.
export async function DELETE(req: NextRequest) {
  const v = await helpViewer("staff");
  if (!v || !canEditArticles(v)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const scope = v.role === "SUPER_USER" ? null : v.id;
  try {
    const row = await prisma.helpArticle.findUnique({ where: { id: String(req.nextUrl.searchParams.get("id") || "") } });
    if (!row || row.chairmanId !== scope) return NextResponse.json({ error: "not found" }, { status: 404 });
    await prisma.helpArticle.delete({ where: { id: row.id } });
    await writeAuditLog({ actorUserId: v.id, action: "HELP_ARTICLE_DELETED", entityType: "HelpArticle", entityId: row.id });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: MISSING }, { status: 503 });
  }
}
