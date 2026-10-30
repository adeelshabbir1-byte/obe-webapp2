import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { withErrors } from "../../../lib/apiHandler";
import { chairmanIdFor } from "../../../lib/reportScope";
import { PARTS, aiOverlaps, importApply, importPreview, restoreVersion, saveEntry, saveStopList, type Part } from "../../../lib/courseCatalog";

/**
 * POST { action, ... } — the Course Catalog.
 *   save { id, patch, note }  restore { id, version }  stopList { list }       (Super Admin / curriculum team)
 *   preview { courseId, catalogId, parts }  import { courseId, catalogId, parts } (the course's SE or Program Lead)
 *   aiOverlaps { code }                                                         (anyone signed in)
 */
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const parts = (Array.isArray(b.parts) ? b.parts : []).filter((p: string): p is Part => (PARTS as readonly string[]).includes(p));
  try {
    switch (b.action) {
      case "save": return NextResponse.json({ ok: true, version: await saveEntry(user, String(b.id || ""), b.patch || {}, String(b.note || "")) });
      case "restore": return NextResponse.json({ ok: true, version: await restoreVersion(user, String(b.id || ""), Number(b.version)) });
      case "stopList": await saveStopList(user, Array.isArray(b.list) ? b.list.map(String) : String(b.list || "").split(/\r?\n/)); return NextResponse.json({ ok: true });
      case "preview": if (!parts.length) throw new Error("Choose what to import."); return NextResponse.json({ ok: true, preview: await importPreview(user, String(b.courseId || ""), String(b.catalogId || ""), parts) });
      case "import": if (!parts.length) throw new Error("Choose what to import."); return NextResponse.json({ ok: true, ...(await importApply(user, String(b.courseId || ""), String(b.catalogId || ""), parts)) });
      case "aiOverlaps": { const ch = await chairmanIdFor(user as never).catch(() => ""); return NextResponse.json({ ok: true, ...(await aiOverlaps(ch, String(b.code || ""))) }); }
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "Could not save." }, { status: 400 });
  }
}
export const POST = withErrors(POST_handler);
