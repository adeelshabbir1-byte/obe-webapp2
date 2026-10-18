import { sectionOf, problemOf } from "./aas";

// Which AAS fields a student or a teacher fills for themselves (the rest come from their record).
export const STUDENT_SELF = ["father", "gender", "nationality", "cnic", "passport", "dob", "phone", "email", "domDistrict", "domProvince", "address", "city", "sscDegree", "sscBoard", "sscTotal", "sscObtained", "hsscDegree", "hsscBoard", "hsscTotal", "hsscObtained"];
export const STAFF_SELF = ["type", "gender", "cnic", "mobile", "address", "province", "city", "contract", "rank", "leaving", "degree", "degreeType", "field", "country", "university", "foreignUniversity", "degreeStart", "degreeEnd"];
export const selfFields = (kind: "student" | "staff") => { const s = sectionOf(kind === "student" ? "students" : "faculty")!; const keys = kind === "student" ? STUDENT_SELF : STAFF_SELF; return s.fields.filter((f) => keys.includes(f.key)); };
/** Format problems with what was typed, or null. */
export function checkValues(kind: "student" | "staff", v: Record<string, string>) {
  const bad = selfFields(kind).map((f) => { const p = problemOf(f, v[f.key] || ""); return p && p !== "missing" ? `${f.label}: ${p}` : null; }).filter(Boolean);
  return bad.length ? bad.join("; ") : null;
}
