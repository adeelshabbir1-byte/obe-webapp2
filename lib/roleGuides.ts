// Training: a short guide and a first-week checklist per role, and the "what to do next" tip shown at the top of every
// page until the checklist is done (ticks are kept in the browser). Videos: each step can name a short screen recording
// once the institute records it (video field); until then the written steps are the guide.

export type Step = { key: string; title: string; href: string; how: string; video?: string };
export const GUIDES: Record<string, { intro: string; steps: Step[] }> = {
  CHAIRMAN: { intro: "As Institute Head you set up the institute once, name the people in charge, then watch and approve.", steps: [
    { key: "settings", title: "Check institute name, logo and position titles", href: "/chairman/institute-settings", how: "Set the institute's name and logo, and the titles you use (VC, Rector, Director)." },
    { key: "org", title: "Build the organisation chart", href: "/chairman/org-chart", how: "Add Deans, HODs, Program Leads; use “+ Add OMC & QEC Conveners”, then add members to each." },
    { key: "controller", title: "Name the Controller of Examinations", href: "/chairman/org-chart", how: "Give the Controller of Examinations duty to one person; they run exams and publish results." },
    { key: "import", title: "Import earlier records", href: "/data-import", how: "Students, faculty, past transcripts and rooms — template or your own file, dry run first." },
    { key: "rules", title: "Check academic rules and calendar", href: "/academic-rules", how: "CGPA limits and minimum attendance; then the academic calendar." },
    { key: "backup", title: "Take the first backup", href: "/chairman/backups", how: "Download one now; weekly backups run on their own." },
    { key: "approvals", title: "Open My Approvals daily", href: "/approvals", how: "Everything waiting for you, in one list." },
  ] },
  DEAN: { intro: "As Dean you approve, watch your faculty's programs and lead accreditation visits.", steps: [
    { key: "overview", title: "Look at your faculty", href: "/dean/overview", how: "Programs, teachers and results of your faculty at a glance." },
    { key: "approvals", title: "Clear My Approvals", href: "/approvals", how: "Leave, results, curricula and requests waiting for you." },
    { key: "readiness", title: "Check accreditation readiness", href: "/accreditation/readiness", how: "What each program still lacks for its council." },
    { key: "quality", title: "Visit the Quality Office", href: "/quality-office", how: "New program approvals, IPE and reviews for your faculty." },
  ] },
  HEAD_OF_DEPARTMENT: { intro: "As Head of Department you run your department's people and results.", steps: [
    { key: "dept", title: "Open your department page", href: "/hod/department", how: "Teachers, programs and this semester's courses." },
    { key: "results", title: "Approve submitted results", href: "/results-approval", how: "Check grade distribution, then approve or return with a note." },
    { key: "leave", title: "Handle leave requests", href: "/leave-approvals", how: "Approve leave and the class cover." },
    { key: "coursehome", title: "See where your courses are used", href: "/where-courses-used", how: "Which programs depend on your department's teachers." },
  ] },
  PROGRAM_COORDINATOR: { intro: "As Program Lead you build the program and run each semester.", steps: [
    { key: "batches", title: "Check your batches and GAs", href: "/coordinator/batches", how: "Each intake, its scheme of studies and graduate attributes." },
    { key: "se", title: "Assign Subject Experts", href: "/coordinator/assign-subject-experts", how: "One SE per course designs CLOs, lecture plan and assessment plan." },
    { key: "students", title: "Upload students", href: "/data-import", how: "Use Data Import (dry run first) or the batch upload." },
    { key: "semester", title: "Plan the semester", href: "/coordinator/semester", how: "Offer courses, sections, dates; then the timetable." },
    { key: "transcript", title: "Look up a student's transcript", href: "/coordinator/student-transcript", how: "Type part of a roll number; use Previous / Next to go through a batch." },
  ] },
  OMC: { intro: "As OMC member you review course designs and papers of your department.", steps: [
    { key: "queue", title: "Open the review queue", href: "/omc/queue", how: "Course designs submitted by Subject Experts — approve or ask for changes." },
    { key: "vetting", title: "Vet question papers", href: "/paper-vetting", how: "Check papers against CLOs and Bloom levels before the exam." },
    { key: "ga", title: "Check GA coverage", href: "/ga-coverage", how: "Every GA taught; labs mapped to Modern Tool Usage." },
  ] },
  SUBJECT_EXPERT: { intro: "As Subject Expert you design the course once; every teacher of it uses your design.", steps: [
    { key: "courses", title: "Open your courses", href: "/subjectexpert/courses", how: "Each course you design." },
    { key: "clo", title: "Write CLOs and map them to GAs", href: "/subjectexpert/courses", how: "3–5 CLOs with Bloom levels, each mapped to a GA." },
    { key: "plan", title: "Lecture plan and assessment plan", href: "/subjectexpert/courses", how: "Topics per lecture mapped to CLOs; quizzes, assignments, mid and final." },
    { key: "submit", title: "Submit to the OMC", href: "/subjectexpert/courses", how: "The OMC reviews and approves the design." },
  ] },
  INSTRUCTOR: { intro: "As teacher you take attendance, enter marks and submit results.", steps: [
    { key: "courses", title: "Open your courses", href: "/instructor/courses", how: "Each section you teach this semester." },
    { key: "attendance", title: "Take attendance", href: "/instructor/courses", how: "Mark each class, or show the QR code for students to scan." },
    { key: "marks", title: "Enter marks", href: "/instructor/courses", how: "Type marks, or import from Moodle / Google Classroom." },
    { key: "result", title: "Submit the result", href: "/instructor/courses", how: "Set grade cut-offs and submit; after approval the Controller publishes it." },
    { key: "profile", title: "Complete your profile", href: "/faculty/profile", how: "Photo, qualifications, experience and publications (used for accreditation)." },
  ] },
};
export const guideFor = (role: string) => GUIDES[role] || null;
