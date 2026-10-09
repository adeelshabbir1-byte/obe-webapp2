export type EvidenceArea = {
  area: string; tab: string; heading: string; help: string; kinds: string[];
  showOrg?: boolean; showCount?: string; showTarget?: boolean;
};
export const EVIDENCE: EvidenceArea[] = [
  { area: "INDUSTRY", tab: "Industry links", heading: "Industrial linkages", help: "Advisory board members and meetings, MoUs, guest lectures, industrial visits and industry projects.",
    kinds: ["Advisory board member", "Advisory board meeting", "MoU / agreement", "Guest lecture", "Industrial visit", "Industry project"], showOrg: true },
  { area: "INTERNSHIP", tab: "Internships", heading: "Internships and supervised projects", help: "Where students did internships or supervised industry projects.",
    kinds: ["Internship", "Supervised project"], showOrg: true, showCount: "Students" },
  { area: "COUNSELLING", tab: "Counselling", heading: "Counselling and student support", help: "Sessions held for students. Record the number of students, never their names or what they said.",
    kinds: ["Academic counselling", "Career counselling", "Orientation session", "Support for weak students", "Other support"], showCount: "Students" },
  { area: "PEO", tab: "PEO review & KPIs", heading: "PEO review and key performance indicators", help: "Record each review of the PEOs (who took part), and the measurable indicators with their target and actual value.",
    kinds: ["Review by faculty", "Review by industry", "Review by alumni", "Review by students", "KPI"], showOrg: true, showTarget: true },
];
export const AREA_OF = Object.fromEntries(EVIDENCE.map((e) => [e.area, e]));

/** Evidence from the last 12 months counts towards the accreditation report. */
export const since12Months = () => new Date(Date.now() - 365 * 86400000);
