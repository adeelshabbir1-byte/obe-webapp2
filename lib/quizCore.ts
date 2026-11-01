import { createHash } from "crypto";
import { numericCorrect } from "./qbankCore";

// Online quizzes (Part 6, build B) — the pure rules: drawing questions by rules (count per CLO, Bloom, difficulty) or
// by hand, a per-student order of questions and options, marking, the integrity rule (warn / auto-submit after N /
// flag only), connection drops that are not cheating, Safe Exam Browser keys, phones.

export type QuizSettings = {
  attempts: number; shuffleQuestions: boolean; shuffleOptions: boolean; oneAtATime: boolean; noBack: boolean;
  results: "NOW" | "AFTER_CLOSE" | "NEVER"; showAnswers: boolean; rule: "WARN" | "AUTO" | "FLAG"; autoAfter: number;
  requireSeb: boolean; sebConfigKey: string | null; sebBrowserKey: string | null; desktopOnly: boolean; aiMarking: boolean; level: 1 | 2;
};
export const DEFAULT_SETTINGS: QuizSettings = { attempts: 1, shuffleQuestions: true, shuffleOptions: true, oneAtATime: false, noBack: false, results: "AFTER_CLOSE", showAnswers: false, rule: "AUTO", autoAfter: 3, requireSeb: false, sebConfigKey: null, sebBrowserKey: null, desktopOnly: false, aiMarking: false, level: 1 };
export type Rule = { clo?: string | null; bloom?: string | null; difficulty?: string | null; count: number };
export type BankQ = { id: string; type: string; cloCodes: string[]; bloom: string; difficulty: string; marks: number; options: string[]; correct: number[]; numericAnswer: number | null; tolerance: number | null; tolMode: string | null };

/** A small seeded random generator, so a student's draw and order are stable across reloads. */
export function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
export function shuffle<T>(a: T[], r: () => number): T[] { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

/** By rules (count per CLO / Bloom / difficulty, any if blank) or by hand; questions in `exclude` (a first attempt's, for a make-up) are avoided. */
export function draw(bank: BankQ[], pick: { ids?: string[]; rules?: Rule[] }, seed: string, exclude: Set<string> = new Set()): { ids: string[]; short: string[] } {
  const r = rng(seed);
  if (pick.ids?.length) { const ok = new Set(bank.map((q) => q.id)); return { ids: pick.ids.filter((i) => ok.has(i)), short: [] }; }
  const chosen: string[] = []; const short: string[] = [];
  for (const rule of pick.rules || []) {
    const fits = (q: BankQ) => (!rule.clo || q.cloCodes.includes(rule.clo)) && (!rule.bloom || q.bloom === rule.bloom) && (!rule.difficulty || q.difficulty === rule.difficulty) && !chosen.includes(q.id);
    const fresh = shuffle(bank.filter((q) => fits(q) && !exclude.has(q.id)), r);
    const reused = shuffle(bank.filter((q) => fits(q) && exclude.has(q.id)), r);
    const take = fresh.concat(reused).slice(0, rule.count);
    chosen.push(...take.map((q) => q.id));
    if (take.length < rule.count) short.push(`${[rule.clo, rule.bloom, rule.difficulty].filter(Boolean).join(" ") || "any"}: ${take.length} of ${rule.count}`);
  }
  return { ids: chosen, short };
}
/** The student's order of questions and of each question's options. */
export function orderFor(ids: string[], bank: BankQ[], s: Pick<QuizSettings, "shuffleQuestions" | "shuffleOptions">, seed: string) {
  const r = rng(`${seed}|order`);
  const qs = s.shuffleQuestions ? shuffle(ids, r) : ids.slice();
  const opts: Record<string, number[]> = {};
  for (const id of qs) { const q = bank.find((x) => x.id === id); if (!q) continue; const n = q.type === "TRUE_FALSE" ? 2 : q.options.length; const o = Array.from({ length: n }, (_, i) => i); opts[id] = s.shuffleOptions && q.type !== "TRUE_FALSE" ? shuffle(o, r) : o; }
  return { questions: qs, options: opts };
}

export type Answer = number | number[] | string | null | undefined;
/** Auto-marking: MCQ (one / several — all and only the right ones), true/false, numerical within tolerance; null = the teacher marks it. */
export function autoMark(q: BankQ, a: Answer): number | null {
  if (["MCQ", "TRUE_FALSE"].includes(q.type)) { if (a === null || a === undefined || a === "") return 0; return Number(a) === q.correct[0] ? q.marks : 0; }
  if (q.type === "MCQ_MULTI") { const g = (Array.isArray(a) ? a : []).map(Number).sort(); const k = q.correct.slice().sort(); return g.length === k.length && g.every((x, i) => x === k[i]) ? q.marks : 0; }
  if (q.type === "NUMERICAL") return q.numericAnswer !== null && numericCorrect(a, q.numericAnswer, q.tolerance ?? 0, q.tolMode === "PCT" ? "PCT" : "ABS") ? q.marks : 0;
  return null;
}
export function score(qs: BankQ[], answers: Record<string, Answer>, teacher: Record<string, number> = {}) {
  let got = 0, max = 0, pending = 0; const perClo: Record<string, [number, number]> = {};
  for (const q of qs) {
    const m = teacher[q.id] ?? autoMark(q, answers[q.id]);
    const c = q.cloCodes[0] || "—"; perClo[c] = perClo[c] || [0, 0]; perClo[c][1] += q.marks; max += q.marks;
    if (m === null) { pending++; continue; }
    got += m; perClo[c][0] += m;
  }
  return { score: Math.round(got * 100) / 100, max, pending, perClo };
}

// ---- integrity
export const EVENT_KINDS = ["FULLSCREEN_EXIT", "TAB_HIDDEN", "BLUR", "COPY", "PASTE", "CONTEXT_MENU", "PRINT", "CONNECTION_LOST"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const COUNTED: EventKind[] = ["FULLSCREEN_EXIT", "TAB_HIDDEN", "BLUR"];
export const EVENT_LABEL: Record<string, string> = { FULLSCREEN_EXIT: "left full-screen", TAB_HIDDEN: "switched tab / app", BLUR: "window lost focus", COPY: "tried to copy", PASTE: "tried to paste", CONTEXT_MENU: "right-click", PRINT: "tried to print", CONNECTION_LOST: "connection lost" };
/** What happens after an event: a warning first (WARN), submit after N leaving events (AUTO, default 3), or only a flag. A lost connection is never counted. */
export function onEvent(rule: QuizSettings["rule"], autoAfter: number, counted: number): "WARN" | "SUBMIT" | "FLAG" | "NONE" {
  if (counted <= 0) return "NONE";
  if (rule === "FLAG") return "FLAG";
  if (rule === "AUTO" && counted >= autoAfter) return "SUBMIT";
  return "WARN";
}
/** "Ali left 2× — 10:05, 10:07, 40 s". */
export function eventLine(name: string, events: { kind: string; at: Date; awayMs?: number | null }[]) {
  const c = events.filter((e) => (COUNTED as string[]).includes(e.kind));
  const t = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });
  const away = Math.round(c.reduce((a, e) => a + (e.awayMs || 0), 0) / 1000);
  return c.length ? `${name} left ${c.length}× — ${c.map((e) => t(e.at)).join(", ")}${away ? `, ${away} s` : ""}` : `${name}: no events`;
}

// ---- Safe Exam Browser
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
/** SEB sends X-SafeExamBrowser-ConfigKeyHash = SHA-256(page URL + Config Key) (and the Browser Exam Key the same way in X-SafeExamBrowser-RequestHash). */
export function sebOk(url: string, headers: { configHash?: string | null; requestHash?: string | null }, keys: { configKey: string | null; browserKey: string | null }) {
  const u = url.split("#")[0];
  if (keys.configKey && headers.configHash?.toLowerCase() === sha(u + keys.configKey)) return true;
  if (keys.browserKey && headers.requestHash?.toLowerCase() === sha(u + keys.browserKey)) return true;
  return false;
}
export const sebHash = (url: string, key: string) => sha(url.split("#")[0] + key);
/** SEB's Config Key: SHA-256 of the settings as compact JSON with keys sorted (case-insensitive), originatorVersion left out. */
export function configKeyOf(settings: Record<string, unknown>): string {
  const norm = (v: unknown): unknown => Array.isArray(v) ? v.map(norm) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).filter((k) => k !== "originatorVersion").sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).map((k) => [k, norm((v as Record<string, unknown>)[k])])) : v;
  return sha(JSON.stringify(norm(settings)));
}
/** The quiz's SEB settings (plain XML property list, opened by Safe Exam Browser). */
export function sebSettings(startURL: string, quitURL: string) {
  return { startURL, quitURL, sendBrowserExamKey: true, allowQuit: true, quitURLConfirm: false, browserViewMode: 1, enableRightMouse: false, allowSpellCheck: false, enablePrintScreen: false, allowClipboard: false, URLFilterEnable: false, examSessionClearCookiesOnStart: false, browserWindowAllowReload: true } as Record<string, unknown>;
}
export function plist(settings: Record<string, unknown>) {
  const v = (x: unknown): string => typeof x === "boolean" ? (x ? "<true/>" : "<false/>") : typeof x === "number" ? `<integer>${x}</integer>` : `<string>${String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</string>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n${Object.entries(settings).map(([k, x]) => `  <key>${k}</key>\n  ${v(x)}`).join("\n")}\n</dict>\n</plist>\n`;
}
export const isPhone = (ua: string) => /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua);
export const isSeb = (ua: string) => /SEB\//i.test(ua);
/** A gap in the heartbeat longer than this is a lost connection (recorded, not counted as an event). */
export const LOST_AFTER_MS = 30_000;
