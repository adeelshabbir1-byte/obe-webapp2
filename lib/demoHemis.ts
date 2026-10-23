import { prisma } from "./db";
import { DEMO_HEAD } from "./demoInstitute";
import { hemisCodes, saveHemisCode } from "./hemis";
import { campusNceacPortal } from "./demoNceacPortal";

// Dream University: its HEMIS code and each program's code, level and discipline, and the personal details of every
// student and teacher (not only the NCEAC programs'), so the HEMIS data sets pass their checks. Safe to run again.
export async function campusHemis() {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!head) throw new Error("Build the demo institute first.");
  const codes = await hemisCodes(head.id);
  if (!codes.ready) return ["run prisma/migration_hemis.sql first"];
  const done: string[] = [];
  if (!codes.inst) { await saveHemisCode(head.id, "", { code: "HEI-0423" }, head.id); done.push("institute HEMIS code"); }
  const programs = Array.from(new Set((await prisma.batch.findMany({ where: { coordinator: { managedById: head.id } }, select: { degreeProgram: true } })).map((b) => b.degreeProgram))).sort();
  let n = 0;
  for (const [i, p] of programs.entries()) {
    if (codes.programs.get(p)?.code) continue;
    const discipline = p.replace(/^(BS|BBA|MBA|MS|BE|PhD)\b\s*(\(Hons\))?\s*/i, "").trim() || (/^BBA/i.test(p) ? "Business Administration" : p);
    await saveHemisCode(head.id, p, { code: `0423-${String(101 + i)}`, level: "BS (4 years)", discipline: /^BBA/i.test(p) ? "Business Administration" : discipline, years: 4 }, head.id);
    n++;
  }
  if (n) done.push(`HEMIS codes for ${n} programs`);
  const details = await campusNceacPortal(true);
  done.push(...details.filter((x) => /details/.test(x)));
  return done.length ? done : ["already there"];
}
