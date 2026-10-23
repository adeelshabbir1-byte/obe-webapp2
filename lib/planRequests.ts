import { randomUUID } from "crypto";
import { prisma } from "./db";
import { notifyUsers } from "./notifications";
import { approverFor } from "./approvers";

// Requests a course advisor makes for one student's degree plan, and who decides them:
//   SUMMER_LOAD — up to 12 credit hours in a summer (the policy allows 9)   → the Program Lead of the student's program
//   AHEAD       — a course before its own semester                           → the HOD, the Chairman (Institute Head) or the Dean
//   SUMMER_NEW  — a course in summer the student has never taken             → the Dean (or the Institute Head where there is no Dean)

const rdb = prisma as unknown as Record<string, any>;
export const KINDS: Record<string, { label: string; approvers: string }> = {
  SUMMER_LOAD: { label: "Summer load of 12 credit hours", approvers: "Program Lead" },
  AHEAD: { label: "Course before its semester", approvers: "HOD, Chairman or Dean" },
  SUMMER_NEW: { label: "New course in summer", approvers: "Dean" },
};
export type PlanRequestRow = { id: string; studentId: string; kind: string; courseCode: string | null; termKey: string | null; value: number | null; note: string | null; status: string; requestedById: string; decidedById: string | null; decidedAt: Date | null; decisionNote: string | null; createdAt: Date };

/** Everyone who may decide this kind of request for this student. */
export async function approversFor(studentId: string, kind: string): Promise<string[]> {
  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { batch: { select: { coordinatorId: true, coordinator: { select: { managedById: true, departmentId: true } } } } } });
  const lead = s?.batch?.coordinatorId, chairmanId = s?.batch?.coordinator?.managedById || "", deptId = s?.batch?.coordinator?.departmentId || null;
  if (!lead) return [];
  if (kind === "SUMMER_LOAD") return [lead];
  // The Dean / the Chairman-HoD, or whoever acts for or covers them (lib/approvers.ts).
  const dean = await approverFor(chairmanId, "DEAN", { departmentId: deptId });
  if (kind === "SUMMER_NEW") return dean.ids.length ? dean.ids : [chairmanId];
  const hod = await approverFor(chairmanId, "HEAD_OF_DEPARTMENT", { departmentId: deptId });
  return Array.from(new Set([...hod.ids, ...dean.ids, chairmanId])).filter(Boolean);
}

export async function createRequest(studentId: string, kind: string, d: { courseCode?: string | null; termKey?: string | null; value?: number | null; note?: string | null }, by: { id: string; name: string }) {
  if (!KINDS[kind]) throw new Error("Unknown request.");
  const open = await rdb.planRequest.findFirst({ where: { studentId, kind, courseCode: d.courseCode || null, termKey: d.termKey || null, status: "PENDING" } });
  if (open) throw new Error("The same request is already waiting for a decision.");
  const row = await rdb.planRequest.create({ data: { id: randomUUID(), studentId, kind, courseCode: d.courseCode || null, termKey: d.termKey || null, value: d.value ?? null, note: d.note || null, status: "PENDING", requestedById: by.id, createdAt: new Date() } });
  const s = await prisma.student.findUnique({ where: { id: studentId }, select: { name: true, rollNumber: true } });
  await notifyUsers(await approversFor(studentId, kind), {
    kind: "PLAN_REQUEST", title: `Degree plan request — ${s?.name} (${s?.rollNumber})`,
    body: `${by.name} asks: ${KINDS[kind].label}${d.courseCode ? ` — ${d.courseCode}` : ""}${d.termKey ? ` in ${termKeyLabel(d.termKey)}` : ""}.${d.note ? `\n${d.note}` : ""}`,
    href: "/plan-requests", exceptId: by.id,
  });
  return row;
}

export async function decideRequest(id: string, approve: boolean, note: string | null, by: { id: string; name: string }) {
  const r = (await rdb.planRequest.findUnique({ where: { id } })) as PlanRequestRow | null;
  if (!r || r.status !== "PENDING") throw new Error("Already decided.");
  if (!(await approversFor(r.studentId, r.kind)).includes(by.id)) throw new Error("This request is for someone else to decide.");
  await rdb.planRequest.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: by.id, decidedAt: new Date(), decisionNote: note || null } });
  await notifyUsers([r.requestedById], { kind: "PLAN_REQUEST", title: `Plan request ${approve ? "approved" : "not approved"}`, body: `${KINDS[r.kind]?.label}${r.courseCode ? ` — ${r.courseCode}` : ""}${r.termKey ? ` in ${termKeyLabel(r.termKey)}` : ""}, by ${by.name}.${note ? `\n${note}` : ""}`, href: `/advisor/students/${r.studentId}` });
}

/** Requests waiting for this person, and those they decided recently. */
export async function requestsFor(userId: string) {
  let rows: PlanRequestRow[] = [];
  try { rows = await rdb.planRequest.findMany({ where: { OR: [{ status: "PENDING" }, { decidedById: userId }] }, orderBy: { createdAt: "desc" }, take: 300 }); } catch { return null; }
  const mine: PlanRequestRow[] = [];
  for (const r of rows) if (r.decidedById === userId || (await approversFor(r.studentId, r.kind)).includes(userId)) mine.push(r);
  return mine;
}

export async function requestsOfStudent(studentId: string): Promise<PlanRequestRow[]> {
  try { return await rdb.planRequest.findMany({ where: { studentId }, orderBy: { createdAt: "desc" } }); } catch { return []; }
}

export const termKeyLabel = (k: string) => { const [y, t] = k.split("-"); return `${t === "FA" ? "Fall" : t === "SP" ? "Spring" : "Summer"} ${y}`; };
