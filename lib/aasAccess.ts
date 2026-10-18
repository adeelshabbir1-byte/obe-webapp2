import { prisma } from "./db";
import { chairmanIdFor } from "./reportScope";
import { REVIEW_ROLES } from "./reviewScope";
import { programContext, aasSettings } from "./aas";

type U = { id: string; role: string; managedById: string | null };

/** Who may use the AAS page, which NCEAC programs they see, and the chosen program / batch / focal person. */
export async function aasContext(user: U, q: { program?: string | null; batch?: string | null }) {
  if (!REVIEW_ROLES.includes(user.role)) return null;
  const chairmanId = await chairmanIdFor(user);
  if (!chairmanId) return null;
  let programs = await programContext(chairmanId);
  if (user.role === "PROGRAM_COORDINATOR") {
    const mine = new Set((await prisma.batch.findMany({ where: { coordinatorId: user.id }, select: { degreeProgram: true } })).map((b) => b.degreeProgram));
    programs = programs.filter((p) => mine.has(p));
  }
  const program = programs.find((p) => p === q.program) || programs[0] || "";
  const batches = program ? await prisma.batch.findMany({ where: { degreeProgram: program, coordinator: { managedById: chairmanId }, ...(user.role === "PROGRAM_COORDINATOR" ? { coordinatorId: user.id } : {}) }, select: { id: true, batchName: true, startYear: true }, orderBy: { startYear: "asc" } }) : [];
  const batchId = batches.find((b) => b.id === q.batch)?.id || batches[0]?.id || null;
  const st = await aasSettings(chairmanId);
  return { chairmanId, programs, program, batches, batchId, focalId: st.focalId || chairmanId, instituteType: st.instituteType || "CAMPUS", visitType: st.visitType || "Accreditation Visit", canEdit: user.role !== "OMC" };
}
