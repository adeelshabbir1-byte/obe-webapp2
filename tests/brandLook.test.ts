import { test } from "node:test";
import assert from "node:assert/strict";
import { contrastWithWhite, suggestPassing } from "../lib/brandLook";

test("contrast check refuses a pale colour and suggests a darker one that passes", () => {
  assert.ok(contrastWithWhite("#7E2435") >= 4.5);
  assert.ok(contrastWithWhite("#F5D76E") < 4.5);
  assert.ok(contrastWithWhite(suggestPassing("#F5D76E")) >= 4.5);
});
