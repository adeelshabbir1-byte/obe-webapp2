import { sectionOf, problemOf, type Field } from "./aas";
import { listsWith, listOf, canon, type Lists } from "./nceacLists";

// Which AAS fields a student or a teacher fills for themselves (the rest come from their record).
export const STUDENT_SELF = ["father", "gender", "nationality", "cnic", "passport", "dob", "phone", "email", "domDistrict", "domProvince", "address", "city", "sscDegree", "sscBoard", "sscTotal", "sscObtained", "hsscDegree", "hsscCode", "hsscBoard", "hsscTotal", "hsscObtained"];
export const STAFF_SELF = ["honorific", "type", "gender", "cnic", "dob", "mobile", "address", "province", "city", "contract", "rank", "leaving", "coreComputing", "degree", "degreeType", "field", "country", "university", "foreignUniversity", "degreeStart", "degreeEnd"];

export type Option = { value: string; label: string };
export type FormField = Field & { options?: Option[] };

/** The fields with the portal's choices attached, so forms show a dropdown spelt exactly as on the NCEAC portal. */
export function withOptions(fields: Field[], lists: Lists = listsWith()): FormField[] {
  return fields.map((f) => {
    if (!f.list) return f;
    const l = listOf(f.list);
    return { ...f, options: (lists[f.list] || []).map((v) => ({ value: v, label: l?.labels?.[v] ? `${v} — ${l.labels[v]}` : v })) };
  });
}
export const selfFields = (kind: "student" | "staff", lists?: Lists): FormField[] => {
  const s = sectionOf(kind === "student" ? "students" : "faculty")!;
  const keys = kind === "student" ? STUDENT_SELF : STAFF_SELF;
  return withOptions(keys.map((k) => s.fields.find((f) => f.key === k)!).filter(Boolean), lists);
};
/** Stored wording turned into the portal's spelling where it can be matched (e.g. "Assistant Professor" → "AssistantProfessor"). */
export function canonValues(kind: "student" | "staff", v: Record<string, string>, lists: Lists = listsWith()) {
  const out = { ...v };
  for (const f of selfFields(kind, lists)) if (f.list && out[f.key]) out[f.key] = canon(f.list, out[f.key], lists) || out[f.key];
  return out;
}
/** Format problems with what was typed, or null. */
export function checkValues(kind: "student" | "staff", v: Record<string, string>, lists: Lists = listsWith()) {
  const bad = selfFields(kind, lists).map((f) => { const p = problemOf(f, v[f.key] || "", lists); return p && p !== "missing" ? `${f.label}: ${p}` : null; }).filter(Boolean);
  return bad.length ? bad.join("; ") : null;
}
