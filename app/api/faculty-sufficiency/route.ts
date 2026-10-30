import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { writeAuditLog } from "../../../lib/audit";
import { whoIs, rdb, str, num, staffOf } from "../../../lib/registers";
import { DEFAULT_RULES, FS_HINT, type Rules } from "../../../lib/facultySufficiency";
import { withErrors } from "../../../lib/apiHandler";

/** POST { action: "override", userId, status: "AQ"|"PQ"|"OTHER"|"", note } — a reviewer's decision (blank = back to the profile's);
 *  POST { action: "rules", ...limits } — the institute's limits (head, Dean, HOD). */
async function POST_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const w = await whoIs(user as never);
  if (!w || !(w.leader || w.qec)) return NextResponse.json({ error: "Only the institute head, Dean, HOD or QEC In-charge can change this." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "override") {
      const u = (await staffOf(w.chairmanId)).find((s) => s.id === String(b.userId || ""));
      if (!u) return NextResponse.json({ error: "Teacher not found." }, { status: 404 });
      const status = ["AQ", "PQ", "OTHER"].includes(String(b.status)) ? String(b.status) : "";
      if (!status) await rdb.facultyQualification.deleteMany({ where: { userId: u.id } });
      else { const note = str(b.note, 1000); if (!note) return NextResponse.json({ error: "Give the reason (it goes into the SAR)." }, { status: 400 }); await rdb.facultyQualification.upsert({ where: { userId: u.id }, create: { userId: u.id, chairmanId: w.chairmanId, status, note, setById: w.id }, update: { status, note, setById: w.id, updatedAt: new Date() } }); }
      await writeAuditLog({ actorUserId: w.id, action: "FACULTY_QUALIFICATION_SET", entityType: "User", entityId: u.id, metadata: { status: status || "profile" } });
      return NextResponse.json({ ok: true });
    }
    if (b.action === "rules") {
      const rules = Object.fromEntries(Object.keys(DEFAULT_RULES).map((k) => [k, num(b[k]) ?? DEFAULT_RULES[k as keyof Rules]]));
      await rdb.facultySufficiencyRule.upsert({ where: { chairmanId: w.chairmanId }, create: { chairmanId: w.chairmanId, rulesJson: JSON.stringify(rules) }, update: { rulesJson: JSON.stringify(rules), updatedAt: new Date() } });
      await writeAuditLog({ actorUserId: w.id, action: "FACULTY_SUFFICIENCY_RULES", entityType: "FacultySufficiencyRule", entityId: w.chairmanId, metadata: rules });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    const m = String((e as Error)?.message || "");
    return NextResponse.json({ error: /does not exist|relation|undefined/i.test(m) ? FS_HINT : m.slice(0, 200) }, { status: 500 });
  }
}
export const POST = withErrors(POST_handler);
