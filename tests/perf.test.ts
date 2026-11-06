import test from "node:test";
import assert from "node:assert/strict";
import { pageOf, pageResult } from "../lib/paging";
import { cached, invalidate } from "../lib/cache";

test("paging: page and size from the address, size capped, one extra row tells if more follow", () => {
  const p = pageOf(new URLSearchParams("page=3&pageSize=20"));
  assert.deepEqual(p, { page: 3, pageSize: 20, skip: 40, take: 21 });
  assert.equal(pageOf(new URLSearchParams("pageSize=9999")).pageSize, 200);
  assert.equal(pageOf(new URLSearchParams("page=-4")).page, 1);
  assert.equal(pageOf(new URLSearchParams(""), { size: 30 }).pageSize, 30);
  const r = pageResult(Array.from({ length: 21 }, (_, i) => i), p);
  assert.equal(r.rows.length, 20); assert.equal(r.hasMore, true);
  assert.equal(pageResult([1, 2], p).hasMore, false);
});

test("cache: computed once while fresh, callers at the same time share one computation, invalidate forgets", async () => {
  let calls = 0;
  const slow = () => new Promise<number>((res) => setTimeout(() => res(++calls), 30));
  const [a, b] = await Promise.all([cached("t:x", 60, slow), cached("t:x", 60, slow)]);
  assert.equal(a, 1); assert.equal(b, 1); assert.equal(calls, 1, "one computation for two callers");
  assert.equal(await cached("t:x", 60, slow), 1, "still fresh");
  await invalidate("t:x");
  assert.equal(await cached("t:x", 60, slow), 2);
  await invalidate("t:*");
  assert.equal(await cached("t:x", 0.001, slow), 3);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(await cached("t:x", 0.001, slow), 4, "expired after its time");
});
