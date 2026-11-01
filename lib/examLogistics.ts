// Exam logistics for affiliated colleges (Adeel prompt §29–30), as pure functions:
//   splitSessions — students into sessions by a centre's capacity, balanced (90 students, 40 PCs → 30 · 30 · 30);
//   rankExaminers — the external examiner pool for one session: never from the college's own institute or a college where
//                   a declared relative studies, must examine the course; same city avoided, fewest duties first;
//   codeScripts   — fictitious roll numbers for answer sheets; only the Controller's office holds the key;
//   pickMarker    — a paper marker never from the student's college, and a re-marker different from the first.
export function splitSessions(students: number, capacity: number) {
  if (students <= 0) return [] as number[];
  if (capacity <= 0) throw new Error("The centre has no capacity set.");
  const n = Math.ceil(students / capacity), base = Math.floor(students / n), extra = students % n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}
export type Examiner = { id: string; name: string; institute: string; city: string; courses: string; relatives: string; duties: number };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function rankExaminers(pool: Examiner[], s: { course: string; collegeName: string; city: string }) {
  return pool.map((e) => {
    const why: string[] = [];
    if (norm(e.institute) && norm(e.institute) === norm(s.collegeName)) why.push("his own institute");
    if (e.relatives && norm(e.relatives).includes(norm(s.collegeName))) why.push("a declared relative studies there");
    const can = !e.courses.trim() || e.courses.toUpperCase().split(/[\s,;]+/).includes(s.course.toUpperCase());
    if (!can) why.push(`doesn't examine ${s.course}`);
    const score = (norm(e.city) && norm(e.city) !== norm(s.city) ? 10 : 0) - e.duties * 3;
    return { ...e, ok: !why.length, why, score };
  }).sort((a, b) => Number(b.ok) - Number(a.ok) || b.score - a.score);
}
export function conflictOf(e: Pick<Examiner, "institute" | "relatives">, collegeName: string) {
  if (norm(e.institute) && norm(e.institute) === norm(collegeName)) return "An external examiner can't be assigned to his own institute.";
  if (e.relatives && norm(collegeName) && norm(e.relatives).includes(norm(collegeName))) return "The examiner declared a relative at this college.";
  return null;
}
/** Codes like "K7Q2-014": a random prefix per course paper plus a shuffled serial, so the order says nothing. */
export function codeScripts(rolls: string[], rand: () => number = Math.random) {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const prefix = Array.from({ length: 4 }, () => A[Math.floor(rand() * A.length)]).join("");
  const order = rolls.map((r) => ({ r, k: rand() })).sort((a, b) => a.k - b.k);
  const key: Record<string, string> = {};
  order.forEach((o, i) => { key[`${prefix}-${String(i + 1).padStart(3, "0")}`] = o.r; });
  return key;
}
export function pickMarker(markers: { name: string; institute: string; scripts: number }[], collegeName: string, notName?: string) {
  return markers.filter((m) => norm(m.institute) !== norm(collegeName) && (!notName || norm(m.name) !== norm(notName))).sort((a, b) => a.scripts - b.scripts)[0] || null;
}
