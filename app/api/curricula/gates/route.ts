import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { withErrors } from "../../../../lib/apiHandler";
import { prisma } from "../../../../lib/db";
import { canBuild } from "../../../../lib/curriculumBuilder";
import { addTopicDep, applyCategoryMap, setCategoryMap, setLabWeek, setNoPrereq, setTotal, setWeights } from "../../../../lib/stageGates";

const db = prisma as unknown as Record<string, any>;
/**
 * POST { curriculumId, action, ... } — the stage-gate data of a curriculum (whoever may build it).
 *   total { total }  noPrereq { masterCourseId, on }  weights { masterCourseId, ploId, weights }  lab { masterCourseId, week, experiment }
 *   dep { masterCourseId, lectureNumber, onCourseId, onLecture }  removeDep { id }  map { fromName, toName }  applyMap {}
 */
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const c = await prisma.masterCurriculum.findUnique({ where: { id: String(b.curriculumId || "") }, select: { id: true, chairmanId: true, authority: true, title: true, status: true } });
  if (!c || !(await canBuild(user as never, c))) return NextResponse.json({ error: "You may not edit this curriculum." }, { status: 403 });
  if (c.status === "PUBLISHED") return NextResponse.json({ error: "A published curriculum is a Golden Copy — start a new revision to change it." }, { status: 409 });
  const own = async (id: string) => { if (!(await prisma.masterCourse.count({ where: { id, masterCurriculumId: c.id } }))) throw new Error("Course not found in this curriculum."); return id; };
  try {
    switch (b.action) {
      case "total": await setTotal(user, c.id, Number(b.total)); break;
      case "noPrereq": await setNoPrereq(await own(String(b.masterCourseId)), b.on === true || b.on === "true"); break;
      case "weights": await setWeights(await own(String(b.masterCourseId)), String(b.ploId || ""), b.weights || Object.fromEntries(Object.keys(b).filter((k) => k.startsWith("w_")).map((k) => [k.slice(2), Number(b[k])]))); break;
      case "lab": await setLabWeek(await own(String(b.masterCourseId)), Number(b.week), String(b.experiment || "")); break;
      case "dep": await addTopicDep(c.id, { masterCourseId: await own(String(b.masterCourseId)), lectureNumber: Number(b.lectureNumber), onCourseId: await own(String(b.onCourseId)), onLecture: Number(b.onLecture) }); break;
      case "removeDep": await db.masterTopicDep.deleteMany({ where: { id: String(b.id || ""), masterCourseId: { in: (await prisma.masterCourse.findMany({ where: { masterCurriculumId: c.id }, select: { id: true } })).map((x) => x.id) } } }); break;
      case "map": await setCategoryMap(c.id, String(b.fromName || ""), String(b.toName || "")); break;
      case "applyMap": return NextResponse.json({ ok: true, message: `${await applyCategoryMap(user, c.id)} course(s) moved to their new categories.` });
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Could not save." }, { status: 400 });
  }
}
export const POST = withErrors(POST_handler);
