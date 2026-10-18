import { randomUUID } from "crypto";
import { prisma } from "./db";
import { programBindings } from "./accreditation/bodies";
import { loadProfile } from "./sarAccess";
import { staffDetails } from "./aas";
import { termIndex } from "./termLogic";

// Whether a program may apply to its council yet, checked from what the system holds, with the few facts it can't know
// typed in by the Institute Head / Program Lead.
//   NBEAC — eligibility for programmatic accreditation (nbeac.org.pk › Accreditation): chartered institution; ≥ 60% of
//           the credit hours of the major in business / public administration / commerce; traditional delivery;
//           at least three graduated batches.
//   PEC   — Manual of Accreditation 2019, Sec. 1.8 and 3.2: ≥ 130 credit hours with ≥ 85 engineering / computing and
//           ≥ 30 non-engineering; a 6 credit-hour final-year design project; student : teacher ≤ 25 : 1; at least eight
//           full-time engineering faculty per section; ≤ 50 students per theory section; 15–18 credit hours a semester;
//           a lab manual for every lab; GA attainment KPI ≥ 50%; PEC registration of engineering faculty.
// Course types are read as: General Education and IDS = non-major / non-engineering; every other type = major.

export type CheckBody = "NBEAC" | "PEC";
export type Check = { key: string; label: string; rule: string; value: string; pass: boolean | null; source: "system" | "entered" | "needed"; note?: string; raw?: string; input?: { kind: "yesno" | "number" | "select"; options?: string[] } };
export type ProgramCheck = { program: string; body: CheckBody; departmentId: string | null; checks: Check[]; passed: number; failed: number; open: number; facts: Record<string, string | number> };

const edb = prisma as unknown as Record<string, any>;
export const ELIGIBILITY_HINT = "Typed-in answers need prisma/migration_council_tools.sql — run it in Supabase.";
const NON_MAJOR = new Set(["general education", "ids"]);
const isNonMajor = (t: string | null | undefined) => NON_MAJOR.has((t || "").trim().toLowerCase());
const PHD = /\bph\.?\s?d\b|doctor(ate)?\b|d\.?phil/i;

export async function savedInputs(chairmanId: string): Promise<Record<string, Record<string, string>>> {
  try {
    const rows = (await edb.councilEligibility.findMany({ where: { chairmanId } })) as { program: string; body: string; inputsJson: string }[];
    return Object.fromEntries(rows.map((r) => [`${r.body}|${r.program}`, (() => { try { return JSON.parse(r.inputsJson); } catch { return {}; } })()]));
  } catch { return {}; }
}

export async function saveInputs(chairmanId: string, body: string, program: string, vals: Record<string, string>, by: string) {
  const all = await savedInputs(chairmanId);
  const merged = { ...(all[`${body}|${program}`] || {}), ...vals };
  for (const k of Object.keys(merged)) if (merged[k] === "") delete merged[k];
  await edb.councilEligibility.upsert({
    where: { chairmanId_body_program: { chairmanId, body, program } },
    create: { id: randomUUID(), chairmanId, body, program, inputsJson: JSON.stringify(merged), updatedById: by, updatedAt: new Date() },
    update: { inputsJson: JSON.stringify(merged), updatedById: by, updatedAt: new Date() },
  });
}

const yes = (v: string | undefined) => (v ? /^y(es)?$/i.test(v) : null);
const num = (v: string | undefined) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);

export async function eligibility(chairmanId: string, opts: { program?: string; departments?: string[] } = {}): Promise<ProgramCheck[]> {
  const bindings = (await programBindings(chairmanId).catch(() => [])).filter((b) => (b.body === "NBEAC" || b.body === "PEC") && (!opts.program || b.program === opts.program) && (!opts.departments || !b.departmentId || opts.departments.includes(b.departmentId)));
  if (!bindings.length) return [];
  const inputs = await savedInputs(chairmanId);
  const hei = await loadProfile(chairmanId, "HEI").catch(() => ({} as Record<string, Record<string, unknown>>));
  const H = (hei.HEI || {}) as Record<string, unknown>;
  const leads = await prisma.user.findMany({ where: { role: "PROGRAM_COORDINATOR", managedById: chairmanId }, select: { id: true } });
  const leadIds = leads.map((l) => l.id).concat(["none"]);
  const out: ProgramCheck[] = [];

  for (const b of bindings) {
    const body = b.body as CheckBody;
    const inp = inputs[`${body}|${b.program}`] || {};
    const batches = await prisma.batch.findMany({ where: { coordinatorId: { in: leadIds }, degreeProgram: b.program }, select: { id: true, batchName: true, startTerm: true, startYear: true } });
    const ids = batches.map((x) => x.id).concat(["none"]);
    const newest = batches.slice().sort((x, y) => termIndex(y.startTerm, y.startYear) - termIndex(x.startTerm, x.startYear))[0] || null;
    const [students, courses] = await Promise.all([
      prisma.student.findMany({ where: { batchId: { in: ids } }, select: { batchId: true, status: true } }),
      prisma.course.findMany({ where: { batchId: { in: ids } }, select: { id: true, batchId: true, code: true, title: true, creditHours: true, courseType: true, semesterNumber: true, instructorId: true, isOffered: true } }),
    ]);
    const curr = newest ? courses.filter((c) => c.batchId === newest.id) : [];
    const ch = (xs: typeof curr) => xs.reduce((a, c) => a + (c.creditHours || 0), 0);
    const totalCh = ch(curr), majorCh = ch(curr.filter((c) => !isNonMajor(c.courseType))), otherCh = totalCh - majorCh;
    const active = students.filter((s) => s.status === "ACTIVE");
    const gradBatches = batches.filter((x) => students.some((s) => s.batchId === x.id && s.status === "GRADUATED")).length;
    const activeBatches = batches.filter((x) => active.some((s) => s.batchId === x.id));

    // Teachers of the program: who teaches its courses now (offered), else any of its running batches.
    const teaching = courses.filter((c) => c.isOffered && c.instructorId);
    const pool = (teaching.length ? teaching : courses.filter((c) => activeBatches.some((x) => x.id === c.batchId))).map((c) => c.instructorId).filter((x): x is string => !!x);
    const people = await prisma.user.findMany({ where: { id: { in: Array.from(new Set(pool)).concat(["none"]) }, isVisitingPlaceholder: false }, select: { id: true } });
    const pIds = people.map((p) => p.id);
    const [profiles, edu, details] = await Promise.all([
      prisma.facultyProfile.findMany({ where: { userId: { in: pIds.concat(["none"]) } }, select: { userId: true, employmentType: true } }),
      prisma.facultyRecord.findMany({ where: { userId: { in: pIds.concat(["none"]) }, kind: "EDUCATION" }, select: { userId: true, title: true } }),
      staffDetails(pIds),
    ]);
    const typeOf = new Map(profiles.map((p) => [p.userId, p.employmentType || ""]));
    const fullTime = pIds.filter((id) => { const t = typeOf.get(id) || details.get(id)?.contract || ""; return !/visit|part/i.test(t); });
    const phd = pIds.filter((id) => edu.some((e) => e.userId === id && PHD.test(e.title)) || PHD.test(`${details.get(id)?.degree || ""} ${details.get(id)?.degreeType || ""}`));
    const ftEntered = num(inp.fullTime);
    const ft = ftEntered ?? fullTime.length;
    const facts: Record<string, string | number> = {
      "Batches": batches.length, "Graduated batches": gradBatches, "Students studying": active.length, "Teachers (this term)": pIds.length,
      "Full-time teachers": ft, "PhD teachers": phd.length, "Curriculum (newest batch)": newest ? `${newest.batchName} · ${curr.length} courses · ${totalCh} Cr Hrs` : "—",
    };
    const checks: Check[] = [];
    const add = (c: Check) => checks.push(c);
    const sys = (key: string, label: string, rule: string, value: string, pass: boolean | null, note?: string) => add({ key, label, rule, value, pass, source: pass === null ? "needed" : "system", note });
    const asked = (key: string, label: string, rule: string, kind: "yesno" | "number" | "select", judge: (v: string) => boolean, show?: (v: string) => string, options?: string[], note?: string) => {
      const v = inp[key];
      add({ key, label, rule, value: v ? (show ? show(v) : v) : "", pass: v ? judge(v) : null, source: v ? "entered" : "needed", input: { kind, options }, note });
    };

    if (body === "NBEAC") {
      const chartered = !!(H.actRef && H.charterType);
      if (chartered) sys("charter", "Chartered institution", "Chartered by the federal or a provincial government", `${H.charterType} — ${H.actRef}`, true);
      else asked("charter", "Chartered institution", "Chartered by the federal or a provincial government", "yesno", (v) => !!yes(v), undefined, undefined, "Or fill Act / Charter in Institute's Profile.");
      const pctEntered = num(inp.businessPct);
      const pct = pctEntered ?? (totalCh ? Math.round((100 * majorCh) / totalCh) : null);
      add({ key: "businessPct", label: "Business credit hours", rule: "≥ 60% of the major's credit hours in business administration, public administration or commerce", value: pct === null ? "" : `${pct}%${pctEntered === null ? ` (${majorCh} of ${totalCh} Cr Hrs, all but General Education / IDS)` : " (entered)"}`, pass: pct === null ? null : pct >= 60, source: pctEntered !== null ? "entered" : pct === null ? "needed" : "system", input: { kind: "number" }, note: "Counted from course types; type a figure to override if some major courses aren't business." });
      asked("delivery", "Mode of delivery", "Traditional (on campus) — online / distance programs are not yet reviewed", "select", (v) => v === "Traditional", undefined, ["Traditional", "Online / distance", "Blended"]);
      const gEntered = num(inp.gradBatches);
      const g = gEntered ?? gradBatches;
      add({ key: "gradBatches", label: "Graduated batches", rule: "At least three batches have graduated", value: `${g}${gEntered !== null ? " (entered)" : ""}`, pass: g >= 3, source: gEntered !== null ? "entered" : "system", input: { kind: "number" }, note: "Counted from students marked Graduated; type the number if older batches aren't in OBEHUB." });
    } else {
      sys("totalCh", "Total credit hours", "At least 130 credit hours over 8 semesters", totalCh ? `${totalCh}` : "", totalCh ? totalCh >= 130 : null, newest ? `Newest batch ${newest.batchName}` : "No batch yet");
      sys("engCh", "Engineering / computing credit hours", "At least 85", totalCh ? `${majorCh}` : "", totalCh ? majorCh >= 85 : null, "All course types except General Education and IDS");
      sys("nonEngCh", "Non-engineering credit hours", "At least 30 (mathematics, humanities, natural sciences)", totalCh ? `${otherCh}` : "", totalCh ? otherCh >= 30 : null, "General Education and IDS courses");
      const fyp = curr.filter((c) => /capstone/i.test(c.courseType || "") || /\b(final year|capstone|senior design)\b.*project|\bfyp\b|design project/i.test(c.title));
      const fypCh = ch(fyp);
      sys("fyp", "Final-year design project", "6 credit hours, over semesters 7 and 8", fyp.length ? `${fypCh} Cr Hrs (${fyp.map((c) => c.code).join(", ")})` : "", curr.length ? fypCh >= 6 : null, fyp.length ? undefined : "No Capstone Project course found");
      const loads = Array.from(new Set(curr.map((c) => c.semesterNumber).filter((x): x is number => !!x))).sort((a, c) => a - c).map((s) => [s, ch(curr.filter((c) => c.semesterNumber === s))] as const);
      const off = loads.filter(([, l]) => l < 15 || l > 18);
      sys("load", "Semester load", "Preferably 15–18 credit hours a semester", loads.length ? loads.map(([s, l]) => `S${s}: ${l}`).join(" · ") : "", loads.length ? off.length === 0 : null, off.length ? `Outside the range: ${off.map(([s]) => `semester ${s}`).join(", ")} (a preference, not a hard limit)` : undefined);
      const ratio = ft ? active.length / ft : null;
      add({ key: "fullTime", label: "Student : teacher ratio", rule: "Does not exceed 25 : 1", value: ratio === null ? "" : `${active.length} : ${ft} = ${ratio.toFixed(1)} : 1`, pass: ratio === null ? null : ratio <= 25, source: ftEntered !== null ? "entered" : ratio === null ? "needed" : "system", input: { kind: "number" }, note: `Full-time teachers counted from who teaches the program (${fullTime.length}); type the number of dedicated full-time faculty to override.` });
      const sections = Math.max(1, ...activeBatches.map((x) => Math.ceil(active.filter((s) => s.batchId === x.id).length / 50)));
      sys("dedicated", "Dedicated engineering faculty", "At least 8 full-time engineering faculty per section, not shared with other programs at the same level", `${ft} for ${sections} section${sections > 1 ? "s" : ""} (largest batch)`, ft >= 8 * sections);
      const biggest = Math.max(0, ...activeBatches.map((x) => active.filter((s) => s.batchId === x.id).length));
      sys("classSize", "Theory class size", "Not more than 50 students per section", biggest ? `Largest batch ${biggest} students → ${Math.ceil(biggest / 50)} section(s) needed` : "", biggest ? true : null, biggest > 50 ? "Make sure the batch is taught in sections of 50 or fewer." : undefined);
      const labs = courses.filter((c) => c.courseType === "Lab" && c.isOffered);
      const manuals = labs.length ? await prisma.labManual.findMany({ where: { courseId: { in: labs.map((l) => l.id) } }, select: { courseId: true } }) : [];
      const noManual = labs.filter((l) => !manuals.some((m) => m.courseId === l.id));
      sys("labManuals", "Lab manuals", "Every lab course has a manual of all its experiments", labs.length ? `${labs.length - noManual.length} of ${labs.length} labs this term` : "", labs.length ? noManual.length === 0 : null, noManual.length ? `Missing: ${noManual.slice(0, 8).map((l) => l.code).join(", ")}` : labs.length ? undefined : "No lab offered this term");
      asked("pecReg", "PEC registration of engineering faculty", "Valid PEC registration for all engineering faculty / staff (checked in the exhibit room)", "yesno", (v) => !!yes(v));
      asked("kpi", "GA attainment KPI", "Program KPI for GA attainment not less than 50%", "number", (v) => Number(v) >= 50, (v) => `${v}%`, undefined, "The pass threshold the program uses for each GA.");
    }
    for (const c of checks) c.raw = inp[c.key] || "";
    out.push({ program: b.program, body, departmentId: b.departmentId, checks, facts, passed: checks.filter((c) => c.pass === true).length, failed: checks.filter((c) => c.pass === false).length, open: checks.filter((c) => c.pass === null).length });
  }
  return out;
}
