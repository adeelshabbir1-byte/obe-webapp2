"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { intentItems, mergeLayouts, LEVEL_LABEL, type Entry, type Level } from "../lib/topicPlanCore";
import { norm, similarity } from "../lib/textMatch";

// The Topic Workspace: any number of courses of the institute side by side (scroll sideways, collapse, pin). Edit
// freely in every open course — reorder, move or copy between courses, add, delete, rename, split, merge, set
// importance — and draw topic links by dragging a topic's ⟶ handle onto a topic of another course. Nothing changes
// until Save: plans the person owns change at once, the others get one proposal per course (see lib/topicPlan.ts).

type Dep = { code: string; topic: string; strength: string };
type Row = {
  id: string; topic: string; subtopic: string | null; week: number; lectureNumber: number; cloId: string | null; clo: string | null; bloom: string | null;
  links: number; paperItems: number; midterm: boolean; pinned: boolean; importance: Level | null; confirmed: boolean; prefill: Level;
  suggestion: { level: Level; why: string; confidence: string }; safety: { mark: string; reason: string };
  dependents: Dep[]; needs: Dep[]; overlaps: { code: string; topic: string; verdict: string }[];
  industry: string | null; reading: string | null; readingAuto: boolean; needsClo: boolean; cloSuggestion: { id: string; code: string; why: string } | null; movedFrom: string | null; notTaught: boolean;
  inCouncil: boolean; gaOnly: number[]; comments: number; difficulty: number; bank: number;
};
type Column = {
  courseId: string; code: string; title: string; semester: number | null; program: string; batch: string; coordinatorId: string;
  plan: "SE" | "INSTRUCTOR"; planCourseId: string; mode: "APPLY" | "PROPOSE" | "TEMPLATE" | "FOLLOWER" | "VIEW"; toName: string; followsBase: string | null; baseCourseId?: string | null; why: string; ownTeaching: boolean;
  textbook: string; hash: string; rows: Row[]; lab: boolean;
};
type Card = Entry & { key: string; origin?: Row; home?: string };
type OpenRef = { courseId: string; plan?: "SE" | "INSTRUCTOR" | null; pinned?: boolean; collapsed?: boolean };
type LinkDraft = { key: string; kind: "PREREQ" | "OVERLAP"; level: string; action: "ADD" | "CHANGE" | "REMOVE"; fromCourseId: string; fromTopic: string; fromCode: string; toCourseId: string; toTopic: string; toCode: string; note?: string };
type PendingLink = { id: string; kind: string; level: string; action: string; fromCode: string; fromTopic: string; toCode: string; toTopic: string; status: string; state: { waiting: string[]; canAct: string | null } };
type Suggestion = { kind: string; key: string; hash: string; confidence: string; reason: string; data: Record<string, unknown> };
type Perf = Record<string, { overall: PerfS; last3: PerfS; last: PerfS; from: string[]; vsLectures: { lectures: number; offerings: number; avg: number }[] | null }>;
type PerfS = { shown: { avg: number; below: number; students: number; offerings: number } | null; tooLittle: boolean; heat: string; trend: number | null; questions: number; assessments: number; offerings: number };
type Line = { id: string; x1: number; y1: number; x2: number; y2: number; color: string; dash: string; label: string; link?: { kind: "PREREQ" | "OVERLAP"; level: string; fromCol: Column; fromTopic: string; toCol: Column; toTopic: string; confirmed: boolean } };

const API = "/api/faculty/topic-workspace";
const LEVEL_COLOR: Record<Level, string> = { CORE: "#5A1923", IMPORTANT: "#B0606E", OPTIONAL: "#E3C3C9" };
const LINK_COLOR: Record<string, string> = { STRONG: "#8E1B1B", MILD: "#C46A12", WEAK: "#8A8A8A", PROGRESSION: "#1565C0", DUPLICATION: "#6A3FA0" };
const HEAT: Record<string, string> = { red: "#C62828", amber: "#E09A1A", green: "#2E7D32", grey: "#B9B2B4" };
const same = (a: string, b: string) => norm(a) === norm(b) || similarity(a, b) >= 0.6;
let seq = 0;
const tmpKey = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`;
const toCards = (c: Column): Card[] => c.rows.map((r) => ({ key: r.id, id: r.id, topic: r.topic, subtopic: r.subtopic, importance: r.importance, origin: r, home: c.courseId }));
const jget = async (url: string) => { const r = await fetch(url); const d = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, d }; };
const jsend = async (url: string, method: string, body: unknown) => { const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const d = await r.json().catch(() => ({})); return { ok: r.ok, status: r.status, d }; };

export default function FacultyTopicWorkspace({ role }: { role: string; courses?: unknown }) {
  const [open, setOpen] = useState<OpenRef[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [work, setWork] = useState<Record<string, Card[]>>({});
  const [links, setLinks] = useState<LinkDraft[]>([]);
  const [pendingLinks, setPendingLinks] = useState<PendingLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);
  const [missing, setMissing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ at: string; data: DraftData } | null>(null);
  const [sessionId] = useState(() => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
  const [savedOnce, setSavedOnce] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [show, setShow] = useState({ prereqs: true, overlaps: true, droppable: false, suggested: true });
  const [heat, setHeat] = useState<"off" | "overall" | "last3" | "last">("off");
  const [perf, setPerf] = useState<Record<string, Perf>>({});
  const [picker, setPicker] = useState(false);
  const [detail, setDetail] = useState<{ courseId: string; key: string } | null>(null);
  const [linkAsk, setLinkAsk] = useState<{ from: { col: Column; card: Card }; to: { col: Column; card: Card } } | null>(null);
  const [lineMenu, setLineMenu] = useState<{ x: number; y: number; line: Line } | null>(null);
  const [chain, setChain] = useState<{ courseId: string; dir: string; data: ChainData | null } | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [others, setOthers] = useState<{ courseId: string; name: string }[]>([]);
  const [sugOpen, setSugOpen] = useState(false);
  const [sugs, setSugs] = useState<{ list: Suggestion[]; ai: string } | null>(null);
  const [short, setShort] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [drag, setDrag] = useState<{ courseId: string; key: string } | null>(null);
  const [dropAt, setDropAt] = useState<{ courseId: string; index: number } | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const lastSave = useRef<{ linksSent?: number; linkErrors?: string[] } | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const [lines, setLines] = useState<Line[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // ---------------------------------------------------------------- loading
  const load = useCallback(async (next?: OpenRef[], keepWork = false) => {
    setLoading(true);
    const url = next ? `${API}?open=${encodeURIComponent(JSON.stringify(next.map((o) => ({ courseId: o.courseId, plan: o.plan || null }))))}` : API;
    const r = await jget(url);
    setLoading(false);
    if (!r.ok) { setMsg({ kind: "err", text: r.d.error || "Could not open the workspace." }); return; }
    setMissing(r.d.missing || null);
    const cols: Column[] = r.d.columns || [];
    setColumns(cols);
    if (!next) {
      const st = (r.d.state?.open || []) as OpenRef[];
      setOpen(st.filter((o) => cols.some((c) => c.courseId === o.courseId)));
      if (r.d.state?.draft) setDraft({ at: r.d.state.draftAt, data: r.d.state.draft });
    }
    setWork((w) => {
      const out: Record<string, Card[]> = {};
      for (const c of cols) out[c.courseId] = keepWork && w[c.courseId] ? w[c.courseId] : toCards(c);
      return out;
    });
    const pl = await jget(`${API}/links`);
    if (pl.ok) setPendingLinks((pl.d.rows || []).filter((p: PendingLink) => p.status === "PENDING"));
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const m = window.matchMedia("(max-width: 760px)"); const f = () => setMobile(m.matches); f(); m.addEventListener("change", f); return () => m.removeEventListener("change", f); }, []);

  const persistOpen = useCallback((o: OpenRef[]) => { jsend(`${API}/state`, "PUT", { open: o }).catch(() => null); }, []);
  const changeOpen = (o: OpenRef[], reload = true) => { setOpen(o); persistOpen(o); if (reload) load(o, true); };
  const addCourses = (ids: string[], plan?: "SE" | "INSTRUCTOR" | null) => {
    const add = ids.filter((id) => !open.some((o) => o.courseId === id)).map((courseId) => ({ courseId, plan: plan || null }));
    if (add.length) changeOpen(open.concat(add));
  };
  const addRefs = (refs: OpenRef[]) => {
    // One version per course offering at a time (its columns are keyed by the course).
    const add = refs.filter((r, i) => !open.some((o) => o.courseId === r.courseId) && refs.findIndex((x) => x.courseId === r.courseId) === i);
    if (add.length) changeOpen(open.concat(add));
  };
  const closeCourse = (id: string) => {
    if (changedCount(id) && !window.confirm("This course has unsaved changes. Close it and lose them?")) return;
    changeOpen(open.filter((o) => o.courseId !== id), false);
    setColumns((c) => c.filter((x) => x.courseId !== id));
    setWork((w) => { const n = { ...w }; delete n[id]; return n; });
  };
  const toggleOpenFlag = (id: string, flag: "pinned" | "collapsed") => changeOpen(open.map((o) => (o.courseId === id ? { ...o, [flag]: !o[flag] } : o)), false);

  // Presence: who else has these courses open.
  useEffect(() => {
    if (!columns.length) return;
    const ping = () => jsend(`${API}/presence`, "POST", { courseIds: columns.map((c) => c.planCourseId) }).then((r) => r.ok && setOthers(r.d.others || [])).catch(() => null);
    ping(); const t = setInterval(ping, 45000); return () => clearInterval(t);
  }, [columns]);

  // ---------------------------------------------------------------- changes
  const colOf = (id: string) => columns.find((c) => c.courseId === id);
  const ordered = useMemo(() => {
    const pos = (id: string) => open.findIndex((o) => o.courseId === id);
    const pinned = (id: string) => !!open.find((o) => o.courseId === id)?.pinned;
    return columns.slice().sort((a, b) => Number(pinned(b.courseId)) - Number(pinned(a.courseId)) || pos(a.courseId) - pos(b.courseId));
  }, [columns, open]);
  const diffs = useMemo(() => {
    const homeOf = new Map<string, string>();
    for (const c of columns) for (const r of c.rows) homeOf.set(r.id, c.courseId);
    const out: Record<string, ReturnType<typeof intentItems>> = {};
    for (const c of columns) {
      const cards = work[c.courseId] || [];
      const movedTo = new Map<string, string>();
      for (const [cid, list] of Object.entries(work)) if (cid !== c.courseId) for (const k of list) if (k.id && homeOf.get(k.id) === c.courseId) movedTo.set(k.id, cid);
      out[c.courseId] = intentItems(c.rows.map((r) => ({ id: r.id, topic: r.topic, subtopic: r.subtopic, importance: r.importance })), cards, movedTo);
    }
    return out;
  }, [columns, work]);
  const changedCount = (id: string) => (diffs[id] || []).length;
  const changedCols = columns.filter((c) => changedCount(c.courseId) > 0);
  const totalChanges = changedCols.reduce((n, c) => n + changedCount(c.courseId), 0) + links.length;
  const toApproval = changedCols.filter((c) => c.mode !== "APPLY").length;
  const impact = useMemo(() => {
    let clo = 0, quiz = 0, prereq = 0;
    for (const c of changedCols) for (const it of diffs[c.courseId]) {
      const r = c.rows.find((x) => x.id === it.lectureRowId);
      if (!r) continue;
      if (it.kind === "REMOVE" || it.kind === "MOVE_OUT") { if (r.clo) clo++; quiz += r.links + r.paperItems; }
      if (it.kind === "REMOVE" || it.kind === "MOVE_OUT" || it.kind === "RENAME") prereq += r.dependents.length + r.needs.length;
    }
    return { clo, quiz, prereq };
  }, [changedCols, diffs]);
  const isChanged = (c: Column, card: Card) => !card.id || !c.rows.some((r) => r.id === card.id) || (() => { const r = c.rows.find((x) => x.id === card.id)!; return r.topic !== card.topic || (r.subtopic || "") !== (card.subtopic || "") || (card.importance || null) !== (r.importance || null); })();

  const setCards = (courseId: string, f: (cards: Card[]) => Card[]) => setWork((w) => ({ ...w, [courseId]: f(w[courseId] || []) }));
  const findCard = (courseId: string, key: string) => (work[courseId] || []).find((k) => k.key === key);
  const move = (from: { courseId: string; key: string }, toCourse: string, index: number, copy = false) => {
    const card = findCard(from.courseId, from.key);
    if (!card) return;
    const target = colOf(toCourse);
    if (target && roCol(target)) { setMsg({ kind: "err", text: `${target.code}: ${target.why}.` }); return; }
    if (roCol(colOf(from.courseId))) { if (from.courseId === toCourse) return; copy = true; }
    if (from.courseId !== toCourse && !copy && card.origin?.pinned) { setMsg({ kind: "err", text: `"${card.topic}" already has attendance recorded, so it can only be copied to another course.` }); return; }
    if (target && from.courseId !== toCourse && !copy && target.plan !== colOf(from.courseId)?.plan) copy = true; // a teaching copy and a Subject Expert plan never share rows
    setWork((w) => {
      const src = (w[from.courseId] || []).slice();
      const at = src.findIndex((k) => k.key === from.key);
      const moving = copy ? { ...card, key: tmpKey(), id: undefined, origin: undefined } : src.splice(at, 1)[0];
      const dst = from.courseId === toCourse ? src : (w[toCourse] || []).slice();
      let i = index; if (from.courseId === toCourse && !copy && at < index) i--;
      dst.splice(Math.max(0, Math.min(i, dst.length)), 0, from.courseId === toCourse ? moving : { ...moving, fromCourseId: copy ? null : (colOf(from.courseId)?.planCourseId || null) });
      return { ...w, [from.courseId]: from.courseId === toCourse ? dst : src, ...(from.courseId === toCourse ? {} : { [toCourse]: dst }) };
    });
  };
  // Book chapters per topic: the system maps them; without the book's contents it asks for them once.
  const [tocAsk, setTocAsk] = useState<{ col: Column; book: string } | null>(null);
  const mapReadings = async (c: Column, toc?: string) => {
    const r = await jsend(`${API}/readings`, "POST", { courseId: c.courseId, plan: c.plan, toc });
    if (r.d.needToc) { setTocAsk({ col: c, book: r.d.book }); return; }
    if (!r.ok) { setMsg({ kind: "err", text: r.d.error || "Could not map the readings." }); return; }
    setTocAsk(null);
    setMsg({ kind: r.d.unmatched?.length ? "info" : "ok", text: `${c.code}: ${r.d.filled} topic(s) mapped to ${r.d.book}${r.d.source === "AI" ? " (contents from the AI model — check the pages)" : ""}${r.d.kept ? `; ${r.d.kept} reading(s) you typed kept` : ""}${r.d.unmatched?.length ? `; no match for ${r.d.unmatched.length}: ${r.d.unmatched.slice(0, 4).join(", ")}${r.d.unmatched.length > 4 ? "…" : ""}` : ""}.` });
    load(open, true);
  };
  const roCol = (c?: Column | null) => !!c && (c.mode === "FOLLOWER" || c.mode === "VIEW");
  const setLevel = (keys: { courseId: string; key: string }[], level: Level) => {
    setWork((w) => { const n = { ...w }; for (const k of keys) n[k.courseId] = (n[k.courseId] || []).map((c) => (c.key === k.key ? { ...c, importance: level } : c)); return n; });
  };
  const selKeys = () => Array.from(sel).map((s) => { const [courseId, key] = s.split("::"); return { courseId, key }; });

  // ---------------------------------------------------------------- save, draft, discard
  const collect = (only?: string[]) => columns.filter((c) => (only ? only.includes(c.courseId) : changedCount(c.courseId) > 0)).map((c) => ({
    courseId: c.courseId, plan: c.plan, hash: c.hash,
    entries: (work[c.courseId] || []).map((k) => ({ id: k.id, topic: k.topic, subtopic: k.subtopic, importance: k.importance || null, fromCourseId: k.fromCourseId || null, mergedFrom: k.mergedFrom || null, splitFrom: k.splitFrom || null })),
  }));
  const save = async (body?: ReturnType<typeof collect>) => {
    if (busy || (!totalChanges && !body)) return;
    setBusy(true); setMsg(null);
    const courses = body || collect();
    let text = "";
    if (courses.length || links.length) {
      const r = await jsend(API, "POST", { sessionId, courses, links: links.map(({ key, ...l }) => { void key; return l; }) });
      if (r.status === 409 && r.d.conflicts) { setBusy(false); setConflicts(r.d.conflicts); return; }
      if (!r.ok) { setBusy(false); setMsg({ kind: "err", text: r.d.error || "Could not save." }); return; }
      lastSave.current = r.d;
      const applied = (r.d.applied || []).filter(Boolean);
      text = [applied.length ? `Saved ${applied.join(", ")}` : "", ...(r.d.proposals || []).map((p: { code: string; to: string; items: number; template?: boolean }) => p.template ? `${p.code}: Template Change Request sent to the OMC (${p.items} change(s))` : `${p.code}: ${p.items} change(s) sent to ${p.to || "its Subject Expert"} for approval`), r.d.waitingMoves ? `${r.d.waitingMoves} move(s) between courses wait for the other course's owner` : ""].filter(Boolean).join(" · ");
      setSavedOnce(true);
    }
    let linkErr = "";
    if (lastSave.current) { const d = lastSave.current; if (d.linkErrors?.length) linkErr = d.linkErrors.join("; "); if (d.linksSent) text += `${text ? " · " : ""}${d.linksSent} topic link(s) sent for approval`; lastSave.current = null; }
    setLinks([]); setBusy(false);
    await jsend(`${API}/state`, "DELETE", {}).catch(() => null); setDraft(null);
    setMsg({ kind: linkErr ? "err" : "ok", text: (text || "Saved.") + (linkErr ? ` — Not sent: ${linkErr}` : "") });
    await load(open);
  };
  const saveDraft = async () => {
    const data: DraftData = { open, work: Object.fromEntries(columns.map((c) => [c.courseId, { hash: c.hash, cards: (work[c.courseId] || []).map(({ origin, ...k }) => { void origin; return k; }) }])), links };
    const r = await jsend(`${API}/state`, "POST", { draft: data });
    setMsg(r.ok ? { kind: "ok", text: "Draft saved — you can come back to it later (one draft per person)." } : { kind: "err", text: r.d.error || "Could not save the draft." });
  };
  const resumeDraft = async () => {
    if (!draft) return;
    const d = draft.data;
    const o = d.open || [];
    setOpen(o); persistOpen(o);
    const r = await jget(`${API}?open=${encodeURIComponent(JSON.stringify(o.map((x) => ({ courseId: x.courseId, plan: x.plan || null }))))}`);
    if (!r.ok) return;
    const cols: Column[] = r.d.columns || [];
    setColumns(cols);
    const out: Record<string, Card[]> = {}; const stale: string[] = [];
    for (const c of cols) {
      const saved = d.work?.[c.courseId];
      const byId = new Map(c.rows.map((x) => [x.id, x]));
      if (!saved) { out[c.courseId] = toCards(c); continue; }
      const mine = saved.cards.map((k) => ({ ...k, origin: k.id ? byId.get(k.id) : undefined }));
      if (saved.hash === c.hash) out[c.courseId] = mine;
      else { stale.push(c.code); const theirs = toCards(c); const m = mergeLayouts(theirs, mine, theirs).merged; out[c.courseId] = m.map((e) => ({ ...e, key: (e as Card).key || e.id || tmpKey(), origin: e.id ? byId.get(e.id) : undefined })); }
    }
    setWork(out); setLinks(d.links || []); setDraft(null);
    setMsg({ kind: "info", text: `Draft resumed.${stale.length ? ` ${stale.join(", ")} changed since; your changes were laid over the current plan — check them.` : ""}` });
  };
  const discard = () => { if (!window.confirm("Discard all unsaved changes?")) return; setWork(Object.fromEntries(columns.map((c) => [c.courseId, toCards(c)]))); setLinks([]); setSel(new Set()); };
  const undo = async () => {
    if (!window.confirm("Undo everything you saved in this session? Plans someone changed since are left as they are.")) return;
    const r = await jsend(`${API}/versions`, "POST", { undo: sessionId });
    setMsg(r.ok ? { kind: "ok", text: `Undone: ${r.d.restored} plan(s) restored${r.d.skipped?.length ? `; not undone (changed since): ${r.d.skipped.join(", ")}` : ""}.` } : { kind: "err", text: r.d.error || "Could not undo." });
    if (r.ok) load(open);
  };
  const mergeAndSave = async () => {
    if (!conflicts) return;
    const body = collect().map((b) => {
      const c = conflicts.find((x) => x.courseId === b.courseId);
      if (!c) return b;
      const col = colOf(b.courseId)!;
      const base = col.rows.map((r) => ({ id: r.id, topic: r.topic, subtopic: r.subtopic }));
      const { merged } = mergeLayouts(base, b.entries, c.theirs);
      return { ...b, hash: c.hash || b.hash, entries: merged.map((e) => ({ id: e.id, topic: e.topic, subtopic: e.subtopic, importance: e.importance || null, fromCourseId: e.fromCourseId || null, mergedFrom: e.mergedFrom || null, splitFrom: e.splitFrom || null })) };
    });
    // The new hash is the current plan's; reload it, then save the merged lists.
    const fresh = await jget(`${API}?open=${encodeURIComponent(JSON.stringify(conflicts.map((x) => ({ courseId: x.courseId, plan: colOf(x.courseId)?.plan || null }))))}`);
    const hashes = new Map(((fresh.d.columns || []) as Column[]).map((c) => [c.courseId, c.hash]));
    setConflicts(null);
    await save(body.map((b) => ({ ...b, hash: hashes.get(b.courseId) || b.hash })));
  };

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement)?.tagName || "");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (e.shiftKey) saveDraft(); else save(); return; }
      if (e.key === "Escape") { setDrag(null); setDropAt(null); setLinkAsk(null); setLineMenu(null); setSel(new Set()); setDetail(null); return; }
      if (typing || mobile) return;
      const lv = ({ "1": "CORE", "2": "IMPORTANT", "3": "OPTIONAL" } as Record<string, Level>)[e.key];
      if (lv && sel.size) { e.preventDefault(); setLevel(selKeys(), lv); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => { const f = (e: BeforeUnloadEvent) => { if (totalChanges) { e.preventDefault(); e.returnValue = ""; } }; window.addEventListener("beforeunload", f); return () => window.removeEventListener("beforeunload", f); }, [totalChanges]);

  // ---------------------------------------------------------------- performance (heat)
  useEffect(() => {
    if (heat === "off") return;
    for (const c of columns) if (!perf[c.courseId]) jget(`${API}/performance?courseId=${c.courseId}&plan=${c.plan}`).then((r) => r.ok && setPerf((p) => ({ ...p, [c.courseId]: r.d.perf || {} })));
  }, [heat, columns, perf]);

  // ---------------------------------------------------------------- suggestions
  const importanceSugs = useMemo(() => columns.flatMap((c) => (work[c.courseId] || []).filter((k) => k.origin && !k.origin.confirmed && k.origin.suggestion.level !== (k.importance || null)).map((k) => ({ col: c, card: k, s: k.origin!.suggestion }))), [columns, work]);
  const loadSugs = async () => { setSugOpen(true); setSugs(null); const r = await jget(`${API}/suggestions?courseIds=${columns.map((c) => c.planCourseId).join(",")}`); setSugs(r.ok ? { list: r.d.suggestions || [], ai: r.d.ai } : { list: [], ai: "off" }); };
  const decide = async (s: Suggestion, decision: "ACCEPTED" | "REJECTED", reason = "") => jsend(`${API}/suggestions`, "POST", { kind: s.kind, key: s.key, hash: s.hash, decision, reason, data: s.data });
  const acceptSug = async (s: Suggestion, level?: string) => {
    if (s.kind === "TOPIC_LINK") {
      const d = s.data as Record<string, string>;
      const fc = columns.find((c) => c.planCourseId === d.fromCourseId || c.code === d.fromCode), tc = columns.find((c) => c.planCourseId === d.toCourseId || c.code === d.toCode);
      setLinks((l) => l.concat({ key: tmpKey(), kind: (d.kind as "PREREQ" | "OVERLAP") || "PREREQ", level: level || d.level, action: "ADD", fromCourseId: fc?.courseId || d.fromCourseId, fromCode: d.fromCode, fromTopic: d.fromTopic, toCourseId: tc?.courseId || d.toCourseId, toCode: d.toCode, toTopic: d.toTopic, note: `Suggested: ${s.reason}` }));
    } else if (s.kind === "ORDER") {
      const d = s.data as Record<string, string>;
      const c = columns.find((x) => x.planCourseId === d.courseId || x.code === d.code);
      if (c) setCards(c.courseId, (cards) => { const i = cards.findIndex((k) => k.topic === d.early), j = cards.findIndex((k) => k.topic === d.late); if (i < 0 || j < 0) return cards; const n = cards.slice(); const [m] = n.splice(i, 1); n.splice(j, 0, m); return n; });
    } else if (s.kind === "COURSE_PREREQ") {
      const r = await decide(s, "ACCEPTED");
      if (!r.ok) { setMsg({ kind: "err", text: r.d.error }); return; }
    }
    if (s.kind !== "COURSE_PREREQ") await decide(s, "ACCEPTED");
    setSugs((x) => (x ? { ...x, list: x.list.filter((y) => y.key !== s.key) } : x));
  };
  const rejectSug = async (s: Suggestion) => {
    const reason = window.prompt("Why not? (remembered, so it isn't suggested again unless the topics change)") || "";
    if (reason.trim().length < 3) return;
    const r = await decide(s, "REJECTED", reason);
    if (r.ok) setSugs((x) => (x ? { ...x, list: x.list.filter((y) => y.key !== s.key) } : x));
  };
  const sugCount = (sugs?.list.length || 0) + importanceSugs.length;

  // ---------------------------------------------------------------- lines between linked topics
  const cardEl = (courseId: string, key: string) => cardRefs.current.get(`${courseId}::${key}`);
  const findTopic = (code: string, topic: string) => {
    for (const c of columns) if (c.code === code) { const list = work[c.courseId] || []; const k = list.find((x) => norm(x.topic) === norm(topic)) || list.find((x) => same(x.topic, topic)); if (k) return { col: c, card: k }; }
    return null;
  };
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area || mobile) { setLines([]); return; }
    const box = area.getBoundingClientRect();
    setSize({ w: area.scrollWidth, h: area.scrollHeight });
    const pt = (el: HTMLElement | undefined, side: "l" | "r") => { if (!el || !el.offsetParent) return null; const r = el.getBoundingClientRect(); return { x: (side === "r" ? r.right : r.left) - box.left + area.scrollLeft, y: r.top + r.height / 2 - box.top + area.scrollTop }; };
    const out: Line[] = [];
    const add = (id: string, a: { col: Column; card: Card }, b: { col: Column; card: Card }, color: string, dash: string, label: string, link?: Line["link"]) => {
      const ia = ordered.indexOf(a.col), ib = ordered.indexOf(b.col);
      const p1 = pt(cardEl(a.col.courseId, a.card.key), ia < ib ? "r" : "l"), p2 = pt(cardEl(b.col.courseId, b.card.key), ia < ib ? "l" : "r");
      if (p1 && p2) out.push({ id, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, color, dash, label, link });
    };
    if (show.prereqs) for (const c of columns) for (const k of work[c.courseId] || []) for (const d of k.origin?.dependents || []) {
      const t = findTopic(d.code, d.topic);
      if (t && t.col.courseId !== c.courseId) add(`p:${c.courseId}:${k.key}:${t.col.courseId}:${t.card.key}`, { col: c, card: k }, t, LINK_COLOR[d.strength] || "#888", "", `${d.strength.toLowerCase()} prerequisite`, { kind: "PREREQ", level: d.strength, fromCol: c, fromTopic: k.topic, toCol: t.col, toTopic: t.card.topic, confirmed: true });
    }
    if (show.overlaps) for (const c of columns) for (const k of work[c.courseId] || []) for (const o of k.origin?.overlaps || []) {
      if (o.code < c.code) continue;
      const t = findTopic(o.code, o.topic);
      if (t) add(`o:${c.courseId}:${k.key}:${t.col.courseId}`, { col: c, card: k }, t, LINK_COLOR[o.verdict] || "#888", "", o.verdict.toLowerCase(), { kind: "OVERLAP", level: o.verdict, fromCol: c, fromTopic: k.topic, toCol: t.col, toTopic: t.card.topic, confirmed: true });
    }
    for (const p of pendingLinks) {
      if ((p.kind === "PREREQ" && !show.prereqs) || (p.kind === "OVERLAP" && !show.overlaps)) continue;
      const a = findTopic(p.fromCode, p.fromTopic), b = findTopic(p.toCode, p.toTopic);
      if (a && b) add(`w:${p.id}`, a, b, LINK_COLOR[p.level] || "#888", "6 4", `${p.level.toLowerCase()} — waiting for ${p.state.waiting.join(", ")}`);
    }
    for (const l of links) {
      const a = findTopic(l.fromCode, l.fromTopic), b = findTopic(l.toCode, l.toTopic);
      if (a && b) add(`d:${l.key}`, a, b, LINK_COLOR[l.level] || "#888", "6 4", `${l.level.toLowerCase()} (unsaved)`);
    }
    if (show.suggested && sugs) for (const s of sugs.list.filter((x) => x.kind === "TOPIC_LINK")) {
      const d = s.data as Record<string, string>;
      const a = findTopic(d.fromCode, d.fromTopic), b = findTopic(d.toCode, d.toTopic);
      if (a && b) add(`s:${s.key}`, a, b, LINK_COLOR[d.level] || "#888", "2 4", `suggested ${String(d.level).toLowerCase()} (${s.confidence}): ${s.reason}`);
    }
    setLines(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work, columns, open, show, pendingLinks, links, sugs, mobile, ordered, heat]);
  useEffect(() => { const f = () => setWork((w) => ({ ...w })); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);

  // ---------------------------------------------------------------- render helpers
  const level = (k: Card): { lv: Level; suggested: boolean } => (k.importance ? { lv: k.importance as Level, suggested: !!k.origin && !k.origin.confirmed && k.importance === k.origin.importance && !k.origin.importance } : { lv: k.origin?.prefill || "IMPORTANT", suggested: true });
  const perfOf = (c: Column, k: Card) => (k.id ? perf[c.courseId]?.[k.id] : undefined);
  const hover = (c: Column, k: Card) => {
    const r = k.origin; const p = perfOf(c, k);
    const lines = [
      `${k.topic}${k.subtopic ? ` — ${k.subtopic}` : ""}`,
      `Importance: ${LEVEL_LABEL[level(k).lv]}${level(k).suggested ? ` (suggested: ${r?.suggestion.why || "default"})` : ""}`,
      r ? `Drop: ${r.safety.mark} ${r.safety.reason}` : "New topic (not saved yet)",
      ...(r?.needs || []).map((n) => `Needs ${n.code}: ${n.topic} (${n.strength.toLowerCase()})`),
      ...(r?.dependents || []).map((d) => `Needed by ${d.code}: ${d.topic} (${d.strength.toLowerCase()})`),
      r?.clo ? `CLO: ${r.clo}${r.bloom ? ` · ${r.bloom}` : ""}` : r?.needsClo ? `Map to a CLO${r.cloSuggestion ? ` — suggested ${r.cloSuggestion.code}` : ""}` : "",
      r && r.links + r.paperItems ? `Assessed in ${r.links + r.paperItems} item(s)` : "",
      r?.difficulty ? `${r.difficulty} student(s) said it was among the hardest` : "",
      r?.movedFrom ? `Taught in ${r.movedFrom} before` : "",
      p ? perfLine(p) : "",
    ];
    return lines.filter(Boolean).join("\n");
  };
  const perfLine = (p: Perf[string]) => {
    const f = (s: PerfS, name: string) => s.tooLittle ? `${name}: too little data${s.shown ? ` (${s.shown.students} students)` : ""}` : `${name}: ${s.shown!.avg}% avg, ${s.shown!.below}% below pass (${s.shown!.students} students, ${s.shown!.offerings} offering(s))`;
    return [f(p.overall, "Overall"), f(p.last3, "Last 3"), f(p.last, "Last"), p.overall.trend != null ? `Trend: ${p.overall.trend > 0 ? "+" : ""}${p.overall.trend} points` : "", `${p.overall.questions} question(s) in ${p.overall.assessments} assessment(s)`, p.from.length ? `History from ${p.from.join(", ")}` : "", p.vsLectures ? `Lectures vs results: ${p.vsLectures.map((v) => `${v.lectures} lecture(s) → ${v.avg}%`).join(", ")}` : ""].filter(Boolean).join("\n");
  };
  const heatOf = (c: Column, k: Card) => { const p = perfOf(c, k); if (!p || heat === "off") return null; const s = heat === "overall" ? p.overall : heat === "last3" ? p.last3 : p.last; return s.tooLittle ? "grey" : s.heat; };

  if (loading && !columns.length) return <p className="small-note">Opening the workspace…</p>;
  const readOnly = mobile;
  const detailCard = detail ? findCard(detail.courseId, detail.key) : null;
  const detailCol = detail ? colOf(detail.courseId) : null;

  return (
    <div className="tw">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {missing && <div className="err">{missing}</div>}
      {draft && <div className="card tw-banner">You have a draft from {new Date(draft.at).toLocaleString()}. <button className="btn btn-sm" onClick={resumeDraft}>Resume it</button> <button className="btn btn-secondary btn-sm" onClick={async () => { await jsend(`${API}/state`, "DELETE", {}); setDraft(null); }}>Discard draft</button></div>}
      {others.length > 0 && <div className="tw-banner tw-presence">Also open right now: {Array.from(new Set(others.map((o) => `${o.name} (${columns.find((c) => c.planCourseId === o.courseId)?.code || ""})`))).join(", ")} — if you both save, the second person sees the difference and merges.</div>}

      <div className="tw-toolbar no-print">
        {!readOnly && <button className="btn btn-sm" onClick={() => setPicker(true)}>＋ Open a course</button>}
        <label><input type="checkbox" checked={show.prereqs} onChange={(e) => setShow({ ...show, prereqs: e.target.checked })} /> Show prerequisites</label>
        <label><input type="checkbox" checked={show.overlaps} onChange={(e) => setShow({ ...show, overlaps: e.target.checked })} /> Show overlaps</label>
        <label><input type="checkbox" checked={show.droppable} onChange={(e) => setShow({ ...show, droppable: e.target.checked })} /> Show what can be dropped</label>
        <label>Results <select value={heat} onChange={(e) => setHeat(e.target.value as typeof heat)}><option value="off">off</option><option value="overall">Overall</option><option value="last3">Last 3</option><option value="last">Last offering</option></select></label>
        <button className="btn btn-secondary btn-sm" onClick={loadSugs}>Suggestions{sugs || importanceSugs.length ? ` (${sugCount})` : ""}</button>
        {columns.some((c) => c.ownTeaching) && <button className="btn btn-secondary btn-sm" onClick={() => setShort(columns.find((c) => c.ownTeaching)!.courseId)}>I&apos;m short of time</button>}
        {savedOnce && <button className="btn btn-secondary btn-sm" onClick={undo} title="Undo everything you saved since opening this page">Undo this session</button>}
        <span className="tw-legend" aria-label="Legend">
          {(["CORE", "IMPORTANT", "OPTIONAL"] as Level[]).map((l, i) => <span key={l}><i style={{ background: LEVEL_COLOR[l] }} />{LEVEL_LABEL[l]} ({i + 1})</span>)}
          <span><i className="tw-outline" />suggested</span><span>⛔ keep · ! care · ✓ can drop</span><span><b style={{ color: LINK_COLOR.STRONG }}>━</b> strong <b style={{ color: LINK_COLOR.MILD }}>━</b> mild <b style={{ color: LINK_COLOR.WEAK }}>━</b> weak <b style={{ color: LINK_COLOR.PROGRESSION }}>━</b> progression <b style={{ color: LINK_COLOR.DUPLICATION }}>━</b> duplication · dashed = waiting · dotted = suggested</span>
        </span>
      </div>
      {msg && <div className={msg.kind === "err" ? "err" : "tw-banner"} role="status">{msg.text} <button className="tw-x" onClick={() => setMsg(null)} aria-label="Dismiss">×</button></div>}
      {!columns.length && <div className="card"><p style={{ fontSize: 13.5 }}>Open any courses of the institute side by side — yours and others&apos;. In courses you own, saved changes apply at once; in other courses they are sent to their Subject Expert as one proposal per course. {readOnly ? "On a phone the workspace is read-only." : <button className="btn btn-sm" onClick={() => setPicker(true)}>Open a course</button>}</p></div>}

      <div className={`tw-area${readOnly ? " tw-mobile" : ""}`} ref={areaRef} onScroll={() => setWork((w) => ({ ...w }))}>
        <svg className="tw-lines" width={size.w} height={size.h} aria-hidden={lines.length === 0}>
          {lines.map((l) => { const mx = (l.x1 + l.x2) / 2; return (
            <g key={l.id} onClick={(e) => { if (l.link && !readOnly) setLineMenu({ x: e.clientX, y: e.clientY, line: l }); }} style={{ cursor: l.link ? "pointer" : "default" }}>
              <path d={`M${l.x1},${l.y1} C${mx},${l.y1} ${mx},${l.y2} ${l.x2},${l.y2}`} stroke="transparent" strokeWidth={10} fill="none" />
              <path d={`M${l.x1},${l.y1} C${mx},${l.y1} ${mx},${l.y2} ${l.x2},${l.y2}`} stroke={l.color} strokeWidth={1.8} strokeDasharray={l.dash} fill="none" opacity={0.85}><title>{l.label}</title></path>
            </g>); })}
        </svg>
        {ordered.map((c) => {
          const o = open.find((x) => x.courseId === c.courseId);
          const cards = work[c.courseId] || [];
          const n = changedCount(c.courseId);
          return (
            <section key={c.courseId} className={`tw-col${o?.pinned ? " tw-pinned" : ""}${o?.collapsed ? " tw-collapsed" : ""}`} aria-label={`${c.code} ${c.title}`}
              onDragOver={(e) => { if (drag && !readOnly) { e.preventDefault(); if (!cards.length) setDropAt({ courseId: c.courseId, index: 0 }); } }}
              onDrop={(e) => { e.preventDefault(); if (drag && dropAt) move(drag, dropAt.courseId, dropAt.index, e.altKey || e.ctrlKey); setDrag(null); setDropAt(null); }}>
              <header className="tw-head">
                <div className="tw-head-top">
                  <b title={c.title}>{c.code}</b> <span className="tw-sem">S{c.semester ?? "?"}</span>
                  <span className="tw-head-btns">
                    <button title={o?.pinned ? "Unpin" : "Pin to the left"} onClick={() => toggleOpenFlag(c.courseId, "pinned")} aria-pressed={!!o?.pinned} style={{ opacity: o?.pinned ? 1 : 0.45 }}>📌</button>
                    <button title={o?.collapsed ? "Expand" : "Collapse"} onClick={() => toggleOpenFlag(c.courseId, "collapsed")}>{o?.collapsed ? "▸" : "▾"}</button>
                    <button title="Close" onClick={() => closeCourse(c.courseId)}>×</button>
                  </span>
                </div>
                {!o?.collapsed && <>
                  <div className="tw-title">{c.title}</div>
                  <div className="tw-meta">{c.program} {c.batch}{c.followsBase ? ` · follows ${c.followsBase}` : ""}</div>
                  <div className={`tw-mode tw-mode-${c.mode}`}>{c.mode === "APPLY" ? "✎ " : c.mode === "TEMPLATE" ? "🔒 " : c.mode === "FOLLOWER" ? "⇢ " : c.mode === "VIEW" ? "👁 " : "✉ "}{c.why}</div>
                  {c.mode === "FOLLOWER" && c.baseCourseId && <button className="btn btn-sm" style={{ marginTop: 4 }} onClick={() => changeOpen(open.some((x) => x.courseId === c.baseCourseId) ? open.filter((x) => x.courseId !== c.courseId) : open.map((x) => (x.courseId === c.courseId ? { courseId: c.baseCourseId!, plan: null } : x)))}>Open the base course instead</button>}
                  <div className="tw-head-actions">
                    {c.ownTeaching || (role === "INSTRUCTOR" && c.plan === "SE" && open.find((x) => x.courseId === c.courseId)?.plan === "SE") ? <select value={c.plan} onChange={(e) => changeOpen(open.map((x) => (x.courseId === c.courseId ? { ...x, plan: e.target.value as "SE" | "INSTRUCTOR" } : x)))} aria-label="Which plan"><option value="INSTRUCTOR">My teaching copy</option><option value="SE">Subject Expert&apos;s plan (propose)</option></select> : null}
                    <select value="" onChange={(e) => { if (e.target.value) { setChain({ courseId: c.courseId, dir: e.target.value, data: null }); jget(`${API}/chain?courseId=${c.courseId}&dir=${e.target.value}`).then((r) => setChain({ courseId: c.courseId, dir: e.target.value, data: r.ok ? r.d : { confirmed: [], suggestedOnly: [], preview: r.d.error || "" } })); } }} aria-label="Open the chain">
                      <option value="">Open the chain…</option><option value="down">Open the courses that need it</option><option value="up">Open what it needs</option><option value="both">Open the whole chain</option>
                    </select>
                    <a className="tw-link" href={`${API}/pdf?courseId=${c.courseId}&plan=${c.plan}`} target="_blank" rel="noreferrer">PDF</a>
                    {c.mode === "APPLY" && c.textbook && !readOnly && <button type="button" className="tw-linkbtn" style={{ padding: 0 }} title={`Map each topic to a chapter of ${c.textbook}`} onClick={() => mapReadings(c)}>📖 Map readings</button>}
                  </div>
                  {n > 0 && <div className="tw-changed">{n} unsaved change{n === 1 ? "" : "s"}</div>}
                </>}
              </header>
              {!o?.collapsed && <div className="tw-list">
                {cards.map((k, i) => {
                  const r = k.origin; const lv = level(k); const h = heatOf(c, k);
                  const hide = show.droppable && r?.safety.mark === "⛔";
                  const selected = sel.has(`${c.courseId}::${k.key}`);
                  return (
                    <div key={k.key}>
                      {dropAt?.courseId === c.courseId && dropAt.index === i && <div className="tw-drop" />}
                      <div ref={(el) => { if (el) cardRefs.current.set(`${c.courseId}::${k.key}`, el); else cardRefs.current.delete(`${c.courseId}::${k.key}`); }}
                        className={`tw-card${selected ? " tw-sel" : ""}${hide ? " tw-dim" : ""}${r?.notTaught ? " tw-nottaught" : ""}`} title={hover(c, k)}
                        draggable={!readOnly && c.mode !== "FOLLOWER"} onDragStart={(e) => { e.dataTransfer.setData("text/plain", k.topic); e.dataTransfer.effectAllowed = "copyMove"; setDrag({ courseId: c.courseId, key: k.key }); }}
                        onDragEnd={() => { setDrag(null); setDropAt(null); }}
                        onDragOver={(e) => { if (!drag) return; e.preventDefault(); e.stopPropagation(); const b = e.currentTarget.getBoundingClientRect(); setDropAt({ courseId: c.courseId, index: e.clientY > b.top + b.height / 2 ? i + 1 : i }); }}
                        onDrop={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          const ln = e.dataTransfer.getData("application/x-topic-link");
                          if (ln) { const [fc, fk] = ln.split("::"); const fcol = colOf(fc), fcard = findCard(fc, fk); if (fcol && fcard && fc !== c.courseId) setLinkAsk((fcol.semester ?? 0) <= (c.semester ?? 0) ? { from: { col: fcol, card: fcard }, to: { col: c, card: k } } : { from: { col: c, card: k }, to: { col: fcol, card: fcard } }); return; }
                          if (drag && dropAt) move(drag, dropAt.courseId, dropAt.index, e.altKey || e.ctrlKey); setDrag(null); setDropAt(null);
                        }}
                        onClick={(e) => { if (detail) setDetail({ courseId: c.courseId, key: k.key }); if (readOnly) return; const id = `${c.courseId}::${k.key}`; setSel((s) => { const n2 = new Set(e.shiftKey || e.ctrlKey || e.metaKey ? s : []); if (n2.has(id) && (e.shiftKey || e.ctrlKey || e.metaKey)) n2.delete(id); else n2.add(id); return n2; }); }}>
                        <button className={`tw-bar${lv.suggested ? " tw-bar-sug" : ""}`} style={{ background: lv.suggested ? "transparent" : LEVEL_COLOR[lv.lv], borderColor: LEVEL_COLOR[lv.lv] }} aria-label={`Importance ${LEVEL_LABEL[lv.lv]}${lv.suggested ? " (suggested)" : ""} — click to change`}
                          onClick={(e) => { e.stopPropagation(); if (readOnly) return; const next: Level = lv.suggested ? lv.lv : lv.lv === "CORE" ? "IMPORTANT" : lv.lv === "IMPORTANT" ? "OPTIONAL" : "CORE"; setLevel([{ courseId: c.courseId, key: k.key }], next); }} />
                        <div className="tw-body">
                          <div className="tw-topic"><span className="tw-ln" title="Lecture number in the plan">L{i + 1}</span>{h && <i className="tw-heat" style={{ background: HEAT[h] }} />}{k.topic}{isChanged(c, k) && <span className="tw-tag">proposed</span>}</div>
                          {k.subtopic && <div className="tw-sub">{k.subtopic}</div>}
                          <div className="tw-badges">
                            {r && <span className={`tw-safe tw-safe-${r.safety.mark === "⛔" ? "no" : r.safety.mark === "✓" ? "ok" : "warn"}`} title={r.safety.reason}>{r.safety.mark}</span>}
                            {r?.clo && <span>{r.clo}</span>}
                            {r?.needsClo && <span className="tw-flag" title={r.cloSuggestion?.why || ""}>map to a CLO</span>}
                            {r?.notTaught && <span className="tw-flag">planned, not taught</span>}
                            {r && r.comments > 0 && <span>💬 {r.comments}</span>}
                            {r?.inCouncil && <span title="In the council (curriculum) outline">council</span>}
                            {r?.reading ? <span title={r.readingAuto ? "Filled in from the book’s contents — check it" : "Reading"}>📖 {r.reading}{r.readingAuto ? " ·auto" : ""}</span> : r && c.textbook && !r.notTaught && <span className="tw-flag" title={`No chapter of ${c.textbook} matched`}>no reading</span>}
                          </div>
                        </div>
                        {!readOnly && !roCol(c) && <span className="tw-handle" draggable title="Drag onto a topic of another course to link them" onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.setData("application/x-topic-link", `${c.courseId}::${k.key}`); e.dataTransfer.effectAllowed = "link"; }}>⟶</span>}
                        <button className="tw-more" aria-label={`Details of ${k.topic}`} onClick={(e) => { e.stopPropagation(); setDetail({ courseId: c.courseId, key: k.key }); }}>⋯</button>
                      </div>
                    </div>
                  );
                })}
                {dropAt?.courseId === c.courseId && dropAt.index >= cards.length && <div className="tw-drop" />}
                {!readOnly && !roCol(c) && <AddTopic onAdd={(t) => setCards(c.courseId, (cs) => cs.concat({ key: tmpKey(), topic: t, subtopic: null, importance: null }))} />}
              </div>}
            </section>
          );
        })}
      </div>

      {totalChanges > 0 && !readOnly && (
        <div className="tw-unsaved no-print" role="region" aria-label="Unsaved changes">
          <span><b>{totalChanges} change{totalChanges === 1 ? "" : "s"}</b> in {changedCols.length} course{changedCols.length === 1 ? "" : "s"}{toApproval ? ` · ${toApproval} will be sent for approval` : ""}{links.length ? ` · ${links.length} link(s) to propose` : ""}</span>
          {(impact.clo || impact.quiz || impact.prereq) ? <span className="tw-impact">Impact: {[impact.clo ? `${impact.clo} CLO mapping(s) dropped` : "", impact.quiz ? `${impact.quiz} quiz/exam link(s) dropped` : "", impact.prereq ? `${impact.prereq} prerequisite link(s) affected` : ""].filter(Boolean).join(" · ")}</span> : null}
          <span className="tw-unsaved-btns"><button className="btn btn-sm" disabled={busy} onClick={() => save()}>{busy ? "Saving…" : "Save"}</button><button className="btn btn-secondary btn-sm" onClick={saveDraft}>Save as draft</button><button className="btn btn-secondary btn-sm" onClick={discard}>Discard</button></span>
        </div>
      )}

      {picker && <Picker onClose={() => setPicker(false)} onOpen={(refs) => { addRefs(refs); setPicker(false); }} openIds={open.map((o) => o.courseId)} />}
      {chain && <Modal title="Open the chain" onClose={() => setChain(null)}><ChainPick data={chain.data} onOpen={(ids) => { addCourses(ids); setChain(null); }} /></Modal>}
      {linkAsk && <Modal title="Link these topics" onClose={() => setLinkAsk(null)}><LinkAsk ask={linkAsk} onDone={(kind, lvl, note) => { setLinks((l) => l.concat({ key: tmpKey(), kind, level: lvl, action: "ADD", fromCourseId: linkAsk.from.col.courseId, fromCode: linkAsk.from.col.code, fromTopic: linkAsk.from.card.topic, toCourseId: linkAsk.to.col.courseId, toCode: linkAsk.to.col.code, toTopic: linkAsk.to.card.topic, note })); setLinkAsk(null); }} /></Modal>}
      {lineMenu?.line.link && <div className="tw-pop" style={{ left: Math.min(lineMenu.x, window.innerWidth - 280), top: lineMenu.y }} role="dialog" aria-label="Change link">
        <b>{lineMenu.line.link.fromCol.code} “{lineMenu.line.link.fromTopic}” → {lineMenu.line.link.toCol.code} “{lineMenu.line.link.toTopic}”</b>
        <div className="small-note">Now: {lineMenu.line.label}. Changes are proposals (both SEs, then the Program Lead).</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
          {(lineMenu.line.link.kind === "PREREQ" ? ["STRONG", "MILD", "WEAK"] : ["PROGRESSION", "DUPLICATION"]).filter((x) => x !== lineMenu.line.link!.level).map((lv) => <button key={lv} className="btn btn-secondary btn-sm" onClick={() => { const L = lineMenu.line.link!; setLinks((l) => l.concat({ key: tmpKey(), kind: L.kind, level: lv, action: "CHANGE", fromCourseId: L.fromCol.courseId, fromCode: L.fromCol.code, fromTopic: L.fromTopic, toCourseId: L.toCol.courseId, toCode: L.toCol.code, toTopic: L.toTopic })); setLineMenu(null); }}>Make it {lv.toLowerCase()}</button>)}
          <button className="btn btn-secondary btn-sm" onClick={() => { const L = lineMenu.line.link!; setLinks((l) => l.concat({ key: tmpKey(), kind: L.kind, level: L.level, action: "REMOVE", fromCourseId: L.fromCol.courseId, fromCode: L.fromCol.code, fromTopic: L.fromTopic, toCourseId: L.toCol.courseId, toCode: L.toCol.code, toTopic: L.toTopic })); setLineMenu(null); }}>Remove link</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setLineMenu(null)}>Close</button>
        </div>
      </div>}
      {conflicts && <Modal title="Someone saved these courses after you opened them" onClose={() => setConflicts(null)}>
        {conflicts.map((c) => { const col = colOf(c.courseId); const base = col?.rows || []; const added = c.theirs.filter((t) => !base.some((b) => b.id === t.id)); const removed = base.filter((b) => !c.theirs.some((t) => t.id === b.id)); const renamed = c.theirs.filter((t) => base.some((b) => b.id === t.id && b.topic !== t.topic)); return (
          <div key={c.courseId} style={{ marginBottom: 10 }}><b>{c.code}</b> — saved by {c.by}:
            <ul className="tw-diff">{added.map((t) => <li key={t.id} className="add">+ {t.topic}</li>)}{removed.map((t) => <li key={t.id} className="del">− {t.topic}</li>)}{renamed.map((t) => <li key={t.id} className="ren">✎ {t.topic}</li>)}{!added.length && !removed.length && !renamed.length && <li>order changed</li>}</ul>
          </div>); })}
        <p className="small-note">Merging keeps both: their changes plus yours on top (where you both renamed the same topic, theirs stays).</p>
        <button className="btn btn-sm" onClick={mergeAndSave}>Merge and save</button> <button className="btn btn-secondary btn-sm" onClick={() => setConflicts(null)}>Not now</button>
      </Modal>}
      {detailCard && detailCol && <TopicDetail col={detailCol} card={detailCard} readOnly={readOnly} columns={columns} perf={perfOf(detailCol, detailCard)} perfLine={perfLine}
        onClose={() => setDetail(null)}
        onChange={(patch) => setCards(detailCol.courseId, (cs) => cs.map((x) => (x.key === detailCard.key ? { ...x, ...patch } : x)))}
        onDelete={() => { if (detailCard.origin && detailCard.origin.safety.mark === "⛔" && !window.confirm(`${detailCard.origin.safety.reason}. Delete it anyway?`)) return; setCards(detailCol.courseId, (cs) => cs.filter((x) => x.key !== detailCard.key)); setDetail(null); }}
        onSplit={() => setCards(detailCol.courseId, (cs) => { const i = cs.findIndex((x) => x.key === detailCard.key); const n = cs.slice(); const src = detailCard.id || detailCard.splitFrom || null; n.splice(i + 1, 0, { key: tmpKey(), topic: `${detailCard.topic} (part 2)`, subtopic: null, importance: detailCard.importance || null, splitFrom: src }); n[i] = { ...n[i], topic: `${detailCard.topic} (part 1)` }; return n; })}
        onMerge={() => setCards(detailCol.courseId, (cs) => { const i = cs.findIndex((x) => x.key === detailCard.key); if (i < 0 || i >= cs.length - 1) return cs; const n = cs.slice(); const nx = n[i + 1]; if (nx.origin?.pinned) return cs; const parts = Array.from(new Set([...(n[i].mergedFrom || (n[i].id ? [n[i].id!] : [])), ...(nx.mergedFrom || (nx.id ? [nx.id] : []))])); n[i] = { ...n[i], topic: `${n[i].topic}; ${nx.topic}`.slice(0, 300), subtopic: [n[i].subtopic, nx.subtopic].filter(Boolean).join("; ") || null, mergedFrom: parts.length > 1 ? parts : n[i].mergedFrom || null }; n.splice(i + 1, 1); return n; })}
        onCopyMove={(to, copy) => { move({ courseId: detailCol.courseId, key: detailCard.key }, to, (work[to] || []).length, copy); setDetail(null); }}
        onSaved={() => load(open, true)} setMsg={setMsg} />}
      {sugOpen && <SuggestionsPanel sugs={sugs} importance={importanceSugs.map((x) => ({ key: `${x.col.courseId}::${x.card.key}`, code: x.col.code, topic: x.card.topic, level: x.s.level, why: x.s.why, confidence: x.s.confidence }))} role={role}
        onClose={() => setSugOpen(false)} onAccept={acceptSug} onReject={rejectSug}
        onImportance={(keys, lv) => setLevel(keys.map((k) => { const [courseId, key] = k.split("::"); return { courseId, key }; }), lv)} />}
      {tocAsk && <Modal title={`Contents of ${tocAsk.book}`} onClose={() => setTocAsk(null)}><TocPaste onSend={(t) => mapReadings(tocAsk.col, t)} /></Modal>}
      {short && <Modal title="I'm short of time" onClose={() => setShort(null)}><ShortOfTime courseId={short} columns={columns.filter((c) => c.ownTeaching)} onDone={(t) => { setShort(null); setMsg({ kind: "ok", text: t }); }} /></Modal>}
    </div>
  );
}

type DraftData = { open: OpenRef[]; work: Record<string, { hash: string; cards: Card[] }>; links: LinkDraft[] };
type Conflict = { courseId: string; code: string; theirs: { id: string; topic: string; subtopic: string | null }[]; by: string; hash?: string };
type ChainData = { confirmed: { id: string; code: string; title: string; semester: number | null }[]; suggestedOnly: { id: string; code: string; title: string; semester: number | null }[]; preview: string };

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="tw-modal" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="tw-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="tw-modal-head"><b>{title}</b><button className="tw-x" onClick={onClose} aria-label="Close">×</button></div>
        {children}
      </div>
    </div>
  );
}

function TocPaste({ onSend }: { onSend: (t: string) => void }) {
  const [t, setT] = useState("");
  return (
    <div>
      <p className="small-note">Paste the book&apos;s table of contents once (it is kept for every course using this book): one chapter or section per line with its pages, e.g. <code>4.2 Linked Lists 112-130</code>.</p>
      <textarea rows={10} value={t} onChange={(e) => setT(e.target.value)} style={{ width: "100%", fontFamily: "monospace", fontSize: 12.5 }} aria-label="Table of contents" />
      <button className="btn btn-sm" disabled={!t.trim()} onClick={() => onSend(t)}>Map the topics</button>
    </div>
  );
}

function AddTopic({ onAdd }: { onAdd: (t: string) => void }) {
  const [t, setT] = useState("");
  return <form className="tw-add" onSubmit={(e) => { e.preventDefault(); if (t.trim()) { onAdd(t.trim()); setT(""); } }}><input value={t} onChange={(e) => setT(e.target.value)} placeholder="Add a topic…" aria-label="Add a topic" /><button className="btn btn-secondary btn-sm" disabled={!t.trim()}>Add</button></form>;
}

type Version = { courseId: string; plan: "SE" | "INSTRUCTOR"; kind: "BASE" | "SE" | "INSTRUCTOR"; label: string; changed?: number; mine?: boolean };
type Group = { key: string; code: string; title: string; semester: number | null; programs: string[]; followers: number; versions: Version[] };

/** One row per course; ticking it opens its latest base plan. "Versions" lists the other independent plans and the teaching copies that changed topics. */
function Picker({ onClose, onOpen, openIds }: { onClose: () => void; onOpen: (refs: OpenRef[]) => void; openIds: string[] }) {
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [pick, setPick] = useState<string[]>([]); // "courseId|plan"
  const [expanded, setExpanded] = useState<string[]>([]);
  useEffect(() => { const t = setTimeout(() => jget(`${API}/courses?q=${encodeURIComponent(q)}`).then((r) => r.ok && setGroups(r.d.groups || [])), 250); return () => clearTimeout(t); }, [q]);
  const id = (v: Version) => `${v.courseId}|${v.plan}`;
  const toggle = (v: Version) => setPick((p) => (p.includes(id(v)) ? p.filter((x) => x !== id(v)) : p.concat(id(v))));
  return (
    <Modal title="Open courses" onClose={onClose}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by code, title, program or batch" style={{ width: "100%" }} aria-label="Search courses" />
      <div className="tw-picklist">
        {groups.map((g) => {
          const first = g.versions[0];
          const more = g.versions.slice(1);
          const open = expanded.includes(g.key);
          return (
            <div key={g.key} className="tw-group">
              {first ? (
                <label className={openIds.includes(first.courseId) ? "tw-muted" : ""}>
                  <input type="checkbox" disabled={openIds.includes(first.courseId)} checked={openIds.includes(first.courseId) || pick.includes(id(first))} onChange={() => toggle(first)} />
                  <b>{g.code}</b> {g.title} <span className="small-note">· S{g.semester ?? "?"} · {g.programs.join(", ")}</span>
                  <div className="small-note" style={{ marginLeft: 22 }}>{first.label}{first.mine ? " · yours" : ""}{g.followers ? ` · ${g.followers} batch(es) follow this plan` : ""}</div>
                </label>
              ) : <div><b>{g.code}</b> {g.title} <span className="small-note">· only follower copies (open the base course)</span></div>}
              {more.length > 0 && <button type="button" className="tw-linkbtn" onClick={() => setExpanded((x) => (open ? x.filter((k) => k !== g.key) : x.concat(g.key)))} aria-expanded={open}>{open ? "▾" : "▸"} {more.length} other version{more.length === 1 ? "" : "s"}</button>}
              {open && more.map((v) => (
                <label key={id(v)} style={{ marginLeft: 22, display: "block" }} className={openIds.includes(v.courseId) ? "tw-muted" : ""}>
                  <input type="checkbox" checked={pick.includes(id(v))} onChange={() => toggle(v)} /> <span className={`tw-vkind tw-vkind-${v.kind}`}>{v.kind === "INSTRUCTOR" ? "Instructor" : "SE"}</span> {v.label}{v.mine ? " · yours" : ""}
                </label>
              ))}
            </div>
          );
        })}
        {!groups.length && <p className="small-note">No courses match.</p>}
      </div>
      <button className="btn btn-sm" disabled={!pick.length} onClick={() => onOpen(pick.map((x) => { const [courseId, plan] = x.split("|"); return { courseId, plan: plan as "SE" | "INSTRUCTOR" }; }))}>Open {pick.length || ""} version{pick.length === 1 ? "" : "s"}</button>
    </Modal>
  );
}

function ChainPick({ data, onOpen }: { data: ChainData | null; onOpen: (ids: string[]) => void }) {
  const [ticked, setTicked] = useState<string[] | null>(null);
  if (!data) return <p className="small-note">Finding the chain…</p>;
  const sel = ticked ?? data.confirmed.map((c) => c.id);
  const row = (c: ChainData["confirmed"][number]) => <label key={c.id} style={{ display: "block" }}><input type="checkbox" checked={sel.includes(c.id)} onChange={() => setTicked(sel.includes(c.id) ? sel.filter((x) => x !== c.id) : sel.concat(c.id))} /> <b>{c.code}</b> {c.title} <span className="small-note">S{c.semester ?? "?"}</span></label>;
  return (
    <div>
      <p><b>{data.preview}</b></p>
      {data.confirmed.map(row)}
      {data.suggestedOnly.length > 0 && <><p className="small-note" style={{ marginTop: 8 }}>Only through suggested or waiting links (not ticked):</p>{data.suggestedOnly.map(row)}</>}
      {!data.confirmed.length && !data.suggestedOnly.length && <p className="small-note">No linked courses found.</p>}
      <button className="btn btn-sm" disabled={!sel.length} onClick={() => onOpen(data.confirmed.concat(data.suggestedOnly).filter((c) => sel.includes(c.id)).map((c) => c.id))}>Open {sel.length} course{sel.length === 1 ? "" : "s"}</button>
    </div>
  );
}

function LinkAsk({ ask, onDone }: { ask: { from: { col: Column; card: Card }; to: { col: Column; card: Card } }; onDone: (kind: "PREREQ" | "OVERLAP", level: string, note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <div>
      <p style={{ fontSize: 13.5 }}><b>{ask.from.col.code}</b> “{ask.from.card.topic}” → <b>{ask.to.col.code}</b> “{ask.to.card.topic}”</p>
      <p className="small-note">Prerequisite: the later topic needs the earlier one. Same topic: taught in both courses. The link is a proposal: both Subject Experts agree, then the Program Lead confirms (a Strong prerequisite also needs two OMC approvals).</p>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={{ width: "100%", marginBottom: 6 }} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span className="small-note">Prerequisite:</span>{["STRONG", "MILD", "WEAK"].map((l) => <button key={l} className="btn btn-sm" style={{ background: LINK_COLOR[l] }} onClick={() => onDone("PREREQ", l, note)}>{l[0] + l.slice(1).toLowerCase()}</button>)}
        <span className="small-note">Same topic:</span>{["PROGRESSION", "DUPLICATION"].map((l) => <button key={l} className="btn btn-sm" style={{ background: LINK_COLOR[l] }} onClick={() => onDone("OVERLAP", l, note)}>{l[0] + l.slice(1).toLowerCase()}</button>)}
      </div>
    </div>
  );
}

function TopicDetail({ col, card, readOnly, columns, perf, perfLine, onClose, onChange, onDelete, onSplit, onMerge, onCopyMove, onSaved, setMsg }: {
  col: Column; card: Card; readOnly: boolean; columns: Column[]; perf?: Perf[string]; perfLine: (p: Perf[string]) => string;
  onClose: () => void; onChange: (p: Partial<Card>) => void; onDelete: () => void; onSplit: () => void; onMerge: () => void; onCopyMove: (to: string, copy: boolean) => void; onSaved: () => void;
  setMsg: (m: { kind: "ok" | "err" | "info"; text: string } | null) => void;
}) {
  const r = card.origin;
  const [comments, setComments] = useState<{ id: string; body: string; by: string; at: string; role: string }[] | null>(null);
  const [text, setText] = useState("");
  const [extra, setExtra] = useState<{ notes: { note: string; term: string | null; by: string }[]; help: { id: string; kind: string; title: string; url: string | null }[] } | null>(null);
  const [note, setNote] = useState("");
  const [help, setHelp] = useState({ kind: "PRACTICE", title: "", url: "" });
  const [target, setTarget] = useState("");
  const owner = col.mode === "APPLY";
  useEffect(() => {
    jget(`${API}/comments?courseId=${col.courseId}&topic=${encodeURIComponent(card.topic)}`).then((x) => x.ok && setComments(x.d.comments || []));
    jget(`${API}/performance?courseId=${col.courseId}&plan=${col.plan}`).then((x) => x.ok && card.id && setExtra(x.d.extras?.[card.id] || null));
  }, [col.courseId, col.plan, card.topic, card.id]);
  const meta = async (patch: Record<string, unknown>) => { const x = await jsend(`${API}/meta`, "PATCH", { courseId: col.courseId, plan: col.plan, lectureRowId: card.id, ...patch }); setMsg(x.ok ? { kind: "ok", text: "Saved." } : { kind: "err", text: x.d.error }); if (x.ok) onSaved(); };
  return (
    <aside className="tw-drawer" aria-label={`Topic ${card.topic}`}>
      <div className="tw-modal-head"><b>{col.code} · Topic</b><button className="tw-x" onClick={onClose} aria-label="Close">×</button></div>
      <label className="tw-field">Topic<input value={card.topic} disabled={readOnly} onChange={(e) => onChange({ topic: e.target.value })} /></label>
      <label className="tw-field">Sub-topics<textarea rows={2} value={card.subtopic || ""} disabled={readOnly} onChange={(e) => onChange({ subtopic: e.target.value || null })} /></label>
      <div className="tw-field">Importance {(["CORE", "IMPORTANT", "OPTIONAL"] as Level[]).map((l) => <button key={l} className={`btn btn-sm ${card.importance === l ? "" : "btn-secondary"}`} disabled={readOnly} onClick={() => onChange({ importance: l })}>{LEVEL_LABEL[l]}</button>)}
        {r && <div className="small-note">Suggested: {LEVEL_LABEL[r.suggestion.level]} ({r.suggestion.confidence}) — {r.suggestion.why}</div>}</div>
      {r && <p className="small-note">Drop: {r.safety.mark} {r.safety.reason}{r.gaOnly.length ? ` · the only topic reaching GA/PLO ${r.gaOnly.join(", ")}` : ""} · {r.bank} question(s) in the bank</p>}
      {!readOnly && <div className="tw-row">
        <button className="btn btn-secondary btn-sm" onClick={onSplit}>Split</button>
        <button className="btn btn-secondary btn-sm" onClick={onMerge}>Merge with next</button>
        <button className="btn btn-secondary btn-sm" onClick={onDelete}>Delete</button>
      </div>}
      {!readOnly && <div className="tw-row"><select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Another open course"><option value="">Another open course…</option>{columns.filter((c) => c.courseId !== col.courseId).map((c) => <option key={c.courseId} value={c.courseId}>{c.code}</option>)}</select>
        <button className="btn btn-secondary btn-sm" disabled={!target} onClick={() => onCopyMove(target, true)}>Copy there</button><button className="btn btn-secondary btn-sm" disabled={!target || !!r?.pinned} onClick={() => onCopyMove(target, false)}>Move there</button></div>}
      {r && card.id && <>
        {(r.needsClo || !r.cloId) && <div className="tw-field">CLO {r.cloSuggestion ? <>suggested <b>{r.cloSuggestion.code}</b> <span className="small-note">({r.cloSuggestion.why})</span> {owner && <button className="btn btn-sm" onClick={() => meta({ cloId: r.cloSuggestion!.id })}>Confirm</button>}</> : <span className="small-note">no CLO suggestion</span>}{!owner && <div className="small-note">The plan&apos;s owner confirms it.</div>}</div>}
        <label className="tw-field">Reading (book chapter){col.textbook ? <span className="small-note"> — required books: {col.textbook}</span> : null}<input defaultValue={r.reading || ""} disabled={!owner} onBlur={(e) => e.target.value !== (r.reading || "") && meta({ reading: e.target.value })} placeholder={owner ? "e.g. Ch. 4.2" : "—"} /></label>
        <label className="tw-field">Industry relevance<select value={r.industry || ""} disabled={!owner} onChange={(e) => meta({ industry: e.target.value || null })}><option value="">—</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select></label>
      </>}
      {perf && <pre className="tw-perf">{perfLine(perf)}</pre>}
      <h4>Teaching notes</h4>
      {extra?.notes.length ? extra.notes.map((n, i) => <p key={i} className="small-note">“{n.note}” — {n.by}{n.term ? `, ${n.term}` : ""}</p>) : <p className="small-note">None yet.</p>}
      {(col.ownTeaching || col.mode === "APPLY") && <form onSubmit={async (e) => { e.preventDefault(); const x = await jsend(`${API}/notes`, "POST", { courseId: col.courseId, topic: card.topic, note }); if (x.ok) { setNote(""); setExtra((o) => ({ notes: [{ note, term: null, by: "you" }, ...(o?.notes || [])], help: o?.help || [] })); } else setMsg({ kind: "err", text: x.d.error }); }}><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note for whoever teaches this next" style={{ width: "100%" }} /></form>}
      <h4>Ready help</h4>
      {extra?.help.length ? extra.help.map((h) => <p key={h.id} className="small-note">{h.kind.toLowerCase()}: {h.url ? <a href={h.url} target="_blank" rel="noreferrer">{h.title}</a> : h.title}</p>) : <p className="small-note">None yet.</p>}
      {(col.ownTeaching || col.mode === "APPLY") && <form className="tw-row" onSubmit={async (e) => { e.preventDefault(); const x = await jsend(`${API}/notes`, "POST", { courseId: col.courseId, topic: card.topic, help }); if (x.ok) { setExtra((o) => ({ notes: o?.notes || [], help: [{ id: tmpKey(), kind: help.kind, title: help.title, url: help.url || null }, ...(o?.help || [])] })); setHelp({ ...help, title: "", url: "" }); } else setMsg({ kind: "err", text: x.d.error }); }}>
        <select value={help.kind} onChange={(e) => setHelp({ ...help, kind: e.target.value })}><option value="PRACTICE">Practice set</option><option value="MATERIAL">Material</option><option value="REMEDIATION">Remediation</option></select>
        <input value={help.title} onChange={(e) => setHelp({ ...help, title: e.target.value })} placeholder="Title" /><input value={help.url} onChange={(e) => setHelp({ ...help, url: e.target.value })} placeholder="https://…" /><button className="btn btn-secondary btn-sm" disabled={!help.title.trim()}>Add</button></form>}
      <h4>Comments {comments ? `(${comments.length})` : ""}</h4>
      {comments?.map((c) => <p key={c.id} style={{ fontSize: 12.5 }}><b>{c.by}</b> <span className="small-note">{c.role.replace(/_/g, " ").toLowerCase()} · {new Date(c.at).toLocaleDateString()}</span><br />{c.body}</p>)}
      <form onSubmit={async (e) => { e.preventDefault(); const x = await jsend(`${API}/comments`, "POST", { courseId: col.courseId, topic: card.topic, lectureRowId: card.id, body: text }); if (x.ok) { setComments((cs) => (cs || []).concat({ id: tmpKey(), body: text, by: "You", at: new Date().toISOString(), role: "" })); setText(""); } else setMsg({ kind: "err", text: x.d.error }); }}>
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Comment (the SE, Instructor and Program Lead see it)" style={{ width: "100%" }} /><button className="btn btn-secondary btn-sm" disabled={!text.trim()}>Comment</button></form>
    </aside>
  );
}

function SuggestionsPanel({ sugs, importance, role, onClose, onAccept, onReject, onImportance }: {
  sugs: { list: Suggestion[]; ai: string } | null; importance: { key: string; code: string; topic: string; level: Level; why: string; confidence: string }[]; role: string;
  onClose: () => void; onAccept: (s: Suggestion, level?: string) => void; onReject: (s: Suggestion) => void; onImportance: (keys: string[], lv: Level) => void;
}) {
  const [tab, setTab] = useState<"course" | "topic" | "importance">("topic");
  const list = (sugs?.list || []).filter((s) => (tab === "course" ? s.kind === "COURSE_PREREQ" : s.kind === "TOPIC_LINK" || s.kind === "ORDER"));
  const chip = (c: string) => <span className={`tw-conf tw-conf-${c}`}>{c}</span>;
  return (
    <aside className="tw-drawer" aria-label="Suggestions">
      <div className="tw-modal-head"><b>Suggestions</b><button className="tw-x" onClick={onClose} aria-label="Close">×</button></div>
      <p className="small-note">Never applied on their own — accepting one creates the same proposal you would make. {sugs ? (sugs.ai === "used" ? "Topic links use the institute's AI model." : sugs.ai === "available" ? "" : "No AI key: suggestions come from wording, lecture order and council data (lower confidence).") : ""}</p>
      <nav className="tw-tabs">
        <button aria-pressed={tab === "course"} onClick={() => setTab("course")}>Course prerequisites ({(sugs?.list || []).filter((s) => s.kind === "COURSE_PREREQ").length})</button>
        <button aria-pressed={tab === "topic"} onClick={() => setTab("topic")}>Topic links ({(sugs?.list || []).filter((s) => s.kind !== "COURSE_PREREQ").length})</button>
        <button aria-pressed={tab === "importance"} onClick={() => setTab("importance")}>Importance ({importance.length})</button>
      </nav>
      {!sugs && tab !== "importance" && <p className="small-note">Looking…</p>}
      {tab !== "importance" && <>
        {list.some((s) => s.confidence === "High") && (tab !== "course" || role === "PROGRAM_COORDINATOR") && <button className="btn btn-sm" onClick={() => list.filter((s) => s.confidence === "High").forEach((s) => onAccept(s))}>Accept all High</button>}
        {list.map((s) => { const d = s.data as Record<string, string>; return (
          <div key={s.key} className="tw-sug">
            {chip(s.confidence)} {s.kind === "COURSE_PREREQ" ? <b>{d.reverse ? `Check: ${d.fromCode} → ${d.toCode}` : `${d.fromCode} before ${d.toCode}`}</b> : s.kind === "ORDER" ? <b>{d.code}: move “{d.early}” after “{d.late}”</b> : <b>{d.fromCode} “{d.fromTopic}” → {d.toCode} “{d.toTopic}” ({String(d.level).toLowerCase()})</b>}
            <div className="small-note">{s.reason}</div>
            <div className="tw-row">
              {s.kind === "COURSE_PREREQ" && role !== "PROGRAM_COORDINATOR" ? <span className="small-note">The Program Lead decides this.</span> : <button className="btn btn-sm" onClick={() => onAccept(s)}>Accept</button>}
              <button className="btn btn-secondary btn-sm" onClick={() => onReject(s)}>Reject</button>
              {s.kind === "TOPIC_LINK" && d.kind === "PREREQ" && <select value="" onChange={(e) => e.target.value && onAccept(s, e.target.value)} aria-label="Change the strength and accept"><option value="">Change…</option>{["STRONG", "MILD", "WEAK"].filter((x) => x !== d.level).map((x) => <option key={x} value={x}>{x.toLowerCase()}</option>)}</select>}
            </div>
          </div>); })}
        {sugs && !list.length && <p className="small-note">Nothing to suggest here.</p>}
      </>}
      {tab === "importance" && <>
        {importance.some((s) => s.confidence === "High") && <button className="btn btn-sm" onClick={() => { const hi = importance.filter((s) => s.confidence === "High"); for (const lv of ["CORE", "IMPORTANT", "OPTIONAL"] as Level[]) onImportance(hi.filter((s) => s.level === lv).map((s) => s.key), lv); }}>Accept all High</button>}
        {importance.map((s) => <div key={s.key} className="tw-sug">{chip(s.confidence)} <b>{s.code}: {s.topic}</b> → {LEVEL_LABEL[s.level]}<div className="small-note">{s.why}</div><div className="tw-row"><button className="btn btn-sm" onClick={() => onImportance([s.key], s.level)}>Accept</button>{(["CORE", "IMPORTANT", "OPTIONAL"] as Level[]).filter((l) => l !== s.level).map((l) => <button key={l} className="btn btn-secondary btn-sm" onClick={() => onImportance([s.key], l)}>{LEVEL_LABEL[l]}</button>)}</div></div>)}
        {!importance.length && <p className="small-note">Every topic&apos;s importance is set.</p>}
        <p className="small-note">Accepted levels join your unsaved changes (Save applies or proposes them).</p>
      </>}
    </aside>
  );
}

function ShortOfTime({ courseId, columns, onDone }: { courseId: string; columns: Column[]; onDone: (t: string) => void }) {
  const [cid, setCid] = useState(courseId);
  const [lost, setLost] = useState(2);
  const [plan, setPlan] = useState<{ choices: { action: string; id: string; topic: string; cost: number; why: string; safety: { mark: string } }[]; picked: { id: string; action: string }[]; shortBy: number; to: string } | null>(null);
  const [pick, setPick] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const look = async () => { setErr(""); const r = await jget(`${API}/short-of-time?courseId=${cid}&lost=${lost}`); if (!r.ok) { setErr(r.d.error); return; } setPlan(r.d); setPick(r.d.picked.map((p: { id: string; action: string }) => `${p.action}:${p.id}`)); };
  const send = async () => { const r = await jsend(`${API}/short-of-time`, "POST", { courseId: cid, picks: pick.map((p) => { const [action, id] = p.split(":"); return { id, action }; }), note }); if (r.ok) onDone(`Sent to ${r.d.to} for approval. When approved, the topics are marked "planned but not taught" and the dependent courses' teachers are told.`); else setErr(r.d.error); };
  return (
    <div>
      <div className="tw-row">
        <select value={cid} onChange={(e) => { setCid(e.target.value); setPlan(null); }} aria-label="Course">{columns.map((c) => <option key={c.courseId} value={c.courseId}>{c.code}</option>)}</select>
        I lost <input type="number" min={1} max={20} value={lost} onChange={(e) => setLost(Number(e.target.value))} style={{ width: 60 }} aria-label="Lectures lost" /> lecture(s) <button className="btn btn-sm" onClick={look}>Show what to drop or shorten</button>
      </div>
      {err && <div className="err">{err}</div>}
      {plan && <>
        <p className="small-note">Safest first. ⛔ topics are never offered. {plan.shortBy ? `Even all of these leave you ${plan.shortBy} lecture(s) short.` : ""}</p>
        <div className="tw-picklist">{plan.choices.map((c) => { const k = `${c.action}:${c.id}`; return <label key={k}><input type="checkbox" checked={pick.includes(k)} onChange={() => setPick((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.concat(k)))} /> {c.safety.mark} <b>{c.action === "DROP" ? "Drop" : "Shorten"}</b> {c.topic} <span className="small-note">cost {c.cost} · {c.why}</span></label>; })}</div>
        <p className="small-note">Preview: {pick.length} lecture(s) won back of {lost}. Goes to {plan.to || "the Subject Expert"} for approval.</p>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why (e.g. 2 holidays, a strike day)" style={{ width: "100%" }} />
        <button className="btn btn-sm" disabled={!pick.length} onClick={send}>Send for approval</button>
      </>}
    </div>
  );
}

const CSS = `
.tw{position:relative}
.tw-toolbar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:8px;font-size:12.5px}
.tw-toolbar label{display:inline-flex;gap:4px;align-items:center}
.tw-legend{display:flex;flex-wrap:wrap;gap:8px;color:var(--slate);font-size:11.5px}
.tw-legend i{display:inline-block;width:6px;height:12px;margin-right:3px;vertical-align:middle;border-radius:2px}
.tw-legend .tw-outline{border:1.5px dashed #B0606E;background:transparent}
.tw-banner{background:#F4EFEE;border:1px solid var(--line);border-radius:8px;padding:6px 10px;font-size:12.5px;margin-bottom:8px}
.tw-presence{background:#FFF7E0}
.tw-x{background:none;border:0;font-size:18px;cursor:pointer;line-height:1;color:var(--slate)}
.tw-area{position:relative;display:flex;gap:12px;overflow-x:auto;padding-bottom:12px;align-items:flex-start;min-height:200px}
.tw-lines{position:absolute;left:0;top:0;pointer-events:none;z-index:2}
.tw-lines g{pointer-events:stroke}
.tw-col{flex:0 0 290px;background:#FBF9F8;border:1px solid var(--line);border-radius:10px;padding:8px;position:relative}
.tw-col.tw-pinned{position:sticky;left:0;z-index:3;box-shadow:4px 0 8px rgba(0,0,0,.06);background:#FFF}
.tw-col.tw-collapsed{flex-basis:120px}
.tw-head{border-bottom:1px solid var(--line);padding-bottom:6px;margin-bottom:6px}
.tw-head-top{display:flex;gap:6px;align-items:center}
.tw-head-btns{margin-left:auto;display:flex;gap:2px}
.tw .tw-head-btns button,.tw .tw-more,.tw .tw-x{background:transparent;border:0;box-shadow:none;min-height:0;height:auto;width:auto;line-height:1.2;cursor:pointer;font-size:13px;padding:2px 5px;border-radius:5px;color:var(--slate)}
.tw .tw-head-btns button:hover,.tw .tw-more:hover{background:#F1E9EA}
.tw .tw-bar{min-height:0;height:auto;box-shadow:none}
.tw-sem{font-size:11px;color:var(--slate);background:var(--line);border-radius:6px;padding:0 5px}
.tw-title{font-size:12.5px;font-weight:600}
.tw-meta{font-size:11px;color:var(--slate)}
.tw-mode{font-size:11px;margin-top:3px;padding:2px 6px;border-radius:6px}
.tw-ln{display:inline-block;min-width:24px;margin-right:5px;font-size:10.5px;font-weight:700;color:var(--slate);background:#F1E9EA;border-radius:4px;padding:0 3px;text-align:center}
.tw-mode-FOLLOWER{background:#F1ECF8;color:#5B3A8A}.tw-mode-VIEW{background:#EEF1F4;color:#444}
.tw-mode-APPLY{background:#E8F3EA;color:#1E6B34}.tw-mode-PROPOSE{background:#E9F0FB;color:#1C4E9B}.tw-mode-TEMPLATE{background:#FBEFE6;color:#8A3D0D}
.tw-head-actions{display:flex;gap:4px;margin-top:4px;flex-wrap:wrap;align-items:center}
.tw-head-actions select{font-size:11.5px;max-width:170px;padding:2px}
.tw-link{font-size:11.5px}
.tw-changed{font-size:11px;color:#8A3D0D;margin-top:3px}
.tw-list{display:flex;flex-direction:column;gap:5px}
.tw-card{display:flex;align-items:stretch;background:#fff;border:1px solid var(--line);border-radius:7px;min-height:36px;cursor:grab;position:relative;z-index:1}
.tw-card.tw-sel{outline:2px solid #1565C0}
.tw-card.tw-dim{opacity:.35}
.tw-card.tw-nottaught .tw-topic{text-decoration:line-through;color:var(--slate)}
.tw-bar{flex:0 0 7px;border:2px solid;border-radius:6px 0 0 6px;cursor:pointer;padding:0}
.tw-bar-sug{border-style:dashed}
.tw-body{flex:1;padding:4px 6px;min-width:0}
.tw-topic{font-size:12.5px;line-height:1.3;word-break:break-word}
.tw-sub{font-size:11px;color:var(--slate);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tw-heat{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:middle}
.tw-tag{font-size:10px;background:#FFF0C2;color:#7A5A00;border-radius:5px;padding:0 4px;margin-left:4px}
.tw-badges{display:flex;gap:5px;flex-wrap:wrap;font-size:10.5px;color:var(--slate);margin-top:2px}
.tw-safe{font-weight:700}.tw-safe-ok{color:#2E7D32}.tw-safe-warn{color:#C46A12}
.tw-flag{color:#8A3D0D;background:#FBEFE6;border-radius:4px;padding:0 3px}
.tw-handle{cursor:crosshair;padding:0 4px;color:var(--slate);display:flex;align-items:center;font-size:12px}
.tw-more{background:none;border:0;cursor:pointer;color:var(--slate);padding:0 6px}
.tw-drop{height:3px;background:#1565C0;border-radius:2px}
.tw-add{display:flex;gap:4px;margin-top:6px}.tw-add input{flex:1;min-width:0;font-size:12px}
.tw-unsaved{position:sticky;bottom:0;z-index:20;display:flex;flex-wrap:wrap;gap:10px;align-items:center;background:#3A1218;color:#fff;padding:8px 12px;border-radius:10px;font-size:13px;margin-top:8px}
.tw-unsaved-btns{margin-left:auto;display:flex;gap:6px}
.tw-impact{font-size:12px;opacity:.9}
.tw-modal{position:fixed;inset:0;background:rgba(0,0,0,.3);z-index:50;display:flex;align-items:flex-start;justify-content:center;padding-top:8vh}
.tw-modal-box{background:#fff;border-radius:12px;padding:14px;width:min(620px,94vw);max-height:80vh;overflow:auto}
.tw-modal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.tw-picklist{max-height:50vh;overflow:auto;margin:8px 0;display:flex;flex-direction:column;gap:3px;font-size:13px}
.tw-muted{opacity:.5}
.tw-group{border-bottom:1px solid var(--line);padding:5px 0}.tw-linkbtn{background:none;border:0;color:#1C4E9B;cursor:pointer;font-size:12px;padding:2px 0 0 22px}
.tw-vkind{font-size:10.5px;border-radius:4px;padding:0 4px;background:#E9F0FB;color:#1C4E9B}.tw-vkind-INSTRUCTOR{background:#FFF4D6;color:#7A5A00}
.tw-pop{position:fixed;z-index:60;background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px;width:270px;box-shadow:0 6px 20px rgba(0,0,0,.12);font-size:12.5px}
.tw-drawer{position:fixed;right:0;top:0;bottom:0;width:min(420px,100vw);background:#fff;z-index:40;box-shadow:-6px 0 20px rgba(0,0,0,.12);padding:14px;overflow:auto;font-size:13px}
.tw-drawer h4{margin:12px 0 4px;font-size:13px}
.tw-field{display:block;margin:6px 0;font-size:12.5px}.tw-field input,.tw-field textarea,.tw-field select{width:100%}
.tw-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:6px 0}
.tw-perf{white-space:pre-wrap;font-size:11.5px;background:#F4EFEE;border-radius:6px;padding:6px}
.tw-tabs{display:flex;gap:4px;flex-wrap:wrap;margin:6px 0}.tw-tabs button{border:1px solid var(--line);background:#fff;border-radius:6px;padding:3px 8px;cursor:pointer;font-size:12px}.tw-tabs button[aria-pressed=true]{background:#3A1218;color:#fff}
.tw-sug{border-top:1px solid var(--line);padding:6px 0}
.tw-conf{font-size:10.5px;border-radius:5px;padding:0 5px}.tw-conf-High{background:#E8F3EA;color:#1E6B34}.tw-conf-Medium{background:#FFF4D6;color:#7A5A00}.tw-conf-Low{background:#EEE;color:#555}
.tw-diff{margin:4px 0;padding-left:18px;font-size:12.5px}.tw-diff .add{color:#1E6B34}.tw-diff .del{color:#B3261E}.tw-diff .ren{color:#1C4E9B}
@media (max-width:760px){.tw-area{flex-direction:column}.tw-col{flex:1 1 auto;width:100%}.tw-col.tw-pinned{position:static}.tw-card{cursor:default}.tw-lines{display:none}}
@media print{.tw-unsaved,.tw-toolbar,.tw-handle,.tw-more{display:none}}
`;
