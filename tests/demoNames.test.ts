import { test } from "node:test";
import assert from "node:assert/strict";
import { fixTitle, titleFor } from "../lib/demoNames";
test("demo titles match first names", () => {
  assert.equal(fixTitle("Ms. Fahad Qureshi"), "Mr. Fahad Qureshi");
  assert.equal(fixTitle("Mr. Zainab Raza"), "Ms. Zainab Raza");
  assert.equal(fixTitle("Dr. Zainab Raza"), "Dr. Zainab Raza");
  assert.equal(fixTitle("Prof. Rubina Khalid"), "Prof. Rubina Khalid");
  assert.equal(titleFor("Sara", 0), "Ms."); assert.equal(titleFor("Ali", 1), "Mr."); assert.equal(titleFor("Ali", 2), "Dr.");
});
