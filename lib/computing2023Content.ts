// HEC / NCEAC "Curriculum of Computing Disciplines" 2023 (HEC Revised Curricula 2022-23, the curriculum NCEAC
// accredits computing programs against): its 10 PLOs (Seoul Accord) and the course outlines it gives — credit hours,
// lab part, prerequisite, CLOs with Bloom level (exactly as listed; maths and General Education outlines list none),
// and a 32-lecture plan derived from each course outline's topics (the document gives no weekly plan).
// Generated from the official PDF. 2023 edition only — never mixed with the 2025 curriculum.
export type Cd23Course = { ch: string; lab: number; pre: string | null; clos: { s: string; b: string }[]; topics: string[] };
export const CD2023_PLOS = [
 {
  "number": 1,
  "title": "Academic Education",
  "description": "To prepare graduates as computing professionals"
 },
 {
  "number": 2,
  "title": "Knowledge for Solving Computing Problems",
  "description": "Apply knowledge of computing fundamentals, knowledge of a computing specialization, and mathematics, science, and domain knowledge appropriate for the computing specialization to the abstraction and conceptualization of computing models from defined problems and requirements."
 },
 {
  "number": 3,
  "title": "Problem Analysis",
  "description": "Identify, formulate, research literature, and solve complex computing problems reaching substantiated conclusions using fundamental principles of mathematics, computing sciences, and relevant domain disciplines."
 },
 {
  "number": 4,
  "title": "Design/Development of Solutions",
  "description": "Design and evaluate solutions for complex computing problems, and design and evaluate systems, components, or processes that meet specified needs with appropriate consideration for public health and safety, cultural, societal, and environmental considerations."
 },
 {
  "number": 5,
  "title": "Modern Tool Usage",
  "description": "Create, select, adapt and apply appropriate techniques, resources, and modern computing tools to complex computing activities, with an understanding of the limitations."
 },
 {
  "number": 6,
  "title": "Individual and Team Work",
  "description": "Function effectively as an individual and as a member or leader in diverse teams and in multi-disciplinary settings."
 },
 {
  "number": 7,
  "title": "Communication",
  "description": "Communicate effectively with the computing community and with society at large about complex computing activities by being able to comprehend and write effective reports, design documentation, make effective presentations, and give and understand clear instructions."
 },
 {
  "number": 8,
  "title": "Computing Professionalism and Society",
  "description": "Understand and assess societal, health, safety, legal, and cultural issues within local and global contexts, and the consequential responsibilities relevant to professional computing practice"
 },
 {
  "number": 9,
  "title": "Ethics",
  "description": "Understand and commit to professional ethics, responsibilities, and norms of professional computing practice"
 },
 {
  "number": 10,
  "title": "Life-long Learning",
  "description": "Recognize the need, and have the ability, to engage in independent learning for continual development as a computing professional"
 }
];
export const CD2023_COURSES: Record<string, Cd23Course> = {
"Programming Fundamentals": {
"ch": "4 (3-3)",
"lab": 1,
"pre": null,
"clos": [
{
"s": "Understand basic problem solving steps and logic constructs",
"b": "C2"
},
{
"s": "Apply basic programing concepts",
"b": "C3"
},
{
"s": "Design and implement algorithms to solve real world problems",
"b": "C3"
}
],
"topics": [
"Introduction to problem solving",
"A brief review of Von-Neumann architecture",
"A brief review of Von-Neumann architecture (continued)",
"Introduction to programming",
"Role of compiler and linker",
"Role of compiler and linker (continued)",
"Introduction to algorithms",
"Introduction to algorithms (continued)",
"Basic data types and variables",
"Input/output constructs",
"Input/output constructs (continued)",
"Arithmetic",
"Comparison and logical operators",
"Comparison and logical operators (continued)",
"Conditional statements and execution flow for conditional statements",
"Conditional statements and execution flow for conditional statements (continued)",
"Repetitive statements and execution flow for repetitive statements",
"Lists and their memory organization",
"Lists and their memory organization (continued)",
"Multidimensional lists",
"Introduction to modular programming",
"Introduction to modular programming (continued)",
"Function definition and calling",
"Function definition and calling (continued)",
"Stack rolling and unrolling",
"String and string operations",
"String and string operations (continued)",
"Pointers/references",
"Static and dynamic memory allocation",
"Static and dynamic memory allocation (continued)",
"File I/O operations",
"File I/O operations (continued)"
]
},
"Object Oriented Programming": {
"ch": "4 (3-3)",
"lab": 1,
"pre": "Programming Fundamentals",
"clos": [
{
"s": "Understand principles of object oriented paradigm.",
"b": "C2"
},
{
"s": "Identify the objects & their relationships to build object oriented solution",
"b": "C3"
},
{
"s": "Model a solution for a given problem using object oriented principles",
"b": "C3"
},
{
"s": "Examine an object oriented solution",
"b": "C4"
}
],
"topics": [
"Introduction to object oriented design",
"History and advantages of object oriented design",
"Introduction to object oriented programming concepts",
"Classes",
"Objects",
"Objects (continued)",
"Data encapsulation",
"Constructors",
"Destructors",
"Access modifiers",
"Access modifiers (continued)",
"Const vs non-const functions",
"Static data members & functions",
"Function overloading",
"Operator overloading",
"Operator overloading (continued)",
"Identification of classes and their relationships",
"Composition",
"Aggregation",
"Inheritance",
"Multiple inheritance",
"Multiple inheritance (continued)",
"Polymorphism",
"Abstract classes and interfaces",
"Generic programming concepts",
"Function & class templates",
"Function & class templates (continued)",
"Standard template library",
"Object streams",
"Data and object serialization using object streams",
"Exception handling",
"Exception handling (continued)"
]
},
"Data Structures": {
"ch": "4 (3-3)",
"lab": 1,
"pre": "Programming Fundamentals",
"clos": [
{
"s": "Implement various data structures and their algorithms and apply them in implementing simple applications",
"b": "C3"
},
{
"s": "Analyze simple algorithms and determine their complexities.",
"b": "C5"
},
{
"s": "Apply the knowledge of data structure to other application domains.",
"b": "C3"
},
{
"s": "Design new data structures and algorithms to solve problems.",
"b": "C6"
}
],
"topics": [
"Abstract data types",
"Complexity analysis",
"Big Oh notation",
"Stacks (linked lists and array implementations)",
"Recursion and analyzing recursive algorithms",
"Divide and conquer algorithms",
"Sorting algorithms (selection",
"Insertion",
"Merge",
"Quick",
"Bubble; Heap",
"Shell",
"Radix",
"Bucket)",
"Queue",
"Dequeuer",
"Priority queues (linked and array implementations of queues)",
"Linked list & its various types",
"Sorted linked list",
"Searching an unsorted array",
"Binary search for sorted arrays",
"Hashing and indexing; Open addressing and chaining",
"Trees and tree traversals",
"Binary search trees",
"Heaps",
"M-way tress",
"Balanced trees",
"Graphs",
"Breadth-first and depth-first traversal",
"Topological order",
"Shortest path",
"Adjacency matrix and adjacency list implementations; Memory management and garbage collection"
]
},
"Computer Organization and Assembly Language": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Digital Logic Design",
"clos": [
{
"s": "Acquire the basic knowledge of computer organization computer architecture and assembly language",
"b": "C2"
},
{
"s": "Understand the concepts of basic computer organization, architecture, and assembly language techniques",
"b": "C2"
},
{
"s": "Solve the problems related to computer organization and assembly language",
"b": "C3"
}
],
"topics": [
"Introduction to computer systems: Information is bits + context",
"Programs are translated by other programs into different forms",
"It pays to understand how compilation systems work",
"Processors read and interpret instructions stored in memory",
"Caches matter",
"Storage devices form a hierarchy",
"The operating system manages the hardware",
"Systems communicate with other systems using networks",
"Representing and manipulating information: information storage",
"Integer representations",
"Integer arithmetic",
"Floating point",
"Machine-level representation of programs: a historical perspective",
"Program encodings",
"Data formats",
"Accessing information",
"Arithmetic and logical operations",
"Control",
"Procedures",
"Array allocation and access",
"Heterogeneous data structures",
"Putting it together: understanding pointers",
"Life in the real world: using the gdb debugger",
"Out of-bounds memory references and buffer overflow",
"X86-64: extending ia32 to 64 bits",
"Machine-level representations of floating-point programs",
"Processor architecture: the Y86 instruction set architecture",
"Logic design and the Hardware Control Language (HCL)",
"Sequential Y86 implementations",
"General principles of pipelining",
"Pipelined Y86 implementations",
"Pipelined Y86 implementations (continued)"
]
},
"Digital Logic Design": {
"ch": "3 (2-3)",
"lab": 1,
"pre": null,
"clos": [
{
"s": "Acquire knowledge related to the concepts, tools and - techniques for the design of digital electronic circuits",
"b": "C2"
},
{
"s": "Demonstrate the skills to design and analyze both - combinational and sequential circuits using a variety of techniques",
"b": "C2"
},
{
"s": "Apply the acquired knowledge to simulate and implement - small-scale digital circuits",
"b": "C3"
},
{
"s": "Understand the relationship between abstract logic - characterizations and practical electrical implementations.",
"b": "C2"
}
],
"topics": [
"Number Systems",
"Logic Gates",
"Logic Gates (continued)",
"Boolean Algebra",
"Boolean Algebra (continued)",
"Combination logic circuits and designs",
"Simplification Methods (K-Map",
"Simplification Methods (K-Map (continued)",
"Quinn Mc-Cluskey method)",
"Quinn Mc-Cluskey method) (continued)",
"Flip Flops and Latches",
"Asynchronous and Synchronous circuits",
"Asynchronous and Synchronous circuits (continued)",
"Counters",
"Counters (continued)",
"Shift Registers",
"Counters",
"Counters (continued)",
"Triggered devices & its types",
"Triggered devices & its types (continued)",
"Mealy machines and Moore machines",
"Binary Arithmetic and Arithmetic Circuits",
"Binary Arithmetic and Arithmetic Circuits (continued)",
"Memory Elements",
"Memory Elements (continued)",
"State Machines",
"Introduction Programmable Logic Devices (CPLD",
"Introduction Programmable Logic Devices (CPLD (continued)",
"FPGA) Lab Assignments using tools such as Verilog HDL/VHDL",
"FPGA) Lab Assignments using tools such as Verilog HDL/VHDL (continued)",
"MultiSim",
"MultiSim (continued)"
]
},
"Operating Systems": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Data Structures",
"clos": [
{
"s": "Understand the characteristics of different structures of the Operating Systems and identify the core functions of the Operating Systems",
"b": "C2"
},
{
"s": "Analyze and evaluate the algorithms of the core functions of the Operating Systems and explain the major performance issues with regard to the core functions",
"b": "C5"
},
{
"s": "Demonstrate the knowledge in applying system software and tools available in modern operating systems.",
"b": "C3"
}
],
"topics": [
"Operating systems basics",
"System calls",
"Process concept and scheduling",
"Inter-process communication",
"Multithreaded programming",
"Multithreading models",
"Threading issues",
"Process scheduling algorithms",
"Thread scheduling",
"Multiple-processor scheduling",
"Synchronization",
"Critical section",
"Synchronization hardware",
"Synchronization problems",
"Deadlocks",
"Detecting and recovering from deadlocks; Memory management",
"Swapping",
"Contiguous memory allocation",
"Segmentation & paging",
"Virtual memory management",
"Demand paging",
"Thrashing",
"Memory-mapped files",
"File systems",
"File concept",
"Directory and disk structure",
"Directory implementation",
"Free space management",
"Disk structure and scheduling",
"Swap space management",
"System protection",
"Virtual machines; Operating system security"
]
},
"Database System": {
"ch": "4 (3-3)",
"lab": 1,
"pre": null,
"clos": [
{
"s": "Explain fundamental database concepts.",
"b": "C2"
},
{
"s": "Design conceptual, logical and physical database schemas using different data models.",
"b": "C5"
},
{
"s": "Identify functional dependencies and resolve database anomalies by normalizing database tables.",
"b": "C2"
},
{
"s": "Use Structured Query Language (SQL) for database definition and manipulation in any DBMS",
"b": "C4"
}
],
"topics": [
"Basic database concepts",
"Database approach vs",
"File based system",
"Database architecture",
"Three level schema architecture",
"Data independence",
"Relational data model",
"Attributes",
"Schemas",
"Tuples",
"Domains",
"Relation instances",
"Keys of relations",
"Integrity constraints",
"Relational algebra",
"Selection; Projection",
"Cartesian product",
"Types of joins",
"Normalization",
"Functional dependencies",
"Normal forms",
"Entity relationship model",
"Entity sets",
"Attributes",
"Relationship",
"Entity-relationship diagrams",
"Structured Query Language (SQL)",
"Joins and subqueries in SQL",
"Grouping and aggregation in SQL",
"Concurrency control",
"Database backup and recovery",
"Indexes; NoSQL systems"
]
},
"Information Security": {
"ch": "3 (2-3)",
"lab": 1,
"pre": null,
"clos": [
{
"s": "Explain key concepts of information security such as design principles, cryptography, risk management, and ethics",
"b": "C2"
},
{
"s": "Discuss legal, ethical, and professional issues in A2 information security",
"b": "C2"
},
{
"s": "Apply various security and risk management tools for achieving information security and privacy",
"b": "C3"
},
{
"s": "Identify appropriate techniques to tackle and solve problems in the discipline of information security",
"b": "C4"
}
],
"topics": [
"Information security foundations",
"Security design principles",
"Security mechanisms",
"Security mechanisms (continued)",
"Symmetric and asymmetric cryptography",
"Encryption",
"Encryption (continued)",
"Hash functions",
"Digital signatures",
"Digital signatures (continued)",
"Key management",
"Authentication and access control",
"Authentication and access control (continued)",
"Software security",
"Vulnerabilities and protections",
"Vulnerabilities and protections (continued)",
"Malware",
"Database security",
"Network security",
"Network security (continued)",
"Firewalls",
"Intrusion detection",
"Intrusion detection (continued)",
"Security policies",
"Policy formation and enforcement",
"Policy formation and enforcement (continued)",
"Risk assessment",
"Cybercrime",
"Cybercrime (continued)",
"Law and ethics in information security",
"Privacy and anonymity of data",
"Privacy and anonymity of data (continued)"
]
},
"Computer Networks": {
"ch": "3 (2-3)",
"lab": 1,
"pre": null,
"clos": [
{
"s": "Describe the key terminologies and technologies of computer networks",
"b": "C2"
},
{
"s": "Explain the services and functions provided by each layer in the Internet protocol stack.",
"b": "C2"
},
{
"s": "Identify various internetworking devices and protocols and their functions in a networking",
"b": "C4"
},
{
"s": "Analyze working and performance of key technologies, algorithms and protocols",
"b": "C4"
},
{
"s": "Build Computer Network on various Topologies",
"b": "C3"
}
],
"topics": [
"Introduction and protocols architecture",
"Basic concepts of networking",
"Network topologies",
"Network topologies (continued)",
"Layered architecture",
"Physical layer functionality",
"Data link layer functionality",
"Data link layer functionality (continued)",
"Multiple access techniques",
"Circuit switching and packet switching",
"LAN technologies",
"LAN technologies (continued)",
"Wireless networks",
"MAC addressing",
"Networking devices",
"Networking devices (continued)",
"Network layer protocols",
"IPv4 and IPv6",
"IP addressing",
"IP addressing (continued)",
"Sub netting",
"CIDR",
"Routing protocols",
"Routing protocols (continued)",
"Transport layer protocols",
"Ports and sockets",
"Connection establishment",
"Connection establishment (continued)",
"Flow and congestion control",
"Application layer protocols",
"Latest trends in computer networks",
"Latest trends in computer networks (continued)"
]
},
"Software Engineering": {
"ch": "3 (3-0)",
"lab": 0,
"pre": null,
"clos": [
{
"s": "Describe various software engineering processes and activates",
"b": "C1"
},
{
"s": "Apply the system modeling techniques to model a medium size software systems",
"b": "C3"
},
{
"s": "Apply software quality assurance and testing principles to medium size software systems",
"b": "C4"
},
{
"s": "Discuss key principles and common methods for software project management such as scheduling, size estimation, cost estimation and risk analysis",
"b": "C2"
}
],
"topics": [
"Nature of Software",
"Overview of Software Engineering",
"Professional software development",
"Software engineering practice",
"Software engineering practice (continued)",
"Software process structure",
"Software process models",
"Agile software Development",
"Agile process models",
"Agile process models (continued)",
"Agile development techniques",
"Requirements engineering process",
"Functional and non-functional requirements",
"Functional and non-functional requirements (continued)",
"Context models",
"Interaction models",
"Structural models",
"Behavioral models",
"Behavioral models (continued)",
"Model driven engineering",
"Architectural design",
"Design and implementation",
"Design and implementation (continued)",
"UML diagrams",
"Design patterns",
"Software testing and quality assurance",
"Software evolution",
"Software evolution (continued)",
"Project management and project planning",
"Configuration management",
"Software Process improvement",
"Software Process improvement (continued)"
]
},
"Analysis of Algorithms": {
"ch": "3 (3-0)",
"lab": 0,
"pre": "Data Structures",
"clos": [
{
"s": "Explain what is meant by “best”, “expected”, and “worst” case behavior of an algorithm",
"b": "C2"
},
{
"s": "Identify the characteristics of data and/or other conditions or assumptions that lead to different behaviors.",
"b": "C1"
},
{
"s": "Determine informally the time and space complexity of simple algorithms",
"b": "C2"
},
{
"s": "List and contrast standard complexity classes",
"b": "C2"
},
{
"s": "Use big O, Omega, Theta notation formally to give asymptotic upper bounds on time and space complexity of algorithms",
"b": "C3"
},
{
"s": "Use of the strategies(brute-force, greedy, divide-and- conquer, and dynamic programming) to solve an appropriate problem",
"b": "C3"
},
{
"s": "Solve problems using graph algorithms, including single- source and all-pairs shortest paths, and at least one minimum spanning tree algorithm",
"b": "C3"
},
{
"s": "Trace and/or implement a string-matching algorithm",
"b": "C2"
}
],
"topics": [
"Introduction",
"Role of algorithms in computing",
"Analysis on nature of input and size of input Asymptotic notations",
"Big-O",
"Big Ω",
"Big Θ",
"Big Θ (continued)",
"Little-o",
"Little-ω",
"Sorting Algorithm analysis",
"Loop invariants",
"Recursion and recurrence relations",
"Recursion and recurrence relations (continued)",
"Algorithm Design Techniques",
"Brute Force Approach",
"Divide-and-conquer approach",
"Merge",
"Quick Sort",
"Greedy approach",
"Greedy approach (continued)",
"Dynamic programming",
"Elements of Dynamic Programming",
"Search trees",
"Heaps",
"Hashing",
"Hashing (continued)",
"Graph algorithms",
"Shortest paths",
"Sparse graphs",
"String matching",
"Introduction to complexity classes",
"Introduction to complexity classes (continued)"
]
},
"Artificial Intelligence": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Object Oriented Programming",
"clos": [
{
"s": "Understand the fundamental constructs of Python programming language.",
"b": "C2"
},
{
"s": "Understand key concepts in the field of artificial intelligence",
"b": "C2"
},
{
"s": "Implement artificial intelligence techniques and case studies",
"b": "C3"
}
],
"topics": [
"An Introduction to Artificial Intelligence and its applications towards Knowledge Based Systems",
"Introduction to Reasoning and Knowledge Representation",
"Introduction to Reasoning and Knowledge Representation (continued)",
"Problem Solving by Searching (Informed searching",
"Problem Solving by Searching (Informed searching (continued)",
"Uninformed searching",
"Uninformed searching (continued)",
"Heuristics",
"Heuristics (continued)",
"Local searching",
"Local searching (continued)",
"Minmax algorithm",
"Minmax algorithm (continued)",
"Alpha beta pruning",
"Alpha beta pruning (continued)",
"Game-playing)",
"Case Studies: General Problem Solver",
"Case Studies: General Problem Solver (continued)",
"Eliza",
"Eliza (continued)",
"Student",
"Student (continued)",
"Macsyma",
"Macsyma (continued)",
"Learning from examples",
"Learning from examples (continued)",
"ANN and Natural Language Processing",
"ANN and Natural Language Processing (continued)",
"Recent trends in AI and applications of AI algorithms",
"Recent trends in AI and applications of AI algorithms (continued)",
"Python programming language will be used to explore and illustrate various issues and techniques in Artificial Intelligence",
"Python programming language will be used to explore and illustrate various issues and techniques in Artificial Intelligence (continued)"
]
},
"Parallel and Distributed Computing": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Object Oriented Programming, Operating Systems",
"clos": [
{
"s": "Learn about parallel and distributed computers. -",
"b": "C2"
},
{
"s": "Write portable programs for parallel or distributed - architectures using Message-Passing Interface (MPI) library",
"b": "C2"
},
{
"s": "Analyze complex problems with shared memory - programming with openMP.",
"b": "C4"
}
],
"topics": [
"Asynchronous/synchronous computation/communication",
"Concurrency control",
"Fault tolerance",
"GPU architecture and programming",
"Heterogeneity",
"Interconnection topologies",
"Load balancing; Memory consistency model",
"Memory hierarchies",
"Message passing interface (MPI)",
"MIMD/SIMD",
"Multithreaded programming",
"Parallel algorithms & architectures",
"Parallel I/O; Performance analysis and tuning",
"Power",
"Programming models (data parallel",
"Task parallel",
"Process-centric",
"Shared/distributed memory)",
"Scalability and performance studies",
"Scheduling; Storage systems",
"Synchronization",
"And tools (Cuda",
"Swift",
"Globus",
"Condor",
"Amazon AWS; OpenStack",
"Cilk",
"Gdb",
"Threads",
"MPICH",
"OpenMP",
"Hadoop; FUSE)"
]
},
"Calculus and Analytic Geometry": {
"ch": "3 (3-0)",
"lab": 0,
"pre": null,
"clos": [],
"topics": [
"Limits and Continuity",
"Introduction to functions",
"Introduction to limits",
"Techniques of funding limits",
"Indeterminate forms of limits",
"Continuous and discontinuous functions and their applications",
"Differential calculus",
"Concept and idea of differentiation",
"Geometrical and Physical meaning of derivatives",
"Rules of differentiation",
"Techniques of differentiation",
"Rates of change",
"Tangents and Normals lines",
"Chain rule",
"Implicit differentiation",
"Linear approximation",
"Applications of differentiation",
"Extreme value functions",
"Mean value theorems",
"Maxima and Minima of a function for single-variable",
"Concavity",
"Integral calculus",
"Concept and idea of Integration",
"Indefinite Integrals",
"Techniques of integration",
"Riemann sums and Definite Integrals",
"Applications of definite integrals",
"Improper integral",
"Applications of Integration",
"Area under the curve",
"Analytical Geometry",
"Straight lines in R3; Equations for planes"
]
},
"Linear Algebra": {
"ch": "3 (3-0)",
"lab": 0,
"pre": "Calculus and Analytical Geometry",
"clos": [],
"topics": [
"Algebra of linear transformations and matrices",
"Algebra of linear transformations and matrices (continued)",
"Determinants",
"Determinants (continued)",
"Determinants (continued)",
"Rank",
"Rank (continued)",
"Rank (continued)",
"Systems of equations",
"Systems of equations (continued)",
"Systems of equations (continued)",
"Vector spaces",
"Vector spaces (continued)",
"Vector spaces (continued)",
"Orthogonal transformations",
"Orthogonal transformations (continued)",
"Orthogonal transformations (continued)",
"Linear dependence",
"Linear dependence (continued)",
"Linear dependence (continued)",
"Linear Independence and bases",
"Linear Independence and bases (continued)",
"Linear Independence and bases (continued)",
"Eigenvalues and eigenvectors",
"Eigenvalues and eigenvectors (continued)",
"Eigenvalues and eigenvectors (continued)",
"Characteristic equations",
"Characteristic equations (continued)",
"Characteristic equations (continued)",
"Inner product space and quadratic forms",
"Inner product space and quadratic forms (continued)",
"Inner product space and quadratic forms (continued)"
]
},
"Probability and Statistics": {
"ch": "3 (3-0)",
"lab": 0,
"pre": null,
"clos": [],
"topics": [
"Introduction to Statistics and Data Analysis",
"Statistical Inference",
"Samples",
"Populations; And the Role of Probability",
"Sampling Procedures",
"Discrete and Continuous Data",
"Statistical Modeling",
"Types of Statistical Studies; Probability: Sample Space",
"Events",
"Counting Sample Points",
"Probability of an Event",
"Additive Rules; Conditional Probability",
"Independence",
"And the Product Rule",
"Bayes’ Rule",
"Random Variables and Probability Distributions; Mathematical Expectation: Mean of a Random Variable",
"Variance and Covariance of Random Variables",
"Means and Variances of Linear Combinations of Random Variables",
"Chebyshev’s Theorem",
"Discrete Probability Distributions; Continuous Probability Distributions",
"Fundamental Sampling Distributions and Data Descriptions: Random Sampling",
"Sampling Distributions",
"Sampling Distribution of Means and the Central Limit Theorem",
"Sampling Distribution of S2; T-Distribution",
"FQuantile and Probability Plots",
"Single Sample & Oneand Two-Sample Estimation Problems",
"Single Sample & Oneand Two-Sample Tests of Hypotheses",
"The Use of PValues for Decision Making in Testing Hypotheses (Single Sample & Oneand TwoSample Tests); Linear Regression and Correlation",
"Least Squares and the Fitted Model",
"Multiple Linear Regression and Certain",
"Nonlinear Regression Models",
"Linear Regression Model Using Matrices; Properties of the Least Squares Estimators"
]
},
"Functional English": {
"ch": "3 (3-0)",
"lab": 0,
"pre": null,
"clos": [],
"topics": [
"Paragraph and Essay Writing",
"Paragraph and Essay Writing (continued)",
"Descriptive Essays",
"Descriptive Essays (continued)",
"Sentence Errors",
"Sentence Errors (continued)",
"Sentence Errors (continued)",
"Persuasive Writing",
"Persuasive Writing (continued)",
"How to give presentations",
"How to give presentations (continued)",
"How to give presentations (continued)",
"Sentence Errors",
"Sentence Errors (continued)",
"Oral Presentations",
"Oral Presentations (continued)",
"Oral Presentations (continued)",
"Comparison and Contrast Essays",
"Comparison and Contrast Essays (continued)",
"Dialogue Writing",
"Dialogue Writing (continued)",
"Dialogue Writing (continued)",
"Short Story Writing",
"Short Story Writing (continued)",
"Review Writing",
"Review Writing (continued)",
"Review Writing (continued)",
"Narrative Essays",
"Narrative Essays (continued)",
"Letter Writing",
"Letter Writing (continued)",
"Letter Writing (continued)"
]
},
"Expository Writing": {
"ch": "3 (3-0)",
"lab": 0,
"pre": "Functional English",
"clos": [],
"topics": [
"Principles of writing good English",
"Understanding the composition process: writing clearly",
"Words",
"Sentence and paragraphs; Comprehension and expression",
"Use of grammar and punctuation",
"Process of writing",
"Observing; Audience collecting",
"Composing",
"Drafting and revising",
"Persuasive writing; Reading skills",
"Listening skills and comprehension",
"Skills for taking notes in class",
"Skills for exams; Business communications",
"Planning messages",
"Writing concise but with impact",
"Letter formats; Mechanics of business",
"Letter writing",
"Letters",
"Memo and applications",
"Summaries; Proposals",
"Writing resumes",
"Styles and formats",
"Oral communications; Verbal and non-verbal communication",
"Conducting meetings",
"Small group communication",
"Taking minutes; Presentation skills",
"Presentation strategies",
"Defining the objective",
"Scope and audience of the presentation; Material gathering material organization strategies",
"Time management",
"Opening and concluding",
"Use of audio-visual aids; Delivery and presentation"
]
},
"Technical and Business Writing": {
"ch": "3 (3-0)",
"lab": 0,
"pre": "Communication and Presentation Skills",
"clos": [],
"topics": [
"Overview of technical reporting",
"Use of library and information gathering; Administering questionnaires",
"Reviewing the gathered information; Technical exposition",
"Topical arrangement; Exemplification",
"Definition; Classification and division",
"Casual analysis",
"Effective exposition; Technical narration",
"Description and argumentation; Persuasive strategy",
"Organizing information and generation solution: brainstorming; Organizing material",
"Construction of the formal outline; Outlining conventions",
"Electronic communication",
"Generation solutions; Polishing style: paragraphs",
"Listening sentence structure; Clarity",
"Length and order; Pomposity",
"Empty words; Pompous vocabulary",
"Document design: document structure; Preamble",
"Summaries",
"Abstracts; Table of contents",
"Footnotes; Glossaries",
"Crossreferencing; Plagiarism",
"Citation and bibliography; Glossaries",
"Index",
"Appendices; Typesetting systems",
"Creating the professional report; Elements",
"Mechanical elements and graphical elements; Reports: Proposals",
"Progress reports; Leaflets",
"Brochures",
"Handbooks; Magazines articles",
"Research papers; Feasibility reports",
"Project reports; Technical research reports",
"Manuals and documentation; Thesis",
"Electronic documents; Linear verses hierarchical structure documents"
]
},
"Islamic Studies": {
"ch": "2 (2-0)",
"lab": 0,
"pre": null,
"clos": [],
"topics": [
"Basic Themes of Quran",
"Basic Themes of Quran (continued)",
"Introduction to Sciences of Hadith",
"Introduction to Sciences of Hadith (continued)",
"Introduction to Sciences of Hadith (continued)",
"Introduction to Islamic Jurisprudence",
"Introduction to Islamic Jurisprudence (continued)",
"Introduction to Islamic Jurisprudence (continued)",
"Primary & Secondary Sources of Islamic Law",
"Primary & Secondary Sources of Islamic Law (continued)",
"Primary & Secondary Sources of Islamic Law (continued)",
"Makken & Madnian life of the Prophet",
"Makken & Madnian life of the Prophet (continued)",
"Makken & Madnian life of the Prophet (continued)",
"Islamic Economic System",
"Islamic Economic System (continued)",
"Islamic Economic System (continued)",
"Political theories",
"Political theories (continued)",
"Political theories (continued)",
"Social System of Islam",
"Social System of Islam (continued)",
"Social System of Islam (continued)",
"Definition of Akhlaq.The Most Important Characters mentioned in the Holy Qur’an and Sunnah",
"Definition of Akhlaq.The Most Important Characters mentioned in the Holy Qur’an and Sunnah (continued)",
"Definition of Akhlaq.The Most Important Characters mentioned in the Holy Qur’an and Sunnah (continued)",
"SIDQ (Truthfulness)Generosity Tawakkaul(trust on Allah)Patience Taqua (piety)",
"SIDQ (Truthfulness)Generosity Tawakkaul(trust on Allah)Patience Taqua (piety) (continued)",
"SIDQ (Truthfulness)Generosity Tawakkaul(trust on Allah)Patience Taqua (piety) (continued)",
"Haqooq ul ibad in the light of Quran & Hadith the important characteristic of Islamic Society",
"Haqooq ul ibad in the light of Quran & Hadith the important characteristic of Islamic Society (continued)",
"Haqooq ul ibad in the light of Quran & Hadith the important characteristic of Islamic Society (continued)"
]
},
"Ideology and Constitution of Pakistan": {
"ch": "2 (2-0)",
"lab": 0,
"pre": null,
"clos": [],
"topics": [
"Historical background of Pakistan: Muslim society in Indo-Pakistan",
"Historical background of Pakistan: Muslim society in Indo-Pakistan (continued)",
"The movement led by the societies",
"The movement led by the societies (continued)",
"The downfall of Islamic society",
"The downfall of Islamic society (continued)",
"The establishment of British Raj- Causes and consequences",
"The establishment of British Raj- Causes and consequences (continued)",
"The establishment of British Raj- Causes and consequences (continued)",
"Political evolution of Muslims in the twentieth century: Sir Syed Ahmed Khan",
"Political evolution of Muslims in the twentieth century: Sir Syed Ahmed Khan (continued)",
"Muslim League",
"Muslim League (continued)",
"Nehru",
"Nehru (continued)",
"Nehru (continued)",
"Allama Iqbal: Independence Movement",
"Allama Iqbal: Independence Movement (continued)",
"Lahore Resolution",
"Lahore Resolution (continued)",
"Pakistan culture and society",
"Pakistan culture and society (continued)",
"Constitutional and Administrative issues",
"Constitutional and Administrative issues (continued)",
"Constitutional and Administrative issues (continued)",
"Pakistan and its geopolitical dimension",
"Pakistan and its geopolitical dimension (continued)",
"Pakistan and International Affairs",
"Pakistan and International Affairs (continued)",
"Pakistan and the challenges ahead",
"Pakistan and the challenges ahead (continued)",
"Pakistan and the challenges ahead (continued)"
]
},
"Professional Practices": {
"ch": "2 (2-0)",
"lab": 0,
"pre": null,
"clos": [],
"topics": [
"Historical",
"Social",
"And economic context of Computing (software engineering",
"Computer Science",
"Information Technology)",
"Definitions of Computing (software engineering",
"Computer Science",
"Information Technology) subject areas and professional activities",
"Professional societies",
"Professional ethics",
"Professional competency and life-long learning",
"Uses",
"Misuses",
"And risks of software",
"Information security and privacy",
"Business practices and the economics of software; Intellectual property and software law (cyber law)",
"Social responsibilities",
"Software related contracts",
"Software house organization",
"Intellectual Property Rights",
"The Framework of Employee Relations Law and Changing Management Practices",
"Human Resource Management and IT",
"Health and Safety at Work",
"Software Liability",
"Liability and Practice",
"Computer Misuse and the Criminal Law",
"Regulation and Control of Personal Information",
"Overview of the British Computer Society Code of Conduct",
"IEEE Code of Ethics",
"ACM Code of Ethics and Professional Conduct",
"ACM/IEEE Software Engineering Code of Ethics and Professional Practice",
"Accountability and Auditing; Social Application of Ethics"
]
},
"Discrete Structure": {
"ch": "3 (3-0)",
"lab": 0,
"pre": null,
"clos": [
{
"s": "Understand the key concepts of Discrete Structures such as Sets, Permutations, Relations, Graphs and Trees etc.",
"b": "C2"
},
{
"s": "Apply formal logic proofs and/or informal, but rigorous, logical reasoning to real problems, such as predicting the behavior of software or solving problems such as puzzles.",
"b": "C3"
},
{
"s": "Apply discrete structures into other computing problems such as formal specification, verification, databases, artificial intelligence, and cryptography.",
"b": "C3"
},
{
"s": "Differentiate various discrete structures and their (Differentiate) relevance within the context of computer science, in the areas of data structures and algorithms, in particular",
"b": "C4"
}
],
"topics": [
"Mathematical reasoning",
"Propositional and predicate logic",
"Rules of inference",
"Proof by induction",
"Proof by contraposition",
"Proof by contradiction",
"Proof by implication",
"Set theory",
"Relations",
"Equivalence relations and partitions",
"Partial orderings",
"Recurrence relations",
"Functions",
"Mappings",
"Function composition",
"Inverse functions; Recursive functions",
"Number Theory",
"Sequences",
"Series",
"Counting",
"Inclusion and exclusion principle",
"Pigeonhole principle",
"Permutations and combinations",
"Algorithms",
"Searching and Sorting Algorithms",
"Elements of graph theory",
"Planar graphs",
"Graph coloring",
"Graph Algorithms",
"Euler graph",
"Hamiltonian path",
"Rooted trees; Traversals"
]
},
"Applied Physics": {
"ch": "3 (2-3)",
"lab": 1,
"pre": null,
"clos": [],
"topics": [
"Electric force and its applications and related problems",
"Conservation of charge; Charge quantization",
"Electric fields due to point charge and lines of force; Ring of charge",
"Disk of charge",
"A point charge in an electric field; Dipole in a n electric field",
"The flux of vector field; The flux of electric field",
"Gauss’ Law; Application of Gauss’ Law",
"Spherically symmetric charge distribution",
"A charge isolated conductor; Electric potential energy",
"Electric potentials; Calculating the potential from the field and related problem Potential due to point and continuous charge distribution",
"Potential due to dipole",
"Equipotential surfaces; Calculating the field from the potential",
"Electric current; Current density",
"Resistance; Resistivity and conductivity",
"Ohm’s law and its applications",
"The Hall effect; The magnetic force on a current",
"The Biot- Savart law; Line of B",
"Two parallel conductors",
"Amperes’ s Law; Solenoid",
"Toroids; Faraday’s experiments",
"Faraday’s Law of Induction; Lenz’s law",
"Motional emf",
"Induced electric field; Induced electric fields",
"The basic equation of electromagnetism; Induced Magnetic field",
"The displacement current",
"Reflection and Refraction of light waves; Total internal reflection",
"Two source interference; Double Slit interference",
"Related problems; Interference from thin films",
"Diffraction and the wave theory",
"Related problems; Single-Slit Diffraction",
"Related problems; Polarization of electromagnetic waves",
"Polarizing sheets; Related problems"
]
},
"Introduction to Information and Communication Technologies": {
"ch": "3 (2-3)",
"lab": 1,
"pre": null,
"clos": [
{
"s": "Understand basics of computing technology",
"b": "C1"
},
{
"s": "Do number systems conversions and arithmetic",
"b": "C2"
},
{
"s": "Have knowledge of types of software",
"b": "C2"
},
{
"s": "Have knowledge of computing related technologies",
"b": "C3"
}
],
"topics": [
"Brief history of Computer; Four Stages of History",
"Computer Elements; Processor",
"Memory; Hardware",
"Software; Application Software its uses and Limitations; System Software its Importance and its Types",
"Types of Computer (Super; Mainframe",
"Mini and Micro Computer); Introduction to CBIS (Computer Based Information System)",
"Methods of Input and Processing; Class2",
"Organizing Computer Facility; Centralized Computing Facility; Distributed Computing Facility",
"Decentralized Computing Facility; Input Devices",
"Keyboard and its Types; Terminal (Dump",
"Smart; Intelligent); Dedicated Data Entry",
"SDA (Source Data Automation); Pointing Devices",
"Voice Input; Output Devices",
"Soft- Hard Copies; Monitors and its Types",
"Printers and its Types; Plotters; Computer Virus and its Forms",
"Storage Units; Primary and Secondary Memories",
"RAM and its Types; Cache",
"Hard Disks; Working of Hard Disk; Diskettes",
"RAID; Optical Disk Storages (DVD",
"CD ROM); Magnetic Types",
"Backup System; Data Communications",
"Data Communication Model; Data Transmission; Digital and Analog Transmission",
"Modems; Asynchronous and Synchronous Transmission",
"Simplex; Half Duplex",
"Full Duplex Transmission; Communications; Medias (Cables",
"Wireless); Protocols",
"Network Topologies (Star; Bus",
"Ring); LAN",
"LAN; Internet; A Brief History",
"Birthplace of ARPA Net; Web Link",
"Browser; Internet Services provider and Online Services Providers",
"Function and Features of Browser; Search Engines; Some Common Services available on Internet"
]
},
"Artificial Neural Networks & Deep Learning": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Programming for Artificial Intelligence",
"clos": [
{
"s": "Understand the fundamentals of neural networks in AI",
"b": "C2"
},
{
"s": "Explain how simple ANNs can be designed",
"b": "C2"
},
{
"s": "Apply ANN for classification Problems",
"b": "C3"
},
{
"s": "Apply deep learning algorithms to real-world problems",
"b": "C3"
},
{
"s": "Analyze results from deep learning to select appropriate solutions",
"b": "C4"
}
],
"topics": [
"Introduction and history of neural networks",
"Basic architecture of neural networks",
"Perceptron and Adaline (Minimum Error Learning) for classification; Basics of deep learning",
"Learning networks",
"Shallow vs; Deep learning etc",
"Machine learning theory – training and test sets",
"Evaluation",
"Etc; Selected topics from: Gradient descent (Delta) rule",
"Hebbian",
"Neo-Hebbian and Differential Hebbian Learning; Drive Reinforcement Theory",
"Kohonen Self Organizing Maps",
"Associative memory",
"Bi-directional associative memory (BAM); Energy surfaces",
"The Boltzmann machines",
"Backpropagation Networks; Feedforward Networks",
"Theory of Generalization",
"Multi-layer perceptrons",
"Error backpropagation; Deep convolutional networks",
"Computational complexity of feed forward and deep convolutional neural networks",
"Unsupervised deep learning including auto-encoders; Deep belief networks",
"Restricted Boltzman Machines",
"Deep Recurrent Neural Networks (BPTT",
"LSTM; Etc.)",
"GPU programming for deep learning CuDNN",
"Generative adversarial networks (GANs); Sparse coding and auto-encoders",
"Data augmentation",
"Elastic distortions",
"Data normalization; Mitigating overfitting with dropout",
"Batch normalization",
"Dropconnect; Novel architectures",
"ResNet",
"GoogleNet; Etc"
]
},
"Computer Vision": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Artificial Neural Networks & Deep Learning",
"clos": [
{
"s": "Understanding the single view geometry concepts",
"b": "C2"
},
{
"s": "Understanding the multiple view geometry concepts",
"b": "C2"
},
{
"s": "Apply concepts of CV for solving real world problems",
"b": "C3"
}
],
"topics": [
"Introduction to Computer Vision (Problems faced",
"History and Modern Advancements)",
"Image Processing",
"Image filtering",
"Image pyramids and Fourier transform",
"Hough transform",
"Camera models",
"Setting up a camera model from parameters",
"Camera looking at a plane",
"Relationship of plane and horizon line",
"Rotation about camera center",
"Concatenation",
"Decomposition and Estimation of transformation from point correspondences",
"Points and planes in 2D/3D",
"Transformations in 2D/3D",
"Rotations in 2D/3D",
"Edge detection",
"Corner detection",
"Feature descriptors and matching (HoG features",
"SIFT",
"SURF)",
"Applications of Computer Vision Traditional Methods: Image Stitching: Making a bigger picture from smaller pictures Single View Geometry: Converting a single image into a 3D model",
"Applications of CV using Deep Learning: Image Detection (Localization",
"Historical Techniques",
"RCNN",
"FRCNN",
"YOLO",
"Retina)",
"Image Segmentation (UNet",
"SegNet",
"MaskRCNN)",
"Image Generation (GANN)"
]
},
"Knowledge Representation and Reasoning": {
"ch": "3 (3-0)",
"lab": 0,
"pre": "Artificial Intelligence",
"clos": [
{
"s": "Understand the fundamentals of knowledge representation and reasoning in deterministic situations",
"b": "C2"
},
{
"s": "Understand the challenges in representing knowledge and reasoning under uncertainty",
"b": "C2"
},
{
"s": "Analyze different situations and apply appropriate knowledge representation frameworks",
"b": "C4"
},
{
"s": "Development of hybrid approaches by synergizing the existing framework to solve complex decision-making problems.",
"b": "C4"
}
],
"topics": [
"Propositional Logic",
"First-order Logic",
"First-order Logic (continued)",
"Horn Clauses",
"Horn Clauses (continued)",
"Description Logic",
"Reasoning using Description Logic",
"Reasoning using Description Logic (continued)",
"Forward and Backward Chaining in Inference Engines",
"Forward and Backward Chaining in Inference Engines (continued)",
"Semantic Networks",
"Ontologies and Ontology Languages",
"Ontologies and Ontology Languages (continued)",
"Logical Agents",
"Logical Agents (continued)",
"Planning",
"Rule-based Knowledge Representation",
"Rule-based Knowledge Representation (continued)",
"Reasoning Under Uncertainty",
"Reasoning Under Uncertainty (continued)",
"Bayesian Networks Representation",
"Inference in Bayesian Networks",
"Inference in Bayesian Networks (continued)",
"Fuzzy Logic",
"Fuzzy Logic (continued)",
"Inferene using Fuzzy Rules",
"Markov Models",
"Markov Models (continued)",
"Commonsense Reasoning",
"Commonsense Reasoning (continued)",
"Explainable AI",
"Explainable AI (continued)"
]
},
"Machine Learning": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Artificial Intelligence",
"clos": [
{
"s": "Describe basic machine learning concepts, theories and (Knowledge) applications.",
"b": "C1"
},
{
"s": "Apply supervised learning techniques to solve classification problems of moderate complexity.",
"b": "C3"
},
{
"s": "Apply unsupervised learning techniques to solve clustering problems of moderate complexity",
"b": "C3"
},
{
"s": "Apply reinforcement learning algorithms to environments with complex dynamics.",
"b": "C3"
},
{
"s": "Develop a reasonable size project using suitable machine learning technique",
"b": "C6"
}
],
"topics": [
"Introduction to machine learning",
"Concept learning: General-to-specific ordering of hypotheses",
"Version spaces Algorithm",
"Version spaces Algorithm (continued)",
"Candidate elimination algorithm",
"Supervised Learning: decision trees",
"Naive Bayes",
"Naive Bayes (continued)",
"Artificial Neural Networks",
"Support Vector Machines",
"Overfitting",
"Overfitting (continued)",
"Noisy data",
"And pruning",
"Measuring Classifier Accuracy",
"Measuring Classifier Accuracy (continued)",
"Linear and Logistic regression",
"Unsupervised Learning: Hierarchical Aglomerative Clustering",
"K-means partitional clustering",
"K-means partitional clustering (continued)",
"Self-Organizing Maps (SOM) k-Nearest-neighbor algorithm",
"Semisupervised learning with EM using labeled and unlabled data",
"Reinforcement Learning: Hidden Markov models",
"Reinforcement Learning: Hidden Markov models (continued)",
"Monte Carlo inference Exploration vs",
"Exploitation Trade-off",
"Markov Decision Processes",
"Markov Decision Processes (continued)",
"Ensemble Learning: Using committees of multiple hypotheses",
"Bagging",
"Boosting",
"Boosting (continued)"
]
},
"Natural Language Processing": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Artificial Neural Networks & Deep Learning",
"clos": [
{
"s": "Understand techniques for information retrieval, language translation, and text classification.",
"b": "C2"
},
{
"s": "Understand the advantages of using standard corpora. Identify examples of current corpora for a variety of NLP tasks.",
"b": "C2"
},
{
"s": "Understand and contrast deterministic and stochastic grammars, providing examples to show the adequacy of each",
"b": "C2"
},
{
"s": "Solve classic and stochastic algorithms for parsing natural language.",
"b": "C3"
}
],
"topics": [
"Introduction & History of NLP",
"Parsing algorithms",
"Basic Text Processing",
"Minimum Edit Distance",
"Language Modeling",
"Spelling Correction",
"Text Classification",
"Deterministic and stochastic grammars",
"CFGs",
"Representing meaning /Semantics",
"Semantic roles",
"Semantics and Vector models",
"Sentiment Analysis",
"Temporal representations",
"Corpus-based methods",
"Corpus-based methods (continued)",
"N-grams and HMMs",
"Smoothing and backoff",
"POS tagging and morphology",
"Information retrieval",
"Vector space model",
"Precision and recall",
"Information extraction",
"Relation Extraction (dependency",
"Constituency grammar)",
"Language translation",
"Text classification",
"Categorization",
"Bag of words model",
"Question and Answering",
"Text Summarization",
"Text Summarization (continued)"
]
},
"Programming for Artificial Intelligence": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Artificial Intelligence",
"clos": [
{
"s": "Understand the fundamental constructs of Lisp, Prolog, and Python programming languages.",
"b": "C2"
},
{
"s": "Comprehend the fundamental constructs of programming languages for data analysis and representation.",
"b": "C2"
},
{
"s": "Understand and apply the Object-oriented concepts in the programming languages.",
"b": "C2"
},
{
"s": "Apply various libraries for plotting, interpreting and analyzing data in Python.",
"b": "C3"
}
],
"topics": [
"The first objective of the course is to introduce and then build the proficiency of students in different AI programming languages",
"The basics include IDE for the languages",
"The basics include IDE for the languages (continued)",
"Variables",
"Expressions",
"Expressions (continued)",
"Operands and operators",
"Operands and operators (continued)",
"Loops",
"Control structures",
"Control structures (continued)",
"Debugging",
"Error messages",
"Error messages (continued)",
"Functions",
"Functions (continued)",
"Strings",
"Lists",
"Lists (continued)",
"Object-oriented constructs and basic graphics in the languages",
"Special emphasis is given to writing production quality clean code in the programming language",
"Special emphasis is given to writing production quality clean code in the programming language (continued)",
"Once the classical programming languages are properly introduced",
"Once the classical programming languages are properly introduced (continued)",
"The course should introduce some libraries necessary for interpreting",
"Analyzing and plotting numerical data in Python (e.g",
"Analyzing and plotting numerical data in Python (e.g (continued)",
"NumPy",
"MatPlotLib",
"MatPlotLib (continued)",
"Anaconda and Pandas for Python) and give examples of each library using simple use cases and small case studies",
"Anaconda and Pandas for Python) and give examples of each library using simple use cases and small case studies (continued)"
]
},
"Advance Statistics": {
"ch": "3 (3-0)",
"lab": 0,
"pre": "Probability and Statistics",
"clos": [
{
"s": "Describe what part of statistics is meant for data scientist (Knowledge) and what the applications of statistics in data science are.",
"b": "C1"
},
{
"s": "Apply Statistical techniques in real life problems.",
"b": "C3"
},
{
"s": "Analyze, Correlate, Forecast data by using different statistical techniques",
"b": "C2"
},
{
"s": "Apply basic data science statistical techniques by using SPSS on real world datasets.",
"b": "C3"
}
],
"topics": [
"Introduction to Statistics",
"Use of Statistics in Data Science",
"Experimental Design",
"Statistical Techniques for Forecasting",
"Interpolation/ Extrapolation",
"Introduction to Probability",
"Conditional Probability",
"Prior and Posterior Probability",
"Random number generation (RNG)",
"Techniques for RNG",
"Correlation analysis; Chi Square Dependency tests",
"Diversity Index",
"Data Distributions Multivariate Distributions",
"Error estimation",
"Confidence Intervals",
"Linear transformations",
"Gradient Descent and Coordinate Descent",
"Likelihood inference",
"Revision of linear regression and likelihood inference",
"Fitting algorithms for nonlinear models and related diagnostics",
"Generalized linear model",
"Exponential families; Variance and link functions",
"Proportion and binary responses",
"Logistic regression",
"Count data and Poisson responses",
"Log-linear models",
"Overdispersion and quasi-likelihood",
"Estimating functions",
"Mixed models",
"Random effects",
"Generalized additive models and penalized regression",
"Introduction to SPSS; Probability/ Correlation analysis/ Dependency tests/ Regression in SPSS"
]
},
"Big Data Analytics": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Introduction to Data Science",
"clos": [
{
"s": "Understand the fundamental concepts of Big Data and its programming paradigm.",
"b": "C2"
},
{
"s": "Hadoop/MapReduce Programming, Framework, and Ecosystem",
"b": "C3"
},
{
"s": "Apache Spark Programming",
"b": "C3"
}
],
"topics": [
"Introduction and Overview of Big Data Systems",
"Introduction and Overview of Big Data Systems (continued)",
"Platforms for Big Data",
"Platforms for Big Data (continued)",
"Hadoop as a Platform",
"Hadoop as a Platform (continued)",
"Hadoop Distributed File Systems (HDFS)",
"Hadoop Distributed File Systems (HDFS) (continued)",
"MapReduce Framework",
"MapReduce Framework (continued)",
"Resource Management in the cluster (YARN)",
"Resource Management in the cluster (YARN) (continued)",
"Apache Scala Basic",
"Apache Scala Basic (continued)",
"Apache Scala Advances",
"Apache Scala Advances (continued)",
"Apache Scala Advances (continued)",
"Resilient Distributed Datasets (RDD)",
"Resilient Distributed Datasets (RDD) (continued)",
"Apache Spark",
"Apache Spark (continued)",
"Apache Spark SQL",
"Apache Spark SQL (continued)",
"Data analytics on Hadoop / Spark",
"Data analytics on Hadoop / Spark (continued)",
"Machine learning on Hadoop / Spark",
"Machine learning on Hadoop / Spark (continued)",
"Spark Streaming",
"Spark Streaming (continued)",
"Other Components of Hadoop Ecosystem",
"Other Components of Hadoop Ecosystem (continued)",
"Other Components of Hadoop Ecosystem (continued)"
]
},
"Data Mining": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Advance Statistics, Introduction to Data Science",
"clos": [
{
"s": "Apply preprocessing techniques on any given raw data.",
"b": "C3"
},
{
"s": "Select and apply proper data mining algorithm to discover interesting patterns",
"b": "C3"
},
{
"s": "Analyze and extract patterns to solve problems and point out how to deploy solution",
"b": "C4"
},
{
"s": "Evaluate systematically supervised, semi supervised and unsupervised models and algorithms with respect to their accuracy",
"b": "C4"
}
],
"topics": [
"Introduction to data mining and basic concepts",
"Introduction to data mining and basic concepts (continued)",
"Pre-Processing Techniques & Summary Statistics",
"Pre-Processing Techniques & Summary Statistics (continued)",
"Association Rule mining using Apriori Algorithm and Frequent Pattern Trees",
"Association Rule mining using Apriori Algorithm and Frequent Pattern Trees (continued)",
"Introduction to Classification Types",
"Introduction to Classification Types (continued)",
"Supervised Classification (Decision trees",
"Supervised Classification (Decision trees (continued)",
"Naïve Bae Classification",
"Naïve Bae Classification (continued)",
"K-Nearest Neighbors",
"K-Nearest Neighbors (continued)",
"Support Vector Machines etc.)",
"Support Vector Machines etc.) (continued)",
"Unsupervised Classification (K Means",
"Unsupervised Classification (K Means (continued)",
"K Median",
"K Median (continued)",
"Hieratical and Divisive Clustering",
"Hieratical and Divisive Clustering (continued)",
"Kohonan Self Organizing maps)",
"Kohonan Self Organizing maps) (continued)",
"Outlier & anomaly detection",
"Outlier & anomaly detection (continued)",
"Web and Social Network Mining",
"Web and Social Network Mining (continued)",
"Data Mining Trends and Research Frontiers",
"Data Mining Trends and Research Frontiers (continued)",
"Implementing concepts using Python",
"Implementing concepts using Python (continued)"
]
},
"Data Visualization": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Data Warehousing & Business Intelligence",
"clos": [
{
"s": "Provides knowledge about importance, necessity, and justification of performing exploratory data analysis and visualization",
"b": "C2"
},
{
"s": "Introduce various type of charts along with their alternatives solution to show same data from versatile aspects.",
"b": "C2"
},
{
"s": "Improving the competency of the students to analyze different problems and select the most appropriate solution.",
"b": "C3"
},
{
"s": "Use of R, various recent tools, and technologies to develop hands-on skills for exploratory data analysis and visualization.",
"b": "C3"
}
],
"topics": [
"Introduction of Exploratory Data Analysis and Visualization",
"Building Blocks and Basic Operations",
"Types of Exploratory Graphs",
"Single and multi-dimensional summaries",
"Five number summary",
"Box plots",
"Histogram",
"Bar plot and others",
"Distributions",
"Their representation using histograms",
"Outliers",
"Variance",
"Probability Mass Functions and their visualization",
"Cumulative distribution functions",
"Percentile-based statistics",
"Random numbers",
"Modelling distributions",
"Exponential",
"Normal",
"Lognormal",
"Pareto",
"Probability density functions",
"Kernel density estimation",
"Relationship between variables",
"Scatter plots",
"Correlation",
"Covariance",
"Estimation and Hypothesis Testing",
"Clustering using K-means and Hierarchical",
"Time series and survival analysis",
"Implementing concepts with R (or similar language)",
"Implementing concepts with R (or similar language) (continued)"
]
},
"Data Warehousing and Business Intelligence": {
"ch": "2-1",
"lab": 1,
"pre": "Introduction to Data Science",
"clos": [
{
"s": "Demonstrate an appreciation of the role that Data Warehouses and Business Intelligence play in enhancing the decision-making process",
"b": "C2"
},
{
"s": "Demonstrate an understanding of the fundamental concepts of the Star and the Snowflake Schema; learn how to design the schema of a DW based on these two models.",
"b": "C2"
},
{
"s": "Understand the architecture of DW Systems and be able to specify the advantages and potential problem areas",
"b": "C3"
},
{
"s": "Use Analytic SQL to aggregate, analyze and report, and model data.",
"b": "C3"
}
],
"topics": [
"Introduction to Data Warehouse and Business Intelligence",
"Introduction to Data Warehouse and Business Intelligence (continued)",
"Necessities and essentials of Business Intelligence",
"Necessities and essentials of Business Intelligence (continued)",
"DW Life Cycle and Basic Architecture",
"DW Life Cycle and Basic Architecture (continued)",
"DW Architecture in SQL Server",
"DW Architecture in SQL Server (continued)",
"Logical Model",
"Logical Model (continued)",
"Indexes",
"Indexes (continued)",
"Physical Model",
"Physical Model (continued)",
"Optimizations",
"Optimizations (continued)",
"OLAP Operations",
"OLAP Operations (continued)",
"Queries and Query Optimization",
"Queries and Query Optimization (continued)",
"Building the DW",
"Building the DW (continued)",
"Data visualization and reporting based on Datawarehouse using SSAS and Tableau",
"Data visualization and reporting based on Datawarehouse using SSAS and Tableau (continued)",
"Data visualization and reporting based on Cube",
"Data visualization and reporting based on Cube (continued)",
"Reports and Dashboard management on PowerBI",
"Reports and Dashboard management on PowerBI (continued)",
"Dashboard Enrichment",
"Dashboard Enrichment (continued)",
"Business Intelligence Tools",
"Business Intelligence Tools (continued)"
]
},
"Introduction to Data Science": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Artificial Intelligence",
"clos": [
{
"s": "Describe what Data Science is and the skill sets needed to be a data scientist.",
"b": "C2"
},
{
"s": "Apply EDA and the Data Science process in a case study.",
"b": "C3"
},
{
"s": "Comprehend the fundamental constructs of Python programming language.",
"b": "C2"
},
{
"s": "Apply basic machine learning algorithms to solve real world problems of moderate complexity.",
"b": "C3"
}
],
"topics": [
"Introduction: What is Data Science? Big Data and Data Science hype",
"Datafication",
"Current landscape of perspectives",
"Skill sets needed",
"Statistical Inference: Populations and samples",
"Statistical modeling",
"Probability distributions",
"Probability distributions (continued)",
"Fitting a model",
"Intro to Python",
"Exploratory Data Analysis and the Data Science Process",
"Basic Machine Learning Algorithms: Linear Regression",
"K-Nearest Neighbors (k-NN)",
"K-means",
"Naive Bayes",
"Naive Bayes (continued)",
"Feature Generation and Feature Selection",
"Dimensionality Reduction: Singular Value Decomposition",
"Principal Component Analysis",
"Mining Social-Network Graphs: Social networks as graphs",
"Clustering of graphs",
"Direct discovery of communities in graphs",
"Partitioning of graphs",
"Partitioning of graphs (continued)",
"Neighborhood properties in graphs",
"Data Visualization: Basic principles",
"Ideas and tools for data visualization",
"Data Science and Ethical Issues: Discussions on privacy",
"Security",
"Ethics",
"Next-generation data scientists",
"Next-generation data scientists (continued)"
]
},
"Digital Forensics": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Introduction to Cyber Security",
"clos": [
{
"s": "To develop knowledge about forensic law, standards, regulations and ethical values",
"b": "C2"
},
{
"s": "To be able to conduct digital forensics for multiple platforms and applications by various tools",
"b": "C3"
},
{
"s": "To be able to generate reports based on digital forensic tools for security systems and platforms",
"b": "C3"
}
],
"topics": [
"An introduction to Digital Forensics",
"Use of digital forensics",
"Key technical concepts",
"Challenges in Digital Forensics",
"The Difference between Computer Experts and Digital Forensics Experts",
"Investigative Process Methodologies",
"Education",
"Training",
"And Awareness",
"Laws",
"Standards",
"And Regulations",
"Ethics and Professional Conduct",
"Digital Evidence Management",
"Collecting evidence",
"Antiforensics",
"Network forensics",
"Mobile and Embedded Forensics",
"Cloud forensics",
"Internet Forensics",
"Social media forensics",
"Investigation Methods for Collecting Digital Evidence",
"Digital Forensic Readiness",
"Digital forensics tools",
"Discovery of Computers and Storage Media",
"Discovery of Audio/ Video Evidence",
"Data Visualization",
"Data Sources",
"Graphing and Charting",
"Analyzing Data",
"Data Distributions",
"Analysis Scenarios; Data Visualization Tools"
]
},
"Information Assurance": {
"ch": "3 (2-3)",
"lab": 1,
"pre": null,
"clos": [
{
"s": "Apply security governance principles; organizational processes; developing and implementing a documented security policy.",
"b": "C3"
},
{
"s": "Understand and apply risk management concepts",
"b": "C2"
},
{
"s": "To understand the business, legal, and technical knowledge needed to secure vital government and business assets.",
"b": "C2"
}
],
"topics": [
"Introduction to (IS) Information System (Concept",
"Design",
"Functions",
"Architecture",
"Components and applications of IS)",
"Secure System Planning and Administration",
"Secure System Planning and Administration (continued)",
"Information Security Policies and Procedures",
"Asset Management",
"Organizational and Human Security",
"Cyber Security Management Concepts",
"NIST Cyber Security Framework",
"NIST Cyber Security Framework (continued)",
"Enterprise Roles and Structures",
"Strategic Planning",
"Security Plans and Policies",
"Contingency Planning",
"Laws",
"Laws and Regulatory Requirements",
"Laws and Regulatory Requirements (continued)",
"Security Standards and Controls",
"Risk Management Process",
"NIST Risk Management Framework",
"Security Metrics and Key Performance Indicators (KPIs)",
"Physical Security and Environmental Events",
"Physical Security and Environmental Events (continued)",
"Contingency Planning",
"Security Education",
"ISO 27001 Compliance",
"Training",
"And Awareness",
"And Awareness (continued)"
]
},
"Introduction to Cyber Security": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Information Security",
"clos": [
{
"s": "To be able to identify computer system threats",
"b": "C2"
},
{
"s": "To be able to identify Malware attacks, and understand the stages of attack and payloads.",
"b": "C2"
},
{
"s": "Implement various cryptographic techniques and simulate attack scenarios",
"b": "C3"
}
],
"topics": [
"Introduction to Cyber security",
"Networks and the Internet",
"Cyber threat landscape",
"Understanding security",
"Information security Principles (Confidentiality",
"Integrity",
"Availability)",
"Information Security Terminology",
"Who are the attackers",
"Advanced Persistent Threat (APT)",
"Advanced Persistent Threat (APT) (continued)",
"Malware",
"Types of malware",
"Attacks using malware",
"Malware Attack Lifecycle: Stages of Attack",
"Social engineering attacks",
"Types of payload",
"Industrial Espionage in Cyberspace",
"Basic cryptography",
"Web application attacks",
"Database security",
"Database security (continued)",
"Cyber kill chain",
"Privacy and anonymity",
"Network security",
"Software security",
"Mobile device security",
"Mobile app security",
"Cyber Terrorism and Information Warfare",
"Introduction to Digital Forensics",
"Digital Forensics Categories",
"Digital Forensics Categories (continued)"
]
},
"Network Security": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Introduction to Cyber Security",
"clos": [
{
"s": "To be able to understand network security threats and methods for security networks",
"b": "C2"
},
{
"s": "To be able to secure wired networks by deploying various methods",
"b": "C3"
},
{
"s": "To be able to secure wireless networks by deploying various methods",
"b": "C3"
}
],
"topics": [
"Introduction to network security",
"Networking Concepts and Protocols",
"Network Threats and Vulnerabilities",
"Network Security Planning and Policy",
"Access Control",
"Defense against Network Attacks",
"Defense against Network Attacks (continued)",
"DOS and DDOS detection and prevention",
"Firewalls",
"Intrusion Detection and Prevention Systems",
"Antivirus Filtering",
"Naming and DNS Security",
"Naming and DNS Security (continued)",
"DNSSEC",
"IP security",
"Secure Sockets Layer",
"VPN",
"Packet Sniffing and spoofing",
"Honeypot",
"Honeypot (continued)",
"Ethernet Security",
"Wireless Security",
"Wireless Attacks",
"Wireless LAN Security with 802.11i",
"Wireless Security Protocols",
"Wireless Security Protocols (continued)",
"Wireless Intrusion Detection",
"Physical access and Security",
"Tor Network",
"Network Forensics",
"Defense against Network Attacks",
"Defense against Network Attacks (continued)"
]
},
"Secure Software Design and Development": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Introduction to Cyber Security",
"clos": [
{
"s": "A good comprehension of software security standards, models, processes and best practices that need to be incorporated throughout the software development lifecycle.",
"b": "C2"
},
{
"s": "Identify insecure programming patterns and the ability to replace them with secure alternatives.",
"b": "C2"
},
{
"s": "Know tools for software security analysis and testing, and the ability to use them in practice and understand their capabilities and limitations.",
"b": "C3"
}
],
"topics": [
"Secure software concepts",
"System issues; System properties",
"Software Project Time Management; Software Project Costing",
"Software Quality Assurance",
"Security Concepts in the SDLC; Risk management",
"Security standards (e.g; Coding standards",
"NIST standards; Federal Information Processing Standards)",
"Best practices (e.g",
"OWASP development guide; OWASP code review guide",
"OWASP testing guide); Security methodologies (e.g",
"Socratic Methodology",
"Operationally Critical Threat; Asset",
"And Vulnerability Evaluation; STRIDE and DREAD",
"Open Source Security Testing Methodology Manual); Security frameworks (e.g",
"Zachman Framework",
"Control Objectives for Information and Related Technology; Sherwood Applied Business Security Architecture (SABSA))",
"Regulations- Privacy and Compliance; Security Models (e.g",
"BLP Confidentiality Model",
"Clark and Wilson Model (Access Triple Model)); Trusted Computing",
"Secure Software Requirements (Sources for Security Requirements; Types of Security Requirements)",
"Secure Software Design (Design consideration; Information Technology Security Principles and Secure Design",
"Designing Secure Design Principles)",
"Design Processes; Secure Software Implementation/Coding",
"Software Development Methodologies; Common Software Vulnerabilities and Controls",
"Defensive Coding Practices—Concepts and Techniques",
"Code Vulnerabilities and Avoiding Polymorphic Malware Attacks: Buffer overflow; Format string bug",
"Code vulnerabilities SQL Injection; Cross-site Scripting",
"Cross-site Request Forgery; Session management",
"Replication of vulnerabilities and exploitation",
"Secure Software Testing; Security Testing Methodologies",
"Software Security Testing; Software Acceptance",
"Legal Protection Mechanisms; Software Deployment- Operations- Maintenance and Disposal"
]
},
"Vulnerability Assessment & Reverse Engineering": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Introduction to Cyber Security",
"clos": [
{
"s": "Basic Understanding of Hacking and Ethical Hacking.",
"b": "C2"
},
{
"s": "Apply techniques for vulnerability assessment and penetration testing.",
"b": "C3"
},
{
"s": "Understand Software vulnerabilities, Network vulnerabilities, Types of Malware and its Analysis.",
"b": "C2"
}
],
"topics": [
"Understanding the need for security assessments",
"Classifying vulnerabilities",
"Software vulnerabilities",
"Network vulnerabilities",
"Vulnerability assessment versus penetration testing",
"Vulnerability assessment versus penetration testing (continued)",
"Vulnerability Assessment Tools",
"Vulnerability management Regulatory compliance",
"Calculating ROIs",
"Application review process",
"Application review process (continued)",
"Pre-assessment",
"Code navigation",
"Codeauditing tactics",
"Memory corruption",
"Memory corruption (continued)",
"Understanding issues in programming languages",
"Steps in Reverse engineering",
"Common tools used for Reverse engineering",
"Binary Obfuscation techniques",
"Understanding core assembly concepts to perform malicious code analysis",
"Understanding core assembly concepts to perform malicious code analysis (continued)",
"Identifying key assembly logic structures with a disassembler",
"Malware analysis Types of malware analysis",
"Malware Taxonomy",
"Static analysis",
"Static analysis (continued)",
"Dynamic analysis",
"Malware Inspection",
"Malware analysis tools",
"Sandboxing and virtualization;",
"Sandboxing and virtualization; (continued)"
]
},
"Deep Learning": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Artificial Neural Networks and Deep Learning",
"clos": [
{
"s": "Apply deep learning algorithms to real-world problems",
"b": "C3"
},
{
"s": "Analyze results from deep learning to select appropriate solutions",
"b": "C4"
},
{
"s": "Code the novel neural network architectures from scratch and evaluating the performance on application specific standard benchmarks",
"b": "C3"
}
],
"topics": [
"Basics of deep learning",
"Learning networks",
"Shallow vs",
"Deep learning etc",
"Machine learning theory – training and test sets",
"Evaluation",
"Etc",
"Theory of Generalization",
"Multi-layer perceptrons",
"Error back-propagation",
"Deep convolutional networks",
"Computational complexity of feed forward and deep convolutional neural networks",
"Unsupervised deep learning including auto-encoders",
"Deep belief networks",
"Restricted Boltzman Machines",
"Deep Recurrent Neural Networks (BPTT",
"LSTM",
"Etc.)",
"GPU programming for deep learning CuDNN",
"Generative adversarial networks (GANs)",
"Sparse coding and auto-encoders",
"Data augmentation",
"Elastic distortions",
"Data normalization",
"Mitigating overfitting with dropout",
"Batch normalization",
"Dropconnect",
"Novel architectures",
"ResNet",
"GoogleNet",
"Etc",
"Etc (continued)"
]
},
"Theory of Automata & Formal Languages": {
"ch": "3 (3-0)",
"lab": 0,
"pre": null,
"clos": [
{
"s": "Explain and manipulate the different concepts in automata theory and formal languages such as formal proofs, automata, regular expressions, Turing machines etc.",
"b": "C2"
},
{
"s": "Prove properties of languages, grammars and automata with rigorously formal mathematical methods",
"b": "C2"
},
{
"s": "Design of automata, RE and CFG",
"b": "C3"
},
{
"s": "Transform between equivalent NFAs, DFAs and REs",
"b": "C3"
},
{
"s": "Define Turing machines performing simple tasks",
"b": "C2"
},
{
"s": "Differentiate and manipulate formal descriptions of languages, automata and grammars with focus on regular and context-free languages, finite automata and regular expressions.",
"b": "C3"
}
],
"topics": [
"Finite State Models: Language definitions preliminaries",
"Regular expressions/Regular languages",
"Regular expressions/Regular languages (continued)",
"Finite automata (FAs)",
"Transition graphs (TGs)",
"Transition graphs (TGs) (continued)",
"NFAs",
"Kleene’s theorem",
"Kleene’s theorem (continued)",
"Transducers (automata with output)",
"Pumping lemma and non-regular language Grammars and PDA: CFGs",
"Pumping lemma and non-regular language Grammars and PDA: CFGs (continued)",
"Derivations",
"Derivation trees and ambiguity",
"Derivation trees and ambiguity (continued)",
"Simplifying CFLs",
"Normal form grammars and parsing",
"Normal form grammars and parsing (continued)",
"Decidability",
"Context sensitive languages",
"Context sensitive languages (continued)",
"Grammars and linear bounded automata (LBA)",
"Chomsky’s hierarchy of grammars Turing Machines Theory: Turing machines",
"Chomsky’s hierarchy of grammars Turing Machines Theory: Turing machines (continued)",
"Post machine",
"Variations on TM",
"Variations on TM (continued)",
"TM encoding",
"Universal Turing Machine",
"Universal Turing Machine (continued)",
"Defining Computers by TMs",
"Defining Computers by TMs (continued)"
]
},
"Advance Database Management Systems": {
"ch": "3 (2-3)",
"lab": 1,
"pre": "Database Systems",
"clos": [
{
"s": "Understanding advance data models, technologies and approaches for building distributed database systems.",
"b": "C2"
},
{
"s": "Applying the models and approaches in order to become enabled to select and apply appropriate methods for a particular case",
"b": "C3"
},
{
"s": "To develop a database solution for a given scenario/ challenging problem in the domain of distributed database systems.",
"b": "C3"
}
],
"topics": [
"Introduction to advance data models such as object relational",
"Object oriented",
"Object oriented (continued)",
"File organizations concepts",
"File organizations concepts (continued)",
"Transactional processing and Concurrency control techniques",
"Transactional processing and Concurrency control techniques (continued)",
"Recovery techniques",
"Recovery techniques (continued)",
"Query processing and optimization",
"Query processing and optimization (continued)",
"Database Programming (PL/SQL",
"Database Programming (PL/SQL (continued)",
"T-SQL or similar technology)",
"T-SQL or similar technology) (continued)",
"Integrity and security",
"Database Administration (Role management",
"Database Administration (Role management (continued)",
"Managing database access",
"Managing database access (continued)",
"Views)",
"Views) (continued)",
"Physical database design and tuning",
"Physical database design and tuning (continued)",
"Distributed database systems",
"Distributed database systems (continued)",
"Emerging research trends in database systems",
"Emerging research trends in database systems (continued)",
"MONGO DB",
"MONGO DB (continued)",
"NO SQL (or similar technologies)",
"NO SQL (or similar technologies) (continued)"
]
}
};
