import type { HelpCategory } from "./types";

// The help desks a request can go to (no database access, so the help panel in the browser can use it too).
// Who receives a request to each desk is worked out in lib/help/desks.ts.

export type DeskKey = "ACCOUNT" | "COURSES" | "REGISTRATION" | "EXAMS" | "FYP" | "FINANCE" | "LIBRARY" | "FACILITIES" | "STUDENT_AFFAIRS" | "TECHNICAL";

export const DESKS: { key: DeskKey; label: string; who: string; students: boolean; categories: HelpCategory[] }[] = [
  { key: "ACCOUNT", label: "My account, password or roles", who: "whoever manages your account (your Program Lead or the Institute Head)", students: true, categories: ["account", "people"] },
  { key: "COURSES", label: "Courses, CLOs, GAs or weightage", who: "the OMC (students: your Program Lead)", students: true, categories: ["curriculum", "weights", "teaching"] },
  { key: "REGISTRATION", label: "Registration, timetable or student records", who: "the Program Lead (students: also your advisor)", students: true, categories: ["registration"] },
  { key: "EXAMS", label: "Exams and results", who: "the department Chairman (students: your Program Lead)", students: true, categories: ["exams"] },
  { key: "FYP", label: "Final Year Project", who: "the department's FYP Head", students: true, categories: ["fyp"] },
  { key: "FINANCE", label: "Fees, scholarships or finance", who: "the Finance Officer", students: true, categories: [] },
  { key: "LIBRARY", label: "Library and textbooks", who: "the Librarian", students: true, categories: ["resources"] },
  { key: "FACILITIES", label: "Rooms, labs or facilities", who: "the Facilities Manager", students: true, categories: [] },
  { key: "STUDENT_AFFAIRS", label: "Societies, admissions or student affairs", who: "Student Affairs", students: true, categories: [] },
  { key: "TECHNICAL", label: "Something in the system isn’t working", who: "the platform's support team", students: true, categories: ["quality", "help"] },
];

export const deskOf = (k: string) => DESKS.find((d) => d.key === k) || null;
export const deskForCategory = (c: HelpCategory | string | undefined): DeskKey => (c && DESKS.find((d) => d.categories.includes(c as HelpCategory))?.key) || "TECHNICAL";
