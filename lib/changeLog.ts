import { prisma } from "./db";

/** Record who changed a shared figure (library, finance, admission, labs). Never blocks the save. */
export async function logChange(chairmanId: string, area: "LIBRARY" | "FINANCE" | "ADMISSION" | "LABS", summary: string, byId: string) {
  try { await prisma.changeLog.create({ data: { chairmanId, area, summary: summary.slice(0, 300), byId } as never }); } catch { /* audit must not break the save */ }
}
