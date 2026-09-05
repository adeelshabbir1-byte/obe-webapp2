// ============================================================================
// Source: HEC (Higher Education Commission, Pakistan) official notification
// No. HEC/NCRC/CS&IT/2025/8163, dated 14 October 2025 — "Revised Curriculum
// for Degree Programs in Computer Science", BS Computer Science, 2025.
// Extracted from the uploaded PDF (86 pages, text layer, not OCR).
//
// HEC's published scheme does not assign formal course codes — universities
// assign their own. The `code` values below are a suggested numbering
// convention (CS-1xx = Computer Science majors, GE-1xx = General Education,
// IDS-1xx = Interdisciplinary/Allied), clearly NOT part of the official
// source. Institutions should replace them with their own codes on adoption.
// ============================================================================

export const HEC_BSCS_2025 = {
  authority: "HEC",
  title: "BS Computer Science",
  version: "2025",
  publicationDate: "2025-10-14",
  sourceReference: "HEC/NCRC/CS&IT/2025/8163",
  minimumCreditHours: 130,
};

export const HEC_BSCS_2025_PLOS = [
  { number: 1, title: "Academic Education", description: "Prepare graduates as computing professionals." },
  { number: 2, title: "Knowledge for Solving Computing Problems", description: "Apply knowledge of computing fundamentals, a computing specialization, and mathematics, science, and domain knowledge appropriate for the computing specialization to the abstraction and conceptualization of computing models from defined problems and requirements." },
  { number: 3, title: "Problem Analysis", description: "Identify, formulate, research literature, and solve complex computing problems reaching substantiated conclusions using fundamental principles of mathematics, computing sciences, and relevant domain disciplines." },
  { number: 4, title: "Design/Development of Solutions", description: "Design and evaluate solutions for complex computing problems, and design and evaluate systems, components, or processes that meet specified needs with appropriate consideration for public health and safety, cultural, societal, and environmental considerations." },
  { number: 5, title: "Modern Tool Usage", description: "Create, select, adapt and apply appropriate techniques, resources, and modern computing tools to complex computing activities, with an understanding of the limitations." },
  { number: 6, title: "Individual and Team Work", description: "Function effectively as an individual and as a member or leader in diverse teams and in multi-disciplinary settings." },
  { number: 7, title: "Communication", description: "Communicate effectively with the computing community and with society at large about complex computing activities by being able to comprehend and write effective reports, design documentation, make effective presentations, and give and understand clear instructions." },
  { number: 8, title: "Computing Professionalism and Society", description: "Understand and assess societal, health, safety, legal, and cultural issues within local and global contexts, and the consequential responsibilities relevant to professional computing practice." },
  { number: 9, title: "Ethics", description: "Understand and commit to professional ethics, responsibilities, and norms of professional computing practice." },
  { number: 10, title: "Life-long Learning", description: "Recognize the need, and have the ability, to engage in independent learning for continual development as a computing professional." },
];

// category: "General Education" | "Core" | "Elective" | "IDS" | "Certification" | "Capstone Project" | "Field Experience"
export const HEC_BSCS_2025_COURSES = [
  // Semester I — 18 credits
  { code: "GE-101", title: "Quantitative Reasoning-I", creditHours: 3, category: "General Education", semesterNumber: 1 },
  { code: "GE-102", title: "Functional English", creditHours: 3, category: "General Education", semesterNumber: 1 },
  { code: "GE-103", title: "Applications of Information and Communication Technologies", creditHours: 3, category: "General Education", semesterNumber: 1 },
  { code: "GE-104", title: "Social Science", creditHours: 2, category: "General Education", semesterNumber: 1 },
  { code: "CS-101", title: "Programming Fundamentals", creditHours: 4, category: "Core", semesterNumber: 1 },
  { code: "IDS-101", title: "Calculus & Analytical Geometry (IDS I, Mandatory)", creditHours: 3, category: "IDS", semesterNumber: 1 },

  // Semester II — 19 credits
  { code: "GE-105", title: "Quantitative Reasoning-II", creditHours: 3, category: "General Education", semesterNumber: 2 },
  { code: "GE-106", title: "Arts and Humanities", creditHours: 2, category: "General Education", semesterNumber: 2 },
  { code: "GE-107", title: "Pakistan Studies", creditHours: 2, category: "General Education", semesterNumber: 2 },
  { code: "GE-108", title: "Fehm-e-Quran – I (for Muslim Students)", creditHours: 1, category: "General Education", semesterNumber: 2 },
  { code: "CS-102", title: "Object Oriented Programming", creditHours: 4, category: "Core", semesterNumber: 2 },
  { code: "CS-103", title: "Digital Logic Design", creditHours: 4, category: "Core", semesterNumber: 2 },
  { code: "IDS-102", title: "Linear Algebra (IDS II, Mandatory)", creditHours: 3, category: "IDS", semesterNumber: 2 },

  // Semester III — 19 credits
  { code: "GE-109", title: "Expository Writing", creditHours: 3, category: "General Education", semesterNumber: 3 },
  { code: "GE-110", title: "Natural Science", creditHours: 3, category: "General Education", semesterNumber: 3 },
  { code: "GE-111", title: "Fehm-e-Quran – II (for Muslim Students)", creditHours: 1, category: "General Education", semesterNumber: 3 },
  { code: "CS-104", title: "Data Structures", creditHours: 4, category: "Core", semesterNumber: 3 },
  { code: "CS-105", title: "Database Systems", creditHours: 4, category: "Core", semesterNumber: 3 },
  { code: "CS-106", title: "Operating Systems", creditHours: 4, category: "Core", semesterNumber: 3 },

  // Semester IV — 17 credits
  { code: "GE-112", title: "Civics and Community Engagement", creditHours: 2, category: "General Education", semesterNumber: 4 },
  { code: "GE-113", title: "Ideology and Constitution of Pakistan", creditHours: 2, category: "General Education", semesterNumber: 4 },
  { code: "GE-114", title: "Entrepreneurship", creditHours: 2, category: "General Education", semesterNumber: 4 },
  { code: "GE-115", title: "Islamic Studies (Religious Education / Ethics for non-Muslim students)", creditHours: 2, category: "General Education", semesterNumber: 4 },
  { code: "CS-107", title: "Software Engineering", creditHours: 3, category: "Core", semesterNumber: 4 },
  { code: "CS-108", title: "Computer Organization & Architecture", creditHours: 3, category: "Core", semesterNumber: 4 },
  { code: "CS-109", title: "Design & Analysis of Algorithms", creditHours: 3, category: "Core", semesterNumber: 4 },

  // Semester V — 18 credits
  { code: "CS-110", title: "Computer Networks", creditHours: 3, category: "Core", semesterNumber: 5 },
  { code: "CS-111", title: "Information Security", creditHours: 3, category: "Core", semesterNumber: 5 },
  { code: "CS-112", title: "Artificial Intelligence", creditHours: 3, category: "Core", semesterNumber: 5 },
  { code: "CS-113", title: "Theory of Automata", creditHours: 3, category: "Core", semesterNumber: 5 },
  { code: "IDS-103", title: "IDS - III (institution-selected)", creditHours: 3, category: "IDS", semesterNumber: 5 },
  { code: "IDS-104", title: "IDS - IV (institution-selected)", creditHours: 3, category: "IDS", semesterNumber: 5 },

  // Semester VI — 15 credits
  { code: "CS-114", title: "Cloud Computing", creditHours: 3, category: "Core", semesterNumber: 6 },
  { code: "CS-ELEC-1", title: "Elective I (specialization)", creditHours: 3, category: "Elective", semesterNumber: 6 },
  { code: "CS-ELEC-2", title: "Elective II (specialization)", creditHours: 3, category: "Elective", semesterNumber: 6 },
  { code: "CS-ELEC-3", title: "Elective III (specialization)", creditHours: 3, category: "Elective", semesterNumber: 6 },
  { code: "CS-ELEC-4", title: "Elective IV (specialization)", creditHours: 3, category: "Elective", semesterNumber: 6 },

  // Semester VII — 15 credits
  { code: "CS-ELEC-5", title: "Elective V (specialization)", creditHours: 3, category: "Elective", semesterNumber: 7 },
  { code: "CS-ELEC-6", title: "Elective VI (specialization)", creditHours: 3, category: "Elective", semesterNumber: 7 },
  { code: "CS-ELEC-7", title: "Elective VII (specialization)", creditHours: 3, category: "Elective", semesterNumber: 7 },
  { code: "CS-ELEC-8", title: "Elective VIII (specialization)", creditHours: 3, category: "Elective", semesterNumber: 7 },
  { code: "CS-CERT", title: "Professional Certification", creditHours: 3, category: "Certification", semesterNumber: 7 },

  // Semester VIII — 9 credits
  { code: "CS-FYP", title: "Final Year Project", creditHours: 6, category: "Capstone Project", semesterNumber: 8 },
  { code: "CS-FIELD", title: "Field Experience", creditHours: 3, category: "Field Experience", semesterNumber: 8 },
];

// The 14 recommended specialization tracks (informational — elective slots
// above are filled from whichever specialization an institution offers)
export const HEC_BSCS_2025_SPECIALIZATIONS = [
  "Software Engineering", "Data Science", "Artificial Intelligence", "Cyber Security",
  "Information Technology", "Computer Engineering", "Computer Games Development",
  "Multimedia and Animation", "Robotics", "Human Computer Interaction",
  "Internet of Things (IoT)", "Network Infrastructure & Cloud Computing",
  "Quantum Computing", "Health Informatics",
];
