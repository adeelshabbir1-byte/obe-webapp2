// HEC/NCEAC Computing Disciplines 2023 (No. 5-4/HEC/CURR/COMP/2023/4394): each course outline's "Course Outline" text and
// its "Reference Materials" (the first listed book is kept as the textbook, the rest as references) — as printed in the document.
export type Cd23Books = { outline: string; textbook: string; references: string[] };
export const CD2023_BOOKS: Record<string, Cd23Books> = {
"Programming Fundamentals": {
"outline": "Introduction to problem solving, a brief review of Von-Neumann architecture, Introduction to programming, role of compiler and linker, introduction to algorithms, basic data types and variables, input/output constructs, arithmetic, comparison and logical operators, conditional statements and execution flow for conditional statements, repetitive statements and execution flow for repetitive statements, lists and their memory organization, multidimensional lists, introduction to modular programming, function definition and calling, stack rolling and unrolling, string and string operations, pointers/references, static and dynamic memory allocation, File I/O operations.",
"textbook": "Starting out with Programming Logic & Degins, 4th Edition, Tony Gaddis",
"references": [
"The C Programming Language, 2nd Edition by Brian W. Kernighan, Dennis M. Ritchie",
"Object Oriented Programming in C++ by Robert Lafore",
"C How to Program, 7th Edition by Paul Deitel & Harvey Deitel",
"Problem Solving and Program Design in C++, 7th Edition by Jeri R. Hanly & Elliot B. Koffman"
]
},
"Object Oriented Programming": {
"outline": "Introduction to object oriented design, history and advantages of object oriented design, introduction to object oriented programming concepts, classes, objects, data encapsulation, constructors, destructors, access modifiers, const vs non-const functions, static data members & functions, function overloading, operator overloading, identification of classes and their relationships, composition, aggregation, inheritance, multiple inheritance, polymorphism, abstract classes and interfaces, generic programming concepts, function & class templates, standard template library, object streams, data and object serialization using object streams, exception handling.",
"textbook": "Java: How to Program, 9th Edition by Paul Deitel",
"references": [
"Beginning Java 2, 7th Edition by Ivor Horton",
"An Introduction to Object Oriented Programming with Java, 5th Edition by C. Thomas Wu",
"Starting Out with C++ from Control Structures to Objects, 9th Edition, Tony Gaddis",
"C++ How to Program, 10th Edition, Deitel & Deitel.",
"Object Oriented Programming in C++, 3rd Edition by Robert Lafore"
]
},
"Data Structures": {
"outline": "Abstract data types, complexity analysis, Big Oh notation, Stacks (linked lists and array implementations), Recursion and analyzing recursive algorithms, divide and conquer algorithms, Sorting algorithms (selection, insertion, merge, quick, bubble, heap, shell, radix, bucket), queue, dequeuer, priority queues (linked and array implementations of queues), linked list & its various types, sorted linked list, searching an unsorted array, binary search for sorted arrays, hashing and indexing, open addressing and chaining, trees and tree traversals, binary search trees, heaps, M-way tress, balanced trees, graphs, breadth-first and depth-first traversal, topological order, shortest path, adjacency matrix and adjacency list implementations, memory management and garbage collection.",
"textbook": "Data Structures and Algorithm Analysis in Java by Mark A. Weiss",
"references": [
"Data Structures and Abstractions with Java by Frank M. Carrano & Timothy M. Henry",
"Data Structures and Algorithms in C++ by Adam Drozdek",
"Data Structures and Algorithm Analysis in C++ by Mark Allen Weiss Java Software Structures: Designing and Using Data Structures by John Lewis and Joseph Chase"
]
},
"Computer Organization and Assembly Language": {
"outline": "Introduction to computer systems: Information is bits + context, programs are translated by other programs into different forms, it pays to understand how compilation systems work, processors read and interpret instructions stored in memory, caches matter, storage devices form a hierarchy, the operating system manages the hardware, systems communicate with other systems using networks; Representing and manipulating information: information storage, integer representations, integer arithmetic, floating point; Machine-level representation of programs: a historical perspective, program encodings, data formats, accessing information, arithmetic and logical operations, control, procedures, array allocation and access, heterogeneous data structures, putting it together: understanding pointers, life in the real world: using the gdb debugger, out of-bounds memory references and buffer overflow, x86-64: extending ia32 to 64 bits, machine-level representations of floating-point programs; Processor architecture: the Y86 instruction set architecture, logic design and the Hardware Control Language (HCL), sequential Y86 implementations, general principles of pipelining, pipelined Y86 implementations",
"textbook": "Computer System Architecture, M. Morris Mano, Latest Edition",
"references": [
"Assembly Language Programming for Intel- Computer, Latest Edition",
"Computer Systems: A Programmer's Perspective, 3/E (CS:APP3e), Randal E. Bryant and David R.O' Hallaron, Carnegie Mellon University",
"Robert Britton, MIPS Assembly Language Programming, Latest Edition"
]
},
"Digital Logic Design": {
"outline": "Number Systems, Logic Gates, Boolean Algebra, Combination logic circuits and designs, Simplification Methods (K-Map, Quinn Mc-Cluskey method), Flip Flops and Latches, Asynchronous and Synchronous circuits, Counters, Shift Registers, Counters, Triggered devices & its types. Mealy machines and Moore machines. Binary Arithmetic and Arithmetic Circuits, Memory Elements, State Machines. Introduction Programmable Logic Devices (CPLD, FPGA) Lab Assignments using tools such as Verilog HDL/VHDL, MultiSim.",
"textbook": "Digital Fundamentals by Floyd, 11/e.",
"references": [
"Fundamental of Digital Logic with Verilog Design, Stephen Brown, 2/e"
]
},
"Operating Systems": {
"outline": "Operating systems basics, system calls, process concept and scheduling, inter-process communication, multithreaded programming, multithreading models, threading issues, process scheduling algorithms, thread scheduling, multiple-processor scheduling, synchronization, critical section, synchronization hardware, synchronization problems, deadlocks, detecting and recovering from deadlocks, memory management, swapping, contiguous memory allocation, segmentation & paging, virtual memory management, demand paging, thrashing, memory-mapped files, file systems, file concept, directory and disk structure, directory implementation, free space management, disk structure and scheduling, swap space management, system protection, virtual machines, operating system security",
"textbook": "Operating Systems Concepts, 9th edition by Abraham Silberschatz",
"references": [
"Modern Operating Systems, 4th edition by Andrew S. Tanenbaum",
"Operating Systems, Internals and Design Principles, 9th edition by William StallingsWu"
]
},
"Database System": {
"outline": "Basic database concepts, Database approach vs. file based system, database architecture, three level schema architecture, data independence, relational data model, attributes, schemas, tuples, domains, relation instances, keys of relations, integrity constraints, relational algebra, selection, projection, Cartesian product, types of joins, normalization, functional dependencies, normal forms, entity relationship model, entity sets, attributes, relationship, entity-relationship diagrams, Structured Query Language (SQL), Joins and subqueries in SQL, Grouping and aggregation in SQL, concurrency control, database backup and recovery, indexes, NoSQL systems.",
"textbook": "Database Systems: A Practical Approach to Design, Implementation, and Management, 6th Edition by Thomas Connolly and Carolyn Begg",
"references": [
"Database Systems: The Complete Book, 2nd Edition by Hector Garcia-Molina, Jeffrey D. Ullman, Jennifer Widom",
"Database System Concepts, 6th Edition by Avi Silberschatz, Henry F. Korth and S. Sudarshan.",
"Database Management Systems, 3rd Edition by Raghu Ramakrishnan, Johannes Gehrke"
]
},
"Information Security": {
"outline": "Information security foundations, security design principles; security mechanisms, symmetric and asymmetric cryptography, encryption, hash functions, digital signatures, key management, authentication and access control; software security, vulnerabilities and protections, malware, database security; network security, firewalls, intrusion detection; security policies, policy formation and enforcement, risk assessment, cybercrime, law and ethics in information security, privacy and anonymity of data.",
"textbook": "Computer Security: Principles and Practice, 3rd edition by William Stallings",
"references": [
"Principles of Information Security, 6th edition by M. Whitman and H. Mattord",
"Computer Security, 3rd edition by Dieter Gollmann",
"Computer Security Fundamentals, 3rd edition by William Easttom",
"Official (ISC)2 Guide to the CISSP CBK, 3rd edition"
]
},
"Computer Networks": {
"outline": "Introduction and protocols architecture, basic concepts of networking, network topologies, layered architecture, physical layer functionality, data link layer functionality, multiple access techniques, circuit switching and packet switching, LAN technologies, wireless networks, MAC addressing, networking devices, network layer protocols, IPv4 and IPv6, IP addressing, sub netting, CIDR, routing protocols, transport layer protocols, ports and sockets, connection establishment, flow and congestion control, application layer protocols, latest trends in computer networks.",
"textbook": "Computer Networking: A Top-Down Approach Featuring the Internet, 6th edition by James F. Kurose and Keith W. Ross",
"references": [
"Computer Networks, 5th Edition by Andrew S. Tanenbaum",
"Data and Computer Communications, 10th Edition by William Stallings",
"Data Communication and Computer Networks, 5th Edition by Behrouz A. Forouzan"
]
},
"Software Engineering": {
"outline": "Nature of Software, Overview of Software Engineering, Professional software development, Software engineering practice, Software process structure, Software process models, Agile software Development, Agile process models, Agile development techniques, Requirements engineering process, Functional and non-functional requirements, Context models, Interaction models, Structural models, behavioral models, model driven engineering, Architectural design, Design and implementation, UML diagrams, Design patterns, Software testing and quality assurance, Software evolution, Project management and project planning, configuration management, Software Process improvement",
"textbook": "Software Engineering, Sommerville I., 10th Edition, Pearson Inc., 2014",
"references": [
"Software Engineering, A Practitioner’s Approach, Pressman R. S.& Maxim B. R., 8 th Edition, McGraw-Hill, 2015."
]
},
"Analysis of Algorithms": {
"outline": "Introduction; role of algorithms in computing, Analysis on nature of input and size of input Asymptotic notations; Big-O, Big Ω, Big Θ, little-o, little-ω, Sorting Algorithm analysis, loop invariants, Recursion and recurrence relations; Algorithm Design Techniques, Brute Force Approach, Divide-and-conquer approach; Merge, Quick Sort, Greedy approach; Dynamic programming; Elements of Dynamic Programming, Search trees; Heaps; Hashing; Graph algorithms, shortest paths, sparse graphs, String matching; Introduction to complexity classes.",
"textbook": "Introduction to Algorithms (3rd edition) by Thomas H. Corman, Charles E. Leiserson, Ronald L. Rivest and Clifford Stein",
"references": [
"Algorithm Design, (1st edition, 2013/2014), Jon Kleinberg, Eva Tardos",
"Algorithms, (4th edition, 2011), Robert Sedgewick, Kevin Wayne"
]
},
"Artificial Intelligence": {
"outline": "An Introduction to Artificial Intelligence and its applications towards Knowledge Based Systems; Introduction to Reasoning and Knowledge Representation, Problem Solving by Searching (Informed searching, Uninformed searching, Heuristics, Local searching, Minmax algorithm, Alpha beta pruning, Game-playing); Case Studies: General Problem Solver, Eliza, Student, Macsyma; Learning from examples; ANN and Natural Language Processing; Recent trends in AI and applications of AI algorithms. Python programming language will be used to explore and illustrate various issues and techniques in Artificial Intelligence.",
"textbook": "Russell, S. and Norvig, P. “Artificial Intelligence. A Modern Approach”, 3rd ed, Prentice Hall, Inc., 2015.",
"references": [
"Norvig, P., “Paradigms of Artificial Intelligence Programming: Case studies in Common Lisp”, Morgan Kaufman Publishers, Inc., 1992.",
"Luger, G.F. and Stubblefield, W.A., “AI algorithms, data structures, and idioms in Prolog, Lisp, and Java”, Pearson Addison-Wesley. 2009.",
"Severance, C.R., 2016. “Python for everybody: Exploring data using Python 3.” CreateSpace Independent Publ Platform.",
"Miller, B.N., Ranum, D.L. and Anderson, J., 2019. “Python programming in context.” Jones & Bartlett Pub.",
"Joshi, P., 2017. “Artificial intelligence with python.” Packt Publishing Ltd."
]
},
"Parallel and Distributed Computing": {
"outline": "Asynchronous/synchronous computation/communication, concurrency control, fault tolerance, GPU architecture and programming, heterogeneity, interconnection topologies, load balancing, memory consistency model, memory hierarchies, Message passing interface (MPI), MIMD/SIMD, multithreaded programming, parallel algorithms & architectures, parallel I/O, performance analysis and tuning, power, programming models (data parallel, task parallel, process-centric, shared/distributed memory), scalability and performance studies, scheduling, storage systems, synchronization, and tools (Cuda, Swift, Globus, Condor, Amazon AWS, OpenStack, Cilk, gdb, threads, MPICH, OpenMP, Hadoop, FUSE).",
"textbook": "Distributed Systems: Principles and Paradigms, A. S. Tanenbaum and M. V. Steen, Prentice Hall, 2nd Edition, 2007",
"references": [
"Distributed and Cloud Computing: Clusters, Grids, Clouds, and the Future Internet, K Hwang, J Dongarra and GC. C. Fox, Elsevier, 1st Ed."
]
},
"Calculus and Analytic Geometry": {
"outline": "Limits and Continuity; Introduction to functions, Introduction to limits, Techniques of funding limits, Indeterminate forms of limits, Continuous and discontinuous functions and their applications, Differential calculus; Concept and idea of differentiation, Geometrical and Physical meaning of derivatives, Rules of differentiation, Techniques of differentiation, Rates of change, Tangents and Normals lines, Chain rule, implicit differentiation, linear approximation, Applications of differentiation; Extreme value functions, Mean value theorems, Maxima and Minima of a function for single-variable, Concavity, Integral calculus; Concept and idea of Integration, Indefinite Integrals, Techniques of integration, Riemann sums and Definite Integrals, Applications of definite integrals, Improper integral, Applications of Integration; Area under the curve, Analytical Geometry; Straight lines in R3, Equations for planes.",
"textbook": "Calculus and Analytic Geometry by Kenneth W. Thomas.",
"references": [
"Calculus by Stewart, James.",
"Calculus by Earl William Swokowski; Michael Olinick; Dennis Pence; Jeffery A. Cole"
]
},
"Linear Algebra": {
"outline": "Algebra of linear transformations and matrices. determinants, rank, systems of equations, vector spaces, orthogonal transformations, linear dependence, linear Independence and bases, eigenvalues and eigenvectors, characteristic equations, Inner product space and quadratic forms",
"textbook": "Elementary Linear Algebra by Howard Anton",
"references": [
"Linear Algebra and its Applications by Gibert Strang"
]
},
"Probability and Statistics": {
"outline": "Introduction to Statistics and Data Analysis, Statistical Inference, Samples, Populations, and the Role of Probability. Sampling Procedures. Discrete and Continuous Data. Statistical Modeling. Types of Statistical Studies. Probability: Sample Space, Events, Counting Sample Points, Probability of an Event, Additive Rules, Conditional Probability, Independence, and the Product Rule, Bayes’ Rule. Random Variables and Probability Distributions. Mathematical Expectation: Mean of a Random Variable, Variance and Covariance of Random Variables, Means and Variances of Linear Combinations of Random Variables, Chebyshev’s Theorem. Discrete Probability Distributions. Continuous Probability Distributions. Fundamental Sampling Distributions and Data Descriptions: Random Sampling, Sampling Distributions, Sampling Distribution of Means and the Central Limit Theorem. Sampling Distribution of S2, t-Distribution, FQuantile and Probability Plots. Single Sample & Oneand Two-Sample Estimation Problems. Single Sample & Oneand Two-Sample Tests of Hypotheses. The Use of PValues for Decision Making in Testing Hypotheses (Single Sample & Oneand TwoSample Tests), Linear Regression and Correlation. Least Squares and the Fitted Model, Multiple Linear Regression and Certain, Nonlinear Regression Models, Linear Regression Model Using Matrices, Properties of the Least Squares Estimators.",
"textbook": "Probability and Statistics for Engineers and Scientists by Ronald E. Walpole, Raymond H. Myers, Sharon L. Myers and Keying E. Ye, Pearson; 9th Edition (January 6, 2011). ISBN-10: 0321629116",
"references": [
"Probability and Statistics for Engineers and Scientists by Anthony J. Hayter, Duxbury Press; 3rd Edition (February 3, 2006), ISBN-10:0495107573",
"Schaum's Outline of Probability and Statistics, by John Schiller, R. Alu Srinivasan and Murray Spiegel, McGraw-Hill; 3rd Edition (2008). ISBN-10:0071544259"
]
},
"Functional English": {
"outline": "Paragraph and Essay Writing, Descriptive Essays; Sentence Errors, Persuasive Writing; How to give presentations, Sentence Errors; Oral Presentations, Comparison and Contrast Essays, Dialogue Writing, Short Story Writing, Review Writing, Narrative Essays, Letter Writing",
"textbook": "College Writing Skills with Readings, by John Langan, McGraw-Hill, 5th Edition.",
"references": [
"A Textbook of English Prose and Structure by Arif Khattak, et al, GIKI Institute, 2000"
]
},
"Expository Writing": {
"outline": "Principles of writing good English, understanding the composition process: writing clearly; words, sentence and paragraphs; Comprehension and expression; Use of grammar and punctuation. Process of writing, observing, audience collecting, composing, drafting and revising, persuasive writing, reading skills, listening skills and comprehension, skills for taking notes in class, skills for exams; Business communications; planning messages, writing concise but with impact. Letter formats, mechanics of business, letter writing, letters, memo and applications, summaries, proposals, writing resumes, styles and formats, oral communications, verbal and non-verbal communication, conducting meetings, small group communication, taking minutes. Presentation skills; presentation strategies, defining the objective, scope and audience of the presentation, material gathering material organization strategies, time management, opening and concluding, use of audio-visual aids, delivery and presentation.",
"textbook": "Practical Business English, Collen Vawdrey, 1993, ISBN = 0256192740",
"references": [
"Effective Communication Skills: The Foundations for Change, John Nielsen, 2008, ISBN = 1453506748",
"College Writing Skills with Readings, by John Langan, McGraw-Hill, 5th Edition.",
"A Textbook of English Prose and Structure by Arif Khattak, et al, GIKI Institute, 2000"
]
},
"Technical and Business Writing": {
"outline": "Overview of technical reporting, use of library and information gathering, administering questionnaires, reviewing the gathered information; Technical exposition; topical arrangement, exemplification, definition, classification and division, casual analysis, effective exposition, technical narration, description and argumentation, persuasive strategy, Organizing information and generation solution: brainstorming, organizing material, construction of the formal outline, outlining conventions, electronic communication, generation solutions. Polishing style: paragraphs, listening sentence structure, clarity, length and order, pomposity, empty words, pompous vocabulary, document design: document structure, preamble, summaries, abstracts, table of contents, footnotes, glossaries, crossreferencing, plagiarism, citation and bibliography, glossaries, index, appendices, typesetting systems, creating the professional report; elements, mechanical elements and graphical elements. Reports: Proposals, progress reports, Leaflets, brochures, handbooks, magazines articles, research papers, feasibility reports, project reports, technical research reports, manuals and documentation, thesis. Electronic documents, Linear verses hierarchical structure documents.",
"textbook": "Technical Report Writing, by Pauley and Riordan, Houghton Mifflin Company, 8th Edition.",
"references": [
"Effective Technical Communication by Ashraf Rizvi, Tata McGraw-Hill."
]
},
"Islamic Studies": {
"outline": "Basic Themes of Quran, Introduction to Sciences of Hadith, Introduction to Islamic Jurisprudence, Primary & Secondary Sources of Islamic Law, Makken & Madnian life of the Prophet, Islamic Economic System, Political theories, Social System of Islam. Definition of Akhlaq.The Most Important Characters mentioned in the Holy Qur’an and Sunnah, SIDQ (Truthfulness)Generosity Tawakkaul(trust on Allah)Patience Taqua (piety). Haqooq ul ibad in the light of Quran & Hadith the important characteristic of Islamic Society.",
"textbook": "Introduction to Islam by Dr Hamidullah, Papular Library Publishers Lahore",
"references": [
"Principles of Islamic Jurisprudence by Ahmad Hassan, Islamic Research Institute, IIUI",
"Muslim Jurisprudence and the Quranic Law of Crimes, By Mir Waliullah, Islamic Books Services"
]
},
"Ideology and Constitution of Pakistan": {
"outline": "Historical background of Pakistan: Muslim society in Indo-Pakistan, the movement led by the societies, the downfall of Islamic society, the establishment of British Raj- Causes and consequences. Political evolution of Muslims in the twentieth century: Sir Syed Ahmed Khan; Muslim League; Nehru; Allama Iqbal: Independence Movement; Lahore Resolution; Pakistan culture and society, Constitutional and Administrative issues, Pakistan and its geopolitical dimension, Pakistan and International Affairs, Pakistan and the challenges ahead.",
"textbook": "The Emergence of Pakistan, Chaudary M., 1967",
"references": [
"The making of Pakistan, Aziz. 1976",
"A Short History of Pakistan, I. H. Qureshi, ed., Karachi, 1988"
]
},
"Professional Practices": {
"outline": "Historical, social, and economic context of Computing (software engineering, Computer Science, Information Technology); Definitions of Computing (software engineering, Computer Science, Information Technology) subject areas and professional activities; professional societies; professional ethics; professional competency and life-long learning; uses, misuses, and risks of software; information security and privacy; business practices and the economics of software; intellectual property and software law (cyber law); social responsibilities, software related contracts, Software house organization. Intellectual Property Rights, The Framework of Employee Relations Law and Changing Management Practices, Human Resource Management and IT, Health and Safety at Work, Software Liability, Liability and Practice, Computer Misuse and the Criminal Law, Regulation and Control of Personal Information. Overview of the British Computer Society Code of Conduct, IEEE Code of Ethics, ACM Code of Ethics and Professional Conduct, ACM/IEEE Software Engineering Code of Ethics and Professional Practice. Accountability and Auditing, Social Application of Ethics.",
"textbook": "Professional Issues in Software Engineering by Frank Bott, Allison Coleman, Jack Eaton and Diane Rowland, CRC Press; 3rd Edition (2000). ISBN-10: 0748409513",
"references": [
"Computer Ethics by Deborah G. Johnson, Pearson; 4th Edition (January 3, 2009). ISBN- 10: 0131112414",
"A Gift of Fire: Social, Legal, and Ethical Issues for Computing and the Internet (3rd Edition) by Sara Baase, Prentice Hall; 3rd Edition (2008). ISBN-10: 0136008488",
"Applied Professional Ethics by Gregory R. Beabout, University Press of America (1993). ISBN-10: 0819193747."
]
},
"Discrete Structure": {
"outline": "Mathematical reasoning, propositional and predicate logic, rules of inference, proof by induction, proof by contraposition, proof by contradiction, proof by implication, set theory, relations, equivalence relations and partitions, partial orderings, recurrence relations, functions, mappings, function composition, inverse functions, recursive functions, Number Theory, sequences, series, counting, inclusion and exclusion principle, pigeonhole principle, permutations and combinations. Algorithms, Searching and Sorting Algorithms, elements of graph theory, planar graphs, graph coloring, Graph Algorithms, euler graph, Hamiltonian path, rooted trees, traversals.",
"textbook": "Discrete Mathematics and Its Applications, 7th edition by Kenneth H. Rosen",
"references": [
"Discrete Mathematics with Applications, 4th Edition by Susanna S. Epp",
"Discrete Mathematics, 7th edition by Richard Johnson Baugh",
"Discrete Mathematical Structures, 4th edition by Kolman, Busby & Ross",
"Discrete and Combinatorial Mathematics: An Applied Introduction by Ralph P. Grimaldi",
"Logic and Discrete Mathematics: A Computer Science Perspective by Winifred Grassman"
]
},
"Applied Physics": {
"outline": "Electric force and its applications and related problems, conservation of charge, charge quantization, Electric fields due to point charge and lines of force. Ring of charge, Disk of charge, A point charge in an electric field, Dipole in a n electric field, The flux of vector field, The flux of electric field, Gauss’ Law, Application of Gauss’ Law, Spherically symmetric charge distribution, A charge isolated conductor, Electric potential energy, Electric potentials, Calculating the potential from the field and related problem Potential due to point and continuous charge distribution, Potential due to dipole, equipotential surfaces, Calculating the field from the potential , Electric current, Current density, Resistance, Resistivity and conductivity, Ohm’s law and its applications, The Hall effect, The magnetic force on a current, The Biot- Savart law, Line of B, Two parallel conductors, Amperes’ s Law, Solenoid, Toroids, Faraday’s experiments, Faraday’s Law of Induction, Lenz’s law, Motional emf, Induced electric field, Induced electric fields, The basic equation of electromagnetism, Induced Magnetic field, The displacement current, Reflection and Refraction of light waves, Total internal reflection, Two source interference, Double Slit interference, related problems, Interference from thin films, Diffraction and the wave theory, related problems, Single-Slit Diffraction, related problems, Polarization of electromagnetic waves, Polarizing sheets, related problems.",
"textbook": "Fundamentals of Physics (Extended), 10th edition, Resnick and Walker",
"references": [
"Narciso Garcia, Arthur Damask, Steven Schwarz., “Physics for Computer Science Students”, Springer Verlag, 1998."
]
},
"Introduction to Information and Communication Technologies": {
"outline": "Brief history of Computer, Four Stages of History, Computer Elements, Processor, Memory, Hardware, Software, Application Software its uses and Limitations, System Software its Importance and its Types, Types of Computer (Super, Mainframe, Mini and Micro Computer), Introduction to CBIS (Computer Based Information System), Methods of Input and Processing, Class2. Organizing Computer Facility, Centralized Computing Facility, Distributed Computing Facility, Decentralized Computing Facility, Input Devices. Keyboard and its Types, Terminal (Dump, Smart, Intelligent), Dedicated Data Entry, SDA (Source Data Automation), Pointing Devices, Voice Input, Output Devices. Soft- Hard Copies, Monitors and its Types, Printers and its Types, Plotters, Computer Virus and its Forms, Storage Units, Primary and Secondary Memories, RAM and its Types, Cache, Hard Disks, Working of Hard Disk, Diskettes, RAID, Optical Disk Storages (DVD, CD ROM), Magnetic Types, Backup System, Data Communications, Data Communication Model, Data Transmission, Digital and Analog Transmission, Modems, Asynchronous and Synchronous Transmission, Simplex. Half Duplex, Full Duplex Transmission, Communications, Medias (Cables, Wireless), Protocols, Network Topologies (Star, Bus, Ring), LAN, LAN, Internet, A Brief History, Birthplace of ARPA Net, Web Link, Browser, Internet Services provider and Online Services Providers, Function and Features of Browser, Search Engines, Some Common Services available on Internet.",
"textbook": "Charles S. Parker, Understanding Computers: Today and Tomorrow, Course Technology, 25 Thomson Place, Boston, Massachusetts 02210, USA",
"references": [
"Livesley, Robert Kenneth. An introduction to automatic digital computers. Cambridge University Press, 2017.",
"Zawacki-Richter, Olaf, and Colin Latchem. \"Exploring four decades of research in Computers & Education.\" Computers & Education 122 (2018): 136-152.",
"Sinha, Pradeep K., and Priti Sinha. Computer fundamentals. BPB publications, 2010.",
"Goel, Anita. Computer fundamentals. Pearson Education India, 2010. Artificial Intelligence Core"
]
},
"Artificial Neural Networks & Deep Learning": {
"outline": "Introduction and history of neural networks, Basic architecture of neural networks, Perceptron and Adaline (Minimum Error Learning) for classification. Basics of deep learning, learning networks, Shallow vs. Deep learning etc.; Machine learning theory – training and test sets, evaluation, etc. Selected topics from: Gradient descent (Delta) rule, Hebbian, Neo-Hebbian and Differential Hebbian Learning, Drive Reinforcement Theory, Kohonen Self Organizing Maps, Associative memory, Bi-directional associative memory (BAM), Energy surfaces, The Boltzmann machines, Backpropagation Networks, Feedforward Networks; Theory of Generalization; Multi-layer perceptrons, error backpropagation; Deep convolutional networks, Computational complexity of feed forward and deep convolutional neural networks; Unsupervised deep learning including auto-encoders; Deep belief networks; Restricted Boltzman Machines; Deep Recurrent Neural Networks (BPTT, LSTM, etc.); GPU programming for deep learning CuDNN; Generative adversarial networks (GANs); Sparse coding and auto-encoders; Data augmentation, elastic distortions, data normalization; Mitigating overfitting with dropout, batch normalization, dropconnect; Novel architectures, ResNet, GoogleNet, etc",
"textbook": "Neural Network Design, 2nd Edition, Martin T. Hagan, Howard, B. Demuth, Mark Hudson Beale and Orlando De Jesus, Publisher: Martin Hagan; 2 edition (September 1",
"references": [
", ISBN-10: 0971732116",
"An Introduction to Neural Networks, James A Anderson, Publisher: A Bradford Book (March 16, 1995), ISBN-10: 0262011441",
"Fundamentals of Artificial Neural Networks, Mohammad Hassoun, Publisher: A Bradford Book (January 1, 2003), ISBN-10: 0262514672",
"Deep Learning by Ian Goodfellow, Yoshua Bengio, Aaron Courville ( http://www.deeplearningbook.org/)",
"Deep learning with python by Francoise Chollet, ISBN-10: 9781617294433, 2017"
]
},
"Computer Vision": {
"outline": "Introduction to Computer Vision (Problems faced, History and Modern Advancements). Image Processing, Image filtering, Image pyramids and Fourier transform, Hough transform. Camera models, Setting up a camera model from parameters, Camera looking at a plane, Relationship of plane and horizon line, Rotation about camera center. Concatenation, Decomposition and Estimation of transformation from point correspondences, Points and planes in 2D/3D, Transformations in 2D/3D, Rotations in 2D/3D. Edge detection, corner detection. Feature descriptors and matching (HoG features, SIFT, SURF). Applications of Computer Vision Traditional Methods: Image Stitching: Making a bigger picture from smaller pictures Single View Geometry: Converting a single image into a 3D model. Applications of CV using Deep Learning: Image Detection (Localization, Historical Techniques, RCNN, FRCNN, YOLO, Retina), Image Segmentation (UNet, SegNet, MaskRCNN), Image Generation (GANN)",
"textbook": "Computer Vision: Algorithms and Applications, by Richard Szeliski.",
"references": [
"Multiple View Geometry in Computer Vision, by Richard Hartley and Andrew Zisserman.",
"Computer Vision: A Modern Approach, by David Forsyth and Jean Ponce.",
"Digital Image Processing, by Rafael Gonzalez and Richard Woods."
]
},
"Knowledge Representation and Reasoning": {
"outline": "Propositional Logic, First-order Logic, Horn Clauses, Description Logic, Reasoning using Description Logic, Forward and Backward Chaining in Inference Engines, Semantic Networks, Ontologies and Ontology Languages, Logical Agents, Planning, Rule-based Knowledge Representation, Reasoning Under Uncertainty, Bayesian Networks Representation, Inference in Bayesian Networks, Fuzzy Logic, Inferene using Fuzzy Rules, Markov Models, Commonsense Reasoning, Explainable AI.",
"textbook": "Stuard Russell and Peter Norvig, Artificial Intelligence: A Modern Approach (3rd Ed.) (2015)",
"references": [
"David Poole and Alan Mackworth, Artificial Intelligence: Foundations of Computational Agents, 2nd Ed, 2017",
"Ronald Brachman and Hector Levesque. Knowledge Representation and Reasoning, 2004"
]
},
"Machine Learning": {
"outline": "Introduction to machine learning; concept learning: General-to-specific ordering of hypotheses, Version spaces Algorithm, Candidate elimination algorithm; Supervised Learning: decision trees, Naive Bayes, Artificial Neural Networks, Support Vector Machines, Overfitting, noisy data, and pruning, Measuring Classifier Accuracy; Linear and Logistic regression; Unsupervised Learning: Hierarchical Aglomerative Clustering. k-means partitional clustering; Self-Organizing Maps (SOM) k-Nearest-neighbor algorithm; Semisupervised learning with EM using labeled and unlabled data; Reinforcement Learning: Hidden Markov models, Monte Carlo inference Exploration vs. Exploitation Trade-off, Markov Decision Processes; Ensemble Learning: Using committees of multiple hypotheses. Bagging, boosting.",
"textbook": "Machine Learning, Tom, M., McGraw Hill, 1997.",
"references": [
"Machine Learning: A Probabilistic Perspective, Kevin P. Murphy, MIT Press,2012"
]
},
"Natural Language Processing": {
"outline": "Introduction & History of NLP, Parsing algorithms, Basic Text Processing, Minimum Edit Distance, Language Modeling, Spelling Correction, Text Classification, Deterministic and stochastic grammars, CFGs, Representing meaning /Semantics, Semantic roles, Semantics and Vector models, Sentiment Analysis, Temporal representations, Corpus-based methods, N-grams and HMMs, Smoothing and backoff, POS tagging and morphology, Information retrieval, Vector space model, Precision and recall, Information extraction, Relation Extraction (dependency, constituency grammar), Language translation, Text classification, categorization, Bag of words model, Question and Answering, Text Summarization",
"textbook": "Daniel Jurafsky and James H. Martin. 2018. Speech and Language Processing: An Introduction to Natural Language Processing. Third Edition. Prentice Hall",
"references": [
"Foundations of Statistical Natural Language Processing, Manning and Schütze, MIT Press. Cambridge, MA: May 1999"
]
},
"Programming for Artificial Intelligence": {
"outline": "The first objective of the course is to introduce and then build the proficiency of students in different AI programming languages. The basics include IDE for the languages, variables, expressions, operands and operators, loops, control structures, debugging, error messages, functions, strings, lists, object-oriented constructs and basic graphics in the languages. Special emphasis is given to writing production quality clean code in the programming language. Once the classical programming languages are properly introduced, the course should introduce some libraries necessary for interpreting, analyzing and plotting numerical data in Python (e.g., NumPy, MatPlotLib, Anaconda and Pandas for Python) and give examples of each library using simple use cases and small case studies.",
"textbook": "Russell, S. and Norvig, P. “Artificial Intelligence. A Modern Approach”, 3rd ed, Prentice Hall, Inc., 2015.",
"references": [
"Norvig, P., “Paradigms of Artificial Intelligence Programming: Case studies in Common Lisp”, Morgan Kaufman Publishers, Inc., 1992.",
"Luger, G.F. and Stubblefield, W.A., “AI algorithms, data structures, and idioms in Prolog, Lisp, and Java”, Pearson Addison-Wesley. 2009.",
"Severance, C.R., 2016. “Python for everybody: Exploring data using Python 3.” CreateSpace Independent Publ Platform.",
"Miller, B.N., Ranum, D.L. and Anderson, J., 2019. “Python programming in context.” Jones & Bartlett Pub.",
"McKinney, W., 2012. “Python for data analysis: Data wrangling with Pandas, NumPy, and IPython.” O'Reilly Media, Inc.",
"Reference Book:",
"Joshi, P., 2017. “Artificial intelligence with python.” Packt Publishing Ltd.",
"Janert, P.K., 2010. “Data analysis with open source tools: a hands-on guide for programmers and data scientists.” O'Reilly Media, Inc. Data Science Core"
]
},
"Advance Statistics": {
"outline": "Introduction to Statistics, Use of Statistics in Data Science, Experimental Design, Statistical Techniques for Forecasting, Interpolation/ Extrapolation, Introduction to Probability, Conditional Probability, Prior and Posterior Probability, Random number generation (RNG), Techniques for RNG, Correlation analysis, Chi Square Dependency tests, Diversity Index, Data Distributions Multivariate Distributions, Error estimation, Confidence Intervals, Linear transformations, Gradient Descent and Coordinate Descent, Likelihood inference, Revision of linear regression and likelihood inference, Fitting algorithms for nonlinear models and related diagnostics, Generalized linear model; exponential families; variance and link functions, Proportion and binary responses; logistic regression, Count data and Poisson responses; log-linear models, Overdispersion and quasi-likelihood; estimating functions, Mixed models, random effects, generalized additive models and penalized regression; Introduction to SPSS, Probability/ Correlation analysis/ Dependency tests/ Regression in SPSS.",
"textbook": "Probability and Statistics for Computer Scientists, 2nd Edition, Michael Baron.",
"references": [
"Probability for Computer Scientists, online Edition, David Forsyth",
"Discovering Statistics using SPSS for Windows, Andy Field"
]
},
"Big Data Analytics": {
"outline": "Introduction and Overview of Big Data Systems; Platforms for Big Data, Hadoop as a Platform, Hadoop Distributed File Systems (HDFS), MapReduce Framework, Resource Management in the cluster (YARN), Apache Scala Basic, Apache Scala Advances, Resilient Distributed Datasets (RDD), Apache Spark, Apache Spark SQL, Data analytics on Hadoop / Spark, Machine learning on Hadoop / Spark, Spark Streaming, Other Components of Hadoop Ecosystem",
"textbook": "White, Tom. “Hadoop: The definitive guide.\" O'Reilly Media, Inc., 2012.",
"references": [
"Karau, Holden, Andy Konwinski, Patrick Wendell, and Matei Zaharia. “Learning spark: lightning-fast big data analysis.\" O'Reilly Media, Inc., 2015.",
"Miner, Donald, and Adam Shook. “MapReduce design patterns: building effective algorithms and analytics for Hadoop and other systems.\" O'Reilly Media, Inc., 2012."
]
},
"Data Mining": {
"outline": "Introduction to data mining and basic concepts, Pre-Processing Techniques & Summary Statistics, Association Rule mining using Apriori Algorithm and Frequent Pattern Trees, Introduction to Classification Types, Supervised Classification (Decision trees, Naïve Bae Classification, K-Nearest Neighbors, Support Vector Machines etc.), Unsupervised Classification (K Means, K Median, Hieratical and Divisive Clustering, Kohonan Self Organizing maps), outlier & anomaly detection, Web and Social Network Mining, Data Mining Trends and Research Frontiers. Implementing concepts using Python",
"textbook": "Jiawei Han & Micheline Kamber, Jian Pei (2011). Data Mining: Concepts and Techniques, 3rd Edition.",
"references": [
"Pang-Ning Tan, Michael Steinbach, and Vipin Kumar (2005). Introduction to Data Mining.",
"Charu C. Aggarwal (2015). Data Mining: The Textbook",
"D. Hand, H. Mannila, P. Smyth (2001). Principles of Data Mining. MIT Press."
]
},
"Data Visualization": {
"outline": "Introduction of Exploratory Data Analysis and Visualization, Building Blocks and Basic Operations; Types of Exploratory Graphs, single and multi-dimensional summaries, five number summary, box plots, histogram, bar plot and others; Distributions, their representation using histograms, outliers, variance; Probability Mass Functions and their visualization; Cumulative distribution functions, percentile-based statistics, random numbers; Modelling distributions, exponential, normal, lognormal, pareto; Probability density functions, kernel density estimation; Relationship between variables, scatter plots, correlation, covariance; Estimation and Hypothesis Testing; Clustering using K-means and Hierarchical; Time series and survival analysis; Implementing concepts with R (or similar language)",
"textbook": "“Exploratory Data Analysis with R” by Roger D. Peng",
"references": []
},
"Data Warehousing and Business Intelligence": {
"outline": "Introduction to Data Warehouse and Business Intelligence; Necessities and essentials of Business Intelligence; DW Life Cycle and Basic Architecture; DW Architecture in SQL Server; Logical Model; Indexes; Physical Model; Optimizations; OLAP Operations, Queries and Query Optimization; Building the DW; Data visualization and reporting based on Datawarehouse using SSAS and Tableau; Data visualization and reporting based on Cube; Reports and Dashboard management on PowerBI; Dashboard Enrichment; Business Intelligence Tools.",
"textbook": "W. H. Inmon, “Building the Data Warehouse”, Wiley-India Edition.",
"references": [
"Ralph Kimball, “The Data Warehouse Toolkit – Practical Techniques for Building Dimensional Data Warehouse,” John Wiley & Sons, Inc.",
"Matteo Golfarelli, Stefano Rizzi, “Data Warehouse Design - Modern Principles and Methodologies”, McGraw Hill Publisher"
]
},
"Introduction to Data Science": {
"outline": "Introduction: What is Data Science? Big Data and Data Science hype, Datafication, Current landscape of perspectives, Skill sets needed; Statistical Inference: Populations and samples, Statistical modeling, probability distributions, fitting a model, Intro to Python; Exploratory Data Analysis and the Data Science Process; Basic Machine Learning Algorithms: Linear Regression, k-Nearest Neighbors (k-NN), k-means, Naive Bayes; Feature Generation and Feature Selection; Dimensionality Reduction: Singular Value Decomposition, Principal Component Analysis; Mining Social-Network Graphs: Social networks as graphs, Clustering of graphs, Direct discovery of communities in graphs, Partitioning of graphs, Neighborhood properties in graphs; Data Visualization: Basic principles, ideas and tools for data visualization; Data Science and Ethical Issues: Discussions on privacy, security, ethics, Next-generation data scientists.",
"textbook": "Foundations of data science, Blum, A., Hopcroft, J., & Kannan, R., Vorabversion eines Lehrbuchs, 2016.",
"references": [
"An Introduction to Data Science, Jeffrey S. Saltz, Jeffrey M. Stanton, SAGE Publications, 2017.",
"Python for everybody: Exploring data using Python 3, Severance, C.R., CreateSpace Independent Pub Platform. 2016.",
"Doing Data Science, Straight Talk from the Frontline, Cathy O'Neil and Rachel Schutt, O'Reilly. 2014.",
"Data Science and Big Data Analytics: Discovering, Analyzing, Visualizing and Presenting Data, EMC Education Services, John Wiley & Sons, 2015. Cyber Security Core"
]
},
"Digital Forensics": {
"outline": "An introduction to Digital Forensics; use of digital forensics; Key technical concepts; Challenges in Digital Forensics ; The Difference between Computer Experts and Digital Forensics Experts; Investigative Process Methodologies ; Education, Training, and Awareness; Laws, Standards, and Regulations; Ethics and Professional Conduct; Digital Evidence Management; Collecting evidence; Antiforensics; Network forensics; Mobile and Embedded Forensics; Cloud forensics; Internet Forensics; social media forensics; Investigation Methods for Collecting Digital Evidence; Digital Forensic Readiness; Digital forensics tools; Discovery of Computers and Storage Media; Discovery of Audio/ Video Evidence; Data Visualization; Data Sources; Graphing and Charting; Analyzing Data; Data Distributions; Analysis Scenarios; Data Visualization Tools.",
"textbook": "The Basics of Digital Forensics: The Primer for Getting Started in Digital Forensics by John Sammons, 2nd Edition or latest",
"references": [
"Digital Forensics and Incident Response : Incident Response Techniques and Procedures to Respond to Modern Cyber Threats, 2nd Edition",
"Guide to Digital Forensics : A Concise and Practical Introduction by Joakim Kävrestad (latest edition)"
]
},
"Information Assurance": {
"outline": "Introduction to (IS) Information System (Concept, Design, Functions, Architecture, Components and applications of IS); Secure System Planning and Administration; Information Security Policies and Procedures; Asset Management; Organizational and Human Security; Cyber Security Management Concepts; NIST Cyber Security Framework; Enterprise Roles and Structures; Strategic Planning; Security Plans and Policies; Contingency Planning; Laws; Laws and Regulatory Requirements; Security Standards and Controls, Risk Management Process, NIST Risk Management Framework, Security Metrics and Key Performance Indicators (KPIs); Physical Security and Environmental Events; Contingency Planning; Security Education, ISO 27001 Compliance, Training, and Awareness.",
"textbook": "Principles of Information Security by Michael E. Whitman, 6th Edition, 2017",
"references": [
"Reference Material: CISSP Study Guide, 7th Edition",
"Information Assurance: Managing Organizational IT Security Risks by Joseph Boyce and Daniel Jennings, 1 Edition or Latest",
"Information Assurance: Security in the Information Environment by Andrew Blyth and Gerald L. Kovacich, Springer, 2nd Edition or Latest"
]
},
"Introduction to Cyber Security": {
"outline": "Introduction to Cyber security; Networks and the Internet; cyber threat landscape; understanding security; information security Principles (Confidentiality, Integrity, Availability); Information Security Terminology; Who are the attackers; Advanced Persistent Threat (APT); Malware, types of malware; Attacks using malware; Malware Attack Lifecycle: Stages of Attack; Social engineering attacks; types of payload; Industrial Espionage in Cyberspace; Basic cryptography; Web application attacks; Database security; Cyber kill chain; Privacy and anonymity; Network security; Software security; Mobile device security; Mobile app security; Cyber Terrorism and Information Warfare; Introduction to Digital Forensics; Digital Forensics Categories.",
"textbook": "Computer Security Fundamentals by Chuck Easttom, 4th edition or latest",
"references": [
"Security+ Guide to Network Security Fundamentals, by Mark Ciampa, 5th Edition",
"Security in Computing by C.P. Pfleeger, Prentice-Hall, 4th Edition or Latest"
]
},
"Network Security": {
"outline": "Introduction to network security, Networking Concepts and Protocols, Network Threats and Vulnerabilities, Network Security Planning and Policy, Access Control, Defense against Network Attacks, DOS and DDOS detection and prevention, Firewalls, Intrusion Detection and Prevention Systems, Antivirus Filtering, Naming and DNS Security, DNSSEC, IP security, Secure Sockets Layer, VPN, Packet Sniffing and spoofing, Honeypot, Ethernet Security, Wireless Security, Wireless Attacks, Wireless LAN Security with 802.11i, Wireless Security Protocols, Wireless Intrusion Detection, Physical access and Security, Tor Network, Network Forensics. Defense against Network Attacks.",
"textbook": "Network Security Assessment: Know Your Network by Chris McNab, 3rd Edition or latest.",
"references": [
"Corporate Computer Security, by Randall J. Boyle, 3th Edition",
"Bulletproof Wireless Security by Praphul Chandra",
"Network Security Essentials: Applications and Standards by William Stallings, 3rd Edition or Latest",
"Cryptography and Network Security Principles and Practices by William Stallings, Latest Edition"
]
},
"Secure Software Design and Development": {
"outline": "Secure software concepts; System issues; System properties; Software Project Time Management; Software Project Costing; Software Quality Assurance; Security Concepts in the SDLC; Risk management; Security standards (e.g., coding standards, NIST standards, Federal Information Processing Standards); Best practices (e.g., OWASP development guide, OWASP code review guide, OWASP testing guide); Security methodologies (e.g., Socratic Methodology, Operationally Critical Threat, Asset, and Vulnerability Evaluation, STRIDE and DREAD, Open Source Security Testing Methodology Manual); Security frameworks (e.g., Zachman Framework, Control Objectives for Information and Related Technology, Sherwood Applied Business Security Architecture (SABSA)); Regulations- Privacy and Compliance; Security Models (e.g., BLP Confidentiality Model, Clark and Wilson Model (Access Triple Model)); Trusted Computing; Secure Software Requirements (Sources for Security Requirements, Types of Security Requirements); Secure Software Design (Design consideration, Information Technology Security Principles and Secure Design, Designing Secure Design Principles); Design Processes; Secure Software Implementation/Coding; Software Development Methodologies; Common Software Vulnerabilities and Controls; Defensive Coding Practices—Concepts and Techniques; Code Vulnerabilities and Avoiding Polymorphic Malware Attacks: Buffer overflow, Format string bug, Code vulnerabilities SQL Injection, Cross-site Scripting, Cross-site Request Forgery, Session management, Replication of vulnerabilities and exploitation; Secure Software Testing; Security Testing Methodologies; Software Security Testing; Software Acceptance; Legal Protection Mechanisms; Software Deployment- Operations- Maintenance and Disposal.",
"textbook": "Official (ISC)2 Guide to the CSSLP (latest)",
"references": [
"Software Security: Building Security In, 1st Edition by Gary McGraw"
]
},
"Vulnerability Assessment & Reverse Engineering": {
"outline": "Understanding the need for security assessments; Classifying vulnerabilities; Software vulnerabilities; Network vulnerabilities; Vulnerability assessment versus penetration testing; Vulnerability Assessment Tools; Vulnerability management Regulatory compliance; Calculating ROIs; Application review process; Pre-assessment; Code navigation; Codeauditing tactics; Memory corruption; understanding issues in programming languages; Steps in Reverse engineering, Common tools used for Reverse engineering; Binary Obfuscation techniques; Understanding core assembly concepts to perform malicious code analysis, Identifying key assembly logic structures with a disassembler, Malware analysis Types of malware analysis; Malware Taxonomy; Static analysis; Dynamic analysis; Malware Inspection; Malware analysis tools; Sandboxing and virtualization;",
"textbook": "Finding and Fixing Vulnerabilities in Information Systems: The Vulnerability Assessment and Mitigation Methodology by Philip S. Anton",
"references": [
"The Art of Software Security Assessment: Identifying and Preventing Software Vulnerabilities by Mark Dowd",
"Reversing: Secrets of Reverse Engineering by Eldad Eilam (latest edition)",
"Practical Malware Analysis: The Hands-On Guide to Dissecting Malicious Software by Michael Sikorski (latest edition) Artificial Intelligence Elective"
]
},
"Deep Learning": {
"outline": "Basics of deep learning, learning networks, Shallow vs. Deep learning etc.; Machine learning theory – training and test sets, evaluation, etc. Theory of Generalization; Multi-layer perceptrons, error back-propagation; Deep convolutional networks, Computational complexity of feed forward and deep convolutional neural networks; Unsupervised deep learning including auto-encoders; Deep belief networks; Restricted Boltzman Machines; Deep Recurrent Neural Networks (BPTT, LSTM, etc.); GPU programming for deep learning CuDNN; Generative adversarial networks (GANs); Sparse coding and auto-encoders; Data augmentation, elastic distortions, data normalization; Mitigating overfitting with dropout, batch normalization, dropconnect; Novel architectures, ResNet, GoogleNet, etc",
"textbook": "Deep Learning by Ian Goodfellow, Yoshua Bengio, Aaron Courville ( http://www.deeplearningbook.org/)",
"references": [
"Deep learning with python by Francoise Chollet, ISBN-10: 9781617294433, 2017"
]
},
"Theory of Automata & Formal Languages": {
"outline": "Finite State Models: Language definitions preliminaries, Regular expressions/Regular languages, Finite automata (FAs), Transition graphs (TGs), NFAs, Kleene’s theorem, Transducers (automata with output), Pumping lemma and non-regular language Grammars and PDA: CFGs, Derivations, derivation trees and ambiguity, Simplifying CFLs, Normal form grammars and parsing, Decidability, Context sensitive languages, grammars and linear bounded automata (LBA), Chomsky’s hierarchy of grammars Turing Machines Theory: Turing machines, Post machine, Variations on TM, TM encoding, Universal Turing Machine, Defining Computers by TMs.",
"textbook": "Introduction to computer theory, Daniel I. A. Cohen, 2nd Edition",
"references": [
"Automata, Computability and Complexity: Theory and Applications, by Elaine Rich, 2011",
"An Introduction to Formal Languages and Automata, by Peter Linz, 4th edition, Jones & Bartlett Publishers, 2006",
"Theory of Automata, Formal Languages and Computation, by S. P. Eugene, Kavier, 2005, New Age Publishers Data Science Elective"
]
},
"Advance Database Management Systems": {
"outline": "Introduction to advance data models such as object relational, object oriented. File organizations concepts, Transactional processing and Concurrency control techniques, Recovery techniques, Query processing and optimization, Database Programming (PL/SQL, T-SQL or similar technology), Integrity and security, Database Administration (Role management, managing database access, views), Physical database design and tuning, Distributed database systems, Emerging research trends in database systems, MONGO DB, NO SQL (or similar technologies)",
"textbook": "Database Systems: A Practical Approach to Design, Implementation, and Management, 6th Edition by Thomas Connolly and Carolyn Begg",
"references": [
"Database Management Systems, 3rd Edition by Raghu Ramakrishnan, Johannes Gehrke",
"Database System Concepts, 6th Edition by Avi Silberschatz, Henry F. Korth and S. Sudarshan.",
"Database Systems: The Complete Book, 2nd Edition by Hector Garcia-Molina, Jeffrey D. Ullman, Jennifer Widom"
]
}
};
