import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "fs";
import { join } from "path";
import { TOUR_CATALOGUE } from "../lib/tourSteps";
import { render, parseTpl } from "../lib/msgTemplates";

// §19.7: every welcome-tour step points to an existing page.
test("tour steps point to existing pages", () => {
  const missing = TOUR_CATALOGUE.map((s) => s.href.split("?")[0]).filter((h) => !existsSync(join(__dirname, "..", "app", h, "page.tsx")));
  assert.deepEqual(missing, []);
});
// §5: templates in English / Urdu.
test("alert templates", () => {
  assert.equal(render(parseTpl(""), "DEADLINE", "Quiz 3", "Due today"), "Quiz 3\nDue today");
  const t = parseTpl(JSON.stringify({ lang: "both", kinds: { DEADLINE: { en: "Reminder: {title}" } } }));
  const out = render(t, "DEADLINE", "Quiz 3", "Due today");
  assert.ok(out.startsWith("Reminder: Quiz 3") && out.includes("یاد دہانی"));
  assert.equal(render(parseTpl('{"lang":"ur"}'), "UNKNOWN", "A", ""), "A");
});
