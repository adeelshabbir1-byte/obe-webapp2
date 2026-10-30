// Result day: 2,000 students open their results within 15 minutes — sign in, dashboard, transcript.
import { page, roll, studentLogin, summaryTo, THRESHOLDS } from "./common.js";
import { sleep } from "k6";

export const options = {
  scenarios: {
    results: {
      executor: "ramping-arrival-rate", startRate: 0, timeUnit: "1m", preAllocatedVUs: 80, maxVUs: 300,
      // ≈ 2,000 students: a burst when results are published, then fewer.
      stages: [{ target: 240, duration: "2m" }, { target: 240, duration: "4m" }, { target: 90, duration: "4m" }, { target: 30, duration: "5m" }],
    },
  },
  // One line per request name in the summary (k6 reports tagged timings only when a threshold names them).
  thresholds: { ...THRESHOLDS, "http_req_duration{name:student login}": ["p(95)<60000"], "http_req_duration{name:student dashboard}": ["p(95)<60000"], "http_req_duration{name:transcript}": ["p(95)<60000"] },
};

export default function () {
  const i = (__VU * 997 + __ITER * 13) % 5000;
  if (!studentLogin(roll(1 + Math.floor(i / 250), 1 + (i % 250)))) return;
  page("/student/dashboard", "student dashboard");
  sleep(1 + Math.random() * 2);
  page("/student/transcript", "transcript");
}

export const handleSummary = summaryTo("tests/load/results/results.json");
