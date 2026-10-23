import { randomUUID } from "crypto";
import { prisma } from "./db";
import { DEMO_HEAD } from "./demoInstitute";
import { adb, programContext, sectionRows, saveDetail } from "./aas";
import { canon } from "./nceacLists";
import { studentExport, facultyExport, summary, portalLists, programTeacherIds } from "./nceacPortal";

// Dream University: the NCEAC details every current student and every teacher of the NCEAC programs needs, so the
// students and faculty files on the NCEAC Portal Data page are complete and pass every check. Only empty values are
// filled (anything already typed is kept), so running it again changes nothing.

function rng(seed: string) { let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const FEMALE = new Set("ayesha hina iqra laiba nida saima sobia rabia eman mahnoor fatima zainab maryam mariam sana amna hira areeba aiman komal sadia noor alina anum sidra bushra kiran mehwish uzma asma zara hafsa saba shazia rida esha aqsa hania momina arooj javeria khadija samina nadia sara sarah alishba anaya mehak minahil rimsha warda wardah yusra sundas sadaf salma iqra".split(" "));
const firstName = (n: string) => n.replace(/^(dr|mr|mrs|ms|miss|prof|engr)\.?\s+/i, "").split(/\s+/)[0].toLowerCase();
const isFemale = (n: string) => FEMALE.has(firstName(n));
const FATHERS = ["Muhammad Aslam", "Abdul Rashid", "Ghulam Mustafa", "Tariq Mehmood", "Khalid Hussain", "Shahid Iqbal", "Zafar Ali", "Nasir Ahmed", "Imran Qureshi", "Javed Akhtar", "Arshad Mahmood", "Mushtaq Ahmad", "Sajid Hameed", "Rizwan Ul Haq", "Waqar Younis"];
const PLACES: [string, string, string, string][] = [["Islamabad", "Islamabad", "Islamabad", "Federal Board of Intermediate and Secondary Education"], ["Rawalpindi", "Rawalpindi", "Punjab", "BISE Rawalpindi"], ["Lahore", "Lahore", "Punjab", "BISE Lahore"], ["Peshawar", "Peshawar", "Khyber Pakhtunkhwa", "BISE Peshawar"], ["Abbottabad", "Abbottabad", "Khyber Pakhtunkhwa", "BISE Abbottabad"], ["Multan", "Multan", "Punjab", "BISE Multan"], ["Karachi", "Karachi", "Sindh", "BIE Karachi"], ["Quetta", "Quetta", "Balochistan", "BISE Quetta"]];
const STREETS = ["House 14, Street 7, G-11/2", "Flat 3, Block B, Bahria Town Phase 4", "House 221, Satellite Town", "House 9, Street 22, F-10/1", "House 56, Askari 14", "Mohallah Rehmanabad, Street 3", "House 102, Sector B-17", "House 18, Gulberg Greens"];
const UNIS = ["COMSATS University Islamabad", "National University of Sciences and Technology", "University of Engineering and Technology, Lahore", "Quaid-i-Azam University", "FAST National University", "International Islamic University, Islamabad", "University of the Punjab"];
const COUNTRY: [RegExp, string][] = [[/malaya|malaysia|\butm\b|\bupm\b/i, "Malaysia"], [/london|manchester|leeds|birmingham|glasgow|edinburgh|oxford|cambridge|\buk\b/i, "United Kingdom"], [/korea|kaist|seoul/i, "South Korea"], [/china|beijing|tsinghua|wuhan|harbin/i, "China"], [/australia|sydney|melbourne|monash/i, "Australia"], [/germany|munich|berlin|tu\s/i, "Germany"], [/sweden|kth|lund/i, "Sweden"], [/texas|california|usa|united states|georgia tech|purdue/i, "United States"], [/canada|toronto|waterloo/i, "Canada"], [/turkey|istanbul|ankara/i, "Turkey"]];
const dmy = (y: number, m: number, d: number) => `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
const cnic = (r: () => number, female: boolean) => { const a = String(10000 + Math.floor(r() * 89999)).padStart(5, "0"); const b = String(Math.floor(r() * 9999999)).padStart(7, "0"); const odd = Math.floor(r() * 5) * 2 + 1; return `${a}-${b}-${female ? odd - 1 : odd}`; };
const phone = (r: () => number) => `03${["00", "01", "11", "21", "33", "45", "15", "22"][Math.floor(r() * 8)]}${String(Math.floor(r() * 9999999)).padStart(7, "0")}`;
const fill = (cur: Record<string, string>, add: Record<string, string>) => Object.fromEntries(Object.entries(add).filter(([k]) => !(cur[k] || "").trim()));

/** everyone = every program and every teacher of the institute (for HEMIS), not only the NCEAC programs. */
export async function campusNceacPortal(everyone = false) {
  const head = await prisma.user.findUnique({ where: { username: DEMO_HEAD }, select: { id: true } });
  if (!head) throw new Error("Build the demo institute first.");
  const programs = everyone ? Array.from(new Set((await prisma.batch.findMany({ where: { coordinator: { managedById: head.id } }, select: { degreeProgram: true } })).map((b) => b.degreeProgram))) : await programContext(head.id);
  if (!programs.length) return ["no NCEAC program (run the accreditation step first)"];
  const lists = await portalLists(head.id);
  const done: string[] = [];
  let studentsFilled = 0, teachersFilled = 0;
  const teacherIds = new Set<string>();
  for (const program of programs) {
    const batches = await prisma.batch.findMany({ where: { degreeProgram: program, coordinator: { managedById: head.id } }, select: { id: true, batchName: true, startYear: true, startTerm: true }, orderBy: { startYear: "asc" } });
    const ctx = { chairmanId: head.id, program, batchId: batches[0]?.id || null, focalId: head.id, batches };
    for (const b of batches) {
      const rows = await sectionRows("students", { ...ctx, batchId: b.id });
      const st = await prisma.student.findMany({ where: { batchId: b.id }, select: { id: true, rollNumber: true, name: true } });
      const byRoll = new Map(st.map((s) => [s.rollNumber, s]));
      for (const row of rows) {
        const s = byRoll.get(row.ref);
        if (!s) continue;
        const r = rng(`nceac-${s.rollNumber}`);
        const female = isFemale(s.name);
        const [city, district, province, board] = PLACES[Math.floor(r() * PLACES.length)];
        const born = b.startYear - 18 - (r() < 0.25 ? 1 : 0);
        const sscTotal = 1100, hsscTotal = 1100;
        const surname = s.name.split(/\s+/).slice(1).join(" ") || "Khan";
        const add = fill(row.values, {
          father: `${FATHERS[Math.floor(r() * FATHERS.length)].split(" ")[0]} ${surname}`, gender: female ? "Female" : "Male", nationality: "Pakistani", cnic: cnic(r, female),
          dob: dmy(born, 1 + Math.floor(r() * 12), 1 + Math.floor(r() * 28)), phone: phone(r), email: `${s.name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}${Math.floor(r() * 90 + 10)}@gmail.com`,
          domDistrict: district, domProvince: province, address: `${STREETS[Math.floor(r() * STREETS.length)]}, ${city}`, city,
          sscDegree: "Matric (Science)", sscBoard: board, sscTotal: String(sscTotal), sscObtained: String(Math.round(sscTotal * (0.68 + r() * 0.27))),
          hsscDegree: "FSc Pre-Engineering", hsscCode: canon("hsscNomenclature", "1", lists) || "1", hsscBoard: board, hsscTotal: String(hsscTotal), hsscObtained: String(Math.round(hsscTotal * (0.62 + r() * 0.3))),
        });
        if (Object.keys(add).length) { await saveDetail("student", s.id, add, head.id); studentsFilled++; }
      }
    }
    for (const id of Array.from(await programTeacherIds(head.id, program))) teacherIds.add(id);
    const faculty = await sectionRows("faculty", ctx);
    for (const row of faculty.filter((x) => everyone || teacherIds.has(x.ref))) {
      const r = rng(`nceac-staff-${row.ref}`);
      const name = row.values.name || "";
      const female = isFemale(name);
      const [city, , province] = PLACES[Math.floor(r() * 3)];
      const phd = /^dr\b/i.test(name) || /phd/i.test(row.values.degree || "");
      const degree = row.values.degree || (phd ? "PhD Computer Science" : "MS Computer Science");
      const endYear = 2005 + Math.floor(r() * 16);
      const startYear = endYear - (canon("degreeType", degree, lists) === "PhD" ? 4 : 2);
      const join = Math.max(endYear, 2012) + Math.floor(r() * 5);
      const add = fill(row.values, {
        honorific: /^dr\b/i.test(name) ? "Dr" : female ? "Ms" : "Mr", type: "Local", gender: female ? "Female" : "Male", cnic: cnic(r, female),
        dob: dmy(endYear - 26 - Math.floor(r() * 6), 1 + Math.floor(r() * 12), 1 + Math.floor(r() * 28)), mobile: phone(r), address: `${STREETS[Math.floor(r() * STREETS.length)]}, ${city}`, province, city,
        contract: canon("contractType", row.values.contract, lists) || "FullTime", rank: canon("academicRank", row.values.rank, lists) || (phd ? "AssistantProfessor" : "Lecturer"),
        joining: dmy(join, 9, 1), coreComputing: "Yes", degree, degreeType: canon("degreeType", degree, lists) || (phd ? "PhD" : "MS/MPhil"), field: row.values.field || "Computer Science",
        country: "Pakistan", university: row.values.university || UNIS[Math.floor(r() * UNIS.length)],
        degreeStart: dmy(startYear, 9, 1 + Math.floor(r() * 14)), degreeEnd: dmy(endYear, 6, 15 + Math.floor(r() * 14)),
      });
      // Exact degree dates (not the estimate from the year) so the file has nothing left to check.
      const stored = (await adb.staffDetail.findUnique({ where: { userId: row.ref } }).catch(() => null)) as { dataJson: string } | null;
      let own: Record<string, string> = {}; try { own = stored ? JSON.parse(stored.dataJson) : {}; } catch { own = {}; }
      // Degrees from abroad: the awarding country and the foreign university's name.
      const abroad = COUNTRY.find(([re]) => re.test(row.values.university || ""));
      if (abroad && !own.country) { add.country = abroad[1]; if (!own.foreignUniversity) add.foreignUniversity = row.values.university || ""; }
      if (!own.degreeStart && row.values.degreeStart) add.degreeStart = row.values.degreeStart.replace(/^01\/09/, "05/09");
      if (!own.degreeEnd && row.values.degreeEnd) add.degreeEnd = row.values.degreeEnd.replace(/^30\/06/, "27/06");
      if (Object.keys(add).length) { await saveDetail("staff", row.ref, add, head.id); teachersFilled++; }
    }
  }
  if (studentsFilled) done.push(`NCEAC details for ${studentsFilled} students`);
  if (teachersFilled) done.push(`NCEAC details for ${teachersFilled} teachers`);
  // One earlier download in the export log, so the log is not empty in the demo.
  try {
    if (!everyone && !(await adb.nceacExportLog.count({ where: { chairmanId: head.id } }))) {
      const lead = await prisma.user.findFirst({ where: { username: "dream.lead.cs" }, select: { id: true } });
      await adb.nceacExportLog.create({ data: { id: randomUUID(), chairmanId: head.id, kind: "faculty", program: programs[0], rowCount: teacherIds.size, rejectedCount: 0, byId: lead?.id || head.id, createdAt: new Date(Date.now() - 6 * 864e5) } });
      done.push("export log");
    }
  } catch { /* migration_nceac_portal.sql not run yet */ }
  // What the files look like now.
  for (const program of programs) {
    const batches = await prisma.batch.findMany({ where: { degreeProgram: program, coordinator: { managedById: head.id } }, select: { id: true, batchName: true } });
    const ctx = { chairmanId: head.id, program, batchId: batches[0]?.id || null, focalId: head.id, batches };
    const s = summary(await studentExport(ctx, "all", lists)), f = summary(await facultyExport(ctx, "program", lists));
    done.push(`${program}: students ${s.ready}/${s.rows} ready, faculty ${f.ready}/${f.rows} ready`);
  }
  return done;
}
