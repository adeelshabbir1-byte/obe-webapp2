export type EvidenceArea = {
  area: string; tab: string; heading: string; help: string; kinds: string[];
  showOrg?: boolean; showCount?: string; showTarget?: boolean;
};
export const EVIDENCE: EvidenceArea[] = [
  { area: "INDUSTRY", tab: "Industry links", heading: "Industrial linkages", help: "Advisory board members and meetings, the industry-liaison office, design projects supervised jointly with industry, faculty consultancy, MoUs, guest lectures and industrial visits.",
    kinds: ["Advisory board member", "Advisory board meeting", "Industry-Liaison office", "Jointly supervised design project", "Faculty consultancy", "MoU / agreement", "Guest lecture", "Industrial visit", "Industry project"], showOrg: true },
  { area: "INTERNSHIP", tab: "Internships", heading: "Internships and supervised projects", help: "Where students did internships or supervised industry projects.",
    kinds: ["Internship", "Supervised project"], showOrg: true, showCount: "Students" },
  { area: "COUNSELLING", tab: "Counselling", heading: "Counselling and student support", help: "The student counsellors appointed and the sessions held. Record the number of students, never their names or what they said.",
    kinds: ["Designated student counsellor", "Academic counselling", "Career counselling", "Orientation session", "Support for weak students", "Other support"], showCount: "Students" },
  { area: "PEO", tab: "PEO review & KPIs", heading: "PEO review and key performance indicators", help: "Record each review of the PEOs (who took part), and the measurable indicators with their target and actual value.",
    kinds: ["Review by faculty", "Review by industry", "Review by alumni", "Review by students", "KPI"], showOrg: true, showTarget: true },
  { area: "QUALITY", tab: "Quality & improvement", heading: "Steps to improve the program", help: "Reviews of the POs, GAs and CLOs, actions taken on the last visit's weaknesses, new initiatives, faculty development, and the compliance report on the last visit.",
    kinds: ["Review of POs / GAs / CLOs", "Action on last visit observation", "New initiative", "Faculty development activity", "Compliance report submitted"] },
];
export const AREA_OF = Object.fromEntries(EVIDENCE.map((e) => [e.area, e]));

/** Evidence from the last 12 months counts towards the accreditation report. */
export const since12Months = () => new Date(Date.now() - 365 * 86400000);
