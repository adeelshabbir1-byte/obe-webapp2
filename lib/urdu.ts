// Urdu for the student portal menus and the parent page (right-to-left, Nastaliq). Chosen per person: the "lang" cookie
// for students (toggle in the portal header), ?lang=ur on the parent link. Wording kept short and plain.

export type Lang = "en" | "ur";
export const URDU_FONT = "https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap";
export const urduStyle = { direction: "rtl" as const, fontFamily: "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif", lineHeight: 2 };

export const NAV_UR: Record<string, string> = {
  "/student/registration": "کورس رجسٹریشن", "/student/degree-plan": "ڈگری پلان", "/student/dashboard": "اختیاری مضامین", "/student/timetable": "میرا ٹائم ٹیبل",
  "/student/exams": "میرے امتحانات", "/student/quizzes": "آن لائن کوئز", "/student/submissions": "کام جمع کرائیں", "/student/fyp": "فائنل ایئر پراجیکٹ",
  "/student/details": "میری تفصیلات", "/student/cv": "میرا پروفائل اور سی وی", "/student/fees": "میری فیس", "/student/activities": "سوسائٹیز اور سرگرمیاں",
  "/student/elections": "سوسائٹی انتخابات", "/student/transcript": "میرا ٹرانسکرپٹ", "/student/recheck": "نتیجہ کی دوبارہ جانچ", "/student/obe-analytics": "میری او بی ای پیش رفت",
  "/student/portfolio": "میرا پورٹ فولیو", "/student/course-survey": "کورس سروے اور جائزے", "/student/attendance": "میری حاضری", "/student/placements": "انٹرن شپ اور ملازمتیں",
  "/student/counselling": "کونسلنگ", "/student/library": "لائبریری", "/student/complaints": "شکایات", "/student/alerts": "الرٹس اور رابطہ", "/student/help": "مدد",
};
export const UI_UR: Record<string, string> = { Hello: "السلام علیکم", "Sign out": "سائن آؤٹ" };

const P: Record<string, [string, string]> = {
  status: ["Status", "حیثیت"], since: ["since", "سے"], semester: ["semester", "سمسٹر"], cgpa: ["CGPA", "سی جی پی اے"],
  good: ["good standing", "اچھی تعلیمی حیثیت"], warning: ["academic warning", "تعلیمی تنبیہ"], probation: ["probation", "پروبیشن"],
  thisSem: ["This semester", "اس سمسٹر"], course: ["Course", "کورس"], attendance: ["Attendance", "حاضری"], marks: ["Marks so far", "اب تک کے نمبر"], avg: ["Class average", "کلاس اوسط"],
  low: ["Attendance below {n}% can stop a student from sitting the final exam.", "{n}% سے کم حاضری پر طالب علم فائنل امتحان میں نہیں بیٹھ سکتا۔"],
  results: ["Results", "نتائج"], fees: ["Fees", "فیس"], paid: ["paid", "ادا شدہ"], due: ["due", "آخری تاریخ"], unpaid: ["unpaid", "غیر ادا شدہ"], partial: ["partly paid", "جزوی ادا شدہ"], paidS: ["paid", "ادا شدہ"],
  readonly: ["Read-only view shared by the student or their advisor.", "یہ صفحہ صرف دیکھنے کے لیے ہے، جو طالب علم یا ان کے ایڈوائزر نے شیئر کیا ہے۔"],
  switch: ["اردو میں دیکھیں", "View in English"],
};
export const pt = (lang: Lang, k: string, n?: number) => (P[k]?.[lang === "ur" ? 1 : 0] || k).replace("{n}", String(n ?? ""));
