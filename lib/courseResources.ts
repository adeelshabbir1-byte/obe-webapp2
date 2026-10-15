import { prisma } from "./db";
import { norm } from "./teachingAnalysis";

// Course resources: the tools a teacher uses in a course, and its textbooks.
//
// Tools are picked from a ready list (or typed in) and suggested from what other teachers use for the same course.
// Textbooks come from a pool shared by every institute on the platform: the books listed in the HEC curriculum
// documents and the books institutes choose for HEC-standard courses, matched by the course's standard title. The
// pool recommends what is most used for a course; the library's requisition list is built from the books chosen.

export const TOOL_CATEGORIES: Record<string, string> = {
  LANGUAGE: "Programming language", IDE: "IDE / editor", SOFTWARE: "Software / tool", LIBRARY: "Library / framework", PLATFORM: "Platform / OS / cloud", HARDWARE: "Hardware / kit", OTHER: "Other",
};
const L = (category: string, names: string) => names.split("|").map((name) => ({ name, category }));
export const TOOL_CATALOG: { name: string; category: string }[] = [
  ...L("LANGUAGE", "Python|Java|C|C++|C#|JavaScript|TypeScript|R|SQL|MATLAB|Kotlin|Swift|Go|Rust|PHP|Assembly (MASM)|Assembly (NASM)|Verilog|VHDL|Prolog|Haskell|Scala|Dart"),
  ...L("IDE", "VS Code|PyCharm|IntelliJ IDEA|Eclipse|NetBeans|Visual Studio|Android Studio|Xcode|Code::Blocks|Dev-C++|Jupyter Notebook|Google Colab|RStudio|Spyder|Arduino IDE|Keil uVision|Xilinx Vivado|Quartus Prime"),
  ...L("SOFTWARE", "Git / GitHub|MySQL|PostgreSQL|MongoDB|Oracle Database|SQL Server|SQLite|Docker|Wireshark|Cisco Packet Tracer|GNS3|Proteus|Multisim|Logisim|MATLAB Simulink|LabVIEW|Weka|Tableau|Power BI|Microsoft Excel|Figma|Unity|Blender|AutoCAD|Burp Suite|Metasploit|Nmap|Postman|Jira|StarUML|Enterprise Architect|Draw.io|LaTeX / Overleaf|SPSS|Selenium|JUnit|Apache JMeter"),
  ...L("LIBRARY", "NumPy|Pandas|scikit-learn|TensorFlow|PyTorch|Keras|OpenCV|NLTK|Hugging Face Transformers|Matplotlib|React|Angular|Vue.js|Node.js|Express|Django|Flask|Spring Boot|.NET|Laravel|Flutter|React Native|Bootstrap|Tailwind CSS|OpenGL|OpenMP|MPI|CUDA|Hadoop|Apache Spark"),
  ...L("PLATFORM", "Linux (Ubuntu)|Kali Linux|Windows Server|AWS|Microsoft Azure|Google Cloud|Firebase|Heroku|Kubernetes|VirtualBox|VMware|Moodle"),
  ...L("HARDWARE", "Arduino|Raspberry Pi|ESP32|FPGA board|8051 trainer kit|Digital logic trainer|Oscilloscope|Cisco routers and switches|Drones / robotics kit"),
];

/** The standard key of a course for matching across institutes: its title without punctuation, case or roman numerals. */
export const courseKey = (title: string) => norm(title).replace(/\b(i|ii|iii|iv|lab|laboratory)\b/g, " ").replace(/\s+/g, " ").trim();

/** Tools other teachers use for courses with the same standard title (this institute first), most used first. */
export async function toolSuggestions(course: { id: string; title: string; chairmanId: string }) {
  const key = courseKey(course.title);
  const tools = await prisma.courseTool.findMany({ where: { courseId: { not: course.id } }, select: { name: true, category: true, courseId: true } }).catch(() => []);
  if (!tools.length) return [];
  const courses = await prisma.course.findMany({ where: { id: { in: Array.from(new Set(tools.map((t) => t.courseId))) } }, select: { id: true, title: true, coordinator: { select: { managedById: true } } } });
  const match = new Map(courses.filter((c) => courseKey(c.title) === key).map((c) => [c.id, c.coordinator.managedById === course.chairmanId]));
  const score = new Map<string, { name: string; category: string; uses: number; here: boolean }>();
  for (const t of tools) {
    if (!match.has(t.courseId)) continue;
    const s = score.get(norm(t.name)) || { name: t.name, category: t.category, uses: 0, here: false };
    s.uses++; s.here = s.here || !!match.get(t.courseId);
    score.set(norm(t.name), s);
  }
  return Array.from(score.values()).sort((a, b) => Number(b.here) - Number(a.here) || b.uses - a.uses).slice(0, 15);
}

// ---------------------------------------------------------------------------
// Textbooks

export type BookInput = { title: string; authors?: string | null; edition?: string | null; publisher?: string | null; year?: number | null; isbn?: string | null };
export const bookKey = (b: { title: string; authors?: string | null }) => `${norm(b.title)}|${norm(b.authors || "").split(" ").slice(0, 2).join(" ")}`.slice(0, 300);

/** Reads one line of a free-text book list ("Title, Authors, 3rd Edition, Publisher, 2019") into its parts. */
export function parseBookLine(line: string): BookInput | null {
  const raw = line.replace(/^\s*(\d+[.)]|[-*•])\s*/, "").trim();
  if (raw.length < 4) return null;
  const isbn = raw.match(/\bISBN[:\s-]*([0-9Xx-]{10,17})/)?.[1] || null;
  const year = Number(raw.match(/\b(19[5-9]\d|20[0-4]\d)\b/)?.[1]) || null;
  const edition = raw.match(/\b(\d+(?:st|nd|rd|th)\s*(?:edition|ed\.?))/i)?.[1] || null;
  const parts = raw.replace(/\bISBN[:\s-]*[0-9Xx-]{10,17}/, "").split(/\s*[,;]\s*|\s+by\s+/i).map((p) => p.replace(/^["“”']+|["“”']+$/g, "").trim()).filter(Boolean);
  const title = parts[0];
  if (!title || title.length < 3) return null;
  const looksMeta = (p: string) => /edition|\bed\.|press|publish|wiley|pearson|mcgraw|o'?reilly|springer|elsevier|cengage|addison|prentice|\b(19|20)\d{2}\b/i.test(p);
  const authors = parts[1] && !looksMeta(parts[1]) ? parts[1] : null;
  const publisher = parts.slice(1).find((p) => /press|publish|wiley|pearson|mcgraw|o'?reilly|springer|elsevier|cengage|addison|prentice|manning|packt|no starch/i.test(p)) || null;
  return { title: title.slice(0, 300), authors: authors?.slice(0, 300) || null, edition, publisher: publisher?.slice(0, 160) || null, year, isbn };
}

/** Finds or adds a book in the shared pool and records that it is used for a course with this standard title. */
export async function upsertTextbook(b: BookInput, subject: string, opts: { fromHec?: boolean; createdById?: string | null } = {}) {
  const key = bookKey(b);
  const existing = await prisma.textbook.findUnique({ where: { normKey: key } });
  if (existing) {
    const subjects = existing.subjects.includes(subject) ? existing.subjects : [...existing.subjects, subject];
    return prisma.textbook.update({
      where: { id: existing.id },
      data: { subjects, fromHec: existing.fromHec || !!opts.fromHec, edition: existing.edition || b.edition || null, publisher: existing.publisher || b.publisher || null, year: existing.year || b.year || null, isbn: existing.isbn || b.isbn || null, authors: existing.authors || b.authors || null },
    });
  }
  return prisma.textbook.create({ data: { title: b.title, authors: b.authors || null, edition: b.edition || null, publisher: b.publisher || null, year: b.year || null, isbn: b.isbn || null, normKey: key, subjects: [subject], fromHec: !!opts.fromHec, createdById: opts.createdById || null } });
}

/** Brings the books named in the HEC curriculum documents for this kind of course into the pool (once). */
async function importHecBooks(subject: string) {
  const masters = await prisma.masterCourse.findMany({ where: { textbook: { not: null }, masterCurriculum: { chairmanId: null } }, select: { title: true, textbook: true, referenceMaterial: true } }).catch(() => []);
  for (const m of masters.filter((x) => courseKey(x.title) === subject)) {
    for (const line of `${m.textbook || ""}\n${m.referenceMaterial || ""}`.split(/\n|(?<=\.)\s+(?=\d+[.)])/)) {
      const b = parseBookLine(line);
      if (b && !(await prisma.textbook.findUnique({ where: { normKey: bookKey(b) } }))?.subjects.includes(subject)) await upsertTextbook(b, subject, { fromHec: true });
    }
  }
}

export type Recommendation = { id: string; title: string; authors: string | null; edition: string | null; publisher: string | null; year: number | null; fromHec: boolean; institutes: number; courses: number };

/** Books recommended for a course: the HEC list and what institutes use for the same standard course, most used first. */
export async function recommendTextbooks(course: { id: string; title: string }): Promise<Recommendation[]> {
  const subject = courseKey(course.title);
  if (!subject) return [];
  await importHecBooks(subject).catch(() => null);
  const books = await prisma.textbook.findMany({ where: { subjects: { has: subject } } });
  if (!books.length) return [];
  const uses = await prisma.courseTextbook.findMany({ where: { textbookId: { in: books.map((b) => b.id) } }, select: { textbookId: true, courseId: true } });
  const owners = new Map((await prisma.course.findMany({ where: { id: { in: Array.from(new Set(uses.map((u) => u.courseId))).concat(["none"]) } }, select: { id: true, coordinator: { select: { managedById: true } } } })).map((c) => [c.id, c.coordinator.managedById]));
  return books.map((b) => {
    const u = uses.filter((x) => x.textbookId === b.id && x.courseId !== course.id);
    return { id: b.id, title: b.title, authors: b.authors, edition: b.edition, publisher: b.publisher, year: b.year, fromHec: b.fromHec, institutes: new Set(u.map((x) => owners.get(x.courseId)).filter(Boolean)).size, courses: u.length };
  }).sort((a, b) => b.institutes - a.institutes || Number(b.fromHec) - Number(a.fromHec) || b.courses - a.courses || a.title.localeCompare(b.title)).slice(0, 20);
}

/** Who may change a course's tools and books: its teacher, its Subject Expert, or its Program Lead. */
export const canEditResources = (user: { id: string }, c: { instructorId: string | null; subjectExpertId: string | null; coordinatorId: string }) =>
  c.instructorId === user.id || c.subjectExpertId === user.id || c.coordinatorId === user.id;

// ---------------------------------------------------------------------------
// The library's requisition list

/** "Fall 2026" for the term most programs of the institute are in now, and the one after it. */
export async function libraryTerms(chairmanId: string) {
  const terms = await prisma.currentTerm.findMany({ where: { coordinator: { managedById: chairmanId } }, select: { termName: true, year: true } });
  const count = new Map<string, number>();
  for (const t of terms) { const k = `${t.termName} ${t.year}`; count.set(k, (count.get(k) || 0) + 1); }
  const current = Array.from(count.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || `Fall ${new Date().getFullYear()}`;
  const [name, y] = current.split(" ");
  const next = name === "Fall" ? `Spring ${Number(y) + 1}` : `Fall ${y}`;
  return { current, next };
}

export type RequisitionRow = {
  textbookId: string; title: string; authors: string | null; edition: string | null; publisher: string | null; isbn: string | null;
  courses: { code: string; title: string; program: string; students: number }[]; students: number; recommended: number;
  inStock: number; ordered: number; received: number; status: string; note: string | null; shortfall: number;
};

/**
 * The books needed for a term: the textbooks chosen for the courses running now (current) or due next (the next
 * semester of each batch), with how many students take them, the copies recommended (one per `perCopy` students) and
 * the library's stock and orders. Courses whose books are only typed as free text are listed separately.
 */
export async function requisitions(chairmanId: string, which: "current" | "next", perCopy: number, includeReference: boolean) {
  const terms = await libraryTerms(chairmanId);
  const term = which === "current" ? terms.current : terms.next;
  const offered = await prisma.course.findMany({ where: { coordinator: { managedById: chairmanId }, isOffered: true }, select: { id: true, batchId: true, semesterNumber: true } });
  let courseIds: string[];
  if (which === "current") courseIds = offered.map((c) => c.id);
  else {
    // Next semester of each batch running now.
    const nextOf = new Map<string, number>();
    for (const c of offered) if (c.batchId && c.semesterNumber) nextOf.set(c.batchId, Math.max(nextOf.get(c.batchId) || 0, c.semesterNumber + 1));
    courseIds = nextOf.size ? (await prisma.course.findMany({ where: { OR: Array.from(nextOf.entries()).map(([batchId, semesterNumber]) => ({ batchId, semesterNumber })) }, select: { id: true } })).map((c) => c.id) : [];
  }
  const courses = courseIds.length ? await prisma.course.findMany({
    where: { id: { in: courseIds } },
    select: { id: true, code: true, title: true, textbook: true, batch: { select: { degreeProgram: true, batchName: true, studentCount: true } }, _count: { select: { studentEnrollments: true } } },
  }) : [];
  const chosen = courses.length ? await prisma.courseTextbook.findMany({ where: { courseId: { in: courses.map((c) => c.id) }, ...(includeReference ? {} : { kind: "TEXT" }) } }) : [];
  const books = new Map((await prisma.textbook.findMany({ where: { id: { in: Array.from(new Set(chosen.map((c) => c.textbookId))).concat(["none"]) } } })).map((b) => [b.id, b]));
  const stock = new Map((await prisma.libraryRequisition.findMany({ where: { chairmanId, term } })).map((r) => [r.textbookId, r]));
  const rows = new Map<string, RequisitionRow>();
  for (const ct of chosen) {
    const b = books.get(ct.textbookId), c = courses.find((x) => x.id === ct.courseId);
    if (!b || !c) continue;
    const students = which === "current" ? c._count.studentEnrollments || c.batch?.studentCount || 0 : c.batch?.studentCount || c._count.studentEnrollments || 0;
    const r = rows.get(b.id) || { textbookId: b.id, title: b.title, authors: b.authors, edition: b.edition, publisher: b.publisher, isbn: b.isbn, courses: [], students: 0, recommended: 0, inStock: 0, ordered: 0, received: 0, status: "PENDING", note: null, shortfall: 0 };
    r.courses.push({ code: c.code, title: c.title, program: `${c.batch?.degreeProgram || ""} ${c.batch?.batchName || ""}`.trim(), students });
    r.students += students;
    rows.set(b.id, r);
  }
  for (const r of Array.from(rows.values())) {
    const s = stock.get(r.textbookId);
    r.recommended = Math.max(1, Math.ceil(r.students / Math.max(1, perCopy)));
    if (s) { r.inStock = s.inStock; r.ordered = s.ordered; r.received = s.received; r.status = s.status; r.note = s.note; }
    r.shortfall = r.status === "NOT_NEEDED" ? 0 : Math.max(0, r.recommended - r.inStock - Math.max(r.ordered, r.received));
  }
  const withBooks = new Set(chosen.map((c) => c.courseId));
  const uncatalogued = courses.filter((c) => !withBooks.has(c.id)).map((c) => ({ code: c.code, title: c.title, program: `${c.batch?.degreeProgram || ""} ${c.batch?.batchName || ""}`.trim(), text: c.textbook }));
  return { term, rows: Array.from(rows.values()).sort((a, b) => b.shortfall - a.shortfall || a.title.localeCompare(b.title)), uncatalogued, courseCount: courses.length };
}
