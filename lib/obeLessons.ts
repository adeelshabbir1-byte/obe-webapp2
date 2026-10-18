// "OBE Basics" for faculty: five short lessons, each with a quiz. Pass = 4 of 5 correct.
export type Q = { prompt: string; options: string[]; answer: number; why: string };
export type Lesson = { key: string; title: string; minutes: number; body: string[]; quiz: Q[] };

export const LESSONS: Lesson[] = [
  { key: "what-is-obe", title: "1. What OBE is", minutes: 4, body: [
    "Outcome-Based Education (OBE) starts from the question: what should a student be able to DO at the end? Courses, teaching and assessment are then planned backwards from those outcomes.",
    "Traditional teaching asks \"did I cover the syllabus?\". OBE asks \"can the students now do what the course promised — and how do we know?\".",
    "Every outcome must be measurable: it is tested by quizzes, assignments, projects or exam questions, and the results are collected as attainment.",
    "When attainment is low, the teacher and the OMC act on it (CQI — Continuous Quality Improvement), and the next offering improves. Accreditation bodies (NCEAC, NBEAC, PEC) check that this loop really runs.",
  ], quiz: [
    { prompt: "What does OBE start from?", options: ["The textbook's chapters", "What students should be able to do at the end", "The number of lectures available", "Last year's exam paper"], answer: 1, why: "OBE plans backwards from the outcomes students must achieve." },
    { prompt: "Which outcome is measurable?", options: ["Students will appreciate databases", "Students will know SQL", "Students will write SQL queries with joins to answer given questions", "Students will be exposed to SQL"], answer: 2, why: "It names an observable action that can be tested." },
    { prompt: "What is CQI?", options: ["A grading scale", "Acting on low attainment so the next offering improves", "A type of quiz", "The course file"], answer: 1, why: "Continuous Quality Improvement closes the loop." },
    { prompt: "Who checks that the OBE loop really runs?", options: ["Only the instructor", "Accreditation bodies such as NCEAC / NBEAC", "Students", "Nobody"], answer: 1, why: "Accreditation visits look for evidence of the full loop." },
    { prompt: "\"Did I cover the syllabus?\" is the question of…", options: ["OBE", "Traditional, content-based teaching", "CQI", "Bloom's taxonomy"], answer: 1, why: "OBE asks what students can do, not what was covered." },
  ] },
  { key: "peo-plo-clo", title: "2. PEO → GA → CLO", minutes: 5, body: [
    "PEOs (Program Educational Objectives) describe what graduates achieve a few years after graduating — e.g. \"working successfully as computing professionals\".",
    "GAs (Graduate Attributes) describe what every student can do at graduation — about 10 to 12 per program, e.g. \"design computing solutions\". In NCEAC language these are graduate attributes.",
    "CLOs (Course Learning Outcomes) describe what a student can do at the end of one course — usually 3 to 5 per course. Each CLO is mapped to the GA it builds.",
    "The chain: assessments measure CLOs → CLOs add up to GAs across courses → GAs support PEOs. The Outcome Flow page in this app shows the chain for your program.",
  ], quiz: [
    { prompt: "Which level describes what a student can do at the end of ONE course?", options: ["PEO", "PLO", "CLO", "KPI"], answer: 2, why: "CLO = Course Learning Outcome." },
    { prompt: "PEOs describe…", options: ["What graduates achieve a few years after graduation", "The marks of a quiz", "One lecture's topic", "The textbook"], answer: 0, why: "PEOs are long-term objectives of the program." },
    { prompt: "How many CLOs does a course usually have?", options: ["1", "3 to 5", "10 to 12", "One per lecture"], answer: 1, why: "A few focused outcomes keep a course measurable." },
    { prompt: "What does a CLO map to?", options: ["A PEO directly", "The GA it builds", "A student", "A room"], answer: 1, why: "CLOs build GAs; GAs support PEOs." },
    { prompt: "Which page shows the whole chain in this app?", options: ["Deadlines", "Outcome Flow", "Timetable", "Profile"], answer: 1, why: "Outcome Flow goes assessments → CLOs → courses → GAs → PEOs." },
  ] },
  { key: "plos", title: "3. The GAs, one by one", minutes: 6, body: [
    "GA-2 Knowledge: apply known computing/maths knowledge to solve a problem (apply, solve). GA-3 Analysis: analyse an open problem, find requirements (analyse, examine). GA-4 Design: create a solution that meets needs (design, develop).",
    "GA-5 Modern Tool Usage: skill with tools (use Git, configure a network). GA-6 Team Work and GA-7 Communication are often confused: how the team shared the work is GA-6; the report or presentation is GA-7.",
    "GA-8 Professionalism and Society looks at computing's impact on people and law; GA-9 Ethics applies codes of conduct; GA-10 Life-long Learning is learning something new on your own.",
    "Rule of thumb: look at the VERB of the CLO and at what is assessed. \"Design a database\" is GA-4 even in a theory course; \"explain normal forms\" is GA-2 knowledge, not design.",
  ], quiz: [
    { prompt: "\"Design a normalised database for a hospital case\" maps best to…", options: ["GA-2 Knowledge", "GA-3 Analysis", "GA-4 Design", "GA-7 Communication"], answer: 2, why: "The verb is design and the result is a solution." },
    { prompt: "\"Analyse the time complexity of recursive algorithms\" maps best to…", options: ["GA-3 Problem Analysis", "GA-5 Tools", "GA-6 Team Work", "GA-10 Life-long Learning"], answer: 0, why: "Analysing is GA-3." },
    { prompt: "A group presentation is marked on slides and delivery. Which GA?", options: ["GA-6 Team Work", "GA-7 Communication", "GA-9 Ethics", "PLO-1"], answer: 1, why: "Slides and delivery assess communication; the division of work would be team work." },
    { prompt: "\"Use Git for version control in a team project\" is mainly…", options: ["GA-5 Modern Tool Usage", "GA-8 Society", "GA-3 Analysis", "GA-4 Design"], answer: 0, why: "The focus is the tool." },
    { prompt: "\"Apply the ACM code of ethics to a privacy case\" maps to…", options: ["GA-8 Professionalism and Society", "GA-9 Ethics", "GA-2 Knowledge", "GA-6 Team Work"], answer: 1, why: "Applying a code of conduct is ethics; GA-8 is about wider impact." },
  ] },
  { key: "bloom", title: "4. Bloom levels and verbs", minutes: 4, body: [
    "Bloom's taxonomy orders thinking from simple to complex: C1 Remember, C2 Understand, C3 Apply, C4 Analyse, C5 Evaluate, C6 Create. Psychomotor (P) and affective (A) domains cover skills and attitudes.",
    "The verb of a CLO sets its level: \"list\" is C1, \"explain\" C2, \"solve\" C3, \"compare\" C4, \"justify\" C5, \"design\" C6.",
    "Early-semester courses have more C1–C3 CLOs; final-year courses and projects reach C4–C6. A CLO and the questions that test it must be at the same level — a C5 CLO cannot be tested by a definition question.",
    "Avoid unmeasurable verbs: know, understand, learn, appreciate, be familiar with.",
  ], quiz: [
    { prompt: "\"Justify the choice of a sorting algorithm for a dataset\" is level…", options: ["C1", "C3", "C5", "P1"], answer: 2, why: "Justify = evaluate (C5)." },
    { prompt: "Which verb should NOT be used in a CLO?", options: ["Compare", "Understand", "Design", "Solve"], answer: 1, why: "\"Understand\" cannot be observed or measured directly." },
    { prompt: "A C6 CLO is best tested by…", options: ["A one-word definition", "A design/creation task", "A true/false quiz", "Attendance"], answer: 1, why: "Creation must be shown by creating something." },
    { prompt: "\"List the layers of the OSI model\" is…", options: ["C1 Remember", "C4 Analyse", "C6 Create", "A3"], answer: 0, why: "Listing is recall." },
    { prompt: "Final-year courses usually reach…", options: ["Only C1", "C4–C6", "No Bloom level", "Only P levels"], answer: 1, why: "Higher semesters target higher-order thinking." },
  ] },
  { key: "attainment", title: "5. Assessment, attainment and CQI", minutes: 5, body: [
    "Each assessment item (quiz, assignment, exam question) is linked to the lecture topics it tests, and through them to one CLO.",
    "A student attains a CLO when their marks on that CLO's items reach the pass mark set by the OMC (often 50%). CLO attainment = share of students who attained it; the course target is usually 60%.",
    "GA attainment combines the CLOs that map to the GA, across all courses of the batch, using the weights the OMC sets.",
    "When a CLO is below target, write a CQI action: what you will change (extra problem sessions, new examples, a different assessment) and check the result next time. Record it in CQI so accreditation can see the loop.",
  ], quiz: [
    { prompt: "How is an exam question linked to a CLO in this app?", options: ["Through the lecture topics it tests", "By the student's roll number", "It is not linked", "Through the timetable"], answer: 0, why: "Items link to topics, topics belong to CLOs." },
    { prompt: "CLO attainment of 48% with a target of 60% means…", options: ["The course passed", "Fewer students than targeted achieved the CLO — plan a CQI action", "The exam was too easy", "Nothing"], answer: 1, why: "Below target → CQI." },
    { prompt: "GA attainment is computed from…", options: ["One quiz", "The CLOs mapped to it across the batch's courses", "Attendance", "The final exam only"], answer: 1, why: "Every course that serves the GA contributes." },
    { prompt: "A good CQI action is…", options: ["\"Students should work harder\"", "\"Add two problem-solving sessions on recursion and a revision quiz before the final\"", "\"Lower the target\"", "\"Remove the CLO\""], answer: 1, why: "Concrete, actionable and checkable next time." },
    { prompt: "Who sets the pass mark for a CLO?", options: ["Each student", "The OMC (passing criteria)", "The timetable", "Nobody"], answer: 1, why: "Passing criteria are an OMC policy." },
  ] },
];
