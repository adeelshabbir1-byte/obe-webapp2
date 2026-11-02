import { groupNavLinks } from "./navGrouping";
import { CORE } from "./roleMenus";

// A short menu (UX review, Nov 2026): Home, one "Approvals", the role's 2–4 daily pages, and a few hubs. Each hub opens a
// page of cards (/hub/<key>) holding every page of that area, so the menu never lists 40 links. Pure: safe on the client.
type Link = { href: string; label: string };
export type Hub = { key: string; label: string; blurb: string; sections: string[] };
export const HUBS: Hub[] = [
  { key: "work", label: "My work", blurb: "The pages you use every day.", sections: ["Daily pages", "Community"] },
  { key: "academics", label: "Academics", blurb: "Semester, timetable, programs and courses, students, curriculum and outcomes, rules.", sections: ["Semester & Timetable", "Programs & Courses", "Students", "Curriculum & Outcomes", "Curriculum Maps", "Policies & Rules", "Review & Approval", "National", "Consortium"] },
  { key: "people", label: "People", blurb: "Faculty, staff, structure and who does what.", sections: ["People & Structure"] },
  { key: "quality", label: "Accreditation & quality", blurb: "Readiness, evidence, SAR, surveys and quality work.", sections: ["Accreditation"] },
  { key: "reports", label: "Reports", blurb: "Read-only reports and analytics.", sections: ["Reports & Analytics"] },
  { key: "institute", label: "Institute", blurb: "Operations, facilities, calendar and settings.", sections: ["University Operations", "Facilities & Calendar", "Settings", "Platform", "More"] },
];
/** Separate approval pages: they live as cards on My Approvals, not in the menu. */
export const APPROVAL_PAGES = ["/leave-approvals", "/results-approval", "/dean/approvals", "/omc/queue", "/requests", "/coordinator/faculty-requests", "/omc/faculty-requests"];
const REPORT_HINT = /report|summary|analytics|comparison|distribution|insight|benchmark|audit-log|map$|matrix$|overview$|progress|history$/i;
// Pages the shared grouping leaves in "More", placed by hand: [pattern, hub, card group].
const PLACE: [RegExp, string, string][] = [
  [/^\/(my-calendar|my-leave|my-payslips|my-obe|handbook|guide|my-feedback|benefits|allocation\/year-card)$/, "work", "Me"],
  [/^\/(controller|exams|exam-board|degrees|official-transcript|status-changes|term-archive|accommodations|academic-rules|admission-criteria)$/, "academics", "Exams & results"],
  [/^\/(allocation\/(board|year-plan)|hod\/assign-subject-experts|scheduling|timetable\/live|semester-readiness|academic-calendar|plan-requests)$/, "academics", "Semester & Timetable"],
  [/^\/(course-catalog|course-homes|courses-in-degree|curriculum-changes|dean\/course-codes|coordinator\/(course-codes|curriculum-sync|labs-overview|activities)|question-bank|program-spec)$/, "academics", "Programs & Courses"],
  [/^\/(omc\/.*|moderation|cqi\/remedies|early-warning|instructor\/mid-feedback)$/, "academics", "Outcomes & CQI"],
  [/^\/(adp|collab|affiliation|affiliates\/marks|chairman\/affiliates|college\/design)$/, "academics", "Degrees, partners & colleges"],
  [/^\/(counselling)$/, "academics", "Students"],
  [/^\/(appraisals|recruitment|teacher-performance|fdp|fdp-funding|faculty-leave|delegations|cv-review|recognition|visiting-pay)$/, "people", "Faculty"],
  [/^\/(accreditation\/.*|quality-office|qaa|plagiarism|policy-history|signed-documents|faculty-sufficiency|hemis|research|alumni-voice|ga-council-map|ga-coverage|plo-progress|outcome-flow|risk)$/, "quality", "Quality"],
  [/^\/(committees|boards|meetings-hub|meeting-planner)$/, "quality", "Committees & meetings"],
  [/^\/(head-dashboard|pilot-figures|inactivity|prediction|plan-insights|process-map|who-does-what|where-courses-used|student-movement)$/, "reports", "Insights"],
  [/^\/operations$/, "institute", "Overview"],
  [/^\/(admissions|fees|fee-refunds|accounts|hr|billing)$/, "institute", "Fees, HR & accounts"],
  [/^\/(assets|inventory|lab-inventory|library.*|purchasing|facilities|facility-booking|faculty-meals|resources)$/, "institute", "Facilities & stores"],
  [/^\/(student-activities|societies\/elections)$/, "institute", "Student life"],
  [/^\/(chairman\/.*|data-import|data-quality|settings\/.*|setup-check|plans)$/, "institute", "Setup & settings"],
];

/** Splits a role's links into the hub each belongs to. */
export function hubsOf(links: Link[]) {
  const out = new Map<string, { title: string; links: Link[] }[]>();
  for (const sec of groupNavLinks(links.filter((l) => l.href !== "/dashboard" && l.href !== "/approvals" && !APPROVAL_PAGES.includes(l.href)))) {
    for (const l of sec.links) {
      let hub = HUBS.find((h) => h.sections.includes(sec.title))?.key || "institute";
      let title = sec.title;
      const placed = ["More", "Facilities & Calendar", "University Operations"].includes(sec.title) ? PLACE.find(([re]) => re.test(l.href)) : null;
      if (placed) { hub = placed[1]; title = placed[2]; }
      else if (sec.title === "More" && REPORT_HINT.test(l.href)) { hub = "reports"; title = "Reports"; }
      else if (sec.title === "More") title = "Other pages";
      const list = out.get(hub) || [];
      let s = list.find((x) => x.title === title); if (!s) { s = { title, links: [] }; list.push(s); }
      s.links.push(l); out.set(hub, list);
    }
  }
  return out;
}
/** The short menu: direct links (approvals + the role's daily pages) and the hub entries with their member pages. */
export function hubMenu(role: string, links: Link[]) {
  const byHref = new Map(links.map((l) => [l.href, l]));
  const first = (CORE[role] || []).map((x) => x[1]).find((hs) => hs.some((h) => h !== "/approvals" && h !== "/deadlines" && h !== "/requests")) || [];
  const today = first.filter((h) => h !== "/approvals" && h !== "/deadlines" && !APPROVAL_PAGES.includes(h)).map((h) => byHref.get(h)).filter((l): l is Link => !!l).slice(0, 4);
  const direct: Link[] = [...(byHref.has("/approvals") ? [byHref.get("/approvals")!] : []), ...today];
  const used = new Set(direct.map((l) => l.href));
  const hubs = hubsOf(links.filter((l) => !used.has(l.href)));
  const entries = HUBS.map((h) => ({ hub: h, sections: hubs.get(h.key) || [] })).map((x) => ({ ...x, members: x.sections.flatMap((s) => s.links) })).filter((x) => x.members.length);
  // A hub of one page is just that page.
  for (const e of entries.filter((x) => x.members.length === 1)) direct.push(e.members[0]);
  return { direct, hubs: entries.filter((x) => x.members.length > 1).map((x) => ({ key: x.hub.key, label: x.hub.label, href: `/hub/${x.hub.key}`, members: x.members.map((m) => m.href) })) };
}
