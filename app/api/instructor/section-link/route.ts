import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { sdb, syncSection, syncFollowers } from "../../../../lib/sectionLink";
import { writeAuditLog } from "../../../../lib/audit";
import { withErrors } from "../../../../lib/apiHandler";

// An instructor links their sections of the same course to one main section ("teach as one"), unlinks, or syncs now.
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || user.role !== "INSTRUCTOR") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "link") {
      const master = await prisma.course.findFirst({ where: { id: String(b.masterId || ""), instructorId: user.id }, select: { id: true, code: true } });
      if (!master) return NextResponse.json({ error: "Choose your main section." }, { status: 400 });
      if (await sdb.sectionLink.findUnique({ where: { courseId: master.id } })) return NextResponse.json({ error: "The main section cannot itself follow another section." }, { status: 400 });
      const ids: string[] = (Array.isArray(b.courseIds) ? b.courseIds : []).filter((x: unknown) => typeof x === "string" && x !== master.id);
      const others = await prisma.course.findMany({ where: { id: { in: ids }, instructorId: user.id, code: master.code }, select: { id: true } });
      if (!others.length) return NextResponse.json({ error: "Choose at least one other section of the same course." }, { status: 400 });
      for (const o of others) {
        await sdb.sectionLink.deleteMany({ where: { masterId: o.id } }); // a follower cannot be a main section
        await sdb.sectionLink.upsert({ where: { courseId: o.id }, create: { courseId: o.id, masterId: master.id, linkedById: user.id }, update: { masterId: master.id } });
        await syncSection(master.id, o.id);
      }
      await writeAuditLog({ actorUserId: user.id, action: "SECTIONS_LINKED", entityType: "Course", entityId: master.id, metadata: { followers: others.map((o) => o.id).join(",") } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "unlink") {
      const c = await prisma.course.findFirst({ where: { id: String(b.courseId || ""), instructorId: user.id }, select: { id: true } });
      if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
      await sdb.sectionLink.deleteMany({ where: { courseId: c.id } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "sync") {
      const c = await prisma.course.findFirst({ where: { id: String(b.masterId || ""), instructorId: user.id }, select: { id: true } });
      if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
      await syncFollowers(c.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch { return NextResponse.json({ error: "Run prisma/migration_section_link.sql first." }, { status: 500 }); }
}
export const POST = withErrors(POST_handler);
