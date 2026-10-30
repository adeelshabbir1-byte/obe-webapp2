// Registration day: 500 students register within 10 minutes (more at the start, as when registration opens).
// Each: signs in, opens Course Registration, loads the course list, registers for the open course, reloads.
import { check, sleep } from "k6";
import { api, page, roll, studentLogin, summaryTo, THRESHOLDS } from "./common.js";

export const options = {
  scenarios: {
    registration: {
      executor: "ramping-arrival-rate", startRate: 0, timeUnit: "1m", preAllocatedVUs: 60, maxVUs: 200,
      // ≈ 500 students: a rush in the first minutes, then a steady trickle.
      stages: [{ target: 100, duration: "1m" }, { target: 100, duration: "2m" }, { target: 30, duration: "3m" }, { target: 20, duration: "4m" }],
    },
  },
  // One line per request name in the summary (k6 reports tagged timings only when a threshold names them).
  thresholds: { ...THRESHOLDS, "http_req_duration{name:student login}": ["p(95)<60000"], "http_req_duration{name:registration page}": ["p(95)<60000"], "http_req_duration{name:registration list}": ["p(95)<60000"], "http_req_duration{name:register}": ["p(95)<60000"] },
};

export default function () {
  const i = (__VU * 1000 + __ITER) % 5000;
  if (!studentLogin(roll(1 + Math.floor(i / 250), 1 + (i % 250)))) return;
  page("/student/registration", "registration page");
  const list = api("GET", "/api/student/registration", null, "registration list");
  check(list, { "course list": (r) => r.status === 200 });
  sleep(2 + Math.random() * 3); // reading the list
  let open = null;
  try { const d = list.json(); open = (d.courses || d.available || []).find((c) => !c.registered && !c.enrolled && c.id); } catch { /* no list */ }
  if (open) {
    const r = api("POST", "/api/student/registration/register", { courseId: open.id }, "register");
    check(r, { "registered (or already)": (x) => x.status === 200 || x.status === 409 || x.status === 400 });
  }
  api("GET", "/api/student/registration", null, "registration list");
}

export const handleSummary = summaryTo("tests/load/results/registration.json");
