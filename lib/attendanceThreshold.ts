import { prisma } from "./db";

export async function getAttendanceThreshold(chairmanId: string | null | undefined): Promise<number> {
  if (!chairmanId) return 75;
  const t = await prisma.attendanceThreshold.findUnique({ where: { chairmanId } });
  return t?.minPercentage ?? 75;
}
