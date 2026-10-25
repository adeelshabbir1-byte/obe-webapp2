import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { chairmanIdFor } from "../../../../lib/reportScope";
import { canDecide, courseBreaches, decideBreach, deleteRule, saveRule, TYPES, RULES_HINT } from "../../../../lib/assessmentRules";

// POST { action: "save", id?, label, types (comma list), level, minPct?, maxPct?, courseKind, program? } — OMC / Institute Head
//      { action: "delete", id }
//      { action: "decide", courseId, source, ruleId, scope, approve, note? } — OMC or HOD
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  try {
    if (b.action === "save" || b.action === "delete") {
      if (!["OMC", "CHAIRMAN"].includes(user.role)) return NextResponse.json({ error: "Only the OMC sets these rules." }, { status: 403 });
      const chairmanId = await chairmanIdFor(user);
      { // Limits finalised by the Convener are locked until he reopens them; while a round is open only he edits.
        const { rounds } = await import("../../../../lib/omcRules");
        const r = (await rounds(chairmanId))[0];
        if (r?.status === "LOCKED") return NextResponse.json({ error: "The limits are locked by the OMC Convener — he reopens them for a new round." }, { status: 423 });
        if (r?.status === "OPEN") { const { omcCommittee } = await import("../../../../lib/omcCommittee"); const com = await omcCommittee(chairmanId, null); if (com.convenerId && com.convenerId !== user.id) return NextResponse.json({ error: "A round is open: give your opinion per category; the Convener decides the figures." }, { status: 403 }); }
      }
      if (b.action === "delete") { await deleteRule(chairmanId, String(b.id || "")); return NextResponse.json({ ok: true }); }
      const types = String(b.types || "").split(/[,+]/).map((t) => t.trim()).filter(Boolean).map((t) => TYPES.find((x) => x.toLowerCase() === t.toLowerCase()) || t);
      const num = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));
      const minPct = num(b.minPct), maxPct = num(b.maxPct);
      if (!types.length) return NextResponse.json({ error: "Name the assessment types, e.g. Quiz, Assignment." }, { status: 400 });
      if (minPct === null && maxPct === null) return NextResponse.json({ error: "Give a minimum or a maximum %." }, { status: 400 });
      if ([minPct, maxPct].some((x) => x !== null && (!Number.isFinite(x) || x < 0 || x > 100))) return NextResponse.json({ error: "Percentages are 0–100." }, { status: 400 });
      await saveRule(chairmanId, { id: b.id ? String(b.id) : undefined, label: String(b.label || `${types.join(" + ")} ${b.level === "CLO" ? "per CLO" : "of the course"}`).slice(0, 120), types, level: b.level === "CLO" ? "CLO" : "COURSE", minPct, maxPct, courseKind: ["THEORY", "LAB"].includes(b.courseKind) ? b.courseKind : "ALL", program: b.program ? String(b.program) : null }, user.id);
      return NextResponse.json({ ok: true });
    }
    if (["open", "opinion", "lock"].includes(b.action)) {
      const r = await (await import("../../../../lib/omcRules")).ruleAct({ id: user.id, name: user.name, managedById: user.managedById, role: user.role }, b);
      return "error" in r ? NextResponse.json({ error: r.error }, { status: 400 }) : NextResponse.json(r);
    }
    if (b.action === "decide") {
      const courseId = String(b.courseId || ""), source = b.source === "SE" ? "SE" : "INSTRUCTOR";
      if (!(await canDecide(user, courseId))) return NextResponse.json({ error: "Only the OMC or the course's HOD can approve." }, { status: 403 });
      const br = (await courseBreaches(courseId, source)).find((x) => x.ruleId === b.ruleId && x.scope === b.scope);
      if (!br) return NextResponse.json({ error: "This course no longer breaks that rule." }, { status: 400 });
      await decideBreach(courseId, source, br.ruleId, br.scope, br.value, !!b.approve, b.note ? String(b.note).slice(0, 500) : null, user);
      return NextResponse.json({ ok: true });
    }
  } catch { return NextResponse.json({ error: RULES_HINT }, { status: 500 }); }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
