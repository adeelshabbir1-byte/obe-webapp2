import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { labAccessFor } from "../../../../lib/labAccess";
import { labCloOptions } from "../../../../lib/labSessions";

// POST { labCourseId, labNumber, title?, cloId?, criteria? } — a lab session's CLO and (optional) rubric.
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  const b = await req.json().catch(() => ({}));
  const access = user ? await labAccessFor(user, String(b.labCourseId || "")) : null;
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const labNumber = Math.round(Number(b.labNumber));
  if (!(labNumber >= 1 && labNumber <= 60)) return NextResponse.json({ error: "Lab number must be 1–60." }, { status: 400 });
  const allowed = new Set((await labCloOptions(access.lab.id, access.theory?.id || null)).map((c) => c.id));
  const cloId = b.cloId && allowed.has(String(b.cloId)) ? String(b.cloId) : null;
  let criteriaJson: string | null = null;
  if (Array.isArray(b.criteria) && b.criteria.length) {
    const crit = b.criteria.map((c: { id?: string; title?: string; cloId?: string | null; weight?: number; levels?: unknown[] }, i: number) => ({ id: String(c.id || `c${i + 1}`), title: String(c.title || `Criterion ${i + 1}`).slice(0, 120), cloId: c.cloId && allowed.has(String(c.cloId)) ? String(c.cloId) : null, weight: Math.max(0, Number(c.weight) || 0), levels: Array.isArray(c.levels) ? c.levels : [] }));
    const tot = crit.reduce((s: number, c: { weight: number }) => s + c.weight, 0);
    if (Math.abs(tot - 100) > 0.5) return NextResponse.json({ error: `Rubric weights must add up to 100% (now ${tot}%).` }, { status: 400 });
    criteriaJson = JSON.stringify(crit);
  }
  try {
    await (prisma as unknown as Record<string, any>).labManual.upsert({
      where: { courseId_labNumber: { courseId: access.lab.id, labNumber } },
      create: { courseId: access.lab.id, labNumber, title: String(b.title || `Lab ${labNumber}`).slice(0, 160), cloId, criteriaJson },
      update: { ...(b.title ? { title: String(b.title).slice(0, 160) } : {}), cloId, criteriaJson },
    });
  } catch { return NextResponse.json({ error: "Not set up yet — the Super User needs to run prisma/migration_groups_labs.sql." }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
