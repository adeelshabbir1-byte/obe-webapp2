import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { saveMeta, setAffiliation, announceVersion, LIB_HINT, type Meta } from "../../../lib/curriculumLibrary";
import { canEditMeta } from "../../../lib/curriculumLibraryData";
import { withErrors } from "../../../lib/apiHandler";

const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// POST { action: "meta", id, ...fields } | { action: "bulk", rows: [{ id, code, level, programCode, programName, discipline }] } |
//      { action: "affiliate", collegeId, universityId|null, note } (Super User)
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "affiliate") {
      if (user.role !== "SUPER_USER") return NextResponse.json({ error: "Only the Super User links colleges to universities." }, { status: 403 });
      const isHead = async (id: string) => !!(await prisma.user.findFirst({ where: { id, role: "CHAIRMAN" } }));
      if (!(await isHead(String(b.collegeId))) || (b.universityId && !(await isHead(String(b.universityId))))) return NextResponse.json({ error: "Choose two institutes." }, { status: 400 });
      await setAffiliation(user.id, String(b.collegeId), b.universityId ? String(b.universityId) : null, str(b.note, 300));
      return NextResponse.json({ ok: true, message: b.universityId ? "Affiliated. The college now sees the university's curricula and follows them." : "Affiliation ended." });
    }
    const one = async (id: string, f: Record<string, unknown>) => {
      const c = await prisma.masterCurriculum.findUnique({ where: { id }, select: { id: true, chairmanId: true, title: true, version: true } });
      if (!c || !(await canEditMeta(user, c))) throw new Error("You can rename only your own institute's curricula (the Super User renames official ones).");
      const year = f.effectiveYear === undefined ? undefined : Number(f.effectiveYear) || null;
      const m: Partial<Meta> = { code: str(f.code, 40) || undefined, level: f.level !== undefined ? str(f.level, 10) || null : undefined, programCode: str(f.programCode, 8) || undefined, programName: f.programName !== undefined ? str(f.programName, 120) || null : undefined, discipline: f.discipline !== undefined ? str(f.discipline, 40) || null : undefined, notificationNo: f.notificationNo !== undefined ? str(f.notificationNo, 120) || null : undefined, effectiveTerm: f.effectiveTerm !== undefined ? str(f.effectiveTerm, 10) || null : undefined, effectiveYear: year ?? (f.effectiveYear === undefined ? undefined : null),
        lockScheme: f.lockScheme === undefined ? undefined : f.lockScheme === true, lockGa: f.lockGa === undefined ? undefined : f.lockGa === true, lockClo: f.lockClo === undefined ? undefined : f.lockClo === true };
      if (f.title || f.version) await prisma.masterCurriculum.update({ where: { id }, data: { ...(str(f.title, 160) ? { title: str(f.title, 160) } : {}), ...(str(f.version, 40) ? { version: str(f.version, 40) } : {}) } });
      const saved = await saveMeta(id, user.id, m);
      if (c.chairmanId && year && f.announce === true) await announceVersion(c.chairmanId, c, saved.effectiveTerm, saved.effectiveYear);
      return saved;
    };
    if (b.action === "meta") { await one(String(b.id), b); return NextResponse.json({ ok: true, message: "Saved." }); }
    if (b.action === "bulk") {
      const rows: Record<string, unknown>[] = Array.isArray(b.rows) ? b.rows.slice(0, 1000) : [];
      let n = 0; const errs: string[] = [];
      for (const r of rows) { try { await one(String(r.id), r); n++; } catch (e) { errs.push((e as Error).message); } }
      return NextResponse.json({ ok: true, message: `${n} curricula named.${errs.length ? ` ${errs.length} not changed: ${errs[0]}` : ""}` });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    const m = (e as Error).message || "";
    return NextResponse.json({ error: /curriculumMeta|instituteAffiliation|does not exist/.test(m) ? LIB_HINT : m }, { status: 400 });
  }
}
export const POST = withErrors(POST_handler);
