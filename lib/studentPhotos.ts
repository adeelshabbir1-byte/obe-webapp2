import { prisma } from "./db";
const pdb = prisma as unknown as Record<string, any>;
/** Photos of some students (studentId → data URL), for lists staff work with. */
export async function studentPhotos(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  try { return new Map(((await pdb.studentPhoto.findMany({ where: { studentId: { in: ids } } })) as { studentId: string; photo: string }[]).map((r) => [r.studentId, r.photo])); } catch { return new Map(); }
}
