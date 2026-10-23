import { prisma } from "./db";
import { bodyOfProgram } from "./accreditation/bodies";

// Which courses — theory, lab, project, general education — teach each graduate attribute of a batch, through the
// course–GA map and the CLO→GA mapping. Computing (NCEAC) and engineering (PEC) programs must show "Modern Tool Usage"
// (GA-5 in the NCEAC list) in their labs, so a program where no lab course maps to it — or a lab that maps to no
// tool-usage GA — is flagged.

export type Kind = "Lab" | "Project" | "General" | "Theory";
export const isLab = (c: { courseType: string; title: string; code: string }) => /lab/i.test(c.courseType) || /\blab(oratory)?\b/i.test(c.title) || /L$/i.test(c.code.trim());
export const kindOf = (c: { courseType: string; title: string; code: string }): Kind => (isLab(c) ? "Lab" : /capstone|project|field/i.test(c.courseType) ? "Project" : /general|ids/i.test(c.courseType) ? "General" : "Theory");
/** The tool-usage GA of a batch: by its title, else number 5. */
export const toolGa = (plos: { id: string; number: number; title: string }[]) => plos.find((p) => /tool/i.test(p.title)) || plos.find((p) => p.number === 5) || null;

export async function gaCoverage(batchId: string, chairmanId: string) {
  const batch = await prisma.batch.findUnique({ where: { id: batchId }, select: { id: true, degreeProgram: true, batchName: true } });
  if (!batch) return null;
  const [plos, courses] = await Promise.all([
    prisma.pLO.findMany({ where: { batchId }, orderBy: { number: "asc" }, select: { id: true, number: true, title: true } }),
    prisma.course.findMany({ where: { batchId }, orderBy: [{ semesterNumber: "asc" }, { code: "asc" }], select: { id: true, code: true, title: true, courseType: true, semesterNumber: true, ploMappings: { select: { ploId: true } }, clos: { where: { source: "SE" }, select: { mappedPloId: true } } } }),
  ]);
  const body = (await bodyOfProgram(chairmanId, batch.degreeProgram)).body;
  const tool = toolGa(plos);
  const gasOf = (c: (typeof courses)[number]) => new Set([...c.ploMappings.map((m) => m.ploId), ...c.clos.map((x) => x.mappedPloId).filter((x): x is string => !!x)]);
  const rows = plos.map((p) => {
    const cs = courses.filter((c) => gasOf(c).has(p.id)).map((c) => ({ code: c.code, title: c.title, kind: kindOf(c), semester: c.semesterNumber }));
    return { number: p.number, title: p.title, total: cs.length, byKind: { Theory: cs.filter((c) => c.kind === "Theory"), Lab: cs.filter((c) => c.kind === "Lab"), Project: cs.filter((c) => c.kind === "Project"), General: cs.filter((c) => c.kind === "General") } };
  });
  const labs = courses.filter(isLab);
  const flags: string[] = [];
  for (const r of rows) if (!r.total) flags.push(`GA-${r.number} (${r.title}) is not taught by any course.`);
  const needsTool = body === "NCEAC" || body === "PEC";
  if (needsTool && tool) {
    const labsTool = labs.filter((c) => gasOf(c).has(tool.id));
    if (!labs.length) flags.push("This program has no lab courses (course type Lab, or \"Lab\" in the title).");
    else if (!labsTool.length) flags.push(`No lab course maps to GA-${tool.number} (${tool.title}). ${body} expects labs to develop modern tool usage — map a CLO of each lab to it.`);
    for (const c of labs.filter((x) => !gasOf(x).has(tool.id))) flags.push(`${c.code} ${c.title}: a lab with no CLO mapped to GA-${tool.number} (${tool.title}).`);
  }
  return { batch, body, tool: tool ? { number: tool.number, title: tool.title } : null, rows, labs: labs.length, flags };
}

/** For the readiness checks: labs of a lead's batches mapping to the tool-usage GA. */
export async function labToolCheck(batchIds: string[]) {
  let labs = 0, ok = 0;
  for (const id of batchIds) {
    const plos = await prisma.pLO.findMany({ where: { batchId: id }, select: { id: true, number: true, title: true } });
    const tool = toolGa(plos);
    if (!tool) continue;
    const cs = await prisma.course.findMany({ where: { batchId: id }, select: { code: true, title: true, courseType: true, ploMappings: { select: { ploId: true } }, clos: { where: { source: "SE" }, select: { mappedPloId: true } } } });
    for (const c of cs.filter(isLab)) { labs++; if (c.ploMappings.some((m) => m.ploId === tool.id) || c.clos.some((x) => x.mappedPloId === tool.id)) ok++; }
  }
  return { labs, ok };
}
