import { readFileSync } from "fs";
import { join } from "path";
import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";

// The demo institute's shared test password (lib/demoInstitute.ts) — read from the file so it is never copied here.
export const PASSWORD = /DEMO_PASSWORD = "([^"]+)"/.exec(readFileSync(join(__dirname, "..", "..", "lib", "demoInstitute.ts"), "utf8"))![1];

/** Signs a staff member in on this request context (its cookies are then used by every request and page). */
export async function signIn(ctx: APIRequestContext | BrowserContext, username: string) {
  const req = "request" in ctx ? ctx.request : ctx;
  const r = await req.post("/api/auth/login", { data: { usernameOrEmail: username, password: PASSWORD } });
  if (!r.ok()) throw new Error(`sign-in ${username}: ${r.status()} ${await r.text()}`);
}
export async function signInStudent(ctx: BrowserContext, rollNumber: string) {
  const r = await ctx.request.post("/api/student/login", { data: { rollNumber, password: PASSWORD } });
  if (!r.ok()) throw new Error(`student sign-in ${rollNumber}: ${r.status()}`);
}

/** Text that means the page broke (Next.js error screens or our friendly error page). */
export const BROKEN = /Application error|Unhandled Runtime Error|Something went wrong on this page|This page could not be found|Internal Server Error/;
/** The same, in raw server HTML (where the payload of every page also carries the 404 page's text): a real render failure. */
export const BROKEN_HTML = /"digest":"|id="__next_error__"|<h2[^>]*>(This page could not be found|Something went wrong on this page)<\/h2>|Application error: a (server|client)-side exception/;

export async function json<T = Record<string, any>>(r: { json: () => Promise<unknown>; status: () => number }) {
  try { return (await r.json()) as T; } catch { return {} as T; }
}

/** No horizontal scroll of the whole page at the current viewport. */
export async function overflowX(page: Page) {
  return page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const wide = Array.from(document.querySelectorAll("body *")).filter((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      if (r.width === 0 || r.right <= w + 1) return false;
      // Inside a box that scrolls on its own is fine.
      for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX) && p.getBoundingClientRect().right <= w + 1) return false; }
      return true;
    }).slice(0, 5).map((el) => `${el.tagName.toLowerCase()}.${(el as HTMLElement).className?.toString().slice(0, 40)}`);
    return { page: document.documentElement.scrollWidth - w, offenders: wide };
  });
}

/** Read-only look-ups in the TEST database (ids for the journeys); every action itself goes through the app. */
let client: import("@prisma/client").PrismaClient | null = null;
export async function testDb() {
  if (!process.env.E2E_DATABASE_URL) throw new Error("Set E2E_DATABASE_URL (the seeded test database).");
  const { PrismaClient } = await import("@prisma/client");
  client ||= new PrismaClient({ datasources: { db: { url: process.env.E2E_DATABASE_URL } } });
  return client;
}
