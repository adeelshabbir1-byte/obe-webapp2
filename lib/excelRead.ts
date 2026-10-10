import ExcelJS from "exceljs";

export type Grid = string[][];

/** Reads an uploaded .xlsx (every sheet) or .csv (one sheet) into text grids. Throws on unreadable files. */
export async function readWorkbookGrids(file: File): Promise<{ name: string; grid: Grid }[]> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith(".csv")) {
    return [{ name: "csv", grid: buf.toString("utf-8").split(/\r?\n/).map((l) => l.split(",").map((x) => x.trim())) }];
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  return wb.worksheets.map((ws) => {
    const grid: Grid = [];
    ws.eachRow((row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (c, i) => { cells[i - 1] = (c.text || "").trim(); });
      grid.push(cells);
    });
    return { name: ws.name, grid };
  });
}

export const norm = (s: string | undefined) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Finds the heading row that contains every wanted heading (matched loosely); returns its index and a column finder. */
export function findHeader(grid: Grid, wanted: RegExp[]) {
  const hi = grid.findIndex((r) => wanted.every((re) => r.some((c) => re.test(norm(c)))));
  if (hi < 0) return null;
  const col = (re: RegExp) => grid[hi].findIndex((c) => re.test(norm(c)));
  return { hi, col };
}

export const sheetNamed = (sheets: { name: string; grid: Grid }[], re: RegExp) => sheets.find((s) => re.test(norm(s.name)));
export const toInt = (v: string | undefined) => { const n = parseInt(String(v ?? "").replace(/[, ]/g, ""), 10); return Number.isFinite(n) && n >= 0 ? n : null; };
export const toText = (v: string | undefined, max = 2000) => { const t = (v || "").trim(); return t ? t.slice(0, max) : null; };
export function toDate(v: string | undefined) {
  const t = (v || "").trim();
  if (!t) return null;
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}
