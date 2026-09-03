// Seed content for HEC's 14 Major compulsory courses: CLOs are HEC's stated
// outcomes (Bloom level inferred from the verb); lecture topics are a real
// 32-lecture (16-week) breakdown, sourced from published university syllabi
// (several from Pakistani institutions) where found, and synthesized from
// standard textbook progressions otherwise. Both seed as an editable DRAFT —
// nothing here is meant to be final without Subject Expert review.
export const HEC_COURSE_SEED_CONTENT: Record<string, { clos: { statement: string; bloomLevel: string }[]; topics: string[] }> = {
  "CS-101": {
    clos: [
      { statement: "Demonstrate proficiency in writing, debugging, and executing basic programs using programming languages such as C or Python.", bloomLevel: "C3" },
      { statement: "Explain core programming concepts including variables, control structures, functions, and data types.", bloomLevel: "C2" },
      { statement: "Develop simple algorithms to solve computational problems.", bloomLevel: "C3" },
      { statement: "Apply best practices in coding to produce efficient and readable programs.", bloomLevel: "C3" },
      { statement: "Analyze program outputs and troubleshoot common errors effectively.", bloomLevel: "C4" },
    ],
    topics: ["Introduction to Computers & Programming", "Problem Solving & Algorithms", "Introduction to C++ Syntax", "Variables & Data Types", "Operators & Expressions", "Input/Output Statements", "Conditional Statements (if-else)", "Switch Statements", "Loops - while", "Loops - for", "Loops - do-while", "Nested Loops", "Functions - Basics", "Function Parameters & Return Values", "Recursion Basics", "Arrays - 1D", "Arrays - 2D", "String Handling", "Pointers - Basics", "Pointers & Arrays", "Dynamic Memory Allocation", "Structures", "File Handling - Basics", "File Handling - Read/Write", "Introduction to Classes & Objects", "Constructors & Destructors", "Function Overloading", "Introduction to Inheritance", "Debugging Techniques", "Code Optimization Basics", "Review & Practice Problems", "Final Project Presentation"],
  },
  "CS-102": {
    clos: [
      { statement: "Understand and apply the principles of object-oriented programming, including encapsulation, inheritance, and polymorphism.", bloomLevel: "C2" },
      { statement: "Design and implement classes and objects to model real-world entities.", bloomLevel: "C5" },
      { statement: "Write reusable and modular code using OOP concepts.", bloomLevel: "C3" },
      { statement: "Analyze the advantages of OOP over procedural programming paradigms.", bloomLevel: "C4" },
      { statement: "Develop small-scale applications utilizing OOP concepts in languages like Java or C++.", bloomLevel: "C3" },
    ],
    topics: ["Review of Procedural vs OOP", "Classes and Objects", "Data Abstraction & Encapsulation", "Access Specifiers", "Constructors - Types", "Destructors", "this Pointer", "Static Members", "Friend Functions", "Operator Overloading - Unary", "Operator Overloading - Binary", "Inheritance - Single", "Inheritance - Multiple", "Inheritance - Multilevel", "Function Overriding", "Virtual Functions", "Abstract Classes", "Polymorphism - Compile Time", "Polymorphism - Run Time", "Interfaces", "Templates - Function", "Templates - Class", "Exception Handling - Basics", "Exception Handling - try/catch/throw", "File I/O with Classes", "Collections & Generics", "Design Patterns - Introduction", "UML Class Diagrams", "Case Study - Library Management System", "Case Study - Continued", "Review & Best Practices", "Final Project Presentation"],
  },
  "CS-103": {
    clos: [
      { statement: "Draw and interpret digital logic diagrams, including combinational and sequential circuits.", bloomLevel: "C3" },
      { statement: "Design basic digital components such as multiplexers, flip-flops, and encoders.", bloomLevel: "C5" },
      { statement: "Analyze the behavior of digital systems using truth tables and Boolean algebra.", bloomLevel: "C4" },
      { statement: "Implement simple digital circuits using logic gates.", bloomLevel: "C3" },
      { statement: "Understand the fundamentals of digital system design and their applications.", bloomLevel: "C2" },
    ],
    topics: ["Number Systems", "Number System Conversions", "Binary Arithmetic", "Boolean Algebra Basics", "Boolean Algebra Laws", "Logic Gates - Basic", "Logic Gates - Universal", "Truth Tables", "Karnaugh Maps - 2/3 Variable", "Karnaugh Maps - 4 Variable", "SOP & POS Forms", "Combinational Circuits - Adders", "Combinational Circuits - Subtractors", "Multiplexers", "Demultiplexers", "Encoders", "Decoders", "Comparators", "Introduction to Sequential Circuits", "Flip-Flops - SR", "Flip-Flops - JK", "Flip-Flops - D & T", "Registers", "Shift Registers", "Counters - Asynchronous", "Counters - Synchronous", "State Diagrams", "State Tables", "Finite State Machine Design", "Memory Devices Overview", "Review & Circuit Design Lab", "Final Project Presentation"],
  },
  "CS-104": {
    clos: [
      { statement: "Implement and analyze various data structures such as arrays, linked lists, stacks, queues, trees, and graphs.", bloomLevel: "C4" },
      { statement: "Select appropriate data structures to optimize algorithm performance.", bloomLevel: "C4" },
      { statement: "Demonstrate proficiency in traversing and manipulating data structures.", bloomLevel: "C3" },
      { statement: "Evaluate the efficiency of algorithms based on data structure choices.", bloomLevel: "C5" },
      { statement: "Solve complex problems using suitable data structures and algorithms.", bloomLevel: "C3" },
    ],
    topics: ["Introduction to Data Structures & ADTs", "Arrays Review", "Analysis of Algorithms - Big O", "Analysis - Omega & Theta", "Linked Lists - Singly", "Linked Lists - Doubly", "Linked Lists - Circular", "Stacks - Implementation", "Stack Applications", "Queues - Implementation", "Queue Applications - Circular Queue", "Recursion & Data Structures", "Trees - Introduction", "Binary Trees", "Binary Search Trees", "BST Operations", "Tree Traversals", "AVL Trees", "Heaps & Priority Queues", "Heapsort", "Hashing - Concepts", "Hash Tables & Collision Resolution", "Graphs - Representation", "Graph Traversals - BFS", "Graph Traversals - DFS", "Shortest Path Algorithms", "Minimum Spanning Trees", "Sorting - Insertion & Selection", "Sorting - Merge Sort", "Sorting - Quick Sort", "Sorting - Radix & Counting Sort", "Review & Case Studies"],
  },
  "CS-105": {
    clos: [
      { statement: "Design and normalize relational database schemas based on user requirements.", bloomLevel: "C5" },
      { statement: "Write SQL queries for data retrieval, insertion, update, and deletion.", bloomLevel: "C3" },
      { statement: "Explain the concepts of database transactions, concurrency, and recovery.", bloomLevel: "C2" },
      { statement: "Implement basic database management tasks using popular database management systems.", bloomLevel: "C3" },
      { statement: "Analyze the role of databases in information systems and their security considerations.", bloomLevel: "C4" },
    ],
    topics: ["Introduction to Databases", "Database System Concepts & Architecture", "Data Models & Schemas", "Entity-Relationship Model", "ER Diagrams - Advanced", "Enhanced ER (EER) Model", "Relational Model Concepts", "Relational Constraints", "ER-to-Relational Mapping", "SQL - Data Definition", "SQL - Basic Queries", "SQL - Insert/Update/Delete", "SQL - Complex Queries & Joins", "SQL - Subqueries", "SQL - Aggregate Functions", "Relational Algebra", "Functional Dependencies", "Normalization - 1NF, 2NF", "Normalization - 3NF, BCNF", "Database Design Process", "Transaction Concepts", "Concurrency Control", "Locking Protocols", "Timestamp-Based Protocols", "Database Recovery Techniques", "Indexing & Hashing", "Query Processing", "Query Optimization", "Database Security", "NoSQL Databases Overview", "Database Project - Design", "Database Project - Implementation & Review"],
  },
  "CS-106": {
    clos: [
      { statement: "Explain the functions and services provided by operating systems.", bloomLevel: "C2" },
      { statement: "Manage processes, threads, and synchronization mechanisms.", bloomLevel: "C3" },
      { statement: "Analyze memory management techniques and file systems.", bloomLevel: "C4" },
      { statement: "Implement basic scheduling algorithms.", bloomLevel: "C3" },
      { statement: "Evaluate operating system performance and security features.", bloomLevel: "C5" },
    ],
    topics: ["Introduction to Operating Systems", "OS Structures & Services", "System Calls", "Process Concept", "Process Scheduling", "Operations on Processes", "Inter-Process Communication", "Threads - Concepts", "Multithreading Models", "CPU Scheduling - FCFS, SJF", "CPU Scheduling - Priority, Round Robin", "Multiprocessor Scheduling", "Process Synchronization - Critical Section", "Synchronization - Semaphores", "Classical Synchronization Problems", "Monitors", "Deadlocks - Characterization", "Deadlock Prevention & Avoidance", "Deadlock Detection & Recovery", "Memory Management - Basics", "Contiguous Memory Allocation", "Paging", "Segmentation", "Virtual Memory - Demand Paging", "Page Replacement Algorithms", "Thrashing", "File System - Concepts", "File System Implementation", "Mass Storage Structure", "Disk Scheduling", "Protection & Security", "Review & Case Studies (Linux/Windows)"],
  },
  "CS-107": {
    clos: [
      { statement: "Apply software development life cycle models to manage projects effectively.", bloomLevel: "C3" },
      { statement: "Develop software requirements specifications and design documents.", bloomLevel: "C3" },
      { statement: "Implement and test software applications using best practices.", bloomLevel: "C3" },
      { statement: "Analyze and manage software project risks and quality.", bloomLevel: "C4" },
      { statement: "Collaborate effectively in team-based software projects.", bloomLevel: "C3" },
    ],
    topics: ["Introduction to Software Engineering", "Software Process Models - Waterfall", "Software Process Models - Agile", "Scrum Framework", "Requirements Engineering - Elicitation", "Requirements Specification (SRS)", "Requirements Analysis", "Use Case Modeling", "UML - Class Diagrams", "UML - Sequence Diagrams", "UML - Activity Diagrams", "Software Design Principles", "Architectural Design", "Design Patterns", "User Interface Design", "Component-Level Design", "Coding Standards & Practices", "Software Testing - Concepts", "Unit Testing", "Integration Testing", "System & Acceptance Testing", "Test Case Design Techniques", "Software Quality Assurance", "Software Metrics", "Project Planning & Estimation", "Risk Management", "Software Configuration Management", "Software Maintenance", "Team Project - Requirements Phase", "Team Project - Design Phase", "Team Project - Implementation & Testing", "Team Project - Presentation & Review"],
  },
  "CS-108": {
    clos: [
      { statement: "Describe the structure and function of computer components such as CPU, memory, and I/O devices.", bloomLevel: "C2" },
      { statement: "Write and understand basic assembly language programs.", bloomLevel: "C3" },
      { statement: "Analyze how hardware components interact during program execution.", bloomLevel: "C4" },
      { statement: "Explain the concepts of instruction set architecture and microarchitecture.", bloomLevel: "C2" },
      { statement: "Optimize programs considering hardware limitations.", bloomLevel: "C5" },
    ],
    topics: ["Introduction to Computer Organization", "Computer Function & Interconnection", "Number Representation", "Data Representation - Floating Point", "Register Transfer Language", "Micro-operations", "Instruction Set Architecture", "Addressing Modes", "CPU Organization", "Instruction Cycle", "Control Unit - Hardwired", "Control Unit - Microprogrammed", "Arithmetic Logic Unit Design", "Booth's Algorithm", "Memory Hierarchy", "Cache Memory - Concepts", "Cache Mapping Techniques", "Main Memory Organization", "Virtual Memory Concepts", "Input/Output Organization", "I/O Interface Techniques", "Interrupts", "DMA (Direct Memory Access)", "Pipelining - Concepts", "Pipeline Hazards", "Instruction-Level Parallelism", "RISC vs CISC", "Multiprocessors - Basics", "Assembly Language Programming - Basics", "Assembly Language Programming - Advanced", "Review & Architecture Case Studies", "Final Project Presentation"],
  },
  "CS-109": {
    clos: [
      { statement: "Design efficient algorithms for common computational problems.", bloomLevel: "C5" },
      { statement: "Analyze algorithm complexity using Big O notation.", bloomLevel: "C4" },
      { statement: "Solve problems involving recursion, divide-and-conquer, and dynamic programming.", bloomLevel: "C3" },
      { statement: "Compare different algorithmic approaches to problem-solving.", bloomLevel: "C4" },
      { statement: "Demonstrate correctness and optimality of algorithms.", bloomLevel: "C3" },
    ],
    topics: ["Introduction to Algorithm Analysis", "Asymptotic Notations - Big O", "Asymptotic Notations - Omega, Theta", "Recurrence Relations", "Master Theorem", "Divide and Conquer - Concepts", "Merge Sort Analysis", "Quick Sort Analysis", "Binary Search & Variants", "Greedy Algorithms - Concepts", "Activity Selection Problem", "Huffman Coding", "Dynamic Programming - Concepts", "Fibonacci & Memoization", "0/1 Knapsack Problem", "Longest Common Subsequence", "Matrix Chain Multiplication", "Graph Algorithms - BFS/DFS Review", "Minimum Spanning Trees - Kruskal", "Minimum Spanning Trees - Prim", "Shortest Path - Dijkstra", "Shortest Path - Bellman-Ford", "All-Pairs Shortest Path - Floyd-Warshall", "Backtracking - Concepts", "N-Queens Problem", "Branch and Bound", "String Matching Algorithms", "NP-Completeness - Introduction", "NP-Complete Problems", "Approximation Algorithms", "Review & Problem Solving", "Final Project Presentation"],
  },
  "CS-110": {
    clos: [
      { statement: "Explain the fundamental concepts of computer networking, including protocols, topologies, and models (OSI, TCP/IP).", bloomLevel: "C2" },
      { statement: "Configure and troubleshoot basic network devices and connections.", bloomLevel: "C3" },
      { statement: "Analyze network security threats and mitigation techniques.", bloomLevel: "C4" },
      { statement: "Demonstrate understanding of data transmission and error handling.", bloomLevel: "C3" },
      { statement: "Design simple network architectures to meet organizational needs.", bloomLevel: "C5" },
    ],
    topics: ["Introduction to Computer Networks", "Network Topologies", "OSI Reference Model", "TCP/IP Model", "Physical Layer - Transmission Media", "Data Link Layer - Framing", "Error Detection & Correction", "Medium Access Control", "Ethernet & LAN Technologies", "Network Layer - Addressing", "IP Addressing & Subnetting", "Routing Algorithms - Distance Vector", "Routing Algorithms - Link State", "Network Layer Protocols - IP, ICMP", "Transport Layer - UDP", "Transport Layer - TCP", "TCP Connection Management", "Congestion Control", "Application Layer - DNS", "Application Layer - HTTP/HTTPS", "Application Layer - FTP, SMTP", "Wireless Networks - Basics", "Wireless LAN (WiFi)", "Network Security - Threats", "Network Security - Firewalls", "Cryptography Basics for Networks", "VPNs", "Network Devices - Switches, Routers", "Software Defined Networking - Intro", "Network Troubleshooting", "Review & Lab Practice", "Final Project Presentation"],
  },
  "CS-111": {
    clos: [
      { statement: "Explain fundamental concepts of information security, including confidentiality, integrity, and availability.", bloomLevel: "C2" },
      { statement: "Identify common security threats and vulnerabilities.", bloomLevel: "C2" },
      { statement: "Apply security measures such as encryption, authentication, and access control.", bloomLevel: "C3" },
      { statement: "Conduct basic security audits and risk assessments.", bloomLevel: "C3" },
      { statement: "Understand legal and ethical issues related to information security.", bloomLevel: "C2" },
    ],
    topics: ["Introduction to Information Security", "CIA Triad - Confidentiality, Integrity, Availability", "Security Threats & Attacks", "Malware Types", "Social Engineering Attacks", "Cryptography - Basics", "Symmetric Key Cryptography", "Asymmetric Key Cryptography", "Hash Functions", "Digital Signatures", "Public Key Infrastructure", "Authentication Mechanisms", "Access Control Models", "Network Security Basics", "Firewalls & Intrusion Detection", "Web Application Security", "SQL Injection & XSS", "Security Protocols - SSL/TLS", "Wireless Security", "Operating System Security", "Database Security", "Risk Assessment", "Security Policies", "Security Audits", "Incident Response", "Disaster Recovery Planning", "Legal & Ethical Issues in Security", "Cyber Laws", "Case Studies - Real World Breaches", "Emerging Security Threats", "Review & Security Lab", "Final Project Presentation"],
  },
  "CS-112": {
    clos: [
      { statement: "Describe core AI concepts including search algorithms, knowledge representation, and reasoning.", bloomLevel: "C2" },
      { statement: "Implement basic AI algorithms for problem-solving and decision-making.", bloomLevel: "C3" },
      { statement: "Analyze the applications of AI in real-world scenarios.", bloomLevel: "C4" },
      { statement: "Discuss ethical considerations and limitations of AI systems.", bloomLevel: "C2" },
      { statement: "Develop simple AI models using appropriate tools and frameworks.", bloomLevel: "C3" },
    ],
    topics: ["Introduction to AI", "History & Applications of AI", "Intelligent Agents", "Problem Solving as Search", "Uninformed Search - BFS, DFS", "Informed Search - A*", "Heuristic Functions", "Local Search & Optimization", "Adversarial Search - Minimax", "Alpha-Beta Pruning", "Constraint Satisfaction Problems", "Knowledge Representation - Logic", "Propositional Logic", "First-Order Logic", "Inference in Logic", "Rule-Based Systems", "Uncertainty & Probability Basics", "Bayesian Networks", "Introduction to Machine Learning", "Supervised Learning - Concepts", "Decision Trees", "Neural Networks - Basics", "Introduction to Natural Language Processing", "NLP Applications", "Computer Vision - Basics", "Expert Systems", "Planning in AI", "Robotics - Basics", "Ethics in AI", "AI Tools & Frameworks Overview", "Review & Case Studies", "Final Project Presentation"],
  },
  "CS-113": {
    clos: [
      { statement: "Explain the concepts of finite automata, regular expressions, and formal languages.", bloomLevel: "C2" },
      { statement: "Design automata to recognize specific languages.", bloomLevel: "C5" },
      { statement: "Demonstrate the equivalence of automata, regular expressions, and grammars.", bloomLevel: "C3" },
      { statement: "Analyze the limitations of finite automata and context-free grammars.", bloomLevel: "C4" },
      { statement: "Apply automata theory to compiler design and language processing.", bloomLevel: "C3" },
    ],
    topics: ["Introduction to Automata Theory", "Alphabets, Strings & Languages", "Finite Automata - Deterministic (DFA)", "DFA Design Examples", "Finite Automata - Non-Deterministic (NFA)", "NFA to DFA Conversion", "NFA with Epsilon Transitions", "Regular Expressions", "Regular Expressions to Automata", "Equivalence of RE and FA", "Regular Languages - Closure Properties", "Pumping Lemma for Regular Languages", "Minimization of DFA", "Moore & Mealy Machines", "Context-Free Grammars - Introduction", "CFG Derivations & Parse Trees", "Ambiguity in Grammars", "Simplification of CFGs", "Chomsky Normal Form", "Greibach Normal Form", "Pushdown Automata - Introduction", "PDA Design", "Equivalence of PDA and CFG", "Pumping Lemma for CFLs", "Context-Free Languages - Closure Properties", "Turing Machines - Introduction", "Turing Machine Design", "Variations of Turing Machines", "Decidability", "Undecidability & Halting Problem", "Chomsky Hierarchy Review", "Review & Problem Solving"],
  },
  "CS-114": {
    clos: [
      { statement: "Describe fundamental cloud computing models and services (IaaS, PaaS, SaaS).", bloomLevel: "C2" },
      { statement: "Deploy and manage applications in cloud environments.", bloomLevel: "C3" },
      { statement: "Analyze the benefits and challenges of cloud computing.", bloomLevel: "C4" },
      { statement: "Implement basic cloud security and compliance measures.", bloomLevel: "C3" },
      { statement: "Evaluate cloud solutions for scalability, cost, and performance.", bloomLevel: "C3" },
    ],
    topics: ["Introduction to Cloud Computing", "Evolution of Cloud Computing", "Cloud Computing Characteristics", "Cloud Service Models - IaaS", "Cloud Service Models - PaaS", "Cloud Service Models - SaaS", "Cloud Deployment Models", "Virtualization - Concepts", "Hypervisors", "Virtual Machines vs Containers", "Introduction to Docker", "Container Orchestration - Kubernetes Basics", "Cloud Storage Systems", "Cloud Networking Basics", "Major Cloud Providers Overview (AWS, Azure, GCP)", "AWS Core Services", "Cloud Computing Architecture", "Load Balancing in the Cloud", "Auto-Scaling", "Cloud Databases", "Serverless Computing", "Cloud Security Fundamentals", "Identity & Access Management in Cloud", "Cloud Compliance & Governance", "Cost Management in Cloud", "Cloud Migration Strategies", "Disaster Recovery in Cloud", "DevOps in Cloud Environments", "Multi-Cloud & Hybrid Cloud", "Emerging Trends - Edge Computing", "Review & Cloud Lab", "Final Project Presentation"],
  },
};
