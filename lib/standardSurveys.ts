// The standard indirect-assessment forms. Every PLO gets one question per form (rated 1-5), so each form adds a separate,
// weighted source to that PLO's blended attainment on "Direct & Indirect PLOs". Items without a PLO are context only.
export type Std = { key: string; title: string; type: "STUDENT" | "ALUMNI" | "EMPLOYER"; when: string; plo: (t: string) => string; peo?: (t: string) => string; extra: string[] };
export const STANDARD_SURVEYS: Std[] = [
  { key: "exit", title: "Graduating Student Exit Survey", type: "STUDENT", when: "Final semester, before the degree is awarded",
    plo: (t) => `I am confident that I can: ${t}`,
    extra: ["Overall, I am satisfied with the quality of teaching in my program.", "Laboratories and equipment met the needs of my courses.", "Library and online resources were adequate.", "Academic advising and counselling helped me.", "My final year project prepared me for professional work.", "I would recommend this program to others."] },
  { key: "internship", title: "Internship Supervisor Evaluation", type: "EMPLOYER", when: "End of each student's internship (filled by the industry supervisor)",
    plo: (t) => `The intern was able to: ${t}`,
    extra: ["The intern was punctual and professional.", "The intern learned new tools and methods quickly.", "We would offer this intern a job."] },
  { key: "alumni", title: "Alumni Survey", type: "ALUMNI", when: "One to three years after graduation",
    plo: (t) => `My degree prepared me well to: ${t}`, peo: (t) => `In my career I have achieved: ${t}`,
    extra: ["I found a job in my field within six months of graduating.", "My studies are relevant to my current work.", "I am pursuing or have completed further study or professional certification."] },
  { key: "employer", title: "Employer Survey", type: "EMPLOYER", when: "Every one to two years, to organisations employing our graduates",
    plo: (t) => `Graduates of this program working for us can: ${t}`, peo: (t) => `Our employees from this program demonstrate: ${t}`,
    extra: ["Graduates of this program compare well with graduates of other universities.", "We would hire graduates of this program again."] },
];
