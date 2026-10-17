import { NextResponse } from "next/server";
import { prisma } from "./db";
import { setDirectClo, splitInstrument, unsplitInstrument, rubricCloShares, writePartMarks } from "./instrumentParts";
import { parseCriteria } from "./rubrics";

const rdb = prisma as unknown as Record<string, any>;

/** Shared body of the SE / Instructor "direct CLO" endpoint: { action: clo | split | unsplit | split-from-rubric, instrumentId, cloId?, parts? }. */
export async function handleDirect(courseId: string, source: "SE" | "INSTRUCTOR", userId: string, b: Record<string, any>) {
  const id = String(b.instrumentId || "");
  let err: string | null = null;
  try {
    if (b.action === "clo") err = await setDirectClo(courseId, source, id, b.cloId ? String(b.cloId) : null);
    else if (b.action === "split") err = await splitInstrument(courseId, source, id, (Array.isArray(b.parts) ? b.parts : []).map((p: { cloId?: string; marksPct?: number }) => ({ cloId: String(p.cloId || ""), marksPct: Number(p.marksPct) || 0 })));
    else if (b.action === "unsplit") err = await unsplitInstrument(courseId, source, id);
    else if (b.action === "split-from-rubric") {
      const [inst, rubric] = await Promise.all([prisma.assessmentInstrument.findFirst({ where: { id, courseId, source } }), rdb.rubric.findUnique({ where: { instrumentId: id } })]);
      if (!inst || !rubric) err = "Make a rubric for this item first.";
      else {
        const criteria = parseCriteria(rubric.criteriaJson);
        const shares = Array.from(rubricCloShares(criteria).entries());
        const tot = shares.reduce((s, [, w]) => s + w, 0);
        if (shares.length < 2 || !tot) err = "Give the rubric's criteria at least two different CLOs first.";
        else {
          let left = inst.marksPct;
          const parts = shares.map(([cloId, w], i) => { const pct = i === shares.length - 1 ? Math.round(left * 10000) / 10000 : Math.round((inst.marksPct * w / tot) * 100) / 100; left -= pct; return { cloId, marksPct: pct }; });
          err = await splitInstrument(courseId, source, id, parts);
          if (!err) {
            // Marks for students already scored with the rubric.
            const scores = (await rdb.rubricScore.findMany({ where: { rubricId: rubric.id } })) as { studentId: string; levelsJson: string }[];
            for (const s of scores) await writePartMarks(id, courseId, s.studentId, rubric.criteriaJson, JSON.parse(s.levelsJson || "{}"), userId);
          }
        }
      }
    } else err = "unknown action";
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    err = /column|does not exist/i.test(m) ? "Not set up yet — the Super User needs to run prisma/migration_direct_clo.sql." : m.slice(0, 200);
  }
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  const instruments = await prisma.assessmentInstrument.findMany({ where: { courseId, source }, orderBy: [{ type: "asc" }, { label: "asc" }], include: { evidence: { orderBy: { createdAt: "desc" } } } });
  return NextResponse.json({ ok: true, instruments });
}
