import { prisma } from "./db";
import { similarity } from "./teachingAnalysis";
import { courseEdges } from "./topicLinkPlan";
import { columnData, compareWithLast, db, planSettings, programPlans, type Access } from "./topicPlan";
import { performanceOf, hardestTopics } from "./topicPerformance";
import {
  bankCoverage, bloomDrops, calendarCheck, coreNotAssessed, councilCoverage, findCycle, gaReach, labVsTheory, missingPrereqs, timeBudget,
  type CoursePlan, type Level, type LinkLite,
} from "./topicPlanCore";

// The Checks tab: warnings for the open courses (none blocks saving, except a prerequisite loop, which is refused when
// the link is drawn), and the data of the program map.

const WEEK = 7 * 864e5;

/** Teaching weeks, mid-term week, last teaching week and holiday weeks of a course's semester. */
export async function calendarOf(courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { coordinatorId: true, midtermWeek: true, offeredTermName: true, offeredTermYear: true, midtermStartDate: true, finalStartDate: true, batch: { select: { degreeProgram: true } } } });
  if (!c) return { weeks: 16, midWeek: 8, lastWeek: 16, holidayWeeks: [] as number[], start: null as Date | null };
  const sd = c.offeredTermName && c.offeredTermYear ? await prisma.semesterDates.findFirst({ where: { coordinatorId: c.coordinatorId, termName: c.offeredTermName, termYear: c.offeredTermYear, ...(c.batch ? { degreeProgram: c.batch.degreeProgram } : {}) } }).catch(() => null) : null;
  const start = sd?.semesterStartDate || null;
  const weekOf = (d: Date | null | undefined) => (start && d ? Math.floor((+d - +start) / WEEK) + 1 : null);
  const midStart = c.midtermStartDate || sd?.midtermStartDate || null, finalStart = c.finalStartDate || sd?.finalStartDate || null;
  const midWeek = c.midtermWeek || (weekOf(midStart) ? weekOf(midStart)! - 1 : 8);
  const midLen = sd?.midtermStartDate && sd?.midtermEndDate ? Math.max(1, Math.ceil((+sd.midtermEndDate - +sd.midtermStartDate) / WEEK)) : 1;
  const lastWeek = weekOf(finalStart) ? Math.max(1, weekOf(finalStart)! - 1 - midLen) : 16;
  let holidayWeeks: number[] = [];
  if (start && finalStart) {
    const hs = await prisma.holiday.findMany({ where: { coordinatorId: c.coordinatorId, date: { gte: start, lt: finalStart } }, select: { date: true } });
    // Lecture weeks skip the mid-term week(s).
    holidayWeeks = Array.from(new Set(hs.map((h) => { const w = weekOf(h.date)!; return midWeek && w > midWeek + midLen ? w - midLen : w; })));
  }
  return { weeks: lastWeek, midWeek, lastWeek, holidayWeeks, start: start as Date | null, midLen };
}

export async function checksFor(columns: Access[], viewerRole: string) {
  const out = [];
  const programs = new Map<string, Awaited<ReturnType<typeof programPlans>>>();
  for (const a of columns) {
    if (!programs.has(a.coordinatorId)) programs.set(a.coordinatorId, await programPlans(a.coordinatorId));
    const plans = programs.get(a.coordinatorId)!;
    const data = await columnData(a);
    const settings = await planSettings((await prisma.user.findUnique({ where: { id: a.coordinatorId }, select: { managedById: true } }))?.managedById || "");
    const links = (await prisma.topicPrerequisite.findMany({ where: { coordinatorId: a.coordinatorId, orphanedAt: null, OR: [{ prereqCourseCode: a.code }, { dependentCourseCode: a.code }] } }).catch(() => [])).map((l): LinkLite => ({ prereqCode: l.prereqCourseCode, prereqTopic: l.prereqTopic, dependentCode: l.dependentCourseCode, dependentTopic: l.dependentTopic, strength: l.strength }));
    const cp = new Map<string, CoursePlan>(Array.from(plans.values()).map((p) => [p.code, { code: p.code, semester: p.semester, topics: p.topics }]));
    // This plan as it is now (the open column may be an Instructor's copy).
    cp.set(a.code, { code: a.code, semester: a.semester, topics: data.rows.map((r) => ({ topic: r.topic, bloom: r.bloom, notTaught: r.notTaught })) });
    const level = (r: (typeof data.rows)[number]) => (r.importance || r.prefill) as Level;
    const facts = data.rows.map((r) => ({ id: r.id, topic: r.topic, importance: level(r), cloId: r.cloId, links: r.links, paperItems: r.paperItems, dependents: r.dependents }));
    const council = a.masterCourseId ? await prisma.masterCourseTopic.findMany({ where: { masterCourseId: a.masterCourseId }, select: { topic: true } }) : [];
    const cal = await calendarOf(a.courseId);
    const perf = await performanceOf(a.planCourseId, data.rows.map((r) => ({ id: r.id, topic: r.topic, movedFrom: r.movedFrom })), settings.minStudents);
    const hard = new Set(Object.entries(perf).filter(([, p]) => !p.overall.tooLittle && (p.overall.shown?.avg ?? 100) < 50).map(([id]) => id));
    // Lab follows theory: a lab course and its theory course (same code without the trailing L, or the same title).
    let lab: ReturnType<typeof labVsTheory> = [];
    if (data.lab) {
      const theory = Array.from(plans.values()).find((p) => p.code !== a.code && (a.code.replace(/[- ]?L(ab)?$/i, "") === p.code || similarity(a.title.replace(/lab(oratory)?/i, ""), p.title) >= 0.6) && !/lab/i.test(p.courseType));
      if (theory) {
        const trows = await prisma.lectureRow.findMany({ where: { courseId: theory.id, source: "SE" }, select: { topic: true, week: true } });
        lab = labVsTheory(data.rows.map((r) => ({ topic: r.topic, week: r.week })), trows);
      }
    }
    const bank = bankCoverage(data.rows.map((r) => ({ topic: r.topic, importance: level(r), hard: hard.has(r.id) })), await prisma.questionBankItem.findMany({ where: { courseCode: a.code, active: true, chairmanId: (await prisma.user.findUnique({ where: { id: a.coordinatorId }, select: { managedById: true } }))?.managedById || "none" }, select: { text: true, kind: true, bloom: true } }).catch(() => []), settings.minBankQuestions);
    const clos = await prisma.cLO.findMany({ where: { courseId: a.planCourseId, source: a.plan }, select: { id: true, mappedPlo: { select: { number: true } } } });
    const ga = gaReach(data.rows.map((r) => ({ id: r.id, cloId: r.cloId, importance: level(r) })), new Map(clos.map((c) => [c.id, c.mappedPlo ? [c.mappedPlo.number] : []])));
    const gaWarn = data.rows.filter((r) => level(r) === "OPTIONAL" && ga.onlyPath(r.id).length).map((r) => `"${r.topic}" is Optional but the only topic reaching GA/PLO ${ga.onlyPath(r.id).join(", ")} — dropping it loses that coverage.`);
    out.push({
      courseId: a.courseId, code: a.code, title: a.title,
      missingPrereqs: missingPrereqs(links.filter((l) => l.dependentCode === a.code), cp).map((m) => `${m.link.prereqCode} "${m.link.prereqTopic}" → "${m.link.dependentTopic}": ${m.why}`),
      bloomDrops: bloomDrops(links, cp).map((b) => `"${b.link.dependentTopic}" (${b.link.dependentCode}, C${b.to}) is taught at a lower Bloom level than "${b.link.prereqTopic}" (${b.link.prereqCode}, C${b.from}) that it builds on.`),
      council: council.length ? councilCoverage(data.rows, council) : null,
      budget: timeBudget(data.rows.map((r) => r.importance || r.prefill), cal.lastWeek * 2),
      coreNotAssessed: coreNotAssessed(facts).map((f) => f.topic),
      calendar: calendarCheck(data.rows.map((r) => ({ topic: r.topic, week: r.week, midterm: r.midterm })), { midWeek: cal.midWeek, lastWeek: cal.lastWeek, holidayWeeks: cal.holidayWeeks }),
      labVsTheory: lab.map((l) => `Lab "${l.lab}" (week ${l.labWeek}) comes before the theory "${l.theory}" (week ${l.theoryWeek}).`),
      bank: bank.filter((b) => b.flag).map((b) => `"${b.topic}": ${b.count} question(s) in the bank (fewer than ${settings.minBankQuestions})`),
      bankAll: bank, ga: gaWarn, gaReach: Array.from(ga.per.entries()).map(([plo, ids]) => ({ plo, lectures: ids.length })).sort((x, y) => x.plo - y.plo),
      reading: a.textbook ? data.rows.filter((r) => !r.reading).length : null, textbook: a.textbook,
      noReading: data.rows.filter((r) => !r.reading).map((r) => r.topic).slice(0, 50),
      lastSemester: await compareWithLast(a.planCourseId, a.plan),
    });
  }
  // Loops anywhere in the programs of the open courses.
  const loops: string[] = [];
  for (const coordinatorId of Array.from(programs.keys())) { const l = findCycle(await courseEdges(coordinatorId, false)); if (l) loops.push(l.join(" → ")); }
  const hardest = ["PROGRAM_COORDINATOR", "OMC"].includes(viewerRole) ? await hardestTopics(Array.from(programs.keys())) : [];
  return { courses: out, loops, hardest };
}

/** The program map: courses by semester, their topics, the links between topics, the longest chains and key topics. */
export async function programMap(coordinatorId: string) {
  const plans = await programPlans(coordinatorId);
  const links = await prisma.topicPrerequisite.findMany({ where: { coordinatorId, orphanedAt: null } }).catch(() => []);
  const overlaps = await prisma.topicOverlapReview.findMany({ where: { coordinatorId } }).catch(() => []);
  const pending = (await db.topicLinkProposal.findMany({ where: { coordinatorId, status: "PENDING" } }).catch(() => [])) as { fromCode: string; fromTopic: string; toCode: string; toTopic: string; level: string; kind: string }[];
  const courses = Array.from(plans.values()).sort((a, b) => (a.semester ?? 99) - (b.semester ?? 99) || a.code.localeCompare(b.code));
  // Longest chains of course prerequisites (by topic links).
  const edges = Array.from(new Set(links.map((l) => `${l.prereqCourseCode}>${l.dependentCourseCode}`))).map((e) => e.split(">") as [string, string]);
  const memo = new Map<string, string[]>();
  const longest = (c: string, seen: Set<string>): string[] => {
    if (memo.has(c)) return memo.get(c)!;
    let best: string[] = [c];
    for (const [a, b] of edges) if (a === c && !seen.has(b)) { const p = [c, ...longest(b, new Set(seen).add(b))]; if (p.length > best.length) best = p; }
    memo.set(c, best); return best;
  };
  const chains = courses.map((c) => longest(c.code, new Set([c.code]))).filter((p) => p.length > 2).sort((a, b) => b.length - a.length);
  const uniqueChains = chains.filter((p, i) => !chains.slice(0, i).some((q) => q.join(">").includes(p.join(">")))).slice(0, 5);
  const deps = new Map<string, number>();
  for (const l of links) { const k = `${l.prereqCourseCode}|${l.prereqTopic}`; deps.set(k, (deps.get(k) || 0) + 1); }
  const keyTopics = Array.from(deps.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => { const [code, topic] = k.split("|"); return { code, topic, dependents: n }; });
  return {
    courses: courses.map((c) => ({ id: c.id, code: c.code, title: c.title, semester: c.semester, topics: c.topics.map((t) => ({ topic: t.topic, importance: t.importance, notTaught: t.notTaught })) })),
    links: links.map((l) => ({ from: l.prereqCourseCode, fromTopic: l.prereqTopic, to: l.dependentCourseCode, toTopic: l.dependentTopic, level: l.strength, kind: "PREREQ", pending: false }))
      .concat(overlaps.map((o) => ({ from: o.codeA, fromTopic: o.topicA, to: o.codeB, toTopic: o.topicB, level: o.verdict, kind: "OVERLAP", pending: false })))
      .concat(pending.map((p) => ({ from: p.fromCode, fromTopic: p.fromTopic, to: p.toCode, toTopic: p.toTopic, level: p.level, kind: p.kind, pending: true }))),
    chains: uniqueChains, keyTopics,
  };
}

/**
 * "Open the chain" from a course: the courses that need it (down), what it needs (up), or both; confirmed links first
 * (ticked), courses reached only through suggested or pending links listed separately (unticked). Same-batch copies are
 * preferred so the chain opens the courses the same students take.
 */
export async function chainFor(courseId: string, dir: "down" | "up" | "both") {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, coordinatorId: true, batchId: true } });
  if (!c) return null;
  const plans = await programPlans(c.coordinatorId);
  const confirmed = await courseEdges(c.coordinatorId, false);
  const pending = ((await db.topicLinkProposal.findMany({ where: { coordinatorId: c.coordinatorId, status: "PENDING", kind: "PREREQ" } }).catch(() => [])) as { fromCode: string; toCode: string }[]).map((p) => [p.fromCode, p.toCode] as [string, string]);
  const masters = await prisma.masterCourse.findMany({ where: { id: { in: Array.from(plans.values()).map((p) => p.masterCourseId).filter((x): x is string => !!x).concat("none") } }, select: { id: true, prerequisiteCourseId: true } }).catch(() => []);
  const codeOfMaster = new Map(Array.from(plans.values()).filter((p) => p.masterCourseId).map((p) => [p.masterCourseId!, p.code]));
  const council = Array.from(plans.values()).flatMap((p) => { const m = masters.find((x) => x.id === p.masterCourseId); const pre = m?.prerequisiteCourseId ? codeOfMaster.get(m.prerequisiteCourseId) : null; return pre ? [[pre, p.code] as [string, string]] : []; });
  const sameBatch = c.batchId ? await prisma.course.findMany({ where: { batchId: c.batchId }, select: { id: true, code: true } }) : [];
  const idOf = (code: string) => sameBatch.find((x) => x.code === code)?.id || plans.get(code)?.id || "";
  const list = Array.from(plans.values()).map((p) => ({ id: p.code, code: p.code, title: p.title, semester: p.semester }));
  const r = (await import("./topicPlanCore")).chainOf(c.code, list, confirmed, pending.concat(council), dir);
  const shape = (x: { code: string; title: string; semester: number | null }) => ({ id: idOf(x.code), code: x.code, title: x.title, semester: x.semester });
  return { confirmed: r.confirmed.map(shape).filter((x) => x.id), suggestedOnly: r.suggestedOnly.map(shape).filter((x) => x.id), preview: r.preview };
}

/** The same course at other universities of the consortium (read-only reference). */
export async function consortiumReference(courseId: string) {
  const c = await prisma.course.findUnique({ where: { id: courseId }, select: { code: true, title: true, coordinator: { select: { managedById: true } } } });
  if (!c) return [];
  const members = ((await db.consortiumMember.findMany({ where: { status: "ACTIVE" } }).catch(() => [])) as { chairmanId: string }[]).map((m) => m.chairmanId);
  if (!members.includes(c.coordinator.managedById || "")) return [];
  const others = await prisma.course.findMany({ where: { coordinator: { managedById: { in: members.filter((m) => m !== c.coordinator.managedById).concat("none") } }, OR: [{ code: c.code }, { title: { contains: c.title.split(/\s+/).slice(0, 2).join(" "), mode: "insensitive" } }] }, select: { id: true, code: true, title: true, coordinator: { select: { managedBy: { select: { name: true } } } } }, take: 20 });
  const close = others.filter((o) => o.code === c.code || similarity(o.title, c.title) >= 0.6).slice(0, 5);
  const out = [];
  for (const o of close) {
    const rows = await prisma.lectureRow.findMany({ where: { courseId: o.id, source: "SE" }, select: { topic: true }, orderBy: { lectureNumber: "asc" } });
    if (rows.length) out.push({ university: o.coordinator.managedBy?.name || "Another university", code: o.code, title: o.title, topics: rows.map((r) => r.topic) });
  }
  return out;
}

/**
 * Daily: ready help for a usually-hard topic is offered to the instructor a week before that topic's lecture
 * (once per course and topic).
 */
export async function offerTopicHelp(now = new Date()) {
  const help = ((await db.topicHelp.findMany({}).catch(() => [])) as { coordinatorId: string; courseCode: string; topicKey: string; title: string; url: string | null; kind: string }[]);
  if (!help.length) return 0;
  const { notifyUsers } = await import("./notifications");
  const { topicKey } = await import("./topicPlanCore");
  let sent = 0;
  const pairs = Array.from(new Set(help.map((h) => `${h.coordinatorId}|${h.courseCode}`)));
  for (const p of pairs) {
    const [coordinatorId, code] = p.split("|");
    const courses = await prisma.course.findMany({ where: { coordinatorId, code, isOffered: true, instructorId: { not: null } }, select: { id: true, instructorId: true } });
    for (const c of courses) {
      const cal = await calendarOf(c.id);
      if (!cal.start) continue;
      const rows = await prisma.lectureRow.findMany({ where: { courseId: c.id, source: "INSTRUCTOR" }, select: { id: true, topic: true, week: true } });
      const perf = await performanceOf(c.id, rows.map((r) => ({ id: r.id, topic: r.topic })));
      for (const r of rows) {
        const w = r.week + (cal.midWeek && r.week > cal.midWeek ? cal.midLen || 1 : 0);
        const days = (+cal.start + (w - 1) * 7 * 864e5 - +now) / 864e5;
        if (days < 0 || days > 7) continue;
        const k = topicKey(r.topic);
        const items = help.filter((h) => h.coordinatorId === coordinatorId && h.courseCode === code && h.topicKey === k);
        const pf = perf[r.id]?.overall;
        if (!items.length || !pf || pf.tooLittle || (pf.shown?.avg ?? 100) >= 50) continue;
        if (await db.topicHelpSent.findUnique({ where: { courseId_topicKey: { courseId: c.id, topicKey: k } } }).catch(() => null)) continue;
        await notifyUsers([c.instructorId], { kind: "TOPIC_SUGGESTION", title: `Next week: "${r.topic}" is usually hard (${pf.shown?.avg}% average)`, body: `Ready help: ${items.map((i) => `${i.title}${i.url ? ` (${i.url})` : ""}`).join("; ")}`, href: "/faculty/topic-workspace" });
        await db.topicHelpSent.create({ data: { courseId: c.id, topicKey: k } }).catch(() => null);
        sent++;
      }
    }
  }
  return sent;
}
