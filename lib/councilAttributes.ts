// The graduate attributes each council sets, under the names OBEHUB uses for them, so a program's own Graduate
// Attributes (GAs) can be loaded from them in one click and mapped back to them for the coverage check:
//   EGA — PEC's 12 engineering Graduate Attributes (Washington Accord; PEC OBA Manual 2019)
//   CGA — NCEAC's 10 computing Graduate Attributes (Seoul Accord; NCEAC Accreditation Manual)
//   BGA — NBEAC sets no fixed list: each business school writes its own learning goals for Assurance of Learning. The
//         list below is a common starting point the school is expected to adapt, not an NBEAC text.
// Pure data: safe to import on the client.

export type CouncilKey = "PEC" | "NCEAC" | "NBEAC";
export type CouncilAttr = { n: number; title: string; statement: string };
export type CouncilSet = { key: CouncilKey; prefix: "EGA" | "CGA" | "BGA"; name: string; source: string; prescribed: boolean; attrs: CouncilAttr[] };

export const COUNCIL_SETS: Record<CouncilKey, CouncilSet> = {
  PEC: {
    key: "PEC", prefix: "EGA", name: "PEC Graduate Attributes", source: "PEC Manual of Accreditation (OBA) 2019 — Washington Accord graduate attributes", prescribed: true,
    attrs: [
      { n: 1, title: "Engineering Knowledge", statement: "An ability to apply knowledge of mathematics, science, engineering fundamentals and an engineering specialization to the solution of complex engineering problems." },
      { n: 2, title: "Problem Analysis", statement: "An ability to identify, formulate, research literature, and analyze complex engineering problems reaching substantiated conclusions using first principles of mathematics, natural sciences and engineering sciences." },
      { n: 3, title: "Design/Development of Solutions", statement: "An ability to design solutions for complex engineering problems and design systems, components or processes that meet specified needs with appropriate consideration for public health and safety, cultural, societal, and environmental considerations." },
      { n: 4, title: "Investigation", statement: "An ability to investigate complex engineering problems in a methodical way including literature survey, design and conduct of experiments, analysis and interpretation of experimental data, and synthesis of information to derive valid conclusions." },
      { n: 5, title: "Modern Tool Usage", statement: "An ability to create, select and apply appropriate techniques, resources, and modern engineering and IT tools, including prediction and modeling, to complex engineering activities, with an understanding of the limitations." },
      { n: 6, title: "The Engineer and Society", statement: "An ability to apply reasoning informed by contextual knowledge to assess societal, health, safety, legal and cultural issues and the consequent responsibilities relevant to professional engineering practice and solution to complex engineering problems." },
      { n: 7, title: "Environment and Sustainability", statement: "An ability to understand the impact of professional engineering solutions in societal and environmental contexts and demonstrate knowledge of and need for sustainable development." },
      { n: 8, title: "Ethics", statement: "Apply ethical principles and commit to professional ethics and responsibilities and norms of engineering practice." },
      { n: 9, title: "Individual and Team Work", statement: "An ability to work effectively, as an individual or in a team, on multifaceted and/or multidisciplinary settings." },
      { n: 10, title: "Communication", statement: "An ability to communicate effectively, orally as well as in writing, on complex engineering activities with the engineering community and with society at large, such as being able to comprehend and write effective reports and design documentation, make effective presentations, and give and receive clear instructions." },
      { n: 11, title: "Project Management", statement: "An ability to demonstrate management skills and apply engineering principles to one's own work, as a member and/or leader in a team, to manage projects in a multidisciplinary environment." },
      { n: 12, title: "Lifelong Learning", statement: "An ability to recognize importance of, and pursue lifelong learning in the broader context of innovation and technological developments." },
    ],
  },
  NCEAC: {
    key: "NCEAC", prefix: "CGA", name: "NCEAC Graduate Attributes", source: "NCEAC Accreditation Manual — Seoul Accord graduate attributes", prescribed: true,
    attrs: [
      { n: 1, title: "Academic Education", statement: "To prepare graduates as computing professionals." },
      { n: 2, title: "Knowledge for Solving Computing Problems", statement: "Apply knowledge of computing fundamentals, knowledge of a computing specialization, and mathematics, science, and domain knowledge appropriate for the computing specialization to the abstraction and conceptualization of computing models from defined problems and requirements." },
      { n: 3, title: "Problem Analysis", statement: "Identify, formulate, research literature, and solve complex computing problems reaching substantiated conclusions using fundamental principles of mathematics, computing sciences, and relevant domain disciplines." },
      { n: 4, title: "Design/Development of Solutions", statement: "Design and evaluate solutions for complex computing problems, and design and evaluate systems, components, or processes that meet specified needs with appropriate consideration for public health and safety, cultural, societal, and environmental considerations." },
      { n: 5, title: "Modern Tool Usage", statement: "Create, select, adapt and apply appropriate techniques, resources, and modern computing tools to complex computing activities, with an understanding of the limitations." },
      { n: 6, title: "Individual and Teamwork", statement: "Function effectively as an individual and as a member or leader in diverse teams and in multi-disciplinary settings." },
      { n: 7, title: "Communication", statement: "Communicate effectively with the computing community and with society at large about complex computing activities by being able to comprehend and write effective reports, design documentation, make effective presentations, and give and understand clear instructions." },
      { n: 8, title: "Computing Professionalism and Society", statement: "Understand and assess societal, health, safety, legal, and cultural issues within local and global contexts, and the consequential responsibilities relevant to professional computing practice." },
      { n: 9, title: "Ethics", statement: "Understand and commit to professional ethics, responsibilities, and norms of professional computing practice." },
      { n: 10, title: "Life-long Learning", statement: "Recognize the need, and have the ability, to engage in independent learning for continual development as a computing professional." },
    ],
  },
  NBEAC: {
    key: "NBEAC", prefix: "BGA", name: "Business learning goals (starter set)", source: "NBEAC asks each school to set its own learning goals for Assurance of Learning; adapt this common starter set to your mission", prescribed: false,
    attrs: [
      { n: 1, title: "Business Knowledge", statement: "Apply knowledge of the functional areas of business — accounting, finance, marketing, management and operations — to business situations." },
      { n: 2, title: "Critical Thinking and Problem Solving", statement: "Analyse business problems using qualitative and quantitative evidence and reach reasoned decisions." },
      { n: 3, title: "Communication", statement: "Communicate clearly and persuasively in writing and speech to business audiences." },
      { n: 4, title: "Ethics and Social Responsibility", statement: "Recognise ethical issues and the social and environmental responsibilities of business, and act on them." },
      { n: 5, title: "Teamwork and Leadership", statement: "Work effectively in teams and show leadership in diverse settings." },
      { n: 6, title: "Technology and Analytics", statement: "Use information technology and data analysis tools to support business decisions." },
      { n: 7, title: "Global and Local Perspective", statement: "Understand the global and Pakistani economic, legal and cultural environment in which businesses operate." },
      { n: 8, title: "Entrepreneurship and Innovation", statement: "Identify opportunities and develop innovative and entrepreneurial solutions." },
    ],
  },
};

export const COUNCIL_KEYS = Object.keys(COUNCIL_SETS) as CouncilKey[];
export const isCouncilKey = (s: string | null | undefined): s is CouncilKey => !!s && s in COUNCIL_SETS;
/** "EGA-3", "CGA-10", "BGA-2". */
export const attrCode = (key: CouncilKey, n: number) => `${COUNCIL_SETS[key].prefix}-${n}`;
