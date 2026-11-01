import { test } from "node:test";
import assert from "node:assert/strict";
import { hubMenu, hubsOf, APPROVAL_PAGES } from "../lib/hubMenu";
import { navForRole } from "../components/reportNav";

test("the menu is short for every big role", () => {
  for (const role of ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "OMC", "INSTRUCTOR"]) {
    const links = [{ href: "/approvals", label: "My Approvals" }, ...navForRole(role as never)];
    const m = hubMenu(role, links);
    assert.ok(m.direct.length + m.hubs.length <= 12, `${role}: ${m.direct.length} + ${m.hubs.length}`);
    // nothing is lost: every page is in the menu or a hub or on the approvals page
    const reach = new Set([...m.direct.map((l) => l.href), ...m.hubs.flatMap((h) => h.members), ...APPROVAL_PAGES, "/approvals", "/dashboard"]);
    for (const l of links) assert.ok(reach.has(l.href), `${role}: ${l.href} unreachable`);
    assert.equal(m.direct.filter((l) => APPROVAL_PAGES.includes(l.href)).length, 0);
  }
});
test("approval pages leave the menu", () => {
  const h = hubsOf([{ href: "/leave-approvals", label: "Leave" }, { href: "/coordinator/semester", label: "Semester" }]);
  assert.equal(Array.from(h.values()).flat().flatMap((s) => s.links).length, 1);
});
