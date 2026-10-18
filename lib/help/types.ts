// Shapes shared by the help center: the built-in manual and FAQ (lib/help/content.ts), an institute's own
// articles (HelpArticle rows), the search engine and the help-desk routing.

export type HelpKind = "guide" | "faq";

export type HelpCategory =
  | "account" | "people" | "curriculum" | "weights" | "teaching" | "registration" | "exams" | "fyp" | "quality" | "resources" | "help";

export const CATEGORIES: { key: HelpCategory; label: string; blurb: string }[] = [
  { key: "account", label: "Account & sign-in", blurb: "Passwords, two-step sign-in, locked accounts and switching roles." },
  { key: "people", label: "People & roles", blurb: "Who adds whom, onboarding teachers and students, lending teachers." },
  { key: "curriculum", label: "Courses & OBE", blurb: "Course templates, CLOs and GAs, prerequisites and their cascade." },
  { key: "weights", label: "Assessments & weightage", blurb: "The weight policy, exceptions and passing criteria." },
  { key: "teaching", label: "Teaching & delivery", blurb: "Recording delivery, leave, papers, follow-ups and remediation." },
  { key: "registration", label: "Registration & students", blurb: "Why registration is blocked, exemptions, advisors and status." },
  { key: "exams", label: "Exams & results", blurb: "Date sheets, result approval and grade changes." },
  { key: "fyp", label: "Final Year Projects", blurb: "FYP Head, proposals, groups, panels and sign-off." },
  { key: "quality", label: "Quality, reports & accreditation", blurb: "CQI, reports, report access, SAR and evidence." },
  { key: "resources", label: "Finance, library & facilities", blurb: "Who keeps which records, textbooks and requisitions." },
  { key: "help", label: "Getting help", blurb: "Help requests, suggestions, notifications and AI features." },
];

/** "STUDENT" is the student portal; every other value is a staff role (prisma UserRole). */
export const STUDENT = "STUDENT";
/** Shown to everyone, staff and students. */
export const EVERYONE = "*";

export type HelpArticle = {
  key: string;
  kind: HelpKind;
  category: HelpCategory;
  /** A question for FAQs ("Who can reset passwords?"), a task for guides ("Add a teacher"). */
  title: string;
  /** The direct answer, in a sentence or three. */
  summary: string;
  steps?: string[];
  /** Who is allowed to do it. */
  who?: string;
  /** What changes downstream when it is done. */
  affects?: string;
  /** Audience: staff roles, STUDENT, or EVERYONE. An empty list means every staff role. */
  roles: string[];
  /** Page prefixes where the article is suggested ("/omc/weight-policy", "/student/registration"). */
  pages?: string[];
  keywords?: string[];
  /** The page where the task is done. */
  href?: string;
  related?: string[];
  source: "builtin" | "institute" | "platform";
  /** Database id, for an institute's or the platform's own article. */
  id?: string;
};

/** Whether an article is meant for this viewer (a staff role, or STUDENT). */
export function forAudience(a: Pick<HelpArticle, "roles">, role: string): boolean {
  if (a.roles.includes(EVERYONE)) return true;
  if (role === STUDENT) return a.roles.includes(STUDENT);
  if (!a.roles.length) return true;
  return a.roles.includes(role);
}
