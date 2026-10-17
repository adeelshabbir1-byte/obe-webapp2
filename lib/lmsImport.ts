/** Reads gradebook CSV exports from Moodle, Google Classroom, Canvas or any LMS into rows of { key, name, scores }. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = "", q = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true; else if (c === "," || c === "\t" || c === ";") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((x) => x.trim())) rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const ID_COLS = /^(id ?number|roll ?(no|number)?|registration( no| number)?|reg ?(no|#)|student ?id|username|user ?name|sis user id|sis login id|enrol?l?ment ?(no|number))$/i;
const SKIP_COLS = /^(first ?name|last ?name|surname|full ?name|name|student|email( address)?|institution|department|section|last downloaded.*|course total.*|total.*|overall.*|current score|final score|unposted.*|id)$/i;

export type LmsSheet = { idCol: number; nameCols: number[]; gradeCols: { col: number; title: string; points: number | null }[]; rows: { key: string; name: string; cells: string[] }[]; source: string };

export function readGradebook(text: string): LmsSheet | { error: string } {
  const all = parseCsv(text);
  if (all.length < 2) return { error: "The file has no rows." };
  const head = all[0].map((h) => h.trim());
  let idCol = head.findIndex((h) => ID_COLS.test(h));
  if (idCol < 0) idCol = head.findIndex((h) => /email/i.test(h));
  if (idCol < 0) idCol = head.findIndex((h) => /^id$/i.test(h));
  if (idCol < 0) return { error: "Could not find a roll number column (ID number, Roll No, Registration No, Username or Email)." };
  const nameCols = head.map((h, i) => (/^(first ?name|last ?name|surname|full ?name|name|student)$/i.test(h) ? i : -1)).filter((i) => i >= 0).sort((a, b) => Number(/last|surname/i.test(head[a])) - Number(/last|surname/i.test(head[b])));
  const source = head.some((h) => /\(Real\)$/i.test(h)) ? "Moodle" : head.some((h) => /^email address$/i.test(h)) && head.some((h) => /^last name$/i.test(h)) ? "Google Classroom" : head.some((h) => /^sis user id$/i.test(h)) ? "Canvas" : "CSV";
  // Google Classroom / Canvas put a "Points" / "Points Possible" row under the header.
  let body = all.slice(1); let pointsRow: string[] | null = null;
  while (body.length && (!body[0][idCol]?.trim() || /points/i.test(body[0][idCol]))) { const r = body.shift()!; if (r.some((x) => /points/i.test(x))) pointsRow = r; }
  if (body.length && /points possible/i.test(body[0].join(" "))) pointsRow = body.shift()!;
  const gradeCols = head.map((h, i) => ({ col: i, title: h.replace(/\s*\((Real|Percentage|Letter)\)$/i, "").replace(/^(Quiz|Assignment|Lesson|Workshop|Forum|Turnitin assignment|H5P):\s*/i, "") }))
    .filter(({ col, title }) => col !== idCol && !nameCols.includes(col) && title && !SKIP_COLS.test(title) && body.some((r) => r[col] !== undefined && r[col].trim() !== "" && Number.isFinite(Number(r[col].trim().replace(/%$/, "")))))
    .map((g) => ({ ...g, points: pointsRow && Number(pointsRow[g.col]) > 0 ? Number(pointsRow[g.col]) : null }));
  const rows = body.filter((r) => r[idCol]?.trim()).map((r) => ({ key: r[idCol].trim(), name: nameCols.map((c) => r[c]?.trim()).filter(Boolean).join(" "), cells: r }));
  if (!gradeCols.length) return { error: "No numeric grade columns found." };
  return { idCol, nameCols, gradeCols, rows, source };
}

export const normKey = (s: string) => s.toLowerCase().replace(/@.*$/, "").replace(/[^a-z0-9]/g, "");
