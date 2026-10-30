import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { AFFILIATE_HINT, collegeUniversity, takeDesign, savePolicy, deletePolicy, universitySave, collegeIdsOf } from "../../../lib/affiliates";
import { withErrors } from "../../../lib/apiHandler";

const str = (v: unknown, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// POST { action, ... }
//  College (Institute Head or Program Lead): take / takeAll — the university Subject Expert's design into its courses.
//  University (Institute Head): policy / policyDelete — marks distribution; marks — the heads the university enters.
async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const ok = (message: string) => NextResponse.json({ ok: true, message });
  try {
    if (b.action === "take" || b.action === "takeAll") {
      const head = user.role === "CHAIRMAN" ? user.id : user.role === "PROGRAM_COORDINATOR" ? user.managedById : null;
      if (!head || !(await collegeUniversity(head))) return NextResponse.json({ error: "Only an affiliated college takes its university's design." }, { status: 403 });
      const where = { coordinator: { managedById: head }, ...(user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id } : {}) };
      if (b.action === "take") {
        const c = await prisma.course.findFirst({ where: { id: str(b.courseId, 60), ...where }, select: { id: true } });
        if (!c) throw new Error("Not one of your courses.");
        return ok(await takeDesign(user.id, c.id));
      }
      const ids = (b.courseIds as unknown[] || []).map((x) => str(x, 60)).slice(0, 300);
      const cs = await prisma.course.findMany({ where: { id: { in: ids }, ...where }, select: { id: true } });
      let n = 0; const fails: string[] = [];
      for (const c of cs) { try { await takeDesign(user.id, c.id); n++; } catch (e) { fails.push((e as Error).message); } }
      return ok(`Took the university's design into ${n} course(s).${fails.length ? ` ${fails.length} could not: ${Array.from(new Set(fails)).slice(0, 3).join(" ")}` : ""}`);
    }
    if (user.role !== "CHAIRMAN") return NextResponse.json({ error: "The university's Institute Head sets this." }, { status: 403 });
    if (!(await collegeIdsOf(user.id)).length && b.action !== "policyDelete") return NextResponse.json({ error: "No colleges are affiliated to your university yet." }, { status: 400 });
    if (b.action === "policy") return ok(await savePolicy(user.id, user.id, b));
    if (b.action === "policyDelete") return ok(await deletePolicy(user.id, user.id, str(b.id, 60)));
    if (b.action === "marks") return ok(await universitySave(user.id, user.id, str(b.courseId, 60), str(b.instrumentId, 60), String(b.lines || "").slice(0, 200000)));
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    const m = (e as Error).message || "Failed.";
    return NextResponse.json({ error: /does not exist|relation|P2021/.test(m) ? AFFILIATE_HINT : m }, { status: 400 });
  }
}
export const POST = withErrors(POST_handler);
