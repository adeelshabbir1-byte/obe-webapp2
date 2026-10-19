// The BBA (Hons) scheme of studies used by the demo institute (HEC BBA framework, 8 semesters): [semester, code, title, credit hours, type].
export const BBA_SCHEME: [number, string, string, number, string][] = [
  [1, "MGT101", "Principles of Management", 3, "Core"], [1, "ACC101", "Financial Accounting I", 3, "Core"], [1, "ECO101", "Microeconomics", 3, "Core"], [1, "ENG101", "Functional English", 3, "General Education"], [1, "MTH101", "Business Mathematics", 3, "General Education"], [1, "ISL101", "Islamic Studies", 2, "General Education"],
  [2, "MKT201", "Principles of Marketing", 3, "Core"], [2, "ACC102", "Financial Accounting II", 3, "Core"], [2, "ECO102", "Macroeconomics", 3, "Core"], [2, "ENG102", "Business Communication", 3, "General Education"], [2, "STA201", "Business Statistics", 3, "General Education"], [2, "PKS101", "Pakistan Studies", 2, "General Education"],
  [3, "FIN301", "Business Finance", 3, "Core"], [3, "ORG301", "Organizational Behaviour", 3, "Core"], [3, "CMA301", "Cost and Management Accounting", 3, "Core"], [3, "BLW301", "Business Law", 3, "Core"], [3, "ICT201", "Information Technology for Business", 3, "IDS"],
  [4, "HRM401", "Human Resource Management", 3, "Core"], [4, "OPM401", "Operations Management", 3, "Core"], [4, "FIN402", "Financial Management", 3, "Core"], [4, "MKT402", "Consumer Behaviour", 3, "Core"], [4, "PSY201", "Introduction to Psychology", 3, "IDS"],
  [5, "RES501", "Business Research Methods", 3, "Core"], [5, "ENT501", "Entrepreneurship", 3, "Core"], [5, "SCM501", "Supply Chain Management", 3, "Core"], [5, "MIS501", "Management Information Systems", 3, "Core"], [5, "FIN503", "Investment and Portfolio Management", 3, "Elective"],
  [6, "STM601", "Strategic Management", 3, "Core"], [6, "IBS601", "International Business", 3, "Core"], [6, "BET601", "Business Ethics and CSR", 3, "Core"], [6, "MKT603", "Digital Marketing", 3, "Elective"], [6, "HRM602", "Compensation Management", 3, "Elective"],
  [7, "PRJ701", "Final Year Project I", 3, "Capstone Project"], [7, "LDR701", "Leadership and Change Management", 3, "Core"], [7, "BNK701", "Islamic Banking and Finance", 3, "Elective"], [7, "MKT704", "Brand Management", 3, "Elective"],
  [8, "PRJ801", "Final Year Project II", 3, "Capstone Project"], [8, "INT801", "Internship", 3, "Field Experience"], [8, "PMG801", "Project Management", 3, "Core"], [8, "CRM801", "Customer Relationship Management", 3, "Elective"],
];
export const BBA_PLOS = [
  "Business knowledge: apply knowledge of the functional areas of business to organisational problems.",
  "Critical thinking: analyse business situations using quantitative and qualitative reasoning.",
  "Communication: communicate effectively in writing and speech with business stakeholders.",
  "Ethics and social responsibility: recognise ethical issues and act responsibly.",
  "Teamwork and leadership: work effectively in diverse teams and lead them.",
  "Technology: use information technology to support business decisions.",
  "Global perspective: understand the global and local context of business.",
  "Entrepreneurship and lifelong learning: identify opportunities and keep learning.",
];
/** PLOs a BBA course maps to, by its kind. */
export function bbaPlos(code: string, type: string): number[] {
  if (/General Education/.test(type)) return /ENG/.test(code) ? [3] : /ISL|PKS/.test(code) ? [4, 7] : [2];
  if (/Capstone|Field/.test(type)) return [1, 2, 3, 5];
  if (/IDS/.test(type)) return [6, 2];
  if (/FIN|ACC|CMA|STA|RES/.test(code)) return [1, 2, 6];
  if (/MKT|IBS|CRM|SCM/.test(code)) return [1, 7, 3];
  if (/HRM|ORG|LDR|MGT|BET/.test(code)) return [1, 4, 5];
  if (/ENT|STM/.test(code)) return [1, 8, 2];
  return [1, 2];
}

