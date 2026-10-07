import { prisma } from "./db";
import type { Prisma } from "@prisma/client";

// Which part of the institute one timetable run covers.
//  - SHARED departments are timetabled together in ONE run (they share rooms and teachers), so nothing can double-book.
//  - A SEPARATE department has its own run and uses only the rooms tagged to it.
export type TimetableScope = {
  key: string; // "SHARED" or a department id
  mode: "SHARED" | "SEPARATE";
  label: string;
  coordinatorIds: string[];
  roomWhere: Prisma.RoomWhereInput;
};

export async function timetableScopeFor(coordinator: { id: string; managedById: string | null }): Promise<TimetableScope> {
  const chairmanId = coordinator.managedById || "";
  const [me, departments, coordinators] = await Promise.all([
    prisma.user.findUnique({ where: { id: coordinator.id }, select: { departmentId: true } }),
    prisma.department.findMany({ where: { chairmanId }, select: { id: true, name: true, timetableMode: true } }),
    prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true, departmentId: true } }),
  ]);
  const mine = departments.find((d) => d.id === me?.departmentId);
  const sharedIds = departments.filter((d) => d.timetableMode !== "SEPARATE").map((d) => d.id);

  if (mine && mine.timetableMode === "SEPARATE") {
    return {
      key: mine.id, mode: "SEPARATE", label: `${mine.name} timetable`,
      coordinatorIds: coordinators.filter((c) => c.departmentId === mine.id).map((c) => c.id),
      roomWhere: { chairmanId, departmentId: mine.id },
    };
  }
  return {
    key: "SHARED", mode: "SHARED", label: "Shared timetable",
    coordinatorIds: coordinators.filter((c) => !c.departmentId || sharedIds.includes(c.departmentId)).map((c) => c.id),
    roomWhere: { chairmanId, OR: [{ departmentId: null }, { departmentId: { in: sharedIds } }] },
  };
}

// Times when these teachers are already teaching in OTHER timetables (another department's own run), so a teacher lent
// across departments is never booked twice.
export async function busyElsewhere(chairmanId: string, scopeKey: string, instructorIds: string[]) {
  if (instructorIds.length === 0) return [];
  const runs = await prisma.timetableRun.findMany({ where: { chairmanId, status: { in: ["COMPLETED", "STOPPED", "RUNNING"] }, NOT: { scopeKey } }, orderBy: { createdAt: "desc" } });
  const latestPerScope = new Map<string, string>();
  for (const r of runs) { const k = r.scopeKey || "SHARED"; if (k !== scopeKey && !latestPerScope.has(k)) latestPerScope.set(k, r.id); }
  if (latestPerScope.size === 0) return [];
  const entries = await prisma.timetableEntry.findMany({
    where: { timetableRunId: { in: Array.from(latestPerScope.values()) }, scheduleSection: { instructorId: { in: instructorIds } } },
    select: { dayOfWeek: true, startHour: true, endHour: true, scheduleSection: { select: { instructorId: true } } },
  });
  return entries.map((e) => ({ facultyId: e.scheduleSection.instructorId, dayOfWeek: e.dayOfWeek, startHour: e.startHour, endHour: e.endHour }));
}
