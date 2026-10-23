// Writes docs/NCEAC-Portal-Field-Inventory.md from lib/nceacInventory.ts, lib/nceacLists.ts and the upload templates.
// Run after changing any of them:  npx tsx scripts/gen-nceac-inventory.ts
import { writeFileSync, mkdirSync } from "fs";
import { INVENTORY, GROUP_LABEL } from "../lib/nceacInventory";
import { PORTAL_LISTS } from "../lib/nceacLists";
import { STUDENT_TEMPLATE, FACULTY_TEMPLATE } from "../lib/nceacPortal";

const esc = (s: string) => s.replace(/\|/g, "\\|");
const out: string[] = [];
out.push("# NCEAC portal (AAS) — field inventory", "");
out.push("Generated from the code (`npx tsx scripts/gen-nceac-inventory.ts`). The same table is on **Accreditation → NCEAC Portal Data → Field inventory**, with an Excel download.", "");
out.push("Sources: the portal's printouts of a submitted application (Request Form, POs, GAs, Curriculum, Students, Faculty, Facilities, Financial, Quality, Industrial Linkages, Addendum A and B), screenshots of the portal's faculty and course forms and dropdowns, and the two Excel upload templates (*Template Current Students* and *Teacher Data*).", "");
const n = (g: string) => INVENTORY.filter((f) => f.group === g).length;
out.push(`**${INVENTORY.length} fields** — ${n("AUTO")} auto, ${n("DERIVED")} derived, ${n("INPUT")} input needed.`, "");
out.push("- **Auto** — OBEHUB already holds it (the source table and field are given).", "- **Derived** — OBEHUB works it out (the formula is given).", "- **Input needed** — someone types it; the place in OBEHUB is given.", "");
out.push("## Upload files", "");
for (const t of [STUDENT_TEMPLATE, FACULTY_TEMPLATE]) {
  out.push(`### ${t.title}`, "", `Sheet \`${t.sheet}\`; dates as real dates shown \`d-mmm-yyyy\`; ${t.note}`, "");
  out.push("| # | Header | Required | Type | Portal list |", "|---|---|---|---|---|");
  t.cols.forEach((c, i) => out.push(`| ${i + 1} | ${esc(c.header)} | ${c.required ? "Yes" : "No"} | ${c.type}${c.check ? ` (${c.check})` : ""} | ${c.list || ""} |`));
  out.push("");
}
out.push("## Portal dropdown lists", "");
out.push("| List | Values | Source |", "|---|---|---|");
for (const l of PORTAL_LISTS) out.push(`| ${l.label} | ${esc(l.values.map((v) => (l.labels?.[v] ? `${v} = ${l.labels[v]}` : v)).join(", "))} | ${{ screenshot: "portal screen", template: "portal template", report: "portal printout", check: "to confirm on the portal" }[l.source]}${l.note ? ` — ${esc(l.note)}` : ""} |`);
out.push("");
out.push("## Every field", "");
for (const form of Array.from(new Set(INVENTORY.map((f) => f.form)))) {
  out.push(`### ${form}`, "", "| Field | Type | Allowed values | Required | Group | Source / formula / where it is typed |", "|---|---|---|---|---|---|");
  for (const f of INVENTORY.filter((x) => x.form === form)) out.push(`| ${esc(f.field)} | ${esc(f.type)} | ${esc(f.allowed || "")} | ${f.required ? "Yes" : "No"} | ${GROUP_LABEL[f.group]} | ${esc(f.source)} |`);
  out.push("");
}
mkdirSync("docs", { recursive: true });
writeFileSync("docs/NCEAC-Portal-Field-Inventory.md", out.join("\n"));
console.log("docs/NCEAC-Portal-Field-Inventory.md", INVENTORY.length, "fields");
