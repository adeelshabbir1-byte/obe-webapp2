// Official course content (HEC / NCEAC / the owner's own course data) loaded into a base course: the pure parts —
// CLO tags in a sub-topic, an HEC weekly outline read from its Markdown, spreading a short outline over 32 lectures
// by the published weekly order. Nothing here invents text: missing parts are reported, never filled in.

export type OfficialClo = { code: string; statement: string; bloom: string; placeholder?: boolean };
export type OfficialLecture = { lecture: number; week: number; topic: string; subtopic: string | null; clo: string | null; midterm?: boolean; splitFrom?: string | null };
export type OfficialPlan = { clos: OfficialClo[]; lectures: OfficialLecture[]; missing: string[]; description?: string | null };
export type OutlineWeek = { week: number; module: string | null; topics: string[]; clo?: number | null };

export const PLACEHOLDER = (code: string) => `${code}: statement to be added (not in the source)`;
export const isMidterm = (topic: string) => /^\s*mid[\s-]?term\b/i.test(topic) || /^\s*mid[\s-]?semester exam/i.test(topic);

/** "[CLO1–3]", "[CLO-2]", "(CLO 1, CLO 3)" → the CLO numbers it names, in order (a range "1–3" gives 1, 2, 3). */
export function cloTags(text: string | null | undefined): number[] {
  if (!text) return [];
  const out: number[] = [];
  const re = /[[(]\s*((?:CLO\s*-?\s*\d+\s*(?:[–—\-,&/]|and|to)?\s*)+(?:\d+)?)\s*[\])]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const body = m[1].replace(/CLO\s*-?\s*/gi, "");
    for (const part of body.split(/\s*(?:,|&|\/|and)\s*/i)) {
      const r = part.match(/^(\d+)\s*(?:[–—-]|to)\s*(\d+)$/i);
      if (r) { const a = Number(r[1]), b = Number(r[2]); for (let i = Math.min(a, b); i <= Math.max(a, b) && i - a < 10; i++) out.push(i); }
      else if (/^\d+$/.test(part.trim())) out.push(Number(part.trim()));
    }
  }
  return Array.from(new Set(out.filter((n) => n > 0 && n < 20)));
}

/** A master course's stored lectures (lecture number, topic, sub-topic with CLO tags) → the plan's lectures, unchanged. */
export function fromMasterTopics(rows: { lectureNumber: number; topic: string; subtopic: string | null; cloNumber: number | null }[], cloCount: number): { lectures: OfficialLecture[]; tagged: number[] } {
  const sorted = rows.slice().sort((a, b) => a.lectureNumber - b.lectureNumber);
  const tagged: number[] = [];
  const lectures = sorted.map((r) => {
    const mid = isMidterm(r.topic);
    const tags = cloTags(r.subtopic).concat(cloTags(r.topic));
    const n = mid ? null : r.cloNumber || tags[0] || null;
    if (n) tagged.push(n);
    return { lecture: r.lectureNumber, week: Math.ceil(r.lectureNumber / 2), topic: r.topic, subtopic: r.subtopic, clo: n && (cloCount === 0 || n <= Math.max(cloCount, n)) ? `CLO-${n}` : null, midterm: mid || undefined };
  });
  return { lectures, tagged: Array.from(new Set(tagged)).sort((a, b) => a - b) };
}

const clean = (s: string) => s.replace(/\*\*|__|`/g, "").replace(/<br\s*\/?>/gi, "; ").replace(/\s+/g, " ").trim();
const splitTopics = (s: string) => clean(s).split(/\s*(?:;|•|·|•)\s*/).map((x) => x.replace(/^[-*]\s*/, "").trim()).filter((x) => x && !/^[-–—]+$/.test(x));
const weekNo = (s: string): number[] => {
  const m = s.match(/(\d+)\s*(?:[–—-]|to|&|and)\s*(\d+)/i);
  if (m) { const a = Number(m[1]), b = Number(m[2]); return a <= b && b - a < 8 ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a]; }
  const one = s.match(/\d+/); return one ? [Number(one[0])] : [];
};

/**
 * The weekly breakdown of an HEC course outline written in Markdown — either a table whose columns include "Week" and
 * "Topics" (and optionally "Module"), or "Week 1" / "Weeks 1–2" headings followed by bullet points. Only the section of
 * the course asked for (e.g. "Course I") is read when the file has more than one course.
 */
export function parseOutline(md: string, course?: string): OutlineWeek[] {
  let text = md.replace(/\r/g, "");
  if (course) {
    const lines = text.split("\n");
    const isHead = (l: string) => /^#{1,3}\s/.test(l);
    const start = lines.findIndex((l) => isHead(l) && l.toLowerCase().includes(course.toLowerCase()));
    if (start >= 0) {
      const level = (lines[start].match(/^#+/) || ["#"])[0].length;
      let end = lines.length;
      for (let i = start + 1; i < lines.length; i++) { const h = lines[i].match(/^(#+)\s/); if (h && h[1].length <= level) { end = i; break; } }
      text = lines.slice(start, end).join("\n");
    }
  }
  const weeks = new Map<number, OutlineWeek>();
  const put = (ws: number[], module: string | null, topics: string[], clo: number | null = null) => {
    if (!ws.length || !topics.length) return;
    // A topic list spread over several weeks: shared out in order.
    const per = Math.max(1, Math.ceil(topics.length / ws.length));
    ws.forEach((w, i) => {
      const part = ws.length === 1 ? topics : topics.slice(i * per, (i + 1) * per);
      if (!part.length) return;
      const cur = weeks.get(w) || { week: w, module, topics: [], clo };
      cur.topics.push(...part); if (!cur.module && module) cur.module = module; if (!cur.clo && clo) cur.clo = clo;
      weeks.set(w, cur);
    });
  };
  // 1. Tables.
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i]) || !/^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || "")) continue;
    const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    const head = cells(lines[i]).map((h) => clean(h).toLowerCase());
    const iw = head.findIndex((h) => /week/.test(h)), it = head.findIndex((h) => /topic|content/.test(h)), im = head.findIndex((h) => /module|unit|theme/.test(h)), ic = head.findIndex((h) => /^clos?\b|learning outcome/.test(h));
    if (iw < 0 || it < 0) continue;
    let module: string | null = null;
    for (let j = i + 2; j < lines.length && /^\s*\|/.test(lines[j]); j++) {
      const c = cells(lines[j]);
      if (im >= 0 && clean(c[im] || "")) module = clean(c[im]);
      const cn = ic >= 0 ? (cloTags(`[${c[ic] || ""}]`)[0] || Number((c[ic] || "").match(/\d+/)?.[0]) || null) : null;
      put(weekNo(c[iw] || ""), module, splitTopics(c[it] || ""), cn);
    }
  }
  if (weeks.size) return Array.from(weeks.values()).sort((a, b) => a.week - b.week);
  // 2. "Week n" headings or lines with bullets under them.
  let cur: number[] = [], module: string | null = null, buf: string[] = [];
  const flush = () => { put(cur, module, buf); buf = []; };
  for (const raw of lines) {
    const l = raw.trim();
    const mod = l.match(/^#{1,6}\s*(module|unit)\b[^:]*:?\s*(.*)$/i);
    if (mod) { flush(); cur = []; module = clean(l.replace(/^#+\s*/, "")); continue; }
    const w = l.match(/^(?:#{1,6}\s*|[-*]\s*|\*\*)?weeks?\s*([\d\s–—\-to&and]+?)\s*(?:\*\*)?\s*[:.)\-–—]?\s*(.*)$/i);
    if (w && weekNo(w[1]).length) { flush(); cur = weekNo(w[1]); const rest = clean(w[2] || ""); if (rest) buf.push(...splitTopics(rest)); continue; }
    if (cur.length && /^[-*+]\s+|^\d+[.)]\s+/.test(l)) buf.push(...splitTopics(l.replace(/^[-*+]\s+|^\d+[.)]\s+/, "")));
  }
  flush();
  return Array.from(weeks.values()).sort((a, b) => a.week - b.week);
}

/**
 * The outline's topics as 32 lectures, in the published weekly order. Fewer topics than lectures: topics are split
 * (earliest weeks with fewest lectures first) and each split lecture says "split from <topic>"; more topics than
 * lectures: neighbouring topics of the same week share a lecture. No topic is added that is not in the outline.
 */
export function spreadTo32(weeks: OutlineWeek[], total = 32): OfficialLecture[] {
  type Slot = { week: number; topics: string[]; part: number; of: number; base: string; clo: number | null };
  const slots: Slot[] = weeks.flatMap((w) => w.topics.map((t) => ({ week: w.week, topics: [t], part: 1, of: 1, base: t, clo: w.clo || null })));
  if (!slots.length) return [];
  // Too many: join the neighbouring pair of the same week with the shortest text.
  while (slots.length > total) {
    let best = -1, len = Infinity;
    for (let i = 0; i + 1 < slots.length; i++) if (slots[i].week === slots[i + 1].week) { const l = slots[i].topics.join("").length + slots[i + 1].topics.join("").length; if (l < len) { len = l; best = i; } }
    if (best < 0) for (let i = 0; i + 1 < slots.length; i++) { const l = slots[i].topics.join("").length + slots[i + 1].topics.join("").length; if (l < len) { len = l; best = i; } }
    const a = slots[best], b = slots[best + 1];
    slots.splice(best, 2, { week: a.week, topics: a.topics.concat(b.topics), part: 1, of: 1, base: a.base, clo: a.clo || b.clo });
  }
  // Too few: give another lecture to the topic whose week has the fewest lectures (earliest first).
  while (slots.length < total) {
    const perWeek = new Map<number, number>(); slots.forEach((s) => perWeek.set(s.week, (perWeek.get(s.week) || 0) + 1));
    const groups = new Map<string, Slot[]>(); slots.forEach((s) => { const k = `${s.week}|${s.base}`; groups.set(k, (groups.get(k) || []).concat(s)); });
    let pick: Slot[] | null = null;
    for (const g of Array.from(groups.values())) {
      if (!pick) { pick = g; continue; }
      const a = perWeek.get(g[0].week)! , b = perWeek.get(pick[0].week)!;
      if (a < b || (a === b && g.length < pick.length)) pick = g;
    }
    const g = pick!; const last = g[g.length - 1]; const at = slots.indexOf(last);
    const of = g.length + 1;
    g.forEach((s) => (s.of = of));
    slots.splice(at + 1, 0, { week: last.week, topics: last.topics, part: of, of, base: last.base, clo: last.clo });
  }
  return slots.map((s, i) => {
    const topic = s.topics.join("; ");
    const split = s.of > 1;
    return { lecture: i + 1, week: s.week, topic: split ? `${topic} (part ${s.part} of ${s.of})` : topic, subtopic: null, clo: s.clo ? `CLO-${s.clo}` : null, splitFrom: split ? s.base : null };
  });
}

/** What the plan would look like, in one line. */
export const planLine = (p: OfficialPlan) => `${p.clos.length} CLO(s)${p.clos.some((c) => c.placeholder) ? ` (${p.clos.filter((c) => c.placeholder).length} placeholder)` : ""}, ${p.lectures.length} lecture(s)${p.lectures.some((l) => l.midterm) ? " incl. the mid-term week" : ""}${p.lectures.some((l) => l.splitFrom) ? `, ${p.lectures.filter((l) => l.splitFrom).length} split` : ""}`;
