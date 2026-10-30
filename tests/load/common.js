// Shared helpers for the k6 load tests (tests/load). Run them against a preview or local build that uses the TEST
// database with the demo institute and the load data (tests/load/seed-load.ts) — never production.
//   k6 run -e BASE_URL=http://localhost:3300 -e PASSWORD=<demo password> tests/load/registration.js
import http from "k6/http";
import { check, fail } from "k6";

export const BASE = __ENV.BASE_URL || "http://localhost:3300";
// The demo institute's test password: -e PASSWORD=… or read from lib/demoInstitute.ts.
export const PASSWORD = __ENV.PASSWORD || (/DEMO_PASSWORD = "([^"]+)"/.exec(open("../../lib/demoInstitute.ts")) || [])[1] || fail("Set -e PASSWORD=<the demo institute's password>");
// Never the live site: pass -e PRODUCTION_URL=… and a BASE_URL on that address is refused.
if (__ENV.PRODUCTION_URL && BASE.replace(/\/$/, "") === __ENV.PRODUCTION_URL.replace(/\/$/, "")) fail("BASE_URL is the live site. Load tests run against a preview or local build with the test database only.");

export const THRESHOLDS = {
  http_req_failed: ["rate<0.01"],
  "http_req_duration{kind:page}": ["p(95)<3000"],
  "http_req_duration{kind:api}": ["p(95)<1500"],
};

/** Student n of batch b (1-based), as seeded: LD-B01-0001 … LD-B20-0250. */
export const roll = (b, n) => `LD-B${String(b).padStart(2, "0")}-${String(n).padStart(4, "0")}`;

export function studentLogin(rollNumber) {
  const jar = http.cookieJar();
  jar.clear(BASE);
  const r = http.post(`${BASE}/api/student/login`, JSON.stringify({ rollNumber, password: PASSWORD }), { headers: { "Content-Type": "application/json" }, tags: { kind: "api", name: "student login" } });
  check(r, { "student signed in": (x) => x.status === 200 });
  return r.status === 200;
}
export function staffLogin(username) {
  const jar = http.cookieJar();
  jar.clear(BASE);
  const r = http.post(`${BASE}/api/auth/login`, JSON.stringify({ usernameOrEmail: username, password: PASSWORD }), { headers: { "Content-Type": "application/json" }, tags: { kind: "api", name: "staff login" } });
  check(r, { "staff signed in": (x) => x.status === 200 });
  return r.status === 200;
}
export const page = (path, name) => { const r = http.get(`${BASE}${path}`, { tags: { kind: "page", name } }); check(r, { [`${name} opens`]: (x) => x.status === 200 && !/Something went wrong on this page|Application error/.test(x.body || "") }); return r; };
export const api = (method, path, body, name) => { const r = http.request(method, `${BASE}${path}`, body ? JSON.stringify(body) : null, { headers: { "Content-Type": "application/json" }, tags: { kind: "api", name } }); return r; };

/** Writes the run's summary (p95 per request name, errors) as JSON next to the scripts. */
export function summaryTo(file) {
  return (data) => {
    const rows = {};
    for (const [k, v] of Object.entries(data.metrics)) {
      const m = /^http_req_duration\{.*name:([^,}]+)/.exec(k);
      if (m && v.values) rows[m[1]] = { p95: Math.round(v.values["p(95)"]), avg: Math.round(v.values.avg), max: Math.round(v.values.max) };
    }
    const out = { when: new Date().toISOString(), base: BASE, requests: data.metrics.http_reqs?.values.count, failed: data.metrics.http_req_failed?.values.rate, p95: Math.round(data.metrics.http_req_duration?.values["p(95)"] || 0), byName: rows };
    return { stdout: JSON.stringify(out, null, 2) + "\n", [file]: JSON.stringify(out, null, 2) };
  };
}
