// Marks entry: 100 teachers save marks at the same moment — each opens Marks Entry and saves 30 marks one by one,
// as the grid does (one request per box).
import { check, sleep } from "k6";
import { api, page, staffLogin, summaryTo, THRESHOLDS } from "./common.js";

export const options = {
  scenarios: { marks: { executor: "per-vu-iterations", vus: 100, iterations: 1, maxDuration: "10m" } },
  // One line per request name in the summary (k6 reports tagged timings only when a threshold names them).
  thresholds: { ...THRESHOLDS, "http_req_duration{name:staff login}": ["p(95)<60000"], "http_req_duration{name:marks entry page}": ["p(95)<60000"], "http_req_duration{name:save a mark}": ["p(95)<60000"] },
};

// The ids come from a small JSON the seed writes (tests/load/ids.json): each teacher's course, its students and assessments.
const ids = JSON.parse(open("./ids.json"));

export default function () {
  const t = ids.teachers[(__VU - 1) % ids.teachers.length];
  if (!staffLogin(t.username)) return;
  page(`/instructor/courses/${t.courseId}/marks`, "marks entry page");
  for (let k = 0; k < 30; k++) {
    const inst = t.instruments[k % t.instruments.length];
    const r = api("PUT", `/api/instructor/courses/${t.courseId}/marks`, { studentId: t.students[k % t.students.length], instrumentId: inst.id, score: Math.min(inst.maxScore, 5 + (k % 5)) }, "save a mark");
    check(r, { "mark saved": (x) => x.status === 200 });
    sleep(0.2 + Math.random() * 0.6); // typing the next box
  }
}

export const handleSummary = summaryTo("tests/load/results/marks.json");
