// Seed content for the 17 remaining genuinely-buildable HEC courses (General
// Education + 2 IDS math courses) — real sources where found (NUST Functional
// English, HEC's own Pakistan Studies / Islamic Studies curricula), synthesized
// from standard Pakistani university GE curricula otherwise. Editable draft.
export const HEC_GE_IDS_SEED_CONTENT: Record<string, { clos: { statement: string; bloomLevel: string }[]; topics: string[] }> = {
  "GE-101": {
    clos: [
      { statement: "Apply arithmetic and algebraic reasoning to solve real-world quantitative problems.", bloomLevel: "C3" },
      { statement: "Interpret and analyze data presented in tables, charts, and graphs.", bloomLevel: "C2" },
      { statement: "Apply basic concepts of probability and statistics to everyday situations.", bloomLevel: "C3" },
      { statement: "Use logical reasoning to evaluate quantitative arguments and claims.", bloomLevel: "C3" },
      { statement: "Solve problems involving ratios, proportions, and percentages in practical contexts.", bloomLevel: "C3" },
    ],
    topics: ["Introduction to Quantitative Reasoning", "Numbers & Number Systems", "Basic Arithmetic Operations", "Ratios & Proportions", "Percentages & Applications", "Introduction to Algebra", "Linear Equations", "Solving Word Problems", "Sets & Set Operations", "Introduction to Functions", "Graphs of Functions", "Sequences & Series - Basics", "Introduction to Statistics", "Data Collection & Organization", "Measures of Central Tendency", "Measures of Dispersion", "Data Visualization - Tables & Charts", "Data Visualization - Graphs", "Introduction to Probability", "Basic Probability Rules", "Permutations & Combinations - Intro", "Logical Reasoning - Basics", "Evaluating Arguments", "Estimation & Approximation", "Unit Conversions", "Financial Mathematics - Simple Interest", "Financial Mathematics - Compound Interest", "Problem Solving Strategies", "Real-World Applications - Case Studies", "Critical Thinking with Numbers", "Review & Practice Problems", "Final Project Presentation"],
  },
  "GE-102": {
    clos: [
      { statement: "Develop proficiency in English language skills, including reading, writing, speaking, and listening.", bloomLevel: "C3" },
      { statement: "Understand and apply ethical considerations in academic and professional communication.", bloomLevel: "C2" },
      { statement: "Apply different writing styles, formats, and citation conventions.", bloomLevel: "C3" },
      { statement: "Enhance critical thinking and analytical skills to analyze and interpret texts.", bloomLevel: "C3" },
      { statement: "Communicate effectively in academic and professional contexts.", bloomLevel: "C3" },
    ],
    topics: ["Introduction to Functional English", "Parts of Speech Review", "Sentence Structure", "Grammar - Tenses", "Grammar - Common Errors", "Vocabulary Building", "Reading Comprehension - Skimming & Scanning", "Reading Comprehension - Detailed Analysis", "Listening Skills", "Speaking Skills - Pronunciation", "Speaking Skills - Presentations", "Paragraph Writing", "Essay Writing - Structure", "Essay Writing - Types", "Academic Writing Conventions", "Citation & Referencing", "Business Communication - Emails", "Business Communication - Letters", "Report Writing", "Summarizing & Paraphrasing", "Critical Reading", "Analytical Writing", "Group Discussion Skills", "Interview Skills", "Formal vs Informal Communication", "Cross-Cultural Communication", "Technical Writing Basics", "Proofreading & Editing", "Public Speaking", "Case Studies - Communication in Practice", "Review & Practice", "Final Presentation"],
  },
  "GE-103": {
    clos: [
      { statement: "Demonstrate proficiency in using office productivity software for word processing, spreadsheets, and presentations.", bloomLevel: "C3" },
      { statement: "Explain fundamental concepts of computers, networks, and the internet.", bloomLevel: "C2" },
      { statement: "Apply digital tools for information search, communication, and collaboration.", bloomLevel: "C3" },
      { statement: "Understand basic concepts of digital security and ethics.", bloomLevel: "C2" },
      { statement: "Utilize ICT tools to solve everyday academic and professional tasks.", bloomLevel: "C3" },
    ],
    topics: ["Introduction to Computers & ICT", "Computer Hardware Basics", "Operating Systems Overview", "File Management", "Introduction to Word Processing", "Word Processing - Formatting", "Word Processing - Advanced Features", "Introduction to Spreadsheets", "Spreadsheets - Formulas & Functions", "Spreadsheets - Charts & Graphs", "Introduction to Presentations", "Presentations - Design Principles", "Introduction to the Internet", "Web Browsing & Search Techniques", "Email & Communication Tools", "Cloud Computing Basics", "Introduction to Databases", "Social Media & Digital Communication", "Digital Security - Basics", "Passwords & Authentication", "Malware & Threats Awareness", "Digital Ethics & Netiquette", "Intellectual Property & Plagiarism", "Introduction to Programming Concepts", "Basic Web Design Concepts", "Mobile Computing & Apps", "E-Commerce Basics", "ICT in Education", "ICT in Business", "Emerging Technologies Overview", "Review & Practice", "Final Project Presentation"],
  },
  "GE-104": {
    clos: [
      { statement: "Explain fundamental concepts and theories of social sciences.", bloomLevel: "C2" },
      { statement: "Analyze social structures, institutions, and their impact on society.", bloomLevel: "C4" },
      { statement: "Apply social science research methods to study societal issues.", bloomLevel: "C3" },
      { statement: "Discuss contemporary social issues from multiple perspectives.", bloomLevel: "C2" },
      { statement: "Evaluate the role of individuals and groups within society.", bloomLevel: "C5" },
    ],
    topics: ["Introduction to Social Sciences", "Sociology - Basic Concepts", "Social Institutions - Family", "Social Institutions - Education", "Social Institutions - Religion", "Social Stratification", "Culture & Society", "Socialization Process", "Introduction to Psychology", "Human Behavior & Cognition", "Introduction to Political Science", "Government & Governance", "Introduction to Economics", "Economic Systems", "Introduction to Anthropology", "Social Research Methods - Qualitative", "Social Research Methods - Quantitative", "Social Change & Development", "Urbanization & Society", "Population & Demography", "Gender & Society", "Social Movements", "Globalization & Society", "Media & Society", "Social Problems - Poverty", "Social Problems - Inequality", "Social Welfare & Policy", "Community & Civil Society", "Ethics in Social Sciences", "Case Studies - Social Issues in Pakistan", "Review & Discussion", "Final Presentation"],
  },
  "IDS-101": {
    clos: [
      { statement: "Apply differentiation techniques to solve problems involving rates of change.", bloomLevel: "C3" },
      { statement: "Apply integration techniques to compute areas and solve accumulation problems.", bloomLevel: "C3" },
      { statement: "Analyze functions using limits and continuity concepts.", bloomLevel: "C4" },
      { statement: "Solve problems involving analytical geometry, including lines, curves, and conic sections.", bloomLevel: "C3" },
      { statement: "Apply calculus concepts to model and solve real-world problems.", bloomLevel: "C3" },
    ],
    topics: ["Functions & Their Graphs", "Limits - Basic Concepts", "Limits - Techniques", "Continuity", "Introduction to Derivatives", "Rules of Differentiation", "Chain Rule", "Implicit Differentiation", "Applications of Derivatives - Rates of Change", "Applications of Derivatives - Optimization", "Higher-Order Derivatives", "Curve Sketching", "Introduction to Integration", "Techniques of Integration - Substitution", "Techniques of Integration - By Parts", "Definite Integrals", "Applications of Integration - Area", "Applications of Integration - Volume", "Analytical Geometry - Straight Lines", "Analytical Geometry - Circles", "Conic Sections - Parabola", "Conic Sections - Ellipse", "Conic Sections - Hyperbola", "Polar Coordinates", "Parametric Equations", "Sequences & Series", "Taylor & Maclaurin Series", "Partial Derivatives - Intro", "Multiple Integrals - Intro", "Vector Calculus - Basics", "Review & Problem Solving", "Final Exam Preparation"],
  },
  "GE-105": {
    clos: [
      { statement: "Apply advanced statistical methods to analyze real-world data.", bloomLevel: "C3" },
      { statement: "Solve problems involving mathematical modeling.", bloomLevel: "C3" },
      { statement: "Apply quantitative reasoning to decision-making under uncertainty.", bloomLevel: "C3" },
      { statement: "Interpret and critique quantitative information in media and research.", bloomLevel: "C2" },
      { statement: "Use technology tools for quantitative analysis.", bloomLevel: "C3" },
    ],
    topics: ["Review of Quantitative Reasoning I", "Mathematical Modeling - Introduction", "Linear Models", "Exponential & Logarithmic Models", "Introduction to Matrices", "Matrix Operations", "Systems of Linear Equations", "Optimization - Linear Programming Basics", "Advanced Probability", "Probability Distributions", "Normal Distribution", "Sampling & Sampling Distributions", "Hypothesis Testing - Basics", "Confidence Intervals", "Correlation & Regression", "Data Analysis with Technology", "Financial Modeling", "Decision Making Under Uncertainty", "Game Theory - Basics", "Network Analysis - Basics", "Critiquing Statistics in Media", "Misuse of Statistics", "Quantitative Reasoning in Research", "Case Study - Health Statistics", "Case Study - Economic Data", "Case Study - Social Data", "Spreadsheet-Based Analysis", "Introduction to Data Science Concepts", "Ethics in Quantitative Analysis", "Real-World Problem Solving", "Review & Practice", "Final Project Presentation"],
  },
  "GE-106": {
    clos: [
      { statement: "Describe major movements and periods in art, literature, and philosophy.", bloomLevel: "C2" },
      { statement: "Analyze works of art, literature, and philosophy within their historical context.", bloomLevel: "C4" },
      { statement: "Demonstrate appreciation of diverse cultural and artistic expressions.", bloomLevel: "C3" },
      { statement: "Apply critical and creative thinking to interpret humanities texts and artifacts.", bloomLevel: "C3" },
      { statement: "Reflect on the role of arts and humanities in shaping human values and society.", bloomLevel: "C3" },
    ],
    topics: ["Introduction to Arts & Humanities", "What is Art? - Defining Concepts", "History of Visual Arts - Ancient", "History of Visual Arts - Renaissance", "History of Visual Arts - Modern", "Introduction to Literature", "Poetry - Forms & Analysis", "Prose & the Novel", "Drama & Theatre", "World Literature Overview", "Introduction to Philosophy", "Ancient Philosophy", "Islamic Philosophy & Thought", "Modern Philosophy", "Ethics & Moral Philosophy", "Introduction to Music", "Music History Overview", "Introduction to Architecture", "Architectural Styles", "Film as an Art Form", "Cultural Studies - Introduction", "Pakistani Art & Culture", "Calligraphy & Islamic Art", "Aesthetics - Theory of Beauty", "Comparative Religion & Humanities", "Humanities in the Digital Age", "Creative Writing - Basics", "Art Appreciation - Museum/Gallery Study", "Interdisciplinary Humanities", "Case Studies - Cultural Artifacts", "Review & Discussion", "Final Presentation"],
  },
  "GE-107": {
    clos: [
      { statement: "Explain the ideological foundations and historical background of Pakistan's creation.", bloomLevel: "C2" },
      { statement: "Analyze the political and constitutional development of Pakistan.", bloomLevel: "C4" },
      { statement: "Discuss the geography, society, and culture of Pakistan.", bloomLevel: "C2" },
      { statement: "Evaluate contemporary political and economic issues facing Pakistan.", bloomLevel: "C5" },
      { statement: "Develop a balanced understanding of Pakistan's foreign policy and international relations.", bloomLevel: "C3" },
    ],
    topics: ["Introduction to Pakistan Studies", "Ideology of Pakistan", "Two-Nation Theory", "Freedom Movement - Early Phase", "Freedom Movement - Role of Quaid-e-Azam", "Pakistan Resolution 1940", "Independence & Partition 1947", "Constitutional History - 1956 Constitution", "Constitutional History - 1962 Constitution", "Constitutional History - 1973 Constitution", "Political Development - Early Years", "Political Development - Democratic Eras", "Political Development - Military Eras", "Geography of Pakistan", "Natural Resources of Pakistan", "Society & Social Structure", "Culture & Heritage of Pakistan", "Economy of Pakistan - Overview", "Economic Challenges & Issues", "Agricultural Economy", "Industrial Development", "Education System of Pakistan", "Foreign Policy - Overview", "Pakistan-India Relations", "Pakistan & the Muslim World", "Pakistan & Global Powers", "Contemporary Political Issues", "Provincial Autonomy & Federalism", "Role of Media in Pakistan", "Challenges of Governance", "Review & Discussion", "Final Presentation"],
  },
  "GE-108": {
    clos: [
      { statement: "Recite selected verses of the Holy Quran with correct pronunciation (Tajweed).", bloomLevel: "C3" },
      { statement: "Translate and explain the meaning of selected Quranic verses.", bloomLevel: "C3" },
      { statement: "Identify key themes and teachings in the assigned portion of the Quran.", bloomLevel: "C2" },
      { statement: "Reflect on the practical application of Quranic teachings in daily life.", bloomLevel: "C3" },
      { statement: "Demonstrate understanding of the historical context of revelation for selected verses.", bloomLevel: "C3" },
    ],
    topics: ["Introduction to Quranic Studies", "Basics of Tajweed", "Makharij (Articulation Points)", "Selected Surah - Al-Fatiha", "Al-Fatiha - Translation & Tafseer", "Selected Surah - Al-Baqarah (Opening Verses)", "Al-Baqarah - Translation", "Al-Baqarah - Key Themes", "Selected Verses on Tawheed", "Selected Verses on Prophethood", "Selected Verses on Akhirah", "Selected Verses on Worship (Ibadah)", "Selected Verses on Salah", "Selected Verses on Zakat & Charity", "Selected Verses on Fasting", "Selected Verses on Family & Ethics", "Selected Verses on Justice", "Selected Verses on Patience & Gratitude", "Asbab al-Nuzul - Introduction", "Historical Context of Selected Verses", "Stories of the Prophets in the Quran - I", "Stories of the Prophets in the Quran - II", "Selected Verses on Knowledge", "Selected Verses on Community", "Memorization Practice - Short Surahs", "Tajweed Practice Session", "Translation Practice", "Thematic Study - Morality in the Quran", "Thematic Study - Social Justice in the Quran", "Application in Daily Life", "Review & Recitation Assessment", "Final Assessment"],
  },
  "IDS-102": {
    clos: [
      { statement: "Perform operations on matrices and solve systems of linear equations.", bloomLevel: "C3" },
      { statement: "Apply concepts of vector spaces and linear transformations.", bloomLevel: "C3" },
      { statement: "Compute eigenvalues and eigenvectors and apply them to problem-solving.", bloomLevel: "C3" },
      { statement: "Apply determinants and their properties in solving linear algebra problems.", bloomLevel: "C3" },
      { statement: "Solve real-world problems using linear algebra techniques.", bloomLevel: "C3" },
    ],
    topics: ["Introduction to Matrices", "Matrix Operations", "Types of Matrices", "Systems of Linear Equations - Introduction", "Gaussian Elimination", "Gauss-Jordan Elimination", "Matrix Inverse", "Determinants - Introduction", "Properties of Determinants", "Cramer's Rule", "Vector Spaces - Introduction", "Subspaces", "Linear Independence", "Basis & Dimension", "Linear Transformations - Introduction", "Matrix Representation of Linear Transformations", "Kernel & Range", "Eigenvalues - Introduction", "Eigenvectors", "Diagonalization", "Inner Product Spaces", "Orthogonality", "Gram-Schmidt Process", "Applications - Computer Graphics", "Applications - Systems Analysis", "Applications - Data Science / PCA Intro", "Symmetric Matrices", "Quadratic Forms", "Singular Value Decomposition - Intro", "Applications in Engineering", "Review & Problem Solving", "Final Exam Preparation"],
  },
  "GE-109": {
    clos: [
      { statement: "Compose well-structured expository essays on academic topics.", bloomLevel: "C3" },
      { statement: "Apply research skills to gather and synthesize information from credible sources.", bloomLevel: "C3" },
      { statement: "Demonstrate proper use of citation and referencing styles.", bloomLevel: "C3" },
      { statement: "Apply advanced grammar and style conventions in academic writing.", bloomLevel: "C3" },
      { statement: "Evaluate and revise written work for clarity and coherence.", bloomLevel: "C5" },
    ],
    topics: ["Introduction to Expository Writing", "The Writing Process - Prewriting", "The Writing Process - Drafting", "The Writing Process - Revising", "Thesis Statement Development", "Organizing Ideas - Outlining", "Paragraph Development", "Types of Expository Essays - Definition", "Types of Expository Essays - Compare & Contrast", "Types of Expository Essays - Cause & Effect", "Types of Expository Essays - Process Analysis", "Argumentative Writing Basics", "Research Skills - Finding Sources", "Evaluating Source Credibility", "Note-Taking & Synthesis", "Avoiding Plagiarism", "Citation Styles - APA", "Citation Styles - MLA", "Integrating Quotes & Paraphrases", "Writing Introductions", "Writing Conclusions", "Cohesion & Coherence", "Sentence Variety & Style", "Academic Vocabulary", "Peer Review Techniques", "Revising for Clarity", "Editing & Proofreading", "Writing for Different Audiences", "Digital & Online Writing", "Portfolio Development", "Review & Practice", "Final Essay Submission"],
  },
  "GE-110": {
    clos: [
      { statement: "Explain fundamental concepts in physics, chemistry, and biology.", bloomLevel: "C2" },
      { statement: "Apply the scientific method to analyze natural phenomena.", bloomLevel: "C3" },
      { statement: "Discuss the relationship between science, technology, and society.", bloomLevel: "C2" },
      { statement: "Analyze environmental issues from a scientific perspective.", bloomLevel: "C4" },
      { statement: "Conduct basic scientific experiments and interpret results.", bloomLevel: "C3" },
    ],
    topics: ["Introduction to Natural Sciences & Scientific Method", "Matter & Its Properties", "Basic Chemistry - Atoms & Elements", "Basic Chemistry - Chemical Reactions", "Basic Physics - Motion & Forces", "Basic Physics - Energy", "Basic Physics - Waves & Light", "Introduction to Biology - Cell Structure", "Biology - Genetics Basics", "Biology - Evolution", "Human Body Systems Overview", "Ecology & Ecosystems", "Biodiversity", "Earth Science - Geology Basics", "Earth Science - Atmosphere & Weather", "Astronomy Basics", "Environmental Science - Pollution", "Environmental Science - Climate Change", "Renewable Energy Sources", "Natural Resource Conservation", "Science & Technology Interaction", "Science in Everyday Life", "Laboratory Safety & Practices", "Experiment - Physical Sciences", "Experiment - Chemical Sciences", "Experiment - Biological Sciences", "Data Analysis in Science", "Scientific Ethics", "Emerging Scientific Fields", "Science Communication", "Review & Discussion", "Final Presentation"],
  },
  "GE-111": {
    clos: [
      { statement: "Recite an extended portion of the Holy Quran with correct Tajweed rules.", bloomLevel: "C3" },
      { statement: "Translate and explain the meaning of an extended set of Quranic verses.", bloomLevel: "C3" },
      { statement: "Analyze thematic content across multiple Surahs studied.", bloomLevel: "C4" },
      { statement: "Apply Quranic guidance to contemporary personal and social issues.", bloomLevel: "C3" },
      { statement: "Demonstrate understanding of Quranic exegesis (Tafseer) methodology.", bloomLevel: "C3" },
    ],
    topics: ["Review of Fehm-e-Quran I", "Advanced Tajweed Rules", "Selected Surah - Yasin (Part 1)", "Selected Surah - Yasin (Part 2)", "Selected Surah - Ar-Rahman (Part 1)", "Selected Surah - Ar-Rahman (Part 2)", "Selected Surah - Al-Mulk", "Introduction to Tafseer Methodology", "Classical Tafseer Overview", "Selected Verses on Governance", "Selected Verses on Economic Justice", "Selected Verses on Human Rights", "Selected Verses on Environment", "Selected Verses on Knowledge & Science", "Selected Verses on Interfaith Relations", "Stories of the Prophets - Advanced Study I", "Stories of the Prophets - Advanced Study II", "Thematic Study - Leadership in the Quran", "Thematic Study - Family Values", "Thematic Study - Contemporary Social Issues", "Memorization Practice - Extended Verses", "Tajweed Assessment Practice", "Translation Practice - Advanced", "Comparative Study of Selected Tafaseer", "Quranic Guidance for Youth", "Quranic Guidance on Ethics in Business", "Application in Modern Life - Case Studies", "Group Discussion & Reflection", "Quran & Contemporary Challenges", "Review of Thematic Studies", "Recitation & Comprehension Assessment", "Final Assessment"],
  },
  "GE-112": {
    clos: [
      { statement: "Explain the concepts of citizenship, rights, and civic responsibilities.", bloomLevel: "C2" },
      { statement: "Analyze the structure and function of local, provincial, and national governance.", bloomLevel: "C4" },
      { statement: "Design and participate in community engagement or service-learning projects.", bloomLevel: "C5" },
      { statement: "Evaluate the role of civil society organizations in community development.", bloomLevel: "C5" },
      { statement: "Demonstrate effective communication and teamwork skills in community settings.", bloomLevel: "C3" },
    ],
    topics: ["Introduction to Civics", "Citizenship - Rights & Responsibilities", "Fundamental Rights in the Constitution", "Local Government Structure", "Provincial Government Structure", "National Government Structure", "Electoral Process in Pakistan", "Role of Civil Society", "NGOs & Community Organizations", "Community Needs Assessment", "Service-Learning - Concepts", "Project Planning for Community Engagement", "Volunteering & Social Responsibility", "Community Mobilization Techniques", "Communication Skills for Community Work", "Teamwork & Leadership", "Conflict Resolution in Communities", "Gender & Community Engagement", "Youth in Civic Life", "Environmental Civic Responsibility", "Digital Citizenship", "Advocacy & Awareness Campaigns", "Fundraising for Community Projects", "Monitoring & Evaluation of Projects", "Case Study - Successful Community Projects", "Field Visit / Community Interaction", "Project Implementation", "Reflective Practice", "Reporting on Community Engagement", "Ethics in Community Work", "Review & Presentation Prep", "Final Project Presentation"],
  },
  "GE-113": {
    clos: [
      { statement: "Explain the ideological basis for the creation of Pakistan.", bloomLevel: "C2" },
      { statement: "Analyze the key features and evolution of Pakistan's constitutions.", bloomLevel: "C4" },
      { statement: "Discuss fundamental rights and principles of policy in the Constitution of Pakistan.", bloomLevel: "C2" },
      { statement: "Evaluate the structure of government under the 1973 Constitution.", bloomLevel: "C5" },
      { statement: "Assess contemporary constitutional and governance challenges in Pakistan.", bloomLevel: "C3" },
    ],
    topics: ["Introduction to Ideology of Pakistan", "Islamic Ideology & Nationhood", "Two-Nation Theory Revisited", "Allama Iqbal's Vision", "Quaid-e-Azam's Vision", "Constitutional Development - Pre-1956", "Objectives Resolution 1949", "Constitution of 1956", "Constitution of 1962", "Constitution of 1973 - Background", "Salient Features of 1973 Constitution", "Fundamental Rights", "Principles of Policy", "Federal Structure & Distribution of Powers", "Parliament - National Assembly", "Parliament - Senate", "Executive - President & Prime Minister", "Judiciary - Structure & Independence", "18th Amendment & Provincial Autonomy", "Islamic Provisions in the Constitution", "Council of Islamic Ideology", "Amendments to the Constitution - Overview", "Emergency Provisions", "Local Government under the Constitution", "Constitutional Crises in Pakistani History", "Judicial Activism & Constitutionalism", "Contemporary Constitutional Debates", "Comparative Constitutional Perspectives", "Rule of Law & Governance", "Case Studies - Landmark Constitutional Cases", "Review & Discussion", "Final Presentation"],
  },
  "GE-114": {
    clos: [
      { statement: "Explain fundamental concepts of entrepreneurship and the entrepreneurial mindset.", bloomLevel: "C2" },
      { statement: "Develop a business idea and evaluate its feasibility.", bloomLevel: "C3" },
      { statement: "Prepare a basic business plan including marketing and financial components.", bloomLevel: "C5" },
      { statement: "Analyze the role of innovation and risk-taking in entrepreneurial ventures.", bloomLevel: "C4" },
      { statement: "Discuss the startup ecosystem and funding options available to entrepreneurs.", bloomLevel: "C2" },
    ],
    topics: ["Introduction to Entrepreneurship", "The Entrepreneurial Mindset", "Types of Entrepreneurship", "Idea Generation Techniques", "Opportunity Recognition", "Market Research Basics", "Customer Discovery", "Business Model Canvas", "Value Proposition Design", "Competitive Analysis", "Marketing Strategy Basics", "Branding & Positioning", "Financial Basics for Entrepreneurs", "Startup Costing & Budgeting", "Revenue Models", "Introduction to Business Plans", "Writing a Business Plan - Executive Summary", "Writing a Business Plan - Operations", "Writing a Business Plan - Financial Projections", "Legal Structures for Startups", "Intellectual Property for Startups", "Funding Options - Bootstrapping", "Funding Options - Angel Investors & VC", "Pitching Your Business Idea", "Risk Management in Startups", "Innovation & Creativity in Business", "Social Entrepreneurship", "Digital Entrepreneurship & E-Commerce", "Scaling a Business", "Case Studies - Successful Startups in Pakistan", "Review & Pitch Practice", "Final Pitch Presentation"],
  },
  "GE-115": {
    clos: [
      { statement: "Identify key principles and sources of Islamic jurisprudence (Fiqh).", bloomLevel: "C2" },
      { statement: "Explain major historical developments in Islamic civilization.", bloomLevel: "C2" },
      { statement: "Analyze the Islamic economic and political systems.", bloomLevel: "C4" },
      { statement: "Discuss ethical values and the family system in Islam.", bloomLevel: "C2" },
      { statement: "Connect historical developments with contemporary Islamic issues and movements.", bloomLevel: "C4" },
    ],
    topics: ["Introduction to Islamic Studies", "Sources of Islamic Law - Quran", "Sources of Islamic Law - Sunnah", "Sources of Islamic Law - Ijma & Qiyas", "Introduction to Fiqh", "Schools of Islamic Jurisprudence", "Islamic Worship - Salah", "Islamic Worship - Zakat", "Islamic Worship - Sawm (Fasting)", "Islamic Worship - Hajj", "Islamic Civilization - Early Period", "Khilafat-e-Rashida", "Umayyad Period", "Abbasid Period", "Islamic Contributions to Science", "Islamic Contributions to Philosophy", "Islamic Economic System - Principles", "Islamic Banking & Finance Basics", "Islamic Political System - Concepts", "Concept of Khilafat & Governance", "Family System in Islam", "Marriage & Family Rights", "Ethical Values in Islam", "Islamic Social Justice", "Human Rights in Islam", "Islam & Contemporary Issues", "Interfaith Relations in Islam", "Islamic Movements - Overview", "Muslim World Today", "Case Studies - Contemporary Islamic Issues", "Review & Discussion", "Final Presentation"],
  },
};
