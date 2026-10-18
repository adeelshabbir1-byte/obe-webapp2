import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { prisma } from "../../../../../lib/db";
import { STANDARD_SURVEYS } from "../../../../../lib/standardSurveys";

// Program Lead: create the four standard indirect-assessment forms for a batch, one question per PLO (and per PEO for alumni/employers).
export async function POST(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified || user.role !== "PROGRAM_COORDINATOR") return NextResponse.json({ error: "Only the Program Lead creates program surveys." }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const batch = await prisma.batch.findFirst({ where: { id: String(b.batchId || ""), coordinatorId: user.id }, select: { id: true, degreeProgram: true, batchName: true } });
  if (!batch) return NextResponse.json({ error: "Choose one of your batches." }, { status: 400 });
  const plos = await prisma.pLO.findMany({ where: { batchId: batch.id }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true } });
  if (!plos.length) return NextResponse.json({ error: "This batch has no GAs yet." }, { status: 400 });
  const prof = await prisma.programProfile.findFirst({ where: { coordinatorId: user.id, degreeProgram: batch.degreeProgram }, select: { peos: true } }).catch(() => null);
  let peos: string[] = []; try { peos = prof?.peos ? JSON.parse(prof.peos) : []; } catch { peos = []; }
  const keys: string[] = Array.isArray(b.keys) && b.keys.length ? b.keys : STANDARD_SURVEYS.map((s) => s.key);
  let made = 0;
  for (const s of STANDARD_SURVEYS.filter((x) => keys.includes(x.key))) {
    const title = `${s.title} — ${batch.degreeProgram} ${batch.batchName}`;
    if (await prisma.surveyTemplate.count({ where: { coordinatorId: user.id, title } })) continue;
    const qs = [
      ...plos.map((p) => ({ text: s.plo(p.title), mappedPloId: p.id, mappedPeoLabel: null as string | null })),
      ...(s.peo ? peos.map((t, i) => ({ text: s.peo!(t), mappedPloId: null as string | null, mappedPeoLabel: `PEO-${i + 1}` })) : []),
      ...s.extra.map((t) => ({ text: t, mappedPloId: null as string | null, mappedPeoLabel: null as string | null })),
    ];
    await prisma.surveyTemplate.create({ data: { coordinatorId: user.id, title, stakeholderType: s.type, questions: { create: qs.map((q, i) => ({ ...q, orderIndex: i })) } } });
    made++;
  }
  return NextResponse.json({ ok: true, made });
}
