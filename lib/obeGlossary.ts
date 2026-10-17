// Plain-language guide to the standard NCEAC/HEC computing PLOs (graduate attributes). Programs may word their PLOs
// differently — the app always shows the program's own statement next to this guide.
export type PloGuide = { n: number; title: string; meaning: string; bloom: string; verbs: string[]; good: string[]; notThis: string };

export const PLO_GUIDE: PloGuide[] = [
  { n: 1, title: "Academic Education", meaning: "Completing the degree with the breadth of knowledge expected of a computing graduate — the overall education, not one skill.", bloom: "C1–C2", verbs: ["describe", "explain", "outline"],
    good: ["Explain the role of computing disciplines and their core areas."], notThis: "Not the same as PLO-2: PLO-1 is about the whole education; PLO-2 is about using specific knowledge to solve problems." },
  { n: 2, title: "Knowledge for Solving Computing Problems", meaning: "Applying knowledge of computing fundamentals, mathematics and the domain to solve problems.", bloom: "C2–C3", verbs: ["apply", "compute", "solve", "use"],
    good: ["Apply graph algorithms to find shortest paths in a network.", "Use Boolean algebra to simplify logic expressions."], notThis: "Not PLO-3: PLO-2 applies known knowledge to a given problem; PLO-3 is about analysing an open problem to find its requirements." },
  { n: 3, title: "Problem Analysis", meaning: "Identifying, formulating and analysing complex computing problems, reaching conclusions from first principles.", bloom: "C4", verbs: ["analyse", "compare", "identify requirements", "examine"],
    good: ["Analyse the time complexity of recursive algorithms.", "Identify functional and non-functional requirements of a case system."], notThis: "Not PLO-4: analysis understands the problem; design creates the solution." },
  { n: 4, title: "Design / Development of Solutions", meaning: "Designing and building systems, components or processes that meet specified needs, with attention to constraints.", bloom: "C5–C6", verbs: ["design", "develop", "construct", "implement"],
    good: ["Design a normalised relational database for a business case.", "Develop a mobile app that meets given usability requirements."], notThis: "Not PLO-5: PLO-4 is about the solution; PLO-5 is about skill with the tools used to build it." },
  { n: 5, title: "Modern Tool Usage", meaning: "Selecting and using modern computing tools, techniques and resources, understanding their limits.", bloom: "P3–P4 / C3", verbs: ["use", "operate", "configure", "simulate"],
    good: ["Use Git for version control in a team project.", "Configure and simulate a network in Packet Tracer."], notThis: "Not PLO-2: the focus is the tool or technique itself, not the underlying theory." },
  { n: 6, title: "Individual and Team Work", meaning: "Working effectively as an individual and as a member or leader of diverse teams.", bloom: "A2–A3", verbs: ["collaborate", "contribute", "lead", "coordinate"],
    good: ["Contribute effectively as a team member in a semester project, with documented roles."], notThis: "Not PLO-7: team work is about working together; communication is about presenting and writing." },
  { n: 7, title: "Communication", meaning: "Communicating effectively with the computing community and society: reports, documentation, presentations.", bloom: "A2–A3", verbs: ["present", "write", "document", "communicate"],
    good: ["Present the project design to a technical audience.", "Write a technical report following standard structure."], notThis: "Not PLO-6: a group presentation assesses communication; how the group shared the work is team work." },
  { n: 8, title: "Computing Professionalism and Society", meaning: "Understanding the impact of computing on society, law, health, safety and culture, and the responsibilities that follow.", bloom: "C2–A3", verbs: ["discuss", "assess impact", "relate"],
    good: ["Discuss the societal impact of AI-based decision systems."], notThis: "Not PLO-9: PLO-8 is about impact and responsibility in society; PLO-9 is about ethical principles and codes of conduct." },
  { n: 9, title: "Ethics", meaning: "Applying ethical principles and professional codes of conduct in computing practice.", bloom: "A3", verbs: ["apply ethical principles", "justify", "adhere"],
    good: ["Apply the ACM code of ethics to a data-privacy case study."], notThis: "Not PLO-8: ethics judges right and wrong conduct; professionalism and society looks at wider impact." },
  { n: 10, title: "Life-long Learning", meaning: "Recognising the need for, and being able to engage in, independent learning as technology changes.", bloom: "A3–A4", verbs: ["investigate", "self-learn", "research", "explore"],
    good: ["Independently investigate a new framework and report its use in the project."], notThis: "Not PLO-3: life-long learning is about learning on your own; analysis is about the problem at hand." },
];

export const BLOOM: { level: string; name: string; verbs: string[] }[] = [
  { level: "C1", name: "Remember", verbs: ["define", "list", "name", "recall", "state"] },
  { level: "C2", name: "Understand", verbs: ["explain", "describe", "summarise", "classify", "discuss"] },
  { level: "C3", name: "Apply", verbs: ["apply", "use", "solve", "implement", "compute", "demonstrate"] },
  { level: "C4", name: "Analyse", verbs: ["analyse", "compare", "differentiate", "examine", "identify"] },
  { level: "C5", name: "Evaluate", verbs: ["evaluate", "assess", "justify", "critique", "select"] },
  { level: "C6", name: "Create", verbs: ["design", "develop", "construct", "create", "formulate"] },
];

export const ploGuide = (n: number | null | undefined) => PLO_GUIDE.find((p) => p.n === n) || null;
