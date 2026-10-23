# NCEAC portal (AAS) — field inventory

Generated from the code (`npx tsx scripts/gen-nceac-inventory.ts`). The same table is on **Accreditation → NCEAC Portal Data → Field inventory**, with an Excel download.

Sources: the portal's printouts of a submitted application (Request Form, POs, GAs, Curriculum, Students, Faculty, Facilities, Financial, Quality, Industrial Linkages, Addendum A and B), screenshots of the portal's faculty and course forms and dropdowns, and the two Excel upload templates (*Template Current Students* and *Teacher Data*).

**136 fields** — 37 auto, 40 derived, 59 input needed.

- **Auto** — OBEHUB already holds it (the source table and field are given).
- **Derived** — OBEHUB works it out (the formula is given).
- **Input needed** — someone types it; the place in OBEHUB is given.

## Upload files

### Students file (Template Current Students)

Sheet `Sheet1`; dates as real dates shown `d-mmm-yyyy`; Header row and one row per current student. The template's example row, its “Compulsory” row and the code legend are guidance and are left out.

| # | Header | Required | Type | Portal list |
|---|---|---|---|---|
| 1 | Student Name | Yes | text |  |
| 2 | FatherName | Yes | text |  |
| 3 | Gender | Yes | text | studentGender |
| 4 | RollNo | Yes | id |  |
| 5 | Admission Date | Yes | date |  |
| 6 | Nationality | Yes | text |  |
| 7 | CNIC Number | Yes | text (cnic) |  |
| 8 | Passport Number | No | text |  |
| 9 | Date of Birth | Yes | date |  |
| 10 | PhoneNumber | No | text (phone) |  |
| 11 | Email | No | text (email) |  |
| 12 | Domicile District | No | text |  |
| 13 | Domicile Province | No | text | province |
| 14 | Mailing Address | Yes | text |  |
| 15 | City (Mailing Address) | Yes | text |  |
| 16 | SSC Degree Name | No | text |  |
| 17 | SSC Board Name | No | text |  |
| 18 | SSC Total Marks | No | number |  |
| 19 | SSC Obtained Marks | No | number |  |
| 20 | HSSC Degree Name | Yes | text |  |
| 21 | HSSC Degree Nomenclature | Yes | number | hsscNomenclature |
| 22 | HSSC Board Name | No | text |  |
| 23 | HSSC Total Marks | Yes | number |  |
| 24 | HSSC Obtained Marks | Yes | number |  |

### Faculty file (Teacher Data)

Sheet `Sheet1`; dates as real dates shown `d-mmm-yyyy`; Header row and one row per teacher of the program, with the highest degree.

| # | Header | Required | Type | Portal list |
|---|---|---|---|---|
| 1 | Email Address | Yes | text (email) |  |
| 2 | Name | Yes | text |  |
| 3 | Gender | Yes | text | facultyGender |
| 4 | CNIC | Yes | text |  |
| 5 | Date of Birth | Yes | date |  |
| 6 | Phone Number | Yes | text (phone) |  |
| 7 | Email | Yes | text (email) |  |
| 8 | Address | Yes | text |  |
| 9 | Province | Yes | text | province |
| 10 | City | Yes | text |  |
| 11 | Contract Type | Yes | text | contractType |
| 12 | Academic Rank | Yes | text | academicRank |
| 13 | Joining Date | Yes | date |  |
| 14 | Leaving Date | No | date |  |
| 15 | Degree Name | Yes | text |  |
| 16 | Degree Type | Yes | text | degreeType |
| 17 | Field of Study | Yes | text |  |
| 18 | Degree Awarded Country | Yes | text |  |
| 19 | Degree Awarded Institute | Yes | text |  |
| 20 | Degree Start Date | Yes | date |  |
| 21 | Degree End Date | Yes | date |  |

## Portal dropdown lists

| List | Values | Source |
|---|---|---|
| Contract Type | FullTime, Visiting, Shared | portal screen |
| Academic Rank | Professor, AssociateProfessor, AssistantProfessor, Lecturer, TeachingAssistant, LabAssistant, LabInstructor, PhDScholars | portal screen |
| Honorific | Mr, Ms, Mrs, Dr, Prof, Engr | to confirm on the portal — Only “Mr” shows in the screenshot of the faculty form; confirm the rest on the portal. |
| Gender (faculty) | Male, Female | to confirm on the portal — The faculty template has no example row; confirm the spelling on the portal. |
| Gender (students file) | M, F | portal template — The students template's example row writes M. |
| Degree Type | PhD, MS/MPhil, BS, Masters, Bachelors | to confirm on the portal — Not visible in the screenshots; confirm on the portal (18-year degrees: MS/MPhil; 16-year: BS or Masters; 14-year: Bachelors). |
| Province | Punjab, Sindh, Khyber Pakhtunkhwa, Balochistan, Islamabad, Gilgit-Baltistan, Azad Jammu and Kashmir | portal printout — The portal's own Request Form prints the federal capital as “Islamabad”. |
| HSSC Degree Nomenclature (code) | 1 = Intermediate With Math, 2 = A Level With Math, 3 = Intermediate With PreMedical | portal template — The students template asks for the numeric code. |
| Course Type | Theory, Lab | to confirm on the portal — The portal asks for theory and lab courses to be added separately. |
| Faculty Type | Local, Foreign | portal printout |
| Graduate Attributes | GA-1 = Academic Education, GA-2 = Knowledge for Solving Computing Problems, GA-3 = Problem Analysis, GA-4 = Design / Development of Solutions, GA-5 = Modern Tool Usage, GA-6 = Individual and Teamwork, GA-7 = Communication, GA-8 = Computing Professionalism and Society, GA-9 = Ethics, GA-10 = Life-long Learning | portal screen |

## Every field

### Students upload file (Template Current Students)

| Field | Type | Allowed values | Required | Group | Source / formula / where it is typed |
|---|---|---|---|---|---|
| Student Name | Text |  | Yes | Auto — OBEHUB already holds it | Student.name |
| FatherName | Text |  | Yes | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file |
| Gender | List | M, F | Yes | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file |
| RollNo | Text / number |  | Yes | Auto — OBEHUB already holds it | Student.rollNumber |
| Admission Date | Date (d-mmm-yyyy) |  | Yes | Derived — OBEHUB works it out | First day of the batch's start term: Batch.startTerm + Batch.startYear (Fall → 1 Sep, Spring → 1 Feb) |
| Nationality | Text |  | Yes | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file (default Pakistani) |
| CNIC Number | Text xxxxx-xxxxxxx-x |  | Yes | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file |
| Passport Number | Text |  | No | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file (foreign students) |
| Date of Birth | Date (d-mmm-yyyy) |  | Yes | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file |
| PhoneNumber | Text, 03xxxxxxxxx |  | No | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file; else AdmissionLead.phone |
| Email | Email |  | No | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file; else AdmissionLead.email |
| Domicile District | Text |  | No | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file |
| Domicile Province | List | Punjab, Sindh, Khyber Pakhtunkhwa, Balochistan, Islamabad, Gilgit-Baltistan, Azad Jammu and Kashmir | No | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file |
| Mailing Address | Text |  | Yes | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file |
| City (Mailing Address) | Text |  | Yes | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file; else AdmissionLead.city |
| SSC Degree Name | Text |  | No | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file |
| SSC Board Name | Text |  | No | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file |
| SSC Total Marks | Number |  | No | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file |
| SSC Obtained Marks | Number |  | No | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file |
| HSSC Degree Name | Text |  | Yes | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file |
| HSSC Degree Nomenclature | Number code | 1 Intermediate With Math, 2 A Level With Math, 3 Intermediate With PreMedical | Yes | Derived — OBEHUB works it out | From the student's track (Student.track): Pre-Medical → 3, A Level → 2, otherwise 1; the student or Program Lead can change it |
| HSSC Board Name | Text |  | No | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file |
| HSSC Total Marks | Number |  | Yes | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file |
| HSSC Obtained Marks | Number |  | Yes | Input needed | Student: My Details (student portal); Program Lead: NCEAC Portal Data → Fix, or upload the filled students file |

### Faculty upload file (Teacher Data)

| Field | Type | Allowed values | Required | Group | Source / formula / where it is typed |
|---|---|---|---|---|---|
| Email Address | Email |  | Yes | Auto — OBEHUB already holds it | User.email (the teacher's institute account) |
| Name | Text |  | Yes | Auto — OBEHUB already holds it | User.name |
| Gender | List | Male, Female | Yes | Auto — OBEHUB already holds it | FacultyProfile.gender (or NCEAC details) |
| CNIC | Text xxxxx-xxxxxxx-x (foreign: passport) |  | Yes | Auto — OBEHUB already holds it | FacultyProfile.cnic (or NCEAC details) |
| Date of Birth | Date |  | Yes | Auto — OBEHUB already holds it | FacultyProfile.dateOfBirth (or NCEAC details) |
| Phone Number | Text, 03xxxxxxxxx |  | Yes | Auto — OBEHUB already holds it | FacultyProfile.phone (or NCEAC details) |
| Email | Email |  | Yes | Auto — OBEHUB already holds it | User.email (or NCEAC details) |
| Address | Text |  | Yes | Auto — OBEHUB already holds it | FacultyProfile.address (or NCEAC details) |
| Province | List | Punjab, Sindh, Khyber Pakhtunkhwa, Balochistan, Islamabad, Gilgit-Baltistan, Azad Jammu and Kashmir | Yes | Input needed | Teacher: My Profile → NCEAC details; Program Lead / HOD: NCEAC Portal Data → Fix, or upload the filled faculty file |
| City | Text |  | Yes | Input needed | Teacher: My Profile → NCEAC details; Program Lead / HOD: NCEAC Portal Data → Fix, or upload the filled faculty file |
| Contract Type | List | FullTime, Visiting, Shared | Yes | Derived — OBEHUB works it out | FacultyProfile.employmentType mapped: Permanent / Contract / Regular → FullTime; Visiting / Part-time → Visiting; Shared → Shared |
| Academic Rank | List | Professor, AssociateProfessor, AssistantProfessor, Lecturer, TeachingAssistant, LabAssistant, LabInstructor, PhDScholars | Yes | Derived — OBEHUB works it out | FacultyProfile.designation mapped: e.g. Assistant Professor → AssistantProfessor, Lab Engineer → LabInstructor |
| Joining Date | Date |  | Yes | Auto — OBEHUB already holds it | FacultyProfile.dateOfJoining |
| Leaving Date | Date |  | No | Input needed | Teacher: My Profile → NCEAC details; Program Lead / HOD: NCEAC Portal Data → Fix, or upload the filled faculty file (only for those who left) |
| Degree Name | Text |  | Yes | Auto — OBEHUB already holds it | FacultyRecord (kind EDUCATION, latest).title |
| Degree Type | List | PhD, MS/MPhil, BS, Masters, Bachelors | Yes | Derived — OBEHUB works it out | From the degree name: PhD; MS / MPhil; BS; Masters; Bachelors |
| Field of Study | Text |  | Yes | Auto — OBEHUB already holds it | FacultyProfile.specialization (or NCEAC details) |
| Degree Awarded Country | Text |  | Yes | Input needed | Teacher: My Profile → NCEAC details; Program Lead / HOD: NCEAC Portal Data → Fix, or upload the filled faculty file (default Pakistan) |
| Degree Awarded Institute | Text |  | Yes | Auto — OBEHUB already holds it | FacultyRecord (EDUCATION).organisation |
| Degree Start Date | Date |  | Yes | Derived — OBEHUB works it out | FacultyRecord.startYear → 1 Sep of that year (estimate; the teacher confirms the exact date) |
| Degree End Date | Date |  | Yes | Derived — OBEHUB works it out | FacultyRecord.endYear → 30 Jun of that year (estimate; the teacher confirms the exact date) |

### Faculty form on the portal (extra fields)

| Field | Type | Allowed values | Required | Group | Source / formula / where it is typed |
|---|---|---|---|---|---|
| Honorific | List | Mr (others to confirm: Ms, Mrs, Dr, Prof, Engr) | Yes | Input needed | Teacher: My Profile → NCEAC details; Program Lead / HOD: NCEAC Portal Data → Fix, or upload the filled faculty file |
| CNIC / Passport choice | Choice |  | Yes | Derived — OBEHUB works it out | Passport when Faculty Type is Foreign, otherwise CNIC |
| Still working at Institute | Tick |  | No | Derived — OBEHUB works it out | Ticked when there is no Leaving Date |
| Is Core Computing Teacher | Tick |  | No | Input needed | Teacher: My Profile → NCEAC details; Program Lead / HOD: NCEAC Portal Data → Fix, or upload the filled faculty file |
| Foreign University Name | Text |  | No | Input needed | Teacher: My Profile → NCEAC details; Program Lead / HOD: NCEAC Portal Data → Fix, or upload the filled faculty file (when the degree is from abroad) |

### Courses Catalog (portal form, one course at a time)

| Field | Type | Allowed values | Required | Group | Source / formula / where it is typed |
|---|---|---|---|---|---|
| Course Name | Text |  | Yes | Auto — OBEHUB already holds it | Course.code + Course.title |
| HEC Curriculum | List |  | Yes | Input needed | NCEAC AAS page (workbook or typed): the HEC curriculum version the program follows |
| Course Type | List | Theory, Lab | Yes | Derived — OBEHUB works it out | Course.courseType: Lab → Lab, everything else → Theory (theory and lab added separately) |
| Linked HEC Course | List |  | Yes | Derived — OBEHUB works it out | The HEC master-curriculum course the course was copied from (Master Curriculum); otherwise chosen on the portal |
| Credit Hr | Number |  | Yes | Auto — OBEHUB already holds it | Course.creditHours |
| GA-1 … GA-10 mapping | Ticks |  | No | Auto — OBEHUB already holds it | CoursePloMapping → PLO.number (PLO n = GA-n) |

### Request Form (Form for Accreditation Visit)

| Field | Type | Allowed values | Required | Group | Source / formula / where it is typed |
|---|---|---|---|---|---|
| Program and sessions under evaluation | Text |  | Yes | Auto — OBEHUB already holds it | Batch.degreeProgram + Batch.batchName of the program's batches |
| Name / Type of Institute, Degree Awarding Institution | Text |  | Yes | Input needed | NCEAC AAS page (workbook or typed) |
| Institute Address, City, Province, Contact No, Email, Website, Date of Establishment, Fax | Text |  | Yes | Input needed | NCEAC AAS page (workbook or typed) — Institute's Profile |
| Chief Administrator Officer: Name, Designation, Email | Text |  | Yes | Auto — OBEHUB already holds it | Institute head's account (User) and position title (Admin → Organisation Chart) |
| Dean: Name, Designation, Email | Text |  | Yes | Auto — OBEHUB already holds it | The Dean's account and position title |
| University Registrar: Name, Designation, Email | Text |  | Yes | Input needed | NCEAC AAS page (workbook or typed) — Contact Information |
| Head of Department: Name, Email | Text |  | Yes | Auto — OBEHUB already holds it | The Head of Department's account (role HEAD_OF_DEPARTMENT of the program's department) |
| Contact No and Fax of each contact | Text |  | Yes | Input needed | NCEAC AAS page (workbook or typed) — Contact Information |
| NCEAC Liaison: Name, Designation, Email, Mobile, Mailing Address, City, Province | Text |  | Yes | Auto — OBEHUB already holds it | The NCEAC focal person chosen on the AAS page (User + FacultyProfile) |

### Program Objectives (POs) form

| Field | Type | Allowed values | Required | Group | Source / formula / where it is typed |
|---|---|---|---|---|---|
| Q1 Vision and mission | Narrative |  | Yes | Input needed | SAR sections (Accreditation → SAR), typed by the program team |
| Q2 Formulation, improvement and approval of POs | Narrative |  | Yes | Input needed | SAR sections (Accreditation → SAR), typed by the program team |
| Q3 Consistency of POs with vision and mission | Narrative |  | Yes | Input needed | SAR sections (Accreditation → SAR), typed by the program team |
| Q4 Evaluating the achievement of POs | Narrative |  | Yes | Derived — OBEHUB works it out | Drafted from PEO/PO attainment (PEO Attainment page); the team edits it |
| Q5 Using the evaluation results | Narrative |  | Yes | Input needed | SAR sections (Accreditation → SAR), typed by the program team |
| PO table: PO No., Program Objective, Mapped GAs | Table |  | Yes | Auto — OBEHUB already holds it | Program objectives (PEO) and their PLO mapping |

### Graduate Attributes (GAs) form

| Field | Type | Allowed values | Required | Group | Source / formula / where it is typed |
|---|---|---|---|---|---|
| Q1 Body that approved the GAs | Text |  | Yes | Input needed | SAR sections (Accreditation → SAR), typed by the program team |
| Q2–Q3 How GAs meet the requirements; how they are reviewed | Narrative |  | Yes | Input needed | SAR sections (Accreditation → SAR), typed by the program team |
| Q4 Data gathered and results of the GA assessment | Table + narrative |  | Yes | Derived — OBEHUB works it out | PLO (GA) attainment per batch: share of students at or above the PLO target (Outcomes Report) |
| Q5 How results improve the program | Narrative |  | Yes | Derived — OBEHUB works it out | CQI actions recorded against PLOs (CqiRecord) |
| Q6 Students' work and evidence of complex problems | Narrative |  | Yes | Input needed | SAR sections (Accreditation → SAR), typed by the program team |
| Q7 Complex problems / activities in breadth and depth courses | Table |  | Yes | Input needed | SAR sections (Accreditation → SAR), typed by the program team (complex-problem tags, item 6) |

### Curriculum and Learning Process form

| Field | Type | Allowed values | Required | Group | Source / formula / where it is typed |
|---|---|---|---|---|---|
| Q1 Compliance with HEC curriculum (8 semesters, ≥ 130 credit hours) | Narrative |  | Yes | Derived — OBEHUB works it out | Σ Course.creditHours of the batch's scheme and number of semesters (Degree Scheme) |
| Q2 Exposure to complex problems and design | Narrative |  | Yes | Input needed | SAR sections (Accreditation → SAR), typed by the program team |
| Q3 Program-specific labs | Narrative |  | Yes | Derived — OBEHUB works it out | Labs (LabInfo) and lab courses of the program |
| Q4 Lab work and its assessment | Narrative |  | Yes | Input needed | SAR sections (Accreditation → SAR), typed by the program team |
| Q5 CLOs defined and mapped to GAs | Yes/No + narrative |  | Yes | Derived — OBEHUB works it out | Share of the program's courses with CLOs and a CLO→PLO mapping |
| Q6 Industry involvement in curriculum | Narrative |  | Yes | Derived — OBEHUB works it out | Board of Studies minutes with external members (MeetingMinutes kind BOS) |
| Q7 Tutorials, seminars, office hours | Narrative |  | Yes | Input needed | SAR sections (Accreditation → SAR), typed by the program team |
| Q8 Internship with employer feedback | Narrative |  | Yes | Derived — OBEHUB works it out | Internship and employer survey records |
| Q9 PBL, design projects, open-ended labs | Narrative |  | Yes | Input needed | SAR sections (Accreditation → SAR), typed by the program team |
| Q10 Assessment of GAs / CLOs, direct and indirect | Narrative |  | Yes | Derived — OBEHUB works it out | Assessment instruments with CLO tags + surveys used (Assessment Rules, Surveys) |
| Q11 FYDP includes complex problems | Narrative |  | Yes | Input needed | SAR sections (Accreditation → SAR), typed by the program team |
| Q12 FYDP graded with rubrics | Narrative |  | Yes | Derived — OBEHUB works it out | FYP rubrics in use (FYP module) |

### Students form

| Field | Type | Allowed values | Required | Group | Source / formula / where it is typed |
|---|---|---|---|---|---|
| Q1 Admission requirements and annual intake | Narrative |  | Yes | Derived — OBEHUB works it out | Admission criteria (Admissions) + intake per year (students admitted per batch) |
| Q2 Credit transfer / exemption policy | Narrative |  | Yes | Derived — OBEHUB works it out | Student status policy: minimum grade, maximum share of credits (Student Status Changes) |
| Q3 Guidance: academic, career, wellness, discipline | Narrative |  | Yes | Derived — OBEHUB works it out | Batch advisors per batch + counselling records |
| Q4 Harassment and plagiarism cases | Narrative |  | Yes | Input needed | SAR sections (Accreditation → SAR), typed by the program team |
| Q5 Workload and class sizes (theory and lab) | Narrative |  | Yes | Derived — OBEHUB works it out | Registration rules (max credit hours) and average students per section |
| Q6 Student societies and activities | Narrative |  | Yes | Derived — OBEHUB works it out | Societies and their events (Society Elections, Events) |
| Q7 KPIs of students' performance against GAs | Narrative |  | Yes | Derived — OBEHUB works it out | PLO targets (individual and cohort) from Outcome settings |

### Faculty and Support Staff form

| Field | Type | Allowed values | Required | Group | Source / formula / where it is typed |
|---|---|---|---|---|---|
| Q1 Strength and competencies of the faculty | Narrative |  | Yes | Derived — OBEHUB works it out | Faculty by highest degree and specialisation (FacultyRecord, FacultyProfile) |
| Q2 Workload: teaching, advising, research | Narrative |  | Yes | Derived — OBEHUB works it out | Teaching load per teacher per term (course allocation) and advising duties |
| Q3 Faculty development and retention | Narrative |  | Yes | Derived — OBEHUB works it out | FDP sessions attended + retention (joining / leaving dates) |
| Q4 Technical and administrative staff | Narrative |  | Yes | Input needed | SAR sections (Accreditation → SAR), typed by the program team |

### Facilities and Infrastructure form

| Field | Type | Allowed values | Required | Group | Source / formula / where it is typed |
|---|---|---|---|---|---|
| Q1–Q3 Lecture rooms: dedicated, shared, average size | Number |  | Yes | Auto — OBEHUB already holds it | Room (type, departmentId, capacity) |
| Q4–Q5 Facilities in lecture rooms, other facilities | Text |  | Yes | Input needed | NCEAC AAS page (workbook or typed) — II Infrastructure |
| Q6–Q8 Computing labs, computers per lab, PC lifetime | Number |  | Yes | Auto — OBEHUB already holds it | LabInfo.computers / computersWorking; lifetime typed in AAS |
| Q9 Lab contact hours per credit hour per week | Number |  | Yes | Derived — OBEHUB works it out | Lab courses' contact hours ÷ credit hours |
| Q10–Q11 Networking; specialised labs and hours | Text |  | Yes | Input needed | NCEAC AAS page (workbook or typed) — II Infrastructure |
| Q12–Q13 Logic design lab; exclusive final-year lab | Yes/No |  | Yes | Input needed | NCEAC AAS page (workbook or typed) — II Infrastructure |
| Q14–Q16 Student to computer ratio (3 years) | Number |  | Yes | Derived — OBEHUB works it out | Active students ÷ working computers in labs |
| Q17–Q18 Books and unique titles in the library | Number |  | Yes | Auto — OBEHUB already holds it | LibraryInfo.totalVolumes, computingTitles |
| Q19–Q21 HEC digital library; library system; IEEE/ACM access | Yes/No |  | Yes | Auto — OBEHUB already holds it | LibraryInfo.databases |
| Q22–Q27 Computing books added and technical magazines (3 years) | Number |  | Yes | Input needed | NCEAC AAS page (workbook or typed) — II Infrastructure |
| Q28 Separate faculty offices | Number |  | Yes | Input needed | NCEAC AAS page (workbook or typed) — III General Information |
| Q29–Q40 Yes/No questions (TA support, BoS meetings, calendar, Wi-Fi, sports, hostel, prayer area, common room, societies, placement office) | Yes/No |  | Yes | Input needed | NCEAC AAS page (workbook or typed) — III General Information (BoS meetings and placement office filled from records) |
| Q41–Q43 Own or rented building; purpose built; sub-campuses | Text |  | Yes | Input needed | NCEAC AAS page (workbook or typed) — III General Information |
| Q44 Recent and planned improvements | Narrative |  | Yes | Input needed | SAR sections (Accreditation → SAR), typed by the program team |

### Institutional Support and Financial Resources form

| Field | Type | Allowed values | Required | Group | Source / formula / where it is typed |
|---|---|---|---|---|---|
| Annual expenditure of the institution (5 years) | Number (PKR millions) |  | Yes | Auto — OBEHUB already holds it | FinanceEntry (kind SPENT) summed per fiscal year |
| Research and faculty development (institution, computing department) | Number |  | Yes | Auto — OBEHUB already holds it | FinanceEntry categories research / development / training |
| Library and computing books | Number |  | Yes | Auto — OBEHUB already holds it | FinanceEntry categories library / books |
| Computing facilities; computing department total | Number |  | Yes | Input needed | NCEAC AAS page (workbook or typed) — IV Financial Information |

### Steps to Improve Quality form

| Field | Type | Allowed values | Required | Group | Source / formula / where it is typed |
|---|---|---|---|---|---|
| Q1–Q3 Program planning; curriculum development; content review | Narrative |  | Yes | Derived — OBEHUB works it out | Board of Studies decisions and curriculum versions (policy history) |
| Q4 Responding to stakeholder feedback | Narrative |  | Yes | Derived — OBEHUB works it out | Survey results and the CQI actions taken on them |
| Q5 Tracking each course's contribution to GAs | Narrative |  | Yes | Auto — OBEHUB already holds it | CLO→PLO mapping and course PLO attainment |
| Q6 Tracking performance through assessment and rubrics | Narrative |  | Yes | Derived — OBEHUB works it out | Rubric-based assessments and attainment reports |
| Q7 Implementation plan from the last visit | Narrative |  | Yes | Derived — OBEHUB works it out | Accreditation tasks and their status (Accreditation → Tasks) |
| Q8–Q10 Participation in quality work; staff development; QA policies | Narrative |  | Yes | Input needed | SAR sections (Accreditation → SAR), typed by the program team |

### Industrial Linkages form

| Field | Type | Allowed values | Required | Group | Source / formula / where it is typed |
|---|---|---|---|---|---|
| Q1 Industry advisory board and its role | Narrative |  | Yes | Input needed | SAR sections (Accreditation → SAR), typed by the program team |
| Q2 Collaborative projects and internships | Narrative |  | Yes | Derived — OBEHUB works it out | Internships and industry projects recorded |
| Q3 Policies for industry-sponsored projects | Narrative |  | Yes | Input needed | SAR sections (Accreditation → SAR), typed by the program team |

### Addendum A (offered courses per session)

| Field | Type | Allowed values | Required | Group | Source / formula / where it is typed |
|---|---|---|---|---|---|
| Course name and mapped GAs | Text |  | Yes | Auto — OBEHUB already holds it | Course.code + title; CoursePloMapping → GA-n |
| Semester number | Number |  | Yes | Auto — OBEHUB already holds it | Course.semesterNumber |
| Sections | Number |  | Yes | Auto — OBEHUB already holds it | CourseSectionAssignment.sectionCount / ScheduleSection count |
| Students | Number |  | Yes | Auto — OBEHUB already holds it | StudentEnrollment count per course |
| Teaching faculty | Text |  | Yes | Auto — OBEHUB already holds it | Course.instructor (and section instructors) |

### Addendum B (faculty teaching elsewhere)

| Field | Type | Allowed values | Required | Group | Source / formula / where it is typed |
|---|---|---|---|---|---|
| Name | Text |  | Yes | Auto — OBEHUB already holds it | User.name of the program's teachers |
| MS course load | Number |  | Yes | Derived — OBEHUB works it out | Courses the teacher teaches in MS programs in the session |
| PhD course load | Number |  | Yes | Derived — OBEHUB works it out | Courses the teacher teaches in PhD programs in the session |
| Other department | Number |  | Yes | Derived — OBEHUB works it out | Courses the teacher teaches for other departments in the session |
