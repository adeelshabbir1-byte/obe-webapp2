import { prisma } from "./db";

// "Planned vs Taught": compares the Subject Expert's plan (source "SE") with what the Instructor actually did
// (source "INSTRUCTOR") topic by topic — lectures given, weeks spent, which quizzes / assignments / exam questions
// test the topic and how many marks they carry — and checks whether teaching time and assessment weight agree.
//
// Marks of an assessment item are split evenly over the lectures it is linked to, so a 10% midterm question that
// tests two lectures gives 5% to each lecture's topic (nothing is counted twice).

type Src = "SE" | "INSTRUCTOR";
const EXAM_RE = /\b(mid[- ]?term|final)\b.*\b(exam|examination|review)\b|\bexam(ination)?\b/i;
export const isExamTopic = (t: string) => EXAM_RE.test(t || "");
export const norm = (t: string) => (t || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9+#]+/g, " ").trim();
const STOP = new Set("a an the and or of to in on for with by from as at into is are introduction intro overview basics basic part i ii iii iv".split(" "));
const words = (t: string) => new Set(norm(t).split(" ").filter((w) => w.length > 1 && !STOP.has(w)));
export function similarity(a: string, b: string) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let n = 0; A.forEach((w) => { if (B.has(w)) n++; });
  return n / (A.size + B.size - n);
}

export type ItemRef = { label: string; type: string; marks: number };
export type TopicSide = {
  topic: string; lectures: number; planned: number; weeks: number[]; firstLecture: number;
  clos: string[]; marks: number; items: ItemRef[]; lectureShare: number; assessShare: number;
};
export type Flag = { kind: "under" | "unassessed" | "over" | "untaught"; text: string };
export type TopicRow = {
  key: string; topic: string; se: TopicSide | null; ins: TopicSide | null;
  status: "covered" | "partial" | "pending" | "missed" | "extra";
  lectureDiff: number; seFlags: Flag[]; insFlags: Flag[];
};
export type OutcomeRow = { code: string; label: string; seLectures: number; insLectures: number; seMarks: number; insMarks: number; seItems: number; insItems: number };
export type SideSummary = {
  teachingLectures: number; examLectures: number; deliveredLectures: number; totalLectures: number;
  assessedMarks: number; unlinkedMarks: number; instruments: number; alignment: number | null;
  byType: { type: string; count: number; marks: number }[];
};
export type Finding = { level: "bad" | "warn" | "good" | "info"; text: string };
export type TeachingAnalysis = {
  instructorName: string | null; basis: "delivered" | "plan"; topics: TopicRow[]; clos: OutcomeRow[]; plos: OutcomeRow[];
  se: SideSummary; ins: SideSummary; findings: Finding[]; hasInstructorData: boolean;
  handovers?: { from: string; lectures: number; lastLecture: number | null; date: string; reason: string | null }[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;
export const pct = (n: number) => `${round1(n)}%`;

/** Flags that say the topic's teaching time and its assessment weight don't agree. */
function flagsFor(t: TopicSide, who: "SE" | "Instructor", basis: "delivered" | "plan"): Flag[] {
  const out: Flag[] = [];
  const weeks = t.weeks.length;
  const time = `${t.lectures} lecture${t.lectures === 1 ? "" : "s"}${weeks > 1 ? ` over ${weeks} weeks` : ""}`;
  const ls = t.lectureShare * 100, as = t.assessShare * 100;
  if (t.lectures === 0 && t.marks > 0) {
    out.push({ kind: "untaught", text: `${round1(t.marks)}% of course marks are set on this topic but ${basis === "delivered" ? "no lecture on it has been logged as taught" : "it has no lecture"}.` });
    return out;
  }
  if (t.lectures >= 2 && t.marks === 0) {
    out.push({ kind: "unassessed", text: `${time} (${pct(ls)} of teaching time) but no quiz, assignment or exam question tests it.` });
  } else if ((t.lectures >= 3 || (t.lectures >= 2 && ls >= 6)) && as < ls * 0.5) {
    const what = t.items.length ? `only ${t.items.length} item${t.items.length === 1 ? "" : "s"} (${t.items.map((i) => i.label).join(", ")}) worth ${round1(t.marks)}% of marks` : "no assessment";
    out.push({ kind: "under", text: `${time} = ${pct(ls)} of teaching time, but ${what} = ${pct(as)} of assessed marks.${who === "Instructor" ? " The time logged here is not backed by assessment — check that the topic really took this long." : ""}` });
  } else if (as >= 5 && as > ls * 2 && t.lectures > 0) {
    out.push({ kind: "over", text: `${pct(as)} of assessed marks rest on ${time} (${pct(ls)} of teaching time) — heavily examined for the time it got.` });
  }
  return out;
}

export async function analyzeTeaching(courseId: string): Promise<TeachingAnalysis> {
  const course = await prisma.course.findUnique({ where: { id: courseId }, include: { instructor: { select: { name: true } } } });
  const [rows, instruments, clos] = await Promise.all([
    prisma.lectureRow.findMany({ where: { courseId }, orderBy: { lectureNumber: "asc" }, include: { instrumentLinks: true } }),
    prisma.assessmentInstrument.findMany({ where: { courseId } }),
    prisma.cLO.findMany({ where: { courseId }, orderBy: { orderIndex: "asc" }, include: { mappedPlo: { select: { number: true, title: true } } } }),
  ]);
  const cloById = new Map(clos.map((c) => [c.id, c]));
  const insRows = rows.filter((r) => r.source === "INSTRUCTOR");
  const deliveredAny = insRows.some((r) => r.actualDate);
  const basis: "delivered" | "plan" = deliveredAny ? "delivered" : "plan";

  function side(src: Src) {
    const rs = rows.filter((r) => r.source === src);
    const insts = instruments.filter((i) => i.source === src);
    const rowById = new Map(rs.map((r) => [r.id, r]));
    // Lectures that count as "given": every SE lecture; for the Instructor the logged ones (once logging has started).
    const counts = (r: (typeof rs)[number]) => src === "SE" || basis === "plan" || !!r.actualDate;
    const teaching = rs.filter((r) => r.topic.trim() && !isExamTopic(r.topic));
    const teachingGiven = teaching.filter(counts);

    // Split each instrument's marks over the lectures it tests.
    const rowMarks = new Map<string, { inst: (typeof insts)[number]; share: number }[]>();
    let assessed = 0, unlinked = 0;
    const byType = new Map<string, { count: number; marks: number }>();
    for (const inst of insts) {
      const t = byType.get(inst.type) || { count: 0, marks: 0 };
      t.count++; t.marks += inst.marksPct; byType.set(inst.type, t);
      const linked = rs.filter((r) => r.instrumentLinks.some((l) => l.instrumentId === inst.id) && r.topic.trim() && !isExamTopic(r.topic));
      if (!linked.length) { unlinked += inst.marksPct; continue; }
      assessed += inst.marksPct;
      for (const r of linked) {
        const arr = rowMarks.get(r.id) || [];
        arr.push({ inst, share: inst.marksPct / linked.length });
        rowMarks.set(r.id, arr);
      }
    }

    const topics = new Map<string, TopicSide & { itemMap: Map<string, ItemRef> }>();
    const cloStat = new Map<string, { lectures: number; marks: number; items: Set<string> }>();
    const ploStat = new Map<string, { label: string; lectures: number; marks: number; items: Set<string> }>();
    const outcome = (r: (typeof rs)[number]) => {
      const c = r.cloId ? cloById.get(r.cloId) : null;
      return { clo: c?.code || null, plo: c?.mappedPlo ? { key: `PLO-${c.mappedPlo.number}`, label: c.mappedPlo.title } : null };
    };
    for (const r of teaching) {
      const k = norm(r.topic);
      const t = topics.get(k) || { topic: r.topic.trim(), lectures: 0, planned: 0, weeks: [] as number[], firstLecture: r.lectureNumber, clos: [] as string[], marks: 0, items: [] as ItemRef[], lectureShare: 0, assessShare: 0, itemMap: new Map<string, ItemRef>() };
      t.planned++;
      const given = counts(r);
      if (given) { t.lectures++; if (!t.weeks.includes(r.week)) t.weeks.push(r.week); }
      const o = outcome(r);
      if (o.clo && !t.clos.includes(o.clo)) t.clos.push(o.clo);
      for (const m of rowMarks.get(r.id) || []) {
        t.marks += m.share;
        const it = t.itemMap.get(m.inst.id) || { label: m.inst.label, type: m.inst.type, marks: 0 };
        it.marks += m.share; t.itemMap.set(m.inst.id, it);
      }
      topics.set(k, t);
      if (o.clo) {
        const c = cloStat.get(o.clo) || { lectures: 0, marks: 0, items: new Set<string>() };
        if (given) c.lectures++;
        for (const m of rowMarks.get(r.id) || []) { c.marks += m.share; c.items.add(m.inst.id); }
        cloStat.set(o.clo, c);
      }
      if (o.plo) {
        const p = ploStat.get(o.plo.key) || { label: o.plo.label, lectures: 0, marks: 0, items: new Set<string>() };
        if (given) p.lectures++;
        for (const m of rowMarks.get(r.id) || []) { p.marks += m.share; p.items.add(m.inst.id); }
        ploStat.set(o.plo.key, p);
      }
    }
    const nGiven = teachingGiven.length || 1;
    let tvd = 0;
    topics.forEach((t) => {
      t.items = Array.from(t.itemMap.values()).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
      t.lectureShare = t.lectures / nGiven;
      t.assessShare = assessed ? t.marks / assessed : 0;
      tvd += Math.abs(t.lectureShare - t.assessShare);
    });
    const summary: SideSummary = {
      teachingLectures: teachingGiven.length, examLectures: rs.filter((r) => isExamTopic(r.topic)).length,
      deliveredLectures: rs.filter((r) => r.actualDate).length, totalLectures: rs.length,
      assessedMarks: assessed, unlinkedMarks: unlinked, instruments: insts.length,
      alignment: assessed > 0 && teachingGiven.length > 0 ? Math.round(100 * (1 - tvd / 2)) : null,
      byType: Array.from(byType.entries()).map(([type, v]) => ({ type, ...v })).sort((a, b) => b.marks - a.marks),
    };
    void rowById;
    return { topics, cloStat, ploStat, summary };
  }

  const se = side("SE"), ins = side("INSTRUCTOR");

  // Pair the Instructor's topics with the SE's: exact (normalised) wording first, then the closest wording.
  const pairs = new Map<string, string>(); // insKey -> seKey
  const seLeft = new Set(se.topics.keys());
  ins.topics.forEach((_, k) => { if (se.topics.has(k)) { pairs.set(k, k); seLeft.delete(k); } });
  const cand: { ik: string; sk: string; s: number }[] = [];
  ins.topics.forEach((t, ik) => {
    if (pairs.has(ik)) return;
    seLeft.forEach((sk) => { const s = similarity(t.topic, se.topics.get(sk)!.topic); if (s >= 0.5) cand.push({ ik, sk, s }); });
  });
  cand.sort((a, b) => b.s - a.s);
  for (const c of cand) if (!pairs.has(c.ik) && seLeft.has(c.sk)) { pairs.set(c.ik, c.sk); seLeft.delete(c.sk); }

  const strip = (t: (TopicSide & { itemMap?: unknown }) | undefined): TopicSide | null => {
    if (!t) return null;
    const { itemMap, ...rest } = t as TopicSide & { itemMap?: unknown };
    void itemMap;
    return rest;
  };
  const topicRows: TopicRow[] = [];
  const seToIns = new Map<string, string>();
  pairs.forEach((sk, ik) => seToIns.set(sk, ik));
  se.topics.forEach((t, sk) => {
    const i = seToIns.has(sk) ? ins.topics.get(seToIns.get(sk)!) : undefined;
    topicRows.push(row(sk, strip(t), strip(i)));
  });
  ins.topics.forEach((t, ik) => { if (!pairs.has(ik)) topicRows.push(row(ik, null, strip(t))); });

  function row(key: string, s: TopicSide | null, i: TopicSide | null): TopicRow {
    let status: TopicRow["status"];
    if (!s) status = "extra";
    else if (!i) status = "missed";
    else if (i.lectures === 0) status = "pending";
    else if (i.lectures < s.lectures) status = "partial";
    else status = "covered";
    return {
      key, topic: s?.topic || i!.topic, se: s, ins: i, status,
      lectureDiff: (i?.lectures || 0) - (s?.lectures || 0),
      seFlags: s ? flagsFor(s, "SE", "plan") : [],
      insFlags: i ? flagsFor(i, "Instructor", basis) : [],
    };
  }
  topicRows.sort((a, b) => (a.se?.firstLecture ?? 1e6) - (b.se?.firstLecture ?? 1e6) || (a.ins?.firstLecture ?? 1e6) - (b.ins?.firstLecture ?? 1e6));

  const outcomes = (a: Map<string, { lectures: number; marks: number; items: Set<string>; label?: string }>, b: typeof a, labels: Map<string, string>) => {
    const keys = Array.from(new Set([...Array.from(a.keys()), ...Array.from(b.keys()), ...Array.from(labels.keys())]));
    keys.sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
    return keys.map((k) => ({
      code: k, label: labels.get(k) || a.get(k)?.label || b.get(k)?.label || "",
      seLectures: a.get(k)?.lectures || 0, insLectures: b.get(k)?.lectures || 0,
      seMarks: a.get(k)?.marks || 0, insMarks: b.get(k)?.marks || 0,
      seItems: a.get(k)?.items.size || 0, insItems: b.get(k)?.items.size || 0,
    }));
  };
  const cloLabels = new Map<string, string>(), ploLabels = new Map<string, string>();
  for (const c of clos) {
    if (!cloLabels.has(c.code)) cloLabels.set(c.code, c.statement);
    if (c.mappedPlo) ploLabels.set(`PLO-${c.mappedPlo.number}`, c.mappedPlo.title);
  }
  const cloRows = outcomes(se.cloStat, ins.cloStat, cloLabels);
  const ploRows = outcomes(se.ploStat, ins.ploStat, ploLabels);

  // ---- Plain-language findings ----
  const findings: Finding[] = [];
  const hasInstructorData = insRows.length > 0;
  const seTopics = topicRows.filter((t) => t.se);
  if (!hasInstructorData) {
    findings.push({ level: "info", text: "The Instructor has no lecture plan for this course yet, so only the Subject Expert's plan can be checked." });
  } else {
    if (basis === "plan") findings.push({ level: "info", text: "No lecture has been logged with a date yet, so the Instructor's side shows their plan, not delivered lectures." });
    const taught = seTopics.filter((t) => t.status === "covered" || t.status === "partial");
    const coverage = seTopics.length ? Math.round((100 * taught.length) / seTopics.length) : 0;
    findings.push({ level: coverage >= 90 ? "good" : coverage >= 70 ? "warn" : "bad", text: `${taught.length} of ${seTopics.length} planned topics ${basis === "delivered" ? "have been taught" : "are in the Instructor's plan"} (${coverage}%).` });
    const missed = topicRows.filter((t) => t.status === "missed");
    if (missed.length) findings.push({ level: "bad", text: `Dropped from the Instructor's plan: ${missed.map((t) => `${t.topic} (${t.se!.lectures} planned)`).join("; ")}.` });
    const pending = topicRows.filter((t) => t.status === "pending");
    if (pending.length && basis === "delivered") findings.push({ level: "warn", text: `Not taught yet: ${pending.slice(0, 12).map((t) => t.topic).join("; ")}${pending.length > 12 ? ` and ${pending.length - 12} more` : ""}.` });
    const extra = topicRows.filter((t) => t.status === "extra" && (t.ins?.lectures || 0) > 0);
    if (extra.length) findings.push({ level: "warn", text: `Taught but not in the SE's plan: ${extra.map((t) => `${t.topic} (${t.ins!.lectures} lec)`).join("; ")}.` });
    const longer = topicRows.filter((t) => t.se && t.ins && t.ins.lectures - t.se.lectures >= 2);
    if (longer.length) findings.push({ level: "warn", text: `Given more time than planned: ${longer.map((t) => `${t.topic} (${t.se!.lectures} → ${t.ins!.lectures})`).join("; ")}.` });
    const shorter = topicRows.filter((t) => t.se && t.ins && t.ins.lectures > 0 && t.se.lectures - t.ins.lectures >= 2);
    if (shorter.length) findings.push({ level: "warn", text: `Given less time than planned: ${shorter.map((t) => `${t.topic} (${t.se!.lectures} → ${t.ins!.lectures})`).join("; ")}.` });
    const under = topicRows.filter((t) => t.insFlags.some((f) => f.kind === "under" || f.kind === "unassessed"));
    if (under.length) findings.push({ level: "bad", text: `Teaching time not backed by assessment (${under.length} topic${under.length === 1 ? "" : "s"}): ${under.map((t) => `${t.topic} — ${t.ins!.lectures} lec, ${round1(t.ins!.marks)}% marks`).join("; ")}. Long time logged on a topic that is barely tested can mean the time was padded, or the topic is not being assessed as it should.` });
    const over = topicRows.filter((t) => t.insFlags.some((f) => f.kind === "over"));
    if (over.length) findings.push({ level: "warn", text: `Examined far more than they were taught: ${over.map((t) => `${t.topic} — ${t.ins!.lectures} lec, ${round1(t.ins!.marks)}% marks`).join("; ")}. Students are tested heavily on material that got little class time.` });
    const untaught = topicRows.filter((t) => t.insFlags.some((f) => f.kind === "untaught"));
    if (untaught.length && basis === "delivered") findings.push({ level: "bad", text: `Assessed before (or without) being taught: ${untaught.map((t) => `${t.topic} (${round1(t.ins!.marks)}% marks)`).join("; ")}.` });
    const a1 = se.summary.alignment, a2 = ins.summary.alignment;
    if (a2 !== null) findings.push({ level: a2 >= 75 ? "good" : a2 >= 60 ? "warn" : "bad", text: `Teaching–assessment balance: Instructor ${a2}/100${a1 !== null ? `, SE plan ${a1}/100` : ""}. 100 means every topic's share of marks equals its share of lectures.` });
    const ploGap = ploRows.filter((p) => p.seMarks > 0 && p.insMarks === 0);
    if (ploGap.length) findings.push({ level: "bad", text: `GAs the SE planned to assess that the Instructor's assessments don't reach: ${ploGap.map((p) => p.code).join(", ")}.` });
    const ploDrift = ploRows.filter((p) => p.seMarks > 0 && p.insMarks > 0 && Math.abs(p.insMarks - p.seMarks) >= 10);
    if (ploDrift.length) findings.push({ level: "warn", text: `GA weight changed by 10+ marks: ${ploDrift.map((p) => `${p.code} ${round1(p.seMarks)}% → ${round1(p.insMarks)}%`).join("; ")}.` });
    const cloGap = cloRows.filter((c) => c.seMarks > 0 && c.insMarks === 0);
    if (cloGap.length) findings.push({ level: "warn", text: `CLOs not assessed by the Instructor: ${cloGap.map((c) => c.code).join(", ")}.` });
    if (ins.summary.unlinkedMarks > 0) findings.push({ level: "warn", text: `${round1(ins.summary.unlinkedMarks)}% of the Instructor's marks are not linked to any lecture, so they can't be traced to a topic, CLO or GA.` });
  }
  const seUnder = topicRows.filter((t) => t.seFlags.length);
  if (seUnder.length) findings.push({ level: "info", text: `In the SE's own plan, ${seUnder.length} topic${seUnder.length === 1 ? "'s" : "s'"} lecture time and marks don't agree: ${seUnder.map((t) => t.topic).join("; ")}.` });
  if (se.summary.unlinkedMarks > 0) findings.push({ level: "info", text: `${round1(se.summary.unlinkedMarks)}% of the SE's marks are not linked to any lecture.` });

  // Earlier instructors of this offering (leave / leaving): who taught the first lectures.
  let handovers: TeachingAnalysis["handovers"] = [];
  try {
    const hs = (await (prisma as unknown as Record<string, any>).courseHandover.findMany({ where: { courseId }, orderBy: { createdAt: "asc" } })) as { fromUserId: string; lecturesDelivered: number; lastLectureNumber: number | null; createdAt: Date; reason: string | null }[];
    const nm = new Map((hs.length ? await prisma.user.findMany({ where: { id: { in: hs.map((h) => h.fromUserId) } }, select: { id: true, name: true } }) : []).map((u) => [u.id, u.name]));
    handovers = hs.map((h) => ({ from: nm.get(h.fromUserId) || "—", lectures: h.lecturesDelivered, lastLecture: h.lastLectureNumber, date: h.createdAt.toISOString().slice(0, 10), reason: h.reason }));
    for (const h of handovers) findings.unshift({ level: "info", text: `${h.from} taught this course until ${h.date}${h.lastLecture ? ` (lectures up to no. ${h.lastLecture}, ${h.lectures} logged)` : ""}${h.reason ? ` — ${h.reason}` : ""}. Delivery counts include their lectures.` });
  } catch { /* table not created yet */ }
  return {
    handovers,
    instructorName: course?.instructor?.name || null, basis, topics: topicRows, clos: cloRows, plos: ploRows,
    se: se.summary, ins: ins.summary, findings, hasInstructorData,
  };
}
