import { randomUUID } from "crypto";
import { prisma } from "./db";
import { writeAuditLog } from "./audit";

// The Institute Head's day-1 set-up: pick the shape of the institute and the disciplines it has; the whole branch
// (faculty → department → program, with the positions that run them) is created pre-filled and trimmed afterwards.

const odb = prisma as unknown as Record<string, any>;
export type Shape = "FDP" | "DP" | "P";
export const SHAPES: { key: Shape; label: string; note: string }[] = [
  { key: "FDP", label: "Faculty → Department → Program", note: "A university: Deans lead faculties, Chairmen / HoDs lead departments." },
  { key: "DP", label: "Department → Program", note: "No faculties: departments report to the Institute Head." },
  { key: "P", label: "Program only", note: "A small college: programs report to the Institute Head directly." },
];
export type TProgram = { name: string; short: string; on: boolean };
export type TDept = { name: string; on: boolean; programs: TProgram[] };
export type TFamily = { key: string; faculty: string; council: string; on: boolean; departments: TDept[] };
const P = (name: string, short: string, on = false): TProgram => ({ name, short, on });
export const FAMILIES: TFamily[] = [
  { key: "computing", faculty: "Faculty of Computing", council: "NCEAC", on: true, departments: [
    { name: "Department of Computer Science", on: true, programs: [P("BS Computer Science", "BSCS", true), P("BS Artificial Intelligence", "BSAI"), P("BS Data Science", "BSDS"), P("BS Cyber Security", "BSCY")] },
    { name: "Department of Software Engineering", on: false, programs: [P("BS Software Engineering", "BSSE", true)] },
    { name: "Department of Information Technology", on: false, programs: [P("BS Information Technology", "BSIT", true)] },
  ] },
  { key: "management", faculty: "Faculty of Management Sciences", council: "NBEAC", on: true, departments: [
    { name: "Department of Management Sciences", on: true, programs: [P("BBA", "BBA", true), P("MBA", "MBA")] },
    { name: "Department of Accounting and Finance", on: false, programs: [P("BS Accounting and Finance", "BSAF", true)] },
    { name: "Department of Commerce", on: false, programs: [P("BS Commerce", "BCOM", true)] },
    { name: "Department of Economics", on: false, programs: [P("BS Economics", "BSECO", true)] },
  ] },
  { key: "engineering", faculty: "Faculty of Engineering", council: "PEC", on: false, departments: [
    { name: "Department of Electrical Engineering", on: true, programs: [P("BSc Electrical Engineering", "BSEE", true)] },
    { name: "Department of Civil Engineering", on: false, programs: [P("BSc Civil Engineering", "BSCE", true)] },
    { name: "Department of Mechanical Engineering", on: false, programs: [P("BSc Mechanical Engineering", "BSME", true)] },
  ] },
  { key: "sciences", faculty: "Faculty of Sciences", council: "HEC", on: false, departments: [
    { name: "Department of Mathematics", on: true, programs: [P("BS Mathematics", "BSMATH", true)] },
    { name: "Department of Physics", on: false, programs: [P("BS Physics", "BSPHY", true)] },
    { name: "Department of Chemistry", on: false, programs: [P("BS Chemistry", "BSCHEM", true)] },
  ] },
  { key: "social", faculty: "Faculty of Social Sciences and Humanities", council: "HEC", on: false, departments: [
    { name: "Department of English", on: true, programs: [P("BS English", "BSENG", true)] },
    { name: "Department of Psychology", on: false, programs: [P("BS Psychology", "BSPSY", true)] },
    { name: "Department of Education", on: false, programs: [P("B.Ed", "BED", true)] },
  ] },
  { key: "health", faculty: "Faculty of Allied Health Sciences", council: "HEC", on: false, departments: [
    { name: "Department of Physical Therapy", on: true, programs: [P("Doctor of Physical Therapy", "DPT", true)] },
    { name: "Department of Nursing", on: false, programs: [P("BS Nursing", "BSN", true)] },
  ] },
];

const clean = (s: unknown, n = 120) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").slice(0, n) : "");

/** Create the structure and its positions. Re-running never creates anything twice (matched by name / scope). */
export async function createStructure(chairmanId: string, shape: Shape, families: TFamily[]) {
  const made = { faculties: 0, departments: 0, programs: 0, positions: 0 };
  const positions = (await odb.orgPosition.findMany({ where: { chairmanId } })) as { id: string; parentId: string | null; role: string; facultyId: string | null; departmentId: string | null; program: string | null }[];
  const pos = async (data: { title: string; role: string; parentId: string | null; facultyId?: string | null; departmentId?: string | null; program?: string | null; holderId?: string | null; offAt?: Date | null }) => {
    const ex = positions.find((p) => p.role === data.role && (p.facultyId || null) === (data.facultyId || null) && (p.departmentId || null) === (data.departmentId || null) && (p.program || null) === (data.program || null));
    if (ex) return ex.id;
    const row = { id: randomUUID(), chairmanId, orderIndex: positions.length, title: data.title, role: data.role, parentId: data.parentId, facultyId: data.facultyId || null, departmentId: data.departmentId || null, program: data.program || null, holderId: data.holderId || null, ...(data.offAt ? { offAt: data.offAt } : {}) };
    await odb.orgPosition.create({ data: row });
    positions.push(row); made.positions++;
    return row.id;
  };
  const root = positions.find((p) => !p.parentId && p.role === "NONE")?.id || (await pos({ title: "Institute Head", role: "NONE", parentId: null, holderId: chairmanId }));
  await pos({ title: "Controller of Examinations", role: "EXAM_CONTROLLER", parentId: root });
  await pos({ title: "QEC Convener", role: "QEC_INCHARGE", parentId: root });

  for (const f of families.filter((x) => x.on)) {
    const fname = clean(f.faculty); if (!fname) continue;
    let facultyId: string | null = null, deanPos = root;
    if (shape === "FDP") {
      const ex = await prisma.faculty.findFirst({ where: { chairmanId, name: fname } });
      facultyId = ex?.id || (await prisma.faculty.create({ data: { chairmanId, name: fname } })).id;
      if (!ex) made.faculties++;
      deanPos = await pos({ title: `Dean, ${fname}`, role: "DEAN", parentId: root, facultyId });
    }
    const depts = shape === "P" ? [{ name: fname.replace(/^Faculty of /i, "Programs of "), on: true, programs: f.departments.filter((d) => d.on).flatMap((d) => d.programs) }] : f.departments.filter((d) => d.on);
    for (const d of depts) {
      const dname = clean(d.name); if (!dname) continue;
      const ex = await prisma.department.findFirst({ where: { chairmanId, name: dname } });
      const dept = ex || (await prisma.department.create({ data: { chairmanId, name: dname, facultyId } }));
      if (!ex) made.departments++; else if (facultyId && !ex.facultyId) await prisma.department.update({ where: { id: ex.id }, data: { facultyId } });
      // Program-only colleges: the department is a container; its Chairman position is switched off (powers pass up).
      const hod = await pos({ title: shape === "P" ? `Head, ${dname}` : `Chairman, ${dname}`, role: "HEAD_OF_DEPARTMENT", parentId: deanPos, departmentId: dept.id, offAt: shape === "P" ? new Date() : null });
      await pos({ title: `OMC Convener, ${dname}`, role: "OMC_CONVENER", parentId: shape === "FDP" ? deanPos : root, departmentId: dept.id });
      for (const p of d.programs.filter((x) => x.on)) {
        const pname = clean(p.name); if (!pname) continue;
        const exP = await prisma.departmentProgram.findFirst({ where: { chairmanId, degreeProgram: pname } });
        if (!exP) { await prisma.departmentProgram.create({ data: { chairmanId, departmentId: dept.id, degreeProgram: pname, accreditationBody: f.council || null, bodySetAt: new Date(), bodySetById: chairmanId } }); made.programs++; }
        await pos({ title: `Program Lead, ${pname}`, role: "PROGRAM_LEAD", parentId: hod, departmentId: exP?.departmentId || dept.id, program: pname });
      }
    }
  }
  await writeAuditLog({ actorUserId: chairmanId, action: "INSTITUTE_STRUCTURE_CREATED", entityType: "User", entityId: chairmanId, metadata: { shape, ...made } }).catch(() => null);
  return made;
}

/** The positions a template / assignment covers: everything except the Institute Head's own box. */
export async function setupPositions(chairmanId: string) {
  const [ps, fs, ds] = await Promise.all([
    odb.orgPosition.findMany({ where: { chairmanId, offAt: null, role: { in: ["DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_LEAD", "EXAM_CONTROLLER", "QEC_INCHARGE", "OMC_CONVENER"] } }, orderBy: [{ orderIndex: "asc" }] }) as Promise<{ id: string; title: string; role: string; facultyId: string | null; departmentId: string | null; program: string | null; holderId: string | null; coversJson: string }[]>,
    prisma.faculty.findMany({ where: { chairmanId }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { chairmanId }, select: { id: true, name: true, facultyId: true } }),
  ]);
  const order = ["EXAM_CONTROLLER", "QEC_INCHARGE", "DEAN", "HEAD_OF_DEPARTMENT", "OMC_CONVENER", "PROGRAM_LEAD"];
  return ps.map((p) => ({ ...p, covers: (() => { try { return JSON.parse(p.coversJson) as string[]; } catch { return []; } })(), scope: p.program || ds.find((d) => d.id === p.departmentId)?.name || fs.find((f) => f.id === p.facultyId)?.name || "Institute" }))
    .sort((a, b) => (a.departmentId || a.facultyId || "").localeCompare(b.departmentId || b.facultyId || "") || order.indexOf(a.role) - order.indexOf(b.role));
}

/** Give a Program Lead their degree program (the record batches hang on), if they don't have it yet. */
export async function ensureDegreeProgram(userId: string, name: string) {
  if (await prisma.degreeProgram.findFirst({ where: { coordinatorId: userId, name } })) return;
  const known = FAMILIES.flatMap((f) => f.departments.flatMap((d) => d.programs)).find((p) => p.name.toLowerCase() === name.toLowerCase())?.short;
  const base = known || name.split(/\s+/).map((w) => (/^(of|and|in|the|&)$/i.test(w) ? "" : w[0])).join("").toUpperCase().replace(/[^A-Z]/g, "") || "PRG";
  let short = base, i = 1;
  while (await prisma.degreeProgram.findFirst({ where: { coordinatorId: userId, shortCode: short } })) short = `${base}${++i}`;
  await prisma.degreeProgram.create({ data: { coordinatorId: userId, name, shortCode: short } }).catch(() => null);
}
