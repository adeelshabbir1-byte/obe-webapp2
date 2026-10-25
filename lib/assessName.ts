// A readable name for an assessment: "Midterm Q1", "Final Q2", "Quiz 3", "Assignment 2" — never a bare "1" or "2".
const TYPE_NAME: Record<string, string> = { quiz: "Quiz", assignment: "Assignment", midterm: "Midterm", mid: "Midterm", final: "Final", finalterm: "Final", lab: "Lab", project: "Project", presentation: "Presentation", viva: "Viva", sessional: "Sessional" };
export function assessName(type: string, label: string) {
  const t = TYPE_NAME[(type || "").toLowerCase().replace(/[^a-z]/g, "")] || (type ? type[0].toUpperCase() + type.slice(1).toLowerCase() : "");
  const l = (label || "").trim();
  if (!l) return t || "Assessment";
  if (t && l.toLowerCase().startsWith(t.toLowerCase())) return l;
  if (/^\d+$/.test(l)) return /Midterm|Final/.test(t) ? `${t} Q${l}` : `${t} ${l}`;
  if (/^q\s*\d+$/i.test(l)) return `${t} ${l.toUpperCase().replace(/\s+/g, "")}`;
  return t ? `${t} ${l}` : l;
}
