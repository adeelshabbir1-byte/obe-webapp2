import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

// Item 23: the Institute Head's pages open in reasonable time. Times are written to the report each run, so a slowdown
// shows before release; the limits are generous (a CI machine is slower than production).
const PAGES = ["/home", "/head-dashboard", "/faculty-status", "/faculty-status?tab=fte", "/faculty-status?tab=nceac", "/consortium/network"];
test("Institute Head pages open quickly", async ({ context, page }, info) => {
  test.setTimeout(240_000);
  await signIn(context, "dream.head");
  const times: string[] = [];
  for (const p of PAGES) {
    await page.goto(p); // the first visit may work figures out (and compile in dev)
    const t0 = Date.now();
    const r = await page.goto(p);
    const ms = Date.now() - t0;
    times.push(`${p}: ${ms} ms`);
    expect(r?.status(), p).toBeLessThan(400);
    expect(ms, `${p} took ${ms} ms`).toBeLessThan(20_000);
  }
  info.annotations.push({ type: "timings", description: times.join(" · ") });
  console.log(`[speed] ${times.join(" · ")}`);
});
