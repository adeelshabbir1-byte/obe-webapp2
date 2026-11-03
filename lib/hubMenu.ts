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
  [/^\/(allocation\/(board|year-plan)|hod\/assign-subject-experts|scheduling|timetable\/live|semester-readiness|term-rollover|academic-calendar|plan-requests)$/, "academics", "Semester & Timetable"],
  [/^\/(course-catalog|course-homes|courses-in-degree|curriculum-changes|dean\/course-codes|coordinator\/(course-codes|curriculum-sync|labs-overview|activities)|question-bank|plan-generate|program-spec)$/, "academics", "Programs & Courses"],
  [/^\/(omc\/.*|curriculum-whatif|moderation|cqi\/remedies|early-warning|instructor\/mid-feedback)$/, "academics", "Outcomes & CQI"],
  [/^\/(adp|collab|affiliation|affiliates\/marks|chairman\/affiliates|college\/design)$/, "academics", "Degrees, partners & colleges"],
  [/^\/(counselling)$/, "academics", "Students"],
  [/^\/(observations|appraisals|recruitment|teacher-performance|fdp|fdp-funding|faculty-leave|delegations|cv-review|recognition|visiting-pay)$/, "people", "Faculty"],
  [/^\/(accreditation\/.*|quality-office|qaa|plagiarism|policy-history|signed-documents|faculty-sufficiency|hemis|research|alumni-voice|ga-council-map|ga-coverage|plo-progress|outcome-flow|risk)$/, "quality", "Quality"],
  [/^\/(committees|boards|meetings-hub|meeting-planner)$/, "quality", "Committees & meetings"],
  [/^\/(head-dashboard|pilot-figures|inactivity|prediction|plan-insights|process-map|who-does-what|where-courses-used|student-movement)$/, "reports", "Insights"],
  [/^\/operations$/, "institute", "Overview"],
  [/^\/(admissions|fees|fee-refunds|accounts|hr|billing)$/, "institute", "Fees, HR & accounts"],
  [/^\/(assets|inventory|lab-inventory|library.*|purchasing|facilities|facility-booking|faculty-meals|resources)$/, "institute", "Facilities & stores"],
  [/^\/(student-activities|societies\/elections)$/, "institute", "Student life"],
  [/^\/(chairman\/.*|data-import|data-quality|settings\/.*|setup-check|plans)$/, "institute", "Setup & settings"],
];

// Pages that sat in the wrong card group (UX review, 3 Nov 2026), placed by hand whatever group the shared grouping gave.
const OVERRIDE: [RegExp, string, string][] = [
  [/^\/(operations|plans)$/, "institute", "Overview"],
  [/^\/(admissions|student-activities|societies\/elections)$/, "institute", "Students & admissions"],
  [/^\/(chairman\/setup|setup-check|chairman\/institute-settings|chairman\/campuses|data-import|data-quality|chairman\/backups|admin\/migrations)$/, "institute", "Set up & data"],
  [/^\/(billing|settings\/who-decides|chairman\/ai-configuration|chairman\/messaging|chairman\/lms)$/, "institute", "Settings & connections"],
  [/^\/(academic-rules|registration-rules)$/, "academics", "Policies & Rules"],
  [/^\/(plan-requests)$/, "academics", "Students"],
  [/^\/(coordinator\/batches|coordinator\/assign-subject-experts|hod\/assign-subject-experts|coordinator\/elective-options|coordinator\/custom-categories|coordinator\/plos|chairman\/plos|coordinator\/grading-scale|coordinator\/program-profile|program-spec|coordinator\/course-codes|dean\/course-codes|course-homes|clo-bulk-import|course-split)$/, "academics", "Program set-up"],
  [/^\/(question-bank|question-bank\/analytics|plan-generate|topic-resources)$/, "academics", "Assessments & question bank"],
  [/^\/(coordinator\/activities)$/, "academics", "Students"],
  // The platform team's pages (Super Admin) in three groups.
  [/^\/admin\/(users|account-requests|modules|billing|affiliations|consortium|analytics|hec-view)$/, "institute", "Platform: institutes"],
  [/^\/(curricula\/builder|admin\/(curricula|master-experts|curriculum-migration|official-content|shared-courses)|national-bank)$/, "institute", "Platform: national curricula"],
  [/^\/admin\/(team|platform-settings|system-health|migrations|demo|feedback|problem-reports|ai-usage|report-bundles|landing-page)$/, "institute", "Platform: running OBEHUB"],
  [/^\/(admission-criteria)$/, "academics", "Policies & Rules"],
  // Accreditation & quality in six clear groups (queue item 10).
  [/^\/(accreditation-overview|accreditation\/readiness|accreditation|accreditation\/tasks|accreditation\/aas|accreditation\/outcomes-report|evidence-files|coordinator\/evidence|coordinator\/course-folders|coordinator\/accreditation-status|aol|cv-review|faculty-sufficiency|lab-file)$/, "quality", "Accreditation"],
  [/^\/(outcome-flow|plo-progress|ga-coverage|ga-council-map|peo-attainment|indirect-assessment|exit-surveys|faculty-survey|alumni-voice|evaluations|coordinator\/surveys|outcomes|complex-problems|portfolio-review|grade-distribution)$/, "quality", "Outcomes & surveys"],
  [/^\/(quality-office|qec-proformas|qaa|ipe|risk|policy-check|policy-history|plagiarism)$/, "quality", "Quality office"],
  [/^\/(hemis|accreditation\/nceac-portal|accreditation\/eligibility|signed-documents)$/, "quality", "Reporting to HEC & councils"],
  [/^\/(research|internationalisation)$/, "quality", "Research"],
  [/^\/(chairman\/training|recognition)$/, "people", "Faculty"],
];
// One name per group: a group the shared menu calls "Settings" is the same as "Setup & settings".
const ALIAS: Record<string, string> = { Settings: "Settings & connections", Platform: "Settings & connections", "Setup & settings": "Settings & connections", "Student life": "Students & admissions" };
// The order of the groups on each hub's page; groups not listed come after, in the order met.
const ORDER: Record<string, string[]> = {
  institute: ["Platform: institutes", "Platform: national curricula", "Platform: running OBEHUB", "Overview", "Set up & data", "Settings & connections", "Students & admissions", "Fees, HR & accounts", "Facilities & stores", "Other pages"],
  academics: ["Semester & Timetable", "Program set-up", "Programs & Courses", "Assessments & question bank", "Outcomes & CQI", "Curriculum & Outcomes", "Curriculum Maps", "Exams & results", "Students", "Degrees, partners & colleges", "Policies & Rules", "Review & Approval", "National", "Consortium"],
  people: ["People & Structure", "Faculty"],
  quality: ["Accreditation", "Outcomes & surveys", "Quality office", "Reporting to HEC & councils", "Research", "Committees & meetings"],
  reports: ["Reports & Analytics", "Insights", "Reports"],
  work: ["Daily pages", "Me", "Community"],
};
/** Splits a role's links into the hub each belongs to. */
export function hubsOf(links: Link[]) {
  const out = new Map<string, { title: string; links: Link[] }[]>();
  for (const sec of groupNavLinks(links.filter((l) => l.href !== "/dashboard" && l.href !== "/approvals" && !APPROVAL_PAGES.includes(l.href)))) {
    for (const l of sec.links) {
      let hub = HUBS.find((h) => h.sections.includes(sec.title))?.key || "institute";
      let title = sec.title;
      const forced = OVERRIDE.find(([re]) => re.test(l.href));
      const placed = forced || (["More", "Facilities & Calendar", "University Operations"].includes(sec.title) ? PLACE.find(([re]) => re.test(l.href)) : null);
      if (placed) { hub = placed[1]; title = placed[2]; }
      else if (sec.title === "More" && REPORT_HINT.test(l.href)) { hub = "reports"; title = "Reports"; }
      else if (sec.title === "More") title = "Other pages";
      title = ALIAS[title] || title;
      const list = out.get(hub) || [];
      let s = list.find((x) => x.title === title); if (!s) { s = { title, links: [] }; list.push(s); }
      s.links.push(l); out.set(hub, list);
    }
  }
  const rank = (h: string) => { for (const [re] of OVERRIDE) { const m = re.source.replace(/^\^\\\/\(|\)\$$/g, "").split("|").map((x) => x.replace(/\\\//g, "/")); const i = m.indexOf(h.slice(1)); if (i >= 0) return i; } return 999; };
  for (const list of out.values()) for (const sct of list) sct.links.sort((x, y) => rank(x.href) - rank(y.href));
  for (const [hub, list] of out) { const o = ORDER[hub] || []; const at = (t: string) => { const i = o.indexOf(t); return i < 0 ? 999 : i; }; list.sort((x, y) => at(x.title) - at(y.title)); }
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
