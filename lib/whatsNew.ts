// "What's new" (Adeel prompt §14): each build adds its entries here, newest first. `roles` are the role keys that see it
// ("*" = every staff role). The notice shows a person only the entries for their role(s) that are newer than the last one
// they dismissed (UserFlag "whatsnew"). The full list is on /whats-new.
export type WhatsNew = { id: string; date: string; roles: string[]; text: string; href?: string };

const STAFF = "*";
export const WHATS_NEW: WhatsNew[] = [
  { id: "2026-11-01-zj", date: "2026-11-01", roles: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"], text: "Committees: a step-by-step “New committee”, and the Members card first — roles and terms, people suggested to tick, add by email, replace with history, your composition rule, and a Secretary who manages members.", href: "/boards" },
  { id: "2026-11-01-zk", date: "2026-11-01", roles: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"], text: "Desks run by others (Library Desk, fees, payroll, facilities, stores) left your menu; see them on one Institute operations page.", href: "/operations" },
  { id: "2026-11-01-zg", date: "2026-11-01", roles: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR"], text: "Joint degrees and ODL are now a step-by-step wizard (8 steps for a joint / dual / double degree, 6 for ODL), each with “still missing” for HEC. The Dean assigns each programme to one person.", href: "/collab" },
  { id: "2026-11-01-zh", date: "2026-11-01", roles: ["CHAIRMAN", "DEAN"], text: "Affiliation work can be handed to one person (the Affiliation office); they get it under “Working as”.", href: "/affiliation" },
  { id: "2026-11-01-zi", date: "2026-11-01", roles: ["*"], text: "The Controller of Examinations can build a team and give each member the programs they handle (Controller Dashboard › My team).", href: "/controller" },
  { id: "2026-11-01-zf", date: "2026-11-01", roles: ["*"], text: "A shorter menu: Home, one My Approvals (a card per kind of approval), your daily pages, and a few areas — Academics, People, Accreditation & quality, Reports, Institute — each opening a page of cards. If you also hold a duty (Controller of Examinations, QEC, IT Manager …), pick it under “Working as” to see only that menu.", href: "/dashboard" },
  { id: "2026-11-01-ze", date: "2026-11-01", roles: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT"], text: "Affiliation: coded answer-sheet marking (markers see only codes), suggested external examiners with conflict checks, sessions split by centre capacity, the yearly tax certificate, and disaffiliation (teach-out or migrate).", href: "/affiliation?tab=MARKING" },
  { id: "2026-11-01-za", date: "2026-11-01", roles: ["COURSE_ASSIGNER", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN"], text: "An approved year plan now fills the term's section assignments and picks the Course Leads; it checks the same-teacher lab rule, the two-ODL-courses limit and the university's faculty approvals.", href: "/allocation/year-plan" },
  { id: "2026-11-01-zb", date: "2026-11-01", roles: ["CHAIRMAN", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT"], text: "Affiliation: final exam papers with what colleges are told and when, and a coverage check of the disclosed lectures; expired affiliation blocks new batches; unpaid fees can hold results.", href: "/affiliation?tab=FINAL_PAPER" },
  { id: "2026-11-01-zc", date: "2026-11-01", roles: ["LAB_ENGINEER", "INSTRUCTOR"], text: "Repeaters who passed a lab before can keep their old lab marks (when the Controller allows it) — one click on the lab page.", href: "/dashboard" },
  { id: "2026-11-01-zd", date: "2026-11-01", roles: ["CHAIRMAN"], text: "SMS / WhatsApp templates in English and Urdu (or both), and a public programme page for joint degrees.", href: "/chairman/messaging" },
  { id: "2026-11-01-x", date: "2026-11-01", roles: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR"], text: "Affiliation: university and affiliated colleges share applications, centres, examiners and agreed marks, TA / DA claims, notices and comparison reports.", href: "/affiliation" },
  { id: "2026-11-01-y", date: "2026-11-01", roles: ["CHAIRMAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR"], text: "Associate Degree programs and exit awards, and suggested course equivalences for transfers.", href: "/adp" },
  { id: "2026-11-01-z", date: "2026-11-01", roles: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR"], text: "Joint / dual / double degrees and ODL: HEC conditions with clauses, MoC checklist, Credit Equivalency Matrix, NOC file and audit pack.", href: "/collab" },
  { id: "2026-11-01-u", date: "2026-11-01", roles: ["COURSE_ASSIGNER", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN"], text: "Year Allocation Plan (Fall + Spring + tentative Summer, Draft A / B, HOD approval) and the Preferences board (uncontested / contested, points, HOD rules, fairness).", href: "/allocation/year-plan" },
  { id: "2026-11-01-v", date: "2026-11-01", roles: ["INSTRUCTOR", "SUBJECT_EXPERT", "LAB_ENGINEER"], text: "My Teaching: rank courses with sections and times, see your year card and allocation letter, accept or raise a concern, ask for a swap.", href: "/allocation/year-card" },
  { id: "2026-11-01-w", date: "2026-11-01", roles: ["*"], text: "CQI Remedies: a weak prerequisite topic gets a remedy before the next topic is taught; the loop is closed with a re-check.", href: "/cqi/remedies" },
  { id: "2026-11-01-r", date: "2026-11-01", roles: ["*"], text: "Install OBEHUB on your phone and turn on notifications; marks typed offline sync when you're back online.", href: "/dashboard" },
  { id: "2026-11-01-s", date: "2026-11-01", roles: ["INSTRUCTOR", "SUBJECT_EXPERT", "PROGRAM_COORDINATOR"], text: "Mid-semester feedback: anonymous pace, clarity and hardest-topic results for your courses, with a suggested action.", href: "/instructor/mid-feedback" },
  { id: "2026-11-01-t", date: "2026-11-01", roles: ["*"], text: "My Role Handbook (PDF) and Meetings — every committee, scheduling, invitations, action items and the minutes format in one place.", href: "/meetings-hub" },
  { id: "2026-11-01-o", date: "2026-11-01", roles: ["*"], text: "Timetable Views & Changes: master grid with teacher colours and clashes, room door sheets with QR, next 7 days of rooms, reschedule / cancel / make-up / substitute, free-slot finder, reports, floor register and class log, and a calendar link.", href: "/timetable/live" },
  { id: "2026-11-01-p", date: "2026-11-01", roles: ["*"], text: "Advisors: “Suggest plan” builds a student's remaining semesters within the load you set; retakes with another batch raise the out-of-batch request.", href: "/advisor/dashboard" },
  { id: "2026-11-01-q", date: "2026-11-01", roles: ["OMC", "SUPER_USER"], text: "Full curriculum template import now reads all sheets (Lab CH, importance, topic links, lab plan, assessment plan, questions, rubrics) with a per-sheet preview first.", href: "/omc/master-curriculum" },
  { id: "2026-11-01-m", date: "2026-11-01", roles: ["*"], text: "Advisor student page in tabs; F / D courses first with where to retake them; the GA matrix (courses × GAs, with what is still needed per GA) on the OBE transcript tab and the student transcript.", href: "/advisor/dashboard" },
  { id: "2026-11-01-n", date: "2026-11-01", roles: ["CHAIRMAN"], text: "Look of the app: your institute's main colour (contrast-checked) and a faint logo watermark.", href: "/chairman/institute-settings" },
  { id: "2026-11-01-j", date: "2026-11-01", roles: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "OMC", "DEPARTMENT_COORDINATOR"], text: "My Delegations: hand chosen tasks to a colleague for a period (e.g. HOD Delegate for naming SEs), or let someone act for you on leave. You can override or revoke any time.", href: "/delegations" },
  { id: "2026-11-01-k", date: "2026-11-01", roles: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "DEPARTMENT_COORDINATOR"], text: "Data Quality: duplicate students, courses with no SE / instructor / sections / plan, unmapped CLOs and questions — each with a Fix link.", href: "/data-quality" },
  { id: "2026-11-01-l", date: "2026-11-01", roles: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "INSTRUCTOR"], text: "Term Archive: archive a term once its results are approved; later corrections go through an approved amendment.", href: "/term-archive" },
  { id: "2026-11-01-g", date: "2026-11-01", roles: ["HEAD_OF_DEPARTMENT"], text: "Name Subject Experts: a matrix of your department's common and service courses × your experts, with each expert's live SE load.", href: "/hod/assign-subject-experts" },
  { id: "2026-11-01-h", date: "2026-11-01", roles: ["PROGRAM_COORDINATOR"], text: "Assign Subject Experts shows each teacher's SE load across the institute, live; courses named by a department show who names them and “Request SE”.", href: "/coordinator/assign-subject-experts" },
  { id: "2026-11-01-i", date: "2026-11-01", roles: ["*"], text: "Course Leads are now chosen automatically (the SE first, then last term's lead, then the most experienced). Anyone who manages leads can still change them.", href: "/course-leads" },
  { id: "2026-11-01-e", date: "2026-11-01", roles: ["SUBJECT_EXPERT", "PROGRAM_COORDINATOR", "HEAD_OF_DEPARTMENT", "CHAIRMAN", "OMC"], text: "CLOs and lecture topics: Undo for 10 seconds after a save or delete, ⟲ history (who · when · old → new), and unsaved CLO edits kept as a draft you can restore.", href: "/subjectexpert/courses" },
  { id: "2026-11-01-f", date: "2026-11-01", roles: ["*"], text: "Text & contrast: larger text and high contrast for you, from the sidebar (A+ and ◐). ⓘ next to CLO, GA and Bloom explains the term.", href: "/help/glossary" },
  { id: "2026-11-01-a", date: "2026-11-01", roles: [STAFF], text: "Menu colours: each page in your menu shows red (overdue), amber (due soon) or blue (in progress), with a count. Hover for the reason.", href: "/dashboard#whats-next" },
  { id: "2026-11-01-b", date: "2026-11-01", roles: [STAFF], text: "“My week” on your home page, “Waiting…” to park a task you can't act on yet, and a daily or weekly digest of red and amber items.", href: "/dashboard#my-week" },
  { id: "2026-11-01-c", date: "2026-11-01", roles: ["CHAIRMAN", "DEAN", "HEAD_OF_DEPARTMENT", "PROGRAM_COORDINATOR", "OMC", "DEPARTMENT_COORDINATOR"], text: "“Who decides what”: one page with every setting, its value, who sets it, who changed it last and where to change it.", href: "/settings/who-decides" },
  { id: "2026-11-01-d", date: "2026-11-01", roles: ["CHAIRMAN", "SUPER_USER"], text: "Pages without help are now listed as missing answers, so you can see where help is still to be written.", href: "/help/manage" },
];

export function entriesFor(role: string, extraRoles: string[] = []) {
  const mine = new Set([role, ...extraRoles]);
  return WHATS_NEW.filter((e) => e.roles.includes(STAFF) ? role !== "STUDENT" : e.roles.some((r) => mine.has(r)));
}
/** Entries newer than the last one the person dismissed. */
export function unseen(role: string, extraRoles: string[], lastSeenId: string | null) {
  const list = entriesFor(role, extraRoles);
  if (!lastSeenId) return list.slice(0, 5);
  const seenAt = WHATS_NEW.findIndex((e) => e.id === lastSeenId);
  return seenAt < 0 ? list.slice(0, 5) : list.filter((e) => WHATS_NEW.indexOf(e) < seenAt);
}
