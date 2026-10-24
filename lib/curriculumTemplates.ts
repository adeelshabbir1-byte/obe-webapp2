// Starting points for the Curriculum Builder: the course types (categories) of common council curricula with their
// targets and required courses. PRE-FILLED from general knowledge of the NCEAC 2023 computing curricula and the HEC
// Undergraduate Education Policy 2023 — every template is marked "check against the curriculum document" until a
// Curriculum Builder confirms it. Numbers and names are deliberately easy to change on the Types step.

export type Kind = "GE" | "IDS" | "IDS_LIST" | "CORE" | "SUPPORTING" | "LAB" | "ELECTIVE_SLOT" | "ELECTIVE_LIST" | "CAPSTONE" | "INTERNSHIP" | "NONCREDIT";
export const KINDS: { kind: Kind; label: string; counts: boolean; batchType: string; color: string; help: string }[] = [
  { kind: "GE", label: "General Education", counts: true, batchType: "General Education", color: "#1565C0", help: "English, Islamic Studies, Pakistan Studies, QR, ICT …" },
  { kind: "CORE", label: "Core (compulsory)", counts: true, batchType: "Core", color: "#2E7D32", help: "Compulsory courses of the discipline" },
  { kind: "SUPPORTING", label: "Mathematics & supporting", counts: true, batchType: "Core", color: "#00897B", help: "Compulsory maths / science courses" },
  { kind: "LAB", label: "Lab", counts: true, batchType: "Lab", color: "#558B2F", help: "Labs taught as separate courses" },
  { kind: "IDS", label: "Interdisciplinary", counts: true, batchType: "IDS", color: "#00838F", help: "Interdisciplinary courses or slots" },
  { kind: "ELECTIVE_SLOT", label: "Elective slots", counts: true, batchType: "Elective", color: "#6A1B9A", help: "Places in the scheme (Elective-I, II …) with credit hours" },
  { kind: "CAPSTONE", label: "Capstone / FYP", counts: true, batchType: "Capstone Project", color: "#AD1457", help: "Final year project" },
  { kind: "INTERNSHIP", label: "Internship", counts: true, batchType: "Field Experience", color: "#EF6C00", help: "Field experience" },
  { kind: "ELECTIVE_LIST", label: "Elective list (options)", counts: false, batchType: "Domain Elective", color: "#9575CD", help: "The courses students choose from — not counted" },
  { kind: "IDS_LIST", label: "IDS list (options)", counts: false, batchType: "Domain IDS", color: "#4DB6AC", help: "Interdisciplinary options — not counted" },
  { kind: "NONCREDIT", label: "Non-credit / certification", counts: false, batchType: "Certification", color: "#8D6E63", help: "Required, no credit hours" },
];
export const kindInfo = (k: string | null | undefined) => KINDS.find((x) => x.kind === k) || KINDS[1];

export type TypeTpl = { name: string; kind: Kind; minCourses?: number; minCredits?: number; maxCredits?: number; required?: string[]; note?: string };
export type Template = { key: string; program: string; council: string; version: string; total: [number, number]; types: TypeTpl[]; tracks: string[]; note: string; verified: boolean; source?: string; trackCourses?: Record<string, string[]> };

/** A required course written as "Title 4 (3+1)" / "Title 3": its title, credit hours and theory + lab split. */
export function parseReq(line: string) {
  const m = line.trim().match(/^(.*?)\s+(\d{1,2})(?:\s*\((\d{1,2})\s*\+\s*(\d{1,2})\))?$/);
  if (!m) return { title: line.trim(), ch: null as number | null, theory: null as number | null, lab: null as number | null };
  return { title: m[1].trim(), ch: Number(m[2]), theory: m[3] ? Number(m[3]) : null, lab: m[4] ? Number(m[4]) : null };
}
export const splitText = (ch: number, lab: number | null | undefined) => (lab ? `${ch} (${ch - lab}+${lab})` : `${ch}`);

// ---- NCEAC "BS Curriculum for Computing Disciplines 2023" (HEC / NCEAC), the official document:
// https://nceac.org.pk/Documents/Curriculums/BS%20Curriculm%20Computing%20Disciplines-2023.pdf
// The document writes credit hours as "4 (3-3)": 3 theory credit hours and 3 lab CONTACT hours = 1 lab credit hour.
// Here that is "4 (3+1)" (theory + lab credit hours).
const NCEAC_SRC = "https://nceac.org.pk/Documents/Curriculums/BS%20Curriculm%20Computing%20Disciplines-2023.pdf";
const GE_2023: TypeTpl = { name: "General Education", kind: "GE", minCredits: 30, minCourses: 12, required: [
  "Application of Information and Communication Technologies 3 (2+1)", "Functional English 3", "Expository Writing 3",
  "Quantitative Reasoning I (Discrete Structures) 3", "Quantitative Reasoning II (Calculus and Analytic Geometry) 3", "Islamic Studies 2",
  "Ideology and Constitution of Pakistan 2", "Social Sciences (e.g. Introduction to Management) 2", "Natural Sciences (Applied Physics) 3 (2+1)",
  "Arts and Humanities (Professional Practices) 2", "Civics and Community Engagement 2", "Entrepreneurship 2"] };
const CORE_2023: TypeTpl = { name: "Computing Core", kind: "CORE", minCredits: 46, minCourses: 14, note: "Includes the capstone (FYP-I and FYP-II)", required: [
  "Programming Fundamentals 4 (3+1)", "Object Oriented Programming 4 (3+1)", "Database Systems 4 (3+1)", "Digital Logic Design 3 (2+1)", "Data Structures 4 (3+1)",
  "Information Security 3 (2+1)", "Artificial Intelligence 3 (2+1)", "Computer Networks 3 (2+1)", "Software Engineering 3", "Computer Organization and Assembly Language 3 (2+1)",
  "Operating Systems 3 (2+1)", "Analysis of Algorithms 3", "Final Year Project I 2 (0+2)", "Final Year Project II 4 (0+4)"] };
const MATHS_2023: TypeTpl = { name: "Mathematics & Supporting Courses", kind: "SUPPORTING", minCredits: 12, minCourses: 4, required: ["Multivariable Calculus 3", "Linear Algebra 3", "Probability and Statistics 3", "Technical and Business Writing 3"] };
const ESUP_2023: TypeTpl = { name: "Elective Supporting Courses", kind: "IDS", minCredits: 3, minCourses: 1, note: "One course, e.g. Introduction to Marketing or Financial Accounting" };
const slots = (n: number): TypeTpl => ({ name: "Domain Elective", kind: "ELECTIVE_SLOT", minCredits: n * 3, minCourses: n, note: `${n} elective slots of 3 credit hours` });
const list = (courses: string[]): TypeTpl => ({ name: "Domain Elective list", kind: "ELECTIVE_LIST", required: courses, note: "The courses offered for the elective slots (not counted)" });
const nceac = (code: string, program: string, domainCore: string[], electives: string[]): Template => ({
  key: `NCEAC-BS-${code}-2023`, program, council: "NCEAC", version: "2023", total: [130, 130], tracks: [], verified: true, source: NCEAC_SRC,
  note: "From NCEAC's official BS Curriculum for Computing Disciplines 2023 — 44 courses, 130 credit hours",
  types: [GE_2023, CORE_2023, { name: "Domain Core", kind: "CORE", minCredits: 18, minCourses: 6, required: domainCore }, slots(7), MATHS_2023, ESUP_2023, list(electives)],
});

// The 14 specialisation tracks of the HEC BS CS 2025 curriculum and their electives, as listed in the document
// ("2+1/3+0" there is taken as 2+1). A course listed in several tracks is ONE course shared by those tracks.
export const HEC_CS_2025_TRACKS: Record<string, string[]> = {
 "Software Engineering": [
  "Software Requirement Engineering 3",
  "Software Project Management 3",
  "Software Quality and Testing 3 (2+1)",
  "DevOps Principles and Practices 3 (2+1)",
  "Software Re-Engineering 3 (2+1)",
  "Software Design and Architecture 3",
  "Parallel and Distributed Computing 3 (2+1)",
  "Software Construction and Development 3 (2+1)",
  "Human Computer Interaction 3 (2+1)",
  "Formal Methods and Design 3",
  "Cross-platform Application Development 3",
  "Advanced Topics in Software Engineering 3 (2+1)",
  "Machine Learning 3 (2+1)",
  "Internet of Things and Its Applications 3 (2+1)",
  "Green Software Engineering 3"
 ],
 "Data Science": [
  "Introduction to Data Science 3",
  "Computational Statistics 3",
  "Data Engineering 3",
  "Data Visualization 3",
  "Business Intelligence 3",
  "Tools and Techniques in Data Science 3",
  "Big Data Analytics 3",
  "Machine Learning 3",
  "Deep Learning 3",
  "Natural Language Processing 3",
  "Data Ethics and Security 3",
  "Computer Vision 3",
  "Information Retrieval 3",
  "Generative AI 3",
  "Data Mining 3"
 ],
 "Artificial Intelligence": [
  "Programming for AI 3",
  "Machine Learning 3",
  "Deep Learning 3",
  "Knowledge Representation and Reasoning 3",
  "Generative AI 3",
  "Computer Vision 3",
  "Natural Language Processing 3",
  "Data Mining 3",
  "Reinforcement Learning 3",
  "Optimization Techniques 3",
  "Stochastic Processes 3",
  "Machine Learning Operations (MLOps) 3",
  "Agentic AI 3",
  "Speech Processing 3",
  "Evolutionary Computing and Swarm Intelligence 3"
 ],
 "Cyber Security": [
  "Information Assurance 3",
  "Network Security 3 (2+1)",
  "Secure Software Design and Development 3 (2+1)",
  "Digital Forensics and Incident Response 3 (2+1)",
  "Applied Cryptography 3 (2+1)",
  "Vulnerability Assessment and Penetration Testing 3 (2+1)",
  "Ethics in Cyber Security 3 (2+1)",
  "Cloud Security 3 (2+1)",
  "Embedded Systems Security 3 (2+1)",
  "Cyber Threat Intelligence 3 (2+1)",
  "Artificial Intelligence for Cyber Security 3 (2+1)",
  "IoT Security 3 (2+1)",
  "Open-Source Intelligence Techniques 3 (2+1)",
  "Usable Security and Privacy 3 (2+1)",
  "Malware Analysis and Reverse Engineering 3 (2+1)",
  "Security Orchestration, Automation and Response 3 (2+1)",
  "Cyber Security Policy and Governance 3",
  "Security Analytics and DevSecOps 3 (2+1)",
  "Quantum Security 3 (2+1)",
  "Blockchain and Web 3 Security 3 (2+1)",
  "Wireless and Mobile Security 3 (2+1)"
 ],
 "Information Technology": [
  "Web Technologies 3 (2+1)",
  "Cyber Security 3 (2+1)",
  "Database Administration and Management 3 (2+1)",
  "System and Network Administration 3 (2+1)",
  "Information Technology Infrastructure 3 (2+1)",
  "Network Security 3 (2+1)",
  "Data Communication 3 (2+1)",
  "Wireless and Mobile Networks 3 (2+1)",
  "Cloud Infrastructure and Services 3 (2+1)",
  "Email Systems and Server Management 3 (2+1)",
  "Ethical Hacking and Penetration Testing 3 (2+1)",
  "Security Policies and Compliance 3",
  "IT Project Management 3",
  "Systems Analysis and Design 3",
  "Technology Lifecycle Planning 3"
 ],
 "Computer Engineering": [
  "Linear Circuit Analysis 3",
  "Electrical Network Analysis 3",
  "Electronic Devices and Circuits 3",
  "Signals and Systems 3",
  "Control Engineering 3",
  "Digital System Design 3",
  "Digital Image Processing 3",
  "Parallel and Distributed Computing 3",
  "Parallel Computer Architecture 3",
  "Computer Interfacing 3",
  "HCI and Computer Graphics 3",
  "Embedded Systems 3",
  "Deep Learning 3",
  "Microprocessor and Microcontroller based Design 3"
 ],
 "Computer Games Development": [
  "Game Design Principles 3 (2+1)",
  "Graphic Design and Illustration Art 3 (2+1)",
  "Game Programming 3 (2+1)",
  "Game Engine Architecture 3 (2+1)",
  "3D Design and Modelling 3 (2+1)",
  "3D Animation and Visual Effects Production 3 (2+1)",
  "UI/UX Design and Development 3 (2+1)",
  "Story Boarding and Narrative Development 3 (2+1)",
  "Virtual and Augmented Reality for Games 3 (2+1)",
  "Simulation and Digital Twins in Games 3 (2+1)",
  "Web3 Gaming 3 (2+1)",
  "Sound Design for Games 3 (2+1)",
  "LiveOps and Monetization for Games 3 (2+1)",
  "Game Design Research Methods 3 (2+1)",
  "Game Testing 3 (2+1)"
 ],
 "Multimedia and Animation": [
  "Fundamentals of Drawing 3 (2+1)",
  "Graphic Design and Illustration Art 3 (2+1)",
  "Animation Programming 3 (2+1)",
  "2D and 3D Animation Principles 3 (2+1)",
  "3D Design and Modelling 3 (2+1)",
  "3D Animation and Visual Effects Production 3 (2+1)",
  "Character Design and Rigging 3 (2+1)",
  "UI/UX Design and Development 3 (2+1)",
  "Story Boarding and Narrative Development 3 (2+1)",
  "Virtual Production and Immersive Media 3 (2+1)",
  "Digital Film Production and Cinematography 3 (2+1)",
  "Sound Design and Foley Production 3 (2+1)",
  "Motion Graphics and Title Design 3 (2+1)",
  "Digital Media Marketing and Monetization 3 (2+1)",
  "Media Testing, Quality and Post-Production 3 (2+1)"
 ],
 "Robotics": [
  "Introduction to Robotics 3",
  "Electric Circuits 3",
  "Basics of Electronics and Components 3",
  "Instrumentation and Measurement 3",
  "Signals and Systems 3",
  "Digital Signal Processing 3",
  "Linear Control Systems 3",
  "Robot Mechanics I (Statics) 3",
  "Robot Mechanics II (Dynamics) 3",
  "Actuators 3",
  "Introduction to Embedded Systems 3",
  "Machine Learning 3",
  "3D Machine Vision 3",
  "Localization and Mapping 3",
  "Aerial Drones 3",
  "Navigation and Mobile Platforms 3",
  "Speech Recognition and Speech Synthesis 3",
  "Human Robot Interaction 3"
 ],
 "Human Computer Interaction": [
  "Human Computer Interaction 3",
  "User-Centered Design and Prototyping 3",
  "Design Thinking and Innovation 3",
  "Usability Engineering 3",
  "Rapid Application Design 3",
  "Cognitive Psychology for Interface Design 3",
  "Accessibility and Inclusive Design 3",
  "Social Computing and Online Communities 3",
  "Visual Design and Information Architecture 3",
  "HCI in Business and Enterprise Systems 3",
  "HCI in Healthcare Systems 3",
  "HCI in Education and Learning Technologies 3",
  "Multimedia Application Design 3",
  "Game Design and Interactive Environments 3",
  "Conversational Interfaces and Intelligent Agents 3",
  "HCI and Cognitive Models in AI Systems 3",
  "Capstone Project in Human-Centered Design 3 (1+2)"
 ],
 "Internet of Things": [
  "Microcontroller Architecture and System Design 4 (3+1)",
  "Embedded Programming 4 (3+1)",
  "Sensors, Transducers and Interfacing 3 (2+1)",
  "Real-Time Operating Systems 3 (2+1)",
  "IoT Communication and Networks 3 (2+1)",
  "IoT Application Layer Protocol 3",
  "Edge AI 3",
  "Machine Learning 3",
  "IoT Cloud 3",
  "Industrial IoT 3",
  "Generative AI 3",
  "IoT Data Analytics and Visualization 3 (2+1)",
  "IoT Security 3",
  "Wireless and 5G for IoT 3",
  "Emerging Applications of IoT 3 (2+1)"
 ],
 "Network Infrastructure and Cloud Computing": [
  "DevOps 3 (2+1)",
  "DevSecOps 3 (2+1)",
  "Machine Learning Operations (MLOps) 3 (2+1)",
  "Cloud Design and Implementation 3 (2+1)",
  "Network Management 3 (2+1)",
  "Internetworking 3 (2+1)",
  "Machine Learning 3 (2+1)",
  "Network Security 3 (2+1)",
  "Software Defined Networks 3 (2+1)",
  "Wireless and Mobile Networks 3 (2+1)",
  "Enterprise Network Infrastructure Engineering Design 3 (2+1)",
  "Network Programmability and Automation 3 (2+1)",
  "Next-Generation Networks and Edge Computing 3",
  "Cloud-Native Application Development 3 (2+1)",
  "Infrastructure as Code 3",
  "Microservices Architecture and Docker Containers 3",
  "Network Automation and Orchestration 3 (2+1)",
  "Cloud Load Balancing 3 (2+1)",
  "Network Performance 3 (2+1)",
  "System Programming 3"
 ],
 "Quantum Computing": [
  "Mathematical Foundations for Quantum Computing 3",
  "Quantum Physics for Computer Scientists 3",
  "Introduction to Quantum Computing 3",
  "Quantum Circuits and Gates 3",
  "Quantum Programming and Simulation 3",
  "Quantum Algorithms 3",
  "Quantum Information Processing 3",
  "Quantum Error Correction and Fault Tolerance 3",
  "Quantum Cryptography and Security 3",
  "Post Quantum Cryptography 3",
  "Quantum Hardware and Emerging Technologies 3",
  "Quantum Machine Learning 3",
  "Quantum Networking 3",
  "Quantum Internet 3",
  "Advanced Quantum Applications 3"
 ],
 "Health Informatics": [
  "Introduction to Health Informatics and Public Health 3",
  "Statistics for Health Informatics 3",
  "Natural Language Processing in Healthcare 3 (2+1)",
  "Health Data Modalities and Visualization 3 (2+1)",
  "Big Data Analytics in Healthcare 3",
  "Machine Learning for Healthcare 3 (2+1)",
  "Health Data Standards and Interoperability 3",
  "Information Security and Privacy 3",
  "Health Data Governance and Ethics 3",
  "Blockchain and Secure Health Data Exchange 3",
  "Health Information Systems and Electronic Health Records 3 (2+1)",
  "Project Management for Healthcare 3 (2+1)",
  "Telehealth Systems and Remote Monitoring 3",
  "Predictive Analytics and Decision Support Systems 3 (2+1)",
  "Genomic Data Science and Precision Medicine 3",
  "Leadership and Innovation in Health Informatics 3",
  "Data Management in Healthcare 4 (3+1)"
 ]
};

export const TEMPLATES: Template[] = [
  nceac("CS", "BS Computer Science",
    ["Theory of Automata 3", "Advanced Database Management Systems 3 (2+1)", "HCI and Computer Graphics 3 (2+1)", "Computer Architecture 3 (2+1)", "Compiler Construction 3 (2+1)", "Parallel and Distributed Computing 3 (2+1)"],
    ["Web Technologies 3 (2+1)", "Mobile Application Development I 3 (2+1)", "Advanced Programming 3 (2+1)", "Numerical Analysis 3 (2+1)", "Web Engineering 3 (2+1)", "Cyber Security 3 (2+1)", "Software Testing and Quality Assurance 3 (2+1)", "Mobile Application Development II 3 (2+1)", "Cloud Computing 3 (2+1)", "Computer Graphics 3 (2+1)", "Object Oriented Analysis and Design 3 (2+1)"]),
  nceac("SE", "BS Software Engineering",
    ["Software Design and Architecture 3", "Software Construction and Development 3 (2+1)", "Software Project Management 3 (2+1)", "Software Quality Engineering 3 (2+1)", "Software Requirement Engineering 3 (2+1)", "Parallel and Distributed Computing 3 (2+1)"],
    ["Software Verification and Validation 3 (2+1)", "Object Oriented Analysis and Design 3 (2+1)", "Computer Architecture 3 (2+1)", "Theory of Automata 3", "HCI and Computer Graphics 3 (2+1)", "Web Technologies 3 (2+1)", "Advanced Database Management 3", "Web Engineering 3 (2+1)", "Data Science 3 (2+1)", "Software Re-Engineering 3 (2+1)", "Mobile Application Development I 3 (2+1)"]),
  nceac("AI", "BS Artificial Intelligence",
    ["Programming for Artificial Intelligence 3 (2+1)", "Machine Learning 3 (2+1)", "Artificial Neural Networks and Deep Learning 3 (2+1)", "Knowledge Representation and Reasoning 3 (2+1)", "Computer Vision 3 (2+1)", "Parallel and Distributed Computing 3 (2+1)"],
    ["Natural Language Processing 3 (2+1)", "Speech Processing 3 (2+1)", "Data Mining 3 (2+1)", "Advanced Statistics 3 (2+1)", "Reinforcement Learning 3 (2+1)", "Theory of Automata 3", "HCI and Computer Graphics 3 (2+1)", "Fuzzy Systems 3 (2+1)", "Swarm Intelligence 3 (2+1)", "Agent Based Modeling 3 (2+1)", "Knowledge Based Systems 3 (2+1)"]),
  nceac("DS", "BS Data Science",
    ["Introduction to Data Science 3 (2+1)", "Advanced Statistics 3 (2+1)", "Data Mining 3 (2+1)", "Data Visualization 3 (2+1)", "Data Warehousing and Business Intelligence 3 (2+1)", "Parallel and Distributed Computing 3 (2+1)"],
    ["Advanced Database Management Systems 3 (2+1)", "Big Data Analytics 3 (2+1)", "Machine Learning 3 (2+1)", "Artificial Neural Networks and Deep Learning 3 (2+1)", "Business Process Analysis 3 (2+1)", "Theory of Automata 3 (2+1)", "HCI and Computer Graphics 3 (2+1)", "Platforms and Architectures for Data Science 3 (2+1)", "Text Mining 3 (2+1)", "Topics in Data Science 3 (2+1)", "Speech Processing 3 (2+1)"]),
  nceac("CYS", "BS Cyber Security",
    ["Cyber Security 3 (2+1)", "Information Assurance 3 (2+1)", "Network Security 3 (2+1)", "Secure Software Design and Development 3 (2+1)", "Digital Forensics 3 (2+1)", "Parallel and Distributed Computing 3 (2+1)"],
    ["Vulnerability Assessment and Reverse Engineering 3 (2+1)", "Basic Electronics 3 (2+1)", "Hardware Security 3 (2+1)", "Malware Analysis 3 (2+1)", "Wireless and Mobile Security 3 (2+1)", "Theory of Automata 3", "HCI and Computer Graphics 3 (2+1)", "Penetration Testing 3 (2+1)", "Computer Architecture 3 (2+1)", "Advanced Digital Logic Design 3 (2+1)", "Embedded Systems 3 (2+1)", "Cyber Law and Cyber Crime 3 (2+1)", "Control System Security 3 (2+1)"]),
  // HEC Revised Curriculum of Computer Science 2025 (applies from Spring 2026; aligned with the HEC UG Policy v1.1):
  // https://www.hec.gov.pk/english/services/universities/RevisedCurricula/Documents/2025-2026/COMPUTER-SCIENCE.pdf
  { key: "HEC-BS-CS-2025", program: "BS Computer Science", council: "HEC", version: "2025", total: [130, 130], verified: true,
    source: "https://www.hec.gov.pk/english/services/universities/RevisedCurricula/Documents/2025-2026/COMPUTER-SCIENCE.pdf",
    note: "From HEC's official Revised Curriculum of Computer Science 2025 (from Spring 2026) — 130 CH, 14 specialisation tracks with their electives",
    tracks: Object.keys(HEC_CS_2025_TRACKS), trackCourses: HEC_CS_2025_TRACKS,
    types: [
      { name: "General Education", kind: "GE", minCredits: 34, minCourses: 15, note: "The document counts Fehm-e-Quran I and II as one course (14)", required: ["Arts and Humanities 2", "Natural Sciences 3 (2+1)", "Social Sciences 2", "Functional English 3", "Expository Writing 3", "Quantitative Reasoning I 3", "Quantitative Reasoning II 3", "Islamic Studies 2", "Ideology and Constitution of Pakistan 2", "Application of Information and Communication Technologies 3 (2+1)", "Entrepreneurship 2", "Civics and Community Engagement 2", "Pakistan Studies 2", "Fehm-e-Quran I 1", "Fehm-e-Quran II 1"] },
      { name: "Computer Science Core", kind: "CORE", minCredits: 48, minCourses: 14, required: ["Programming Fundamentals 4 (3+1)", "Object Oriented Programming 4 (3+1)", "Database Systems 4 (3+1)", "Digital Logic Design 4 (3+1)", "Data Structures 4 (3+1)", "Information Security 3 (2+1)", "Artificial Intelligence 3 (2+1)", "Computer Networks 3 (2+1)", "Software Engineering 3", "Computer Organization and Architecture 3 (2+1)", "Operating Systems 4 (3+1)", "Design and Analysis of Algorithms 3", "Theory of Automata 3", "Cloud Computing 3 (2+1)"] },
      { name: "Interdisciplinary / Allied", kind: "IDS", minCredits: 12, minCourses: 4, required: ["Calculus and Analytical Geometry 3", "Linear Algebra 3"], note: "Calculus and Linear Algebra are compulsory; two more from the IDS list" },
      { name: "Specialization Electives", kind: "ELECTIVE_SLOT", minCredits: 24, minCourses: 8, note: "8 electives of 3 CH from one specialisation track" },
      { name: "Professional Certification", kind: "CORE", minCredits: 3, minCourses: 1, required: ["Professional Certification 3"] },
      { name: "Field Experience / Internship", kind: "INTERNSHIP", minCredits: 3, minCourses: 1, required: ["Field Experience 3"] },
      { name: "Capstone Project", kind: "CAPSTONE", minCredits: 6, minCourses: 1, required: ["Final Year Project 6 (0+6)"] },
      { name: "IDS list", kind: "IDS_LIST", required: ["Discrete Structures 3", "Probability and Statistics 3", "Economics 3", "Organizational Behavior 3", "Media and Information Literacy 3", "E-Governance and ICT Policy 3", "Environmental Science 3", "Professional Practice 3", "Digital Marketing and E-Commerce 3", "Technology Management 3", "Financial Technology (FinTech) Fundamentals 3", "Geographic Information Systems and Spatial Data 3", "Bioinformatics 3", "Smart Cities and Urban Informatics 3", "Cyber Law and Digital Policy 3", "Technology and Sustainable Development 3"], note: "Options for the IDS slots (not counted)" },
      { name: "Specialization Elective list", kind: "ELECTIVE_LIST", note: "The electives of the 14 tracks; a course shared by tracks is listed once" },
    ] },
  { ...nceac("IT", "BS Information Technology", [], []), verified: false, note: "Common parts from the NCEAC 2023 document; the IT Domain Core and electives are NOT filled — enter them from section 4.9 of the document" },
  { key: "HEC-UG-2023", program: "Any undergraduate program", council: "HEC", version: "UG Policy 2023", total: [120, 144], tracks: [], verified: false, note: "HEC Undergraduate Education Policy baseline — adapt names and numbers to the discipline",
    types: [GE_2023, { name: "Major Core", kind: "CORE", minCredits: 72 }, { name: "Interdisciplinary", kind: "IDS", minCredits: 12 }, slots(4), { name: "Capstone Project", kind: "CAPSTONE", minCredits: 3 }, { name: "Internship", kind: "INTERNSHIP", minCredits: 3, minCourses: 1 }, list([])] },
  { key: "NBEAC-BBA", program: "BBA (Hons)", council: "NBEAC", version: "draft", total: [130, 136], tracks: ["Finance", "Marketing", "Human Resource Management", "Supply Chain", "Business Analytics"], verified: false, note: "NOT from an official document — an outline to adapt; enter NBEAC's requirements",
    types: [GE_2023, { name: "Business Core", kind: "CORE", minCredits: 60 }, { name: "Interdisciplinary", kind: "IDS", minCredits: 12 }, slots(6), { name: "Capstone Project", kind: "CAPSTONE", minCredits: 3 }, { name: "Internship", kind: "INTERNSHIP", minCredits: 3 }, list([])] },
];

// Words that put a course into a type when its title gives no exact match.
const HINTS: [RegExp, Kind][] = [
  [/english|writing|islam|ethics|pakistan|constitution|quantitative reasoning|civics|ict\b|information and communication|entrepreneur|arts|humanit|social science|natural science|psycholog|sociolog|quran/i, "GE"],
  [/calculus|linear algebra|probability|statistic|discrete|differential equation|numerical|physics|mathemat/i, "SUPPORTING"],
  [/final year project|fyp|capstone/i, "CAPSTONE"], [/internship|field experience/i, "INTERNSHIP"], [/\blab\b|laboratory/i, "LAB"],
  [/elective[- ]?(i|ii|iii|iv|v|vi|vii|viii|\d+)\b/i, "ELECTIVE_SLOT"],
];
export const normTitle = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/\b(i{1,3}|iv|v)\b$/i, (m) => m).replace(/[^a-z0-9]+/g, " ").trim();
/** Which type a course goes to: an exact required-course match first, then its old category, then title hints. */
export function autoPlace(course: { title: string; category: string }, types: { name: string; kind: string; required: string[] }[]) {
  const t = normTitle(course.title);
  const rt = (r: string) => normTitle(parseReq(r).title);
  const exact = types.find((ty) => ty.required.some((r) => rt(r) === t || normTitle(parseReq(r).title.replace(/\s*\(.*?\)\s*/g, " ")) === t || (/\((.*?)\)/.exec(parseReq(r).title)?.[1] && normTitle(/\((.*?)\)/.exec(parseReq(r).title)![1].replace(/^e\.?g\.?\s*/i, "")) === t)));
  if (exact) return exact.name;
  const old = course.category.toLowerCase();
  const byKind = (k: Kind) => types.find((ty) => ty.kind === k)?.name;
  if (old === "domain elective") return byKind("ELECTIVE_LIST") || byKind("ELECTIVE_SLOT");
  if (old === "domain ids") return byKind("IDS_LIST") || byKind("IDS");
  if (old === "elective") return byKind("ELECTIVE_SLOT");
  if (old === "general education") return byKind("GE");
  if (old === "ids") return byKind("IDS");
  if (old === "capstone project") return byKind("CAPSTONE");
  if (old === "field experience") return byKind("INTERNSHIP");
  for (const [re, k] of HINTS) if (re.test(course.title)) { const n = byKind(k); if (n) return n; }
  const near = types.find((ty) => ty.required.some((r) => { const a = rt(r); return a.length > 6 && (t.includes(a) || a.includes(t)); }));
  if (near) return near.name;
  return types.find((ty) => ty.kind === "CORE")?.name || null;
}

/** Is a required course (written "Title 3 (2+1)", maybe "QR I (Discrete Structures)") among these titles? */
export function reqPresent(req: string, titles: string[]) {
  const t = parseReq(req).title;
  const keys = [normTitle(t), normTitle(t.replace(/\s*\(.*?\)\s*/g, " ")), ...(/\((.*?)\)/.exec(t) ? [normTitle(/\((.*?)\)/.exec(t)![1].replace(/^e\.?\s*g\.?\s*/i, ""))] : [])].filter(Boolean);
  return titles.some((x) => { const a = normTitle(x); return keys.some((q) => a === q || (q.length > 6 && a.length > 6 && (a.includes(q) || q.includes(a)))); });
}


// NCEAC 2025: NCEAC accredits BS CS against HEC's Revised Curriculum of Computer Science 2025 — the document was
// notified to the NCEAC Chairman (No. HEC/NCRC/CS&IT/2025/8163). Same structure and content, NCEAC as the council.
// NCEAC's own "Curriculum 2025 Notification" (nceac.org.pk) could not be read here; confirm nothing differs.
const HEC25 = TEMPLATES.find((t) => t.key === "HEC-BS-CS-2025")!;
TEMPLATES.push({ ...HEC25, key: "NCEAC-BS-CS-2025", council: "NCEAC", note: "NCEAC accredits against HEC's Revised Curriculum of Computer Science 2025 (No. HEC/NCRC/CS&IT/2025/8163) — 130 CH, 14 tracks" });

// University of the Punjab — BS Computer Science for affiliated colleges, v1.0.0 (01-12-2021), 131 CH.
// From its Scheme of Studies (lib/puBscs2021.ts holds the outlines and the HEC 2025 / NCEAC 2023 equivalents).
TEMPLATES.push({ key: "PU-BSCS-2021", program: "BS Computer Science", council: "PU", version: "2021", total: [131, 131], verified: true,
    note: "University of the Punjab — BS CS for affiliated colleges (v1.0.0, Dec 2021), 131 CH, with codes, semesters and outlines",
    tracks: [],
    types: [
      { name: "Computing Core", kind: "CORE", minCourses: 11, minCredits: 39, required: ["Discrete Structures 3", "Programming Fundamentals 4 (3+1)", "Object Oriented Programming 4 (3+1)", "Software Engineering 3", "Data Structures and Algorithms 4 (3+1)", "Operating Systems 4 (3+1)", "Database Systems 4 (3+1)", "Computer Networks 4 (3+1)", "Final Year Project - I 3 (0+3)", "Final Year Project - II 3 (0+3)", "Information Security 3"] },
      { name: "Domain Core", kind: "CORE", minCourses: 7, minCredits: 24, required: ["Digital Logic Design 4 (3+1)", "Computer Organization and Assembly Language 4 (3+1)", "Theory of Automata 3", "Design and Analysis of Algorithms 3", "Compiler Construction 3", "Parallel and Distributed Computing 3", "Artificial Intelligence 4 (3+1)"] },
      { name: "Math and Science Foundation", kind: "SUPPORTING", minCourses: 4, minCredits: 12, required: ["Probability and Statistics 3", "Applied Physics 3", "Linear Algebra 3", "Calculus and Analytical Geometry 3"] },
      { name: "General Education", kind: "GE", minCourses: 7, minCredits: 19, required: ["Introduction to Information and Communication Technologies 3 (2+1)", "English Composition and Comprehension 3", "Islamic Studies 2", "Communication and Presentation Skills 3", "Pakistan Studies 2", "Professional Practices 3", "Technical and Business Writing 3"] },
      { name: "CS Electives", kind: "ELECTIVE_SLOT", minCourses: 5, minCredits: 16, required: ["Web Technologies 4 (3+1)", "Enterprise Application Development 3", "Mobile Application Development 3", "Software Project Management 3", "Software Quality Assurance 3"] },
      { name: "CS Supporting", kind: "SUPPORTING", minCourses: 3, minCredits: 9, required: ["Multivariate Calculus 3", "Numerical Computing 3", "Theory of Programming Languages 3"] },
      { name: "University Electives", kind: "IDS", minCourses: 5, minCredits: 12, required: ["Introduction to Economics 3", "Introduction to Psychology 3", "Principles of Management 3", "Arabic Language 2", "Social Service 1"] },
      { name: "Math Deficiency", kind: "NONCREDIT", minCourses: 2, required: ["Math Deficiency - I 3", "Math Deficiency - II 3"] },
    ] });
