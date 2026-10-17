export const STAGES: [string, string][] = [["INQUIRY", "Inquiry"], ["APPLIED", "Applied"], ["TEST", "Entry test"], ["INTERVIEW", "Interview"], ["MERIT", "On merit list"], ["OFFERED", "Offer sent"], ["ADMITTED", "Fee paid"], ["ENROLLED", "Enrolled"], ["LOST", "Lost"]];
export const SOURCES = ["Website", "Walk-in", "Phone", "Facebook / Instagram", "Newspaper", "School visit", "Referral", "Education expo", "Other"];
export const stageLabel = (s: string) => STAGES.find((x) => x[0] === s)?.[1] || s;
