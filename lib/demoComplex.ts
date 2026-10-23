import { randomUUID } from "crypto";
import { prisma } from "./db";
import { DEMO_HEAD } from "./demoInstitute";
import { programContext } from "./aas";
import { cdb } from "./complexProblems";
import { labTasks } from "./labPlanCore";

// Dream University: knowledge areas (CK1–CK7) for every course of the NCEAC programs, complex computing problems tagged
// on the project and assignment work of the core courses (every student meets at least one), an open-ended task in
// each lab course and the final year projects. P5 (codes and standards) is left uncovered on purpose, so the coverage
// matrix shows a gap. Safe to run again: existing tags are kept.

const KNOW: [RegExp, string][] = [
  [/calculus|algebra|probability|statistic|discrete|numerical/i, "CK1"],
  [/programming|object oriented|data structure|digital logic|operating|organi[sz]ation|automata|algorithm/i, "CK2"],
  [/artificial|machine|network|security|database|compiler|cloud|data science|graphics|natural language|parallel|mobile|web/i, "CK3"],
  [/software|design|human computer|web|mobile|final year|object oriented|database/i, "CK4"],
  [/web|mobile|cloud|compiler|machine learning|lab/i, "CK5"],
  [/professional|entrepreneur|civics|ethic|islamic|ideology|information security/i, "CK6"],
  [/final year|research|technical and business writing|data science/i, "CK7"],
];
const TAGS: [RegExp, string[], string][] = [
  [/data structure/i, ["P1", "P3", "P7", "CK2"], "Design a route planner for a city bus network: choose and justify the data structures under memory and time limits."],
  [/database/i, ["P1", "P2", "P6", "CK3", "CK4"], "Model a hospital's admissions database with conflicting needs of doctors, billing and privacy law."],
  [/software engineering/i, ["P1", "P2", "P6", "P7", "CK4"], "Plan and design a campus transport app with real stakeholders whose requirements conflict."],
  [/artificial intelligence/i, ["P1", "P3", "P4", "CK3"], "Build a timetable scheduler using search and constraints for an unfamiliar, loosely defined problem."],
  [/computer networks/i, ["P1", "P3", "P7", "CK3", "CK5"], "Design the network of a three-building campus with redundancy, budget and growth limits."],
  [/human computer/i, ["P1", "P2", "P6", "CK4", "CK6"], "Redesign a government service form for low-literacy users after field interviews."],
  [/machine learning|natural language|data science/i, ["P1", "P3", "P4", "CK3", "CK7"], "Train and evaluate a model on a noisy local dataset; justify every choice against the literature."],
];

export async function campusComplexProblems() {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!head) throw new Error("Build the demo institute first.");
  const programs = await programContext(head.id);
  const done: string[] = [];
  let know = 0, tags = 0, labs = 0, fyps = 0;
  try { await cdb.complexTarget.count({ where: { chairmanId: head.id } }); } catch { return ["run prisma/migration_complex_profiles.sql first"]; }
  for (const program of programs) {
    const batches = await prisma.batch.findMany({ where: { degreeProgram: program, coordinator: { managedById: head.id } }, select: { id: true } });
    const courses = await prisma.course.findMany({ where: { batchId: { in: batches.map((b) => b.id) } }, select: { id: true, code: true, title: true, courseType: true } });
    // Knowledge areas per course code.
    for (const c of Array.from(new Map(courses.map((x) => [x.code, x])).values())) {
      const areas = Array.from(new Set(KNOW.filter(([re]) => re.test(`${c.title} ${c.courseType === "Lab" ? "lab" : ""}`)).map(([, k]) => k)));
      if (!areas.length) continue;
      const cur = await cdb.courseKnowledge.findUnique({ where: { chairmanId_courseCode: { chairmanId: head.id, courseCode: c.code } } }).catch(() => null);
      if (cur) continue;
      await cdb.courseKnowledge.create({ data: { chairmanId: head.id, courseCode: c.code, areasJson: JSON.stringify(areas) } });
      know++;
    }
    // Complex problems on the project / assignment with the most marks entered.
    for (const c of courses) {
      const t = TAGS.find(([re]) => re.test(c.title));
      if (!t) continue;
      const insts = await prisma.assessmentInstrument.findMany({ where: { courseId: c.id, source: "INSTRUCTOR", marksPct: { gt: 0 }, type: { in: ["Project", "Assignment", "Lab"] } }, select: { id: true, _count: { select: { studentMarks: true } } } as never }) as unknown as { id: string; _count: { studentMarks: number } }[];
      const best = insts.sort((a, b) => b._count.studentMarks - a._count.studentMarks)[0];
      if (!best || !best._count.studentMarks) continue;
      if (await cdb.complexTag.findUnique({ where: { instrumentId: best.id } })) continue;
      await cdb.complexTag.create({ data: { instrumentId: best.id, courseId: c.id, attrsJson: JSON.stringify(t[1]), note: t[2] } });
      tags++;
    }
    // One open-ended task in every lab course.
    for (const c of courses.filter((x) => x.courseType === "Lab" || /L$/.test(x.code))) {
      let tasks = await labTasks(c.id).catch(() => []);
      // A lab course with no plan yet gets its open-ended lab (lab 12) planned.
      if (!tasks.length) {
        await cdb.labTaskPlan.create({ data: { id: randomUUID(), labCourseId: c.id, labNumber: 12, week: 12, topicsJson: "[]", openEnded: true, oelBrief: "Students define the problem, design their own experiment and defend the result.", updatedById: head.id } }).catch(() => null);
        tasks = await labTasks(c.id).catch(() => []);
      }
      const task = tasks[tasks.length > 2 ? tasks.length - 2 : 0];
      if (!task) continue;
      const refId = `${c.id}:${task.labNumber}`;
      if (await cdb.complexTarget.findUnique({ where: { kind_refId: { kind: "LAB", refId } } })) continue;
      await cdb.labTaskPlan.updateMany({ where: { labCourseId: c.id, labNumber: task.labNumber }, data: { openEnded: true, oelBrief: "Students define the problem, design their own experiment and defend the result." } }).catch(() => null);
      await cdb.complexTarget.create({ data: { id: randomUUID(), chairmanId: head.id, kind: "LAB", refId, courseId: c.id, attrsJson: JSON.stringify(["P1", "P3", "P4", "CK5"]), note: `Open-ended: ${task.title}`, updatedById: head.id } });
      labs++;
    }
    // Final year projects with students of these batches.
    const members = await prisma.fypGroupMember.findMany({ where: { status: "JOINED", studentId: { in: (await prisma.student.findMany({ where: { batchId: { in: batches.map((b) => b.id) } }, select: { id: true } })).map((s) => s.id).concat(["none"]) } }, select: { groupId: true } }).catch(() => []);
    for (const g of Array.from(new Set(members.map((m) => m.groupId)))) {
      if (await cdb.complexTarget.findUnique({ where: { kind_refId: { kind: "FYP", refId: g } } })) continue;
      await cdb.complexTarget.create({ data: { id: randomUUID(), chairmanId: head.id, kind: "FYP", refId: g, attrsJson: JSON.stringify(["P1", "P2", "P3", "P6", "P7", "CK3", "CK4", "CK7"]), note: "Real client, conflicting requirements, open design space.", updatedById: head.id } });
      fyps++;
    }
  }
  if (know) done.push(`knowledge areas for ${know} courses`);
  if (tags) done.push(`${tags} complex-problem assessments`);
  if (labs) done.push(`${labs} open-ended labs`);
  if (fyps) done.push(`${fyps} final year projects tagged`);
  return done.length ? done : ["already there"];
}
