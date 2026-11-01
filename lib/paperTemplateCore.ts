// Paper templates (Part 6, build C) — the pure rules: which template applies (program → department → institute, the
// exam type's variant before the general one), the fields filled for a course, sections and numbering, who may open a
// locked paper, the watermark.

export type Scope = "INSTITUTE" | "DEPARTMENT" | "PROGRAM";
export type Section = { title: string; types: string[]; attemptAny?: number | null; note?: string | null };
export type TemplateConfig = {
  fields: { institute: boolean; logo: boolean; faculty: boolean; department: boolean; program: boolean; course: boolean; semester: boolean; term: boolean; section: boolean; teacher: "SHOW" | "HIDDEN" | "OFF"; examType: boolean; date: boolean; time: boolean; duration: boolean; total: boolean; rollBoxes: boolean };
  instructions: string; sections: Section[]; numbering: "Q1" | "1.1"; showMarks: boolean; showClo: boolean;
  page: "A4" | "Letter"; margins: number; font: string; fontSize: number; footer: string; turnOver: boolean; watermark: string; answerSheet: boolean;
};
export const DEFAULT_TEMPLATE: TemplateConfig = {
  fields: { institute: true, logo: true, faculty: true, department: true, program: true, course: true, semester: true, term: true, section: true, teacher: "SHOW", examType: true, date: true, time: true, duration: true, total: true, rollBoxes: true },
  instructions: "Attempt all questions. Write your roll number on every sheet. Mobile phones are not allowed.",
  sections: [], numbering: "Q1", showMarks: true, showClo: false, page: "A4", margins: 1, font: "Helvetica", fontSize: 11, footer: "Page {page} of {pages}", turnOver: true, watermark: "", answerSheet: false,
};
export type TemplateRow = { id: string; scope: Scope; scopeId: string | null; examType: string; config: TemplateConfig };

/** The most specific template: the course's program, then its department, then the institute; the exam type's own before "ALL". */
export function resolveTemplate(rows: TemplateRow[], ctx: { departmentId: string | null; program: string | null; examType: string }): TemplateRow | null {
  const order: [Scope, string | null][] = [["PROGRAM", ctx.program], ["DEPARTMENT", ctx.departmentId], ["INSTITUTE", null]];
  for (const [scope, id] of order) {
    if (scope !== "INSTITUTE" && !id) continue;
    for (const ex of [ctx.examType, "ALL"]) {
      const r = rows.find((x) => x.scope === scope && (scope === "INSTITUTE" || x.scopeId === id) && x.examType === ex);
      if (r) return r;
    }
  }
  return null;
}
export function mergeConfig(c: Partial<TemplateConfig> | null | undefined): TemplateConfig {
  return { ...DEFAULT_TEMPLATE, ...(c || {}), fields: { ...DEFAULT_TEMPLATE.fields, ...(c?.fields || {}) }, sections: Array.isArray(c?.sections) ? c!.sections : [] };
}

export type Filled = Record<string, string>;
export const FIELD_LABEL: Record<string, string> = { institute: "Institute", faculty: "Faculty", department: "Department", program: "Program", course: "Course", semester: "Semester", term: "Term", section: "Section", teacher: "Teacher", examType: "Examination", date: "Date", time: "Time", duration: "Duration", total: "Total marks" };
/** The header rows the template asks for, from the filled values (a teacher's edit wins). */
export function headerRows(cfg: TemplateConfig, auto: Filled, edits: Filled): [string, string][] {
  const out: [string, string][] = [];
  for (const k of Object.keys(FIELD_LABEL)) {
    const on = k === "teacher" ? cfg.fields.teacher !== "OFF" : (cfg.fields as Record<string, unknown>)[k];
    if (!on) continue;
    const v = k === "teacher" && cfg.fields.teacher === "HIDDEN" ? "Paper setter: hidden" : edits[k] ?? auto[k] ?? "";
    out.push([FIELD_LABEL[k], v]);
  }
  return out;
}
/** Questions into the template's sections by type (the rest go to the last section); numbering Q1 a/b or 1.1. */
export function layoutSections<T extends { type: string }>(qs: T[], cfg: TemplateConfig): { title: string; note: string | null; items: { q: T; no: string; partNo: (i: number, label: string) => string }[] }[] {
  const secs = cfg.sections.length ? cfg.sections : [{ title: "", types: [] as string[] }];
  const buckets = secs.map(() => [] as T[]);
  for (const q of qs) { let i = secs.findIndex((s) => s.types.includes(q.type)); if (i < 0) i = secs.length - 1; buckets[i].push(q); }
  let n = 0;
  return secs.map((s, si) => ({
    title: s.title, note: s.attemptAny ? `Attempt any ${s.attemptAny} of ${buckets[si].length}.` : s.note || null,
    items: buckets[si].map((q) => { n++; const no = n; return { q, no: cfg.numbering === "1.1" ? `${no}.` : `Q${no}`, partNo: (i: number, label: string) => (cfg.numbering === "1.1" ? `${no}.${i + 1}` : `(${label})`) }; }),
  })).filter((s) => s.items.length || s.title);
}

// ---- paper security
export type Viewer = { id: string; isSetter: boolean; isHod: boolean; isController: boolean; isReviewer: boolean };
/** After vetting a mid / final paper is locked until exam day: only the HOD and the Controller open it; only the Controller prints or downloads. */
export function access(v: Viewer, p: { locked: boolean; examDay: Date | null }, now = new Date()) {
  const before = !p.examDay || now < new Date(new Date(p.examDay).toDateString());
  const lockedNow = p.locked && before;
  const open = lockedNow ? v.isHod || v.isController : v.isSetter || v.isHod || v.isController || v.isReviewer;
  return { open, download: lockedNow ? v.isController : open && (v.isController || v.isSetter), lockedNow };
}
export const watermarkOf = (name: string, at: Date) => `${name} · ${at.toISOString().slice(0, 16).replace("T", " ")} UTC`;
/** "Seen by: Dr X (PL) 12 Nov 10:42 · Controller 13 Nov 09:15 (downloaded)". */
export function seenBy(log: { name: string; role: string; action: string; at: Date }[]) {
  const t = (d: Date) => `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${d.toISOString().slice(11, 16)}`;
  return log.length ? `Seen by: ${log.map((l) => `${l.name} (${l.role}) ${t(new Date(l.at))}${l.action === "OPENED" ? "" : ` (${l.action.toLowerCase()})`}`).join(" · ")}` : "Not opened by anyone else yet.";
}
