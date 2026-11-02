import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { getAuthenticatedUser } from "../../../lib/session";
import { chairmanIdFor } from "../../../lib/reportScope";
import { decide, editRow, getPlan, rowsOf, startFromForecast, submit, type Plan } from "../../../lib/yearPlan";
import { addRule, removeRule, savePrefDetail } from "../../../lib/allocBoard";
import { getFlag, setFlag } from "../../../lib/scopedSettings";
import { notifyUsers } from "../../../lib/notifications";
import { withErrors } from "../../../lib/apiHandler";

export const dynamic = "force-dynamic";
const db = prisma as unknown as Record<string, any>;
const ASSIGNERS = ["COURSE_ASSIGNER", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN"];

// POST { action, … } — course allocation (Adeel prompt §25):
//  start {draft} · edit {draft, key, teachers[], visiting, reason} · submit {draft, markVisiting} · withdraw {draft}
//  decide {planId, approve} (HOD / delegate) · pref {courseCode, rank, sections, times} (teacher) · unpref {courseCode}
//  rule {kind, facultyId, courseCode, n, reason} / unrule {id} (HOD) · swap {planId, myRow, otherId, otherRow}
//  swapAnswer {id, accept} · swapApprove {id, approve} · ack {planId} · concern {planId, text}
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const cid = await chairmanIdFor(user as never);
  const b = (await req.json().catch(() => ({}))) as Record<string, any>;
  const assigner = ASSIGNERS.includes(user.role);
  const plan = async () => { const p = await getPlan(user as never, cid, b.draft === "B" ? "B" : "A"); if (!p) throw new Error("Start the plan first."); return p; };
  try {
    switch (b.action) {
      case "start": if (!assigner) break; return NextResponse.json({ rows: await startFromForecast(user as never, cid, b.draft === "B" ? "B" : "A") });
      case "edit": if (!assigner) break; await editRow(user as never, await plan(), String(b.key), (b.teachers || []).map((t: { id: string; name: string; n: number }) => ({ id: String(t.id), name: String(t.name || ""), n: Number(t.n) || 0 })), Number(b.visiting) || 0, b.reason); return NextResponse.json({ ok: true });
      case "submit": if (!assigner) break; await submit(user as never, await plan(), !!b.markVisiting); return NextResponse.json({ ok: true });
      case "withdraw": { if (!assigner) break; const p = await plan(); if (p.status !== "SUBMITTED") throw new Error("Not submitted."); await db.allocationPlan.update({ where: { id: p.id }, data: { status: "DRAFT" } }); return NextResponse.json({ ok: true }); }
      case "decide": { const p = (await db.allocationPlan.findUnique({ where: { id: String(b.planId) } })) as Plan | null; if (!p || p.chairmanId !== cid) throw new Error("Not found."); await decide(user, p, !!b.approve); return NextResponse.json({ ok: true }); }
      case "prefWindow": { if (!["HEAD_OF_DEPARTMENT", "CHAIRMAN", "COURSE_ASSIGNER"].includes(user.role)) break; const { setPrefWindow } = await import("../../../lib/allocExtras"); return NextResponse.json({ ok: true, window: await setPrefWindow(user, cid, String(b.opens || ""), String(b.closes || ""), String(b.note || "")) }); }
      case "mentor": { if (!assigner) break; const { setMentor } = await import("../../../lib/allocExtras"); const { yearLabelNow } = await import("../../../lib/yearPlan"); await setMentor(user, cid, yearLabelNow(), String(b.teacherId), String(b.code), String(b.mentorId || "")); return NextResponse.json({ ok: true }); }
      case "pref": {
        { const block = await (await import("../../../lib/allocExtras")).prefBlock(cid); if (block) throw new Error(block); }
        const code = String(b.courseCode || "").trim().toUpperCase(); if (!code) throw new Error("Which course?");
        const rank = Math.max(1, Math.min(3, Number(b.rank) || 2));
        const had = await prisma.facultyCoursePreference.findFirst({ where: { facultyId: user.id, courseCode: code } });
        if (had) await prisma.facultyCoursePreference.update({ where: { id: had.id }, data: { priority: rank } });
        else await prisma.facultyCoursePreference.create({ data: { facultyId: user.id, courseCode: code, priority: rank } as never });
        await savePrefDetail(user.id, code, String(b.sections || ""), String(b.times || ""));
        return NextResponse.json({ ok: true });
      }
      case "unpref": { const block = await (await import("../../../lib/allocExtras")).prefBlock(cid); if (block) throw new Error(block); }
        await prisma.facultyCoursePreference.deleteMany({ where: { facultyId: user.id, courseCode: String(b.courseCode || "").toUpperCase() } }); return NextResponse.json({ ok: true });
      case "rule": if (!["HEAD_OF_DEPARTMENT", "CHAIRMAN"].includes(user.role)) break; await addRule(user.id, cid, b as never); return NextResponse.json({ ok: true });
      case "unrule": if (!["HEAD_OF_DEPARTMENT", "CHAIRMAN"].includes(user.role)) break; await removeRule(cid, String(b.id)); return NextResponse.json({ ok: true });
      case "swap": {
        const p = (await db.allocationPlan.findUnique({ where: { id: String(b.planId) } })) as Plan | null;
        if (!p || p.status !== "APPROVED") throw new Error("Swaps are for the approved plan.");
        const rows = rowsOf(p);
        if (!rows.find((r) => r.key === b.myRow)?.teachers.some((t) => t.id === user.id) || !rows.find((r) => r.key === b.otherRow)?.teachers.some((t) => t.id === b.otherId)) throw new Error("Choose your section and the other teacher's.");
        const id = randomUUID();
        await db.allocSwap.create({ data: { id, planId: p.id, aId: user.id, aRow: String(b.myRow), bId: String(b.otherId), bRow: String(b.otherRow) } });
        await notifyUsers([String(b.otherId)], { kind: "ASSIGNMENT", title: `${user.name} asks to swap a section with you`, href: "/allocation/year-card" });
        return NextResponse.json({ ok: true });
      }
      case "swapAnswer": {
        const s = await db.allocSwap.findUnique({ where: { id: String(b.id) } });
        if (!s || s.bId !== user.id || s.status !== "ASKED") throw new Error("Not yours to answer.");
        await db.allocSwap.update({ where: { id: s.id }, data: { status: b.accept ? "AGREED" : "DECLINED" } });
        await notifyUsers([s.aId], { kind: "ASSIGNMENT", title: b.accept ? "Swap agreed — waiting for the assigner" : "Swap declined", href: "/allocation/year-card" });
        return NextResponse.json({ ok: true });
      }
      case "swapApprove": {
        if (!assigner) break;
        const s = await db.allocSwap.findUnique({ where: { id: String(b.id) } });
        if (!s || s.status !== "AGREED") throw new Error("Not agreed by both.");
        if (b.approve) {
          const p = (await db.allocationPlan.findUnique({ where: { id: s.planId } })) as Plan;
          const rows = rowsOf(p);
          const ra = rows.find((r) => r.key === s.aRow)!, rb = rows.find((r) => r.key === s.bRow)!;
          const ta = ra.teachers.find((t) => t.id === s.aId)!, tb = rb.teachers.find((t) => t.id === s.bId)!;
          ta.n -= 1; tb.n -= 1;
          const add = (r: typeof ra, id: string, name: string) => { const t = r.teachers.find((x) => x.id === id); if (t) t.n++; else r.teachers.push({ id, name, n: 1 }); };
          add(ra, s.bId, tb.name); add(rb, s.aId, ta.name);
          ra.teachers = ra.teachers.filter((t) => t.n > 0); rb.teachers = rb.teachers.filter((t) => t.n > 0);
          await db.allocationPlan.update({ where: { id: p.id }, data: { rowsJson: JSON.stringify(rows), updatedAt: new Date() } });
        }
        await db.allocSwap.update({ where: { id: s.id }, data: { status: b.approve ? "DONE" : "REFUSED" } });
        await notifyUsers([s.aId, s.bId], { kind: "ASSIGNMENT", title: b.approve ? "Your section swap is done" : "Your section swap was refused", href: "/allocation/year-card" });
        return NextResponse.json({ ok: true });
      }
      case "ack": await setFlag(user.id, `alloc:ack:${b.planId}`, new Date().toISOString()); return NextResponse.json({ ok: true });
      case "concern": {
        const p = (await db.allocationPlan.findUnique({ where: { id: String(b.planId) } })) as Plan | null;
        if (!p) throw new Error("Not found.");
        const text = String(b.text || "").trim(); if (text.length < 5) throw new Error("Say what the concern is.");
        await setFlag(user.id, `alloc:concern:${p.id}`, text.slice(0, 500));
        const to = [p.submittedById, p.approvedById].filter((x): x is string => !!x);
        await notifyUsers(to, { kind: "ASSIGNMENT", title: `${user.name} raised a concern about the year allocation`, body: text, href: "/allocation/year-plan" });
        return NextResponse.json({ ok: true });
      }
    }
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  return NextResponse.json({ error: "Not allowed." }, { status: 403 });
}
export const POST = withErrors(POST_handler);
