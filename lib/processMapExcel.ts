import ExcelJS from "exceljs";
import { PM_ROLES, PHASES, ROWS, GROUP_COLOR, KIND_LABEL, KIND_STYLE } from "./processMap";
import type { Titles, TitleKey } from "./titles";

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

/** The process map as a coloured Excel workbook (optionally one role's column only). */
export function processMapWorkbook(t: Titles | null, roleF: string | null) {
  const cols = PM_ROLES.filter((r) => !roleF || r[0] === roleF);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Process map", { views: [{ state: "frozen", xSplit: 3, ySplit: 1 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const head = ws.addRow(["Task", "Sub-task", "When", ...cols.map(([, d, tk]) => (tk && t?.[tk as TitleKey]?.title) || d)]);
  head.eachCell((c) => { c.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial", size: 10 }; c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D2A4A" } }; c.alignment = { wrapText: true, vertical: "middle" }; });
  ws.getColumn(1).width = 18; ws.getColumn(2).width = 44; ws.getColumn(3).width = 16;
  cols.forEach((_, i) => { ws.getColumn(4 + i).width = 18; });
  for (const [n, label, when] of PHASES) {
    const rows = ROWS.filter((r) => r.phase === n && (!roleF || r.cells[roleF as never]));
    if (!rows.length) continue;
    const p = ws.addRow([`${n}. ${label} — ${when}`]);
    ws.mergeCells(p.number, 1, p.number, 3 + cols.length);
    p.getCell(1).font = { bold: true, name: "Arial", size: 11 }; p.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3E5E8" } };
    rows.forEach((r, i) => {
      const x = ws.addRow([`${!r.group && i > 0 ? "↓ " : ""}${r.task}${r.group && (i === 0 || rows[i - 1].group !== r.group) ? ` (parallel ${r.group})` : ""}`, r.sub, r.when, ...cols.map(([k]) => r.cells[k]?.[1] || "")]);
      x.eachCell({ includeEmpty: true }, (c, ci) => {
        c.alignment = { wrapText: true, vertical: "top" };
        c.border = { bottom: { style: "thin", color: { argb: "FFDDDDDD" } } };
        if (r.group) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(GROUP_COLOR[r.group]) } };
        const cell = ci > 3 ? r.cells[cols[ci - 4][0]] : null;
        c.font = { name: "Arial", size: 9, bold: ci === 1 || (!!cell && KIND_STYLE[cell[0]].weight >= 700), color: { argb: argb(cell ? KIND_STYLE[cell[0]].color : "#222222") } };
      });
    });
  }
  const key = wb.addWorksheet("Key");
  key.getColumn(1).width = 24; key.getColumn(2).width = 70;
  key.addRow(["How to read the map"]).font = { bold: true, size: 12, name: "Arial" };
  key.addRow(["Same colour", "Rows run at the same time (a parallel group)"]);
  key.addRow(["White row with ↓", "Waits for the row above"]);
  for (const [k, l] of Object.entries(KIND_LABEL)) { const r = key.addRow([l, ""]); r.getCell(1).font = { name: "Arial", bold: KIND_STYLE[k as keyof typeof KIND_STYLE].weight >= 700, color: { argb: argb(KIND_STYLE[k as keyof typeof KIND_STYLE].color) } }; }
  return wb;
}
