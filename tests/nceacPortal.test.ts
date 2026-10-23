import { test } from "node:test";
import assert from "node:assert/strict";
import { canon, listsWith, parseDate, cnicOf, phoneOf } from "../lib/nceacLists";
import { STUDENT_TEMPLATE, FACULTY_TEMPLATE, buildRow, cellOf } from "../lib/nceacPortal";
import { INVENTORY } from "../lib/nceacInventory";

const L = listsWith();

test("the files have the portal templates' headers, in the same order", () => {
  assert.deepEqual(STUDENT_TEMPLATE.cols.map((c) => c.header), ["Student Name", "FatherName", "Gender", "RollNo", "Admission Date", "Nationality", "CNIC Number", "Passport Number", "Date of Birth", "PhoneNumber", "Email", "Domicile District", "Domicile Province", "Mailing Address", "City (Mailing Address)", "SSC Degree Name", "SSC Board Name", "SSC Total Marks", "SSC Obtained Marks", "HSSC Degree Name", "HSSC Degree Nomenclature", "HSSC Board Name", "HSSC Total Marks", "HSSC Obtained Marks"]);
  assert.deepEqual(FACULTY_TEMPLATE.cols.map((c) => c.header), ["Email Address", "Name", "Gender", "CNIC", "Date of Birth", "Phone Number", "Email", "Address", "Province", "City", "Contract Type", "Academic Rank", "Joining Date", "Leaving Date", "Degree Name", "Degree Type", "Field of Study", "Degree Awarded Country", "Degree Awarded Institute", "Degree Start Date", "Degree End Date"]);
  // The "Compulsory" row of the students template.
  assert.deepEqual(STUDENT_TEMPLATE.cols.filter((c) => c.required).map((c) => c.header), ["Student Name", "FatherName", "Gender", "RollNo", "Admission Date", "Nationality", "CNIC Number", "Date of Birth", "Mailing Address", "City (Mailing Address)", "HSSC Degree Name", "HSSC Degree Nomenclature", "HSSC Total Marks", "HSSC Obtained Marks"]);
  assert.equal(STUDENT_TEMPLATE.sheet, "Sheet1");
  assert.equal(FACULTY_TEMPLATE.sheet, "Sheet1");
});

test("OBEHUB's wording becomes the portal's spelling", () => {
  assert.equal(canon("academicRank", "Assistant Professor", L), "AssistantProfessor");
  assert.equal(canon("academicRank", "Associate Prof.", L), "AssociateProfessor");
  assert.equal(canon("academicRank", "Senior Lecturer", L), "Lecturer");
  assert.equal(canon("academicRank", "Lab Engineer", L), "LabInstructor");
  assert.equal(canon("academicRank", "Professor", L), "Professor");
  assert.equal(canon("academicRank", "Peon", L), null);
  assert.equal(canon("contractType", "Permanent", L), "FullTime");
  assert.equal(canon("contractType", "Visiting", L), "Visiting");
  assert.equal(canon("contractType", "Part-time", L), "Visiting");
  assert.equal(canon("province", "KPK", L), "Khyber Pakhtunkhwa");
  assert.equal(canon("province", "ICT", L), "Islamabad");
  assert.equal(canon("degreeType", "PhD Computer Science", L), "PhD");
  assert.equal(canon("degreeType", "MS Software Engineering", L), "MS/MPhil");
  assert.equal(canon("degreeType", "BS Computer Science", L), "BS");
  assert.equal(canon("degreeType", "MSc Physics", L), "Masters");
  assert.equal(canon("studentGender", "Female", L), "F");
  assert.equal(canon("facultyGender", "m", L), "Male");
  assert.equal(canon("hsscNomenclature", "Non-Medical", L), "1");
  assert.equal(canon("hsscNomenclature", "Pre-Medical", L), "3");
  assert.equal(canon("hsscNomenclature", "A Level", L), "2");
  // An institute's corrected list is used instead.
  assert.equal(canon("honorific", "Engr.", listsWith({ honorific: ["Mr", "Ms"] })), null);
});

test("formats: dates, CNIC and phone numbers", () => {
  assert.equal(parseDate("05/09/2024")?.toISOString().slice(0, 10), "2024-09-05");
  assert.equal(parseDate("2024-09-05")?.toISOString().slice(0, 10), "2024-09-05");
  assert.equal(parseDate("5-Sep-2024")?.toISOString().slice(0, 10), "2024-09-05");
  assert.equal(parseDate("31/02/2024"), null);
  assert.equal(cnicOf("3520212345671"), "35202-1234567-1");
  assert.equal(cnicOf("35202-1234567"), null);
  assert.equal(phoneOf("0300-1234567"), "03001234567");
  assert.equal(phoneOf("+92 300 1234567"), "03001234567");
  assert.equal(phoneOf("12"), null);
  const d = cellOf(STUDENT_TEMPLATE.cols[4], "01/09/2024", L);
  assert.ok(d.value instanceof Date);
  assert.equal(cellOf(STUDENT_TEMPLATE.cols[3], "152368", L).value, 152368);
  assert.equal(cellOf(STUDENT_TEMPLATE.cols[3], "DRM-CS-24-005", L).value, "DRM-CS-24-005");
});

test("a student row: what the portal would reject", () => {
  const ok = { name: "Zaid", father: "Bakar", gender: "Male", roll: "152368", admission: "01/09/2024", nationality: "Pakistani", cnic: "42323-2678191-1", dob: "11/01/2006", address: "House 1", city: "Multan", hsscDegree: "FSc", hsscCode: "1", hsscTotal: "1100", hsscObtained: "896" };
  const r = buildRow(STUDENT_TEMPLATE, ok, L, "152368", "s1");
  assert.deepEqual(r.issues, []);
  assert.equal(r.cells[2], "M");
  assert.equal(r.cells.length, 24);
  const bad = buildRow(STUDENT_TEMPLATE, { ...ok, cnic: "123", hsscObtained: "1200", gender: "x", father: "" }, L, "152368", "s1");
  const cols = bad.issues.filter((i) => i.severity === "reject").map((i) => i.col).sort();
  assert.deepEqual(cols, ["CNIC Number", "FatherName", "Gender", "HSSC Obtained Marks"]);
  // A foreign student with a passport needs no CNIC.
  const foreign = buildRow(STUDENT_TEMPLATE, { ...ok, nationality: "Afghan", cnic: "", passport: "P1234567" }, L, "1", "s2");
  assert.deepEqual(foreign.issues, []);
});

test("a faculty row: portal values, dates in order, passport for foreign faculty", () => {
  const ok = { accountEmail: "a@x.edu.pk", name: "Dr. A", gender: "Female", cnic: "3520212345672", dob: "01/01/1985", mobile: "03001234567", email: "a@x.edu.pk", address: "House 2", province: "Punjab", city: "Lahore", contract: "FullTime", rank: "AssistantProfessor", joining: "01/09/2015", degree: "PhD CS", degreeType: "PhD", field: "AI", country: "Pakistan", university: "NUST", degreeStart: "01/09/2010", degreeEnd: "30/06/2014" };
  const r = buildRow(FACULTY_TEMPLATE, ok, L, "u1", "u1");
  assert.deepEqual(r.issues, []);
  assert.equal(r.cells[3], "35202-1234567-2");
  const bad = buildRow(FACULTY_TEMPLATE, { ...ok, rank: "Registrar", degreeEnd: "01/01/2009" }, L, "u1", "u1");
  assert.deepEqual(bad.issues.map((i) => i.col), ["Academic Rank", "Degree End Date"]);
  const foreign = buildRow(FACULTY_TEMPLATE, { ...ok, type: "Foreign", cnic: "AB123456" }, L, "u2", "u2");
  assert.equal(foreign.cells[3], "AB123456");
  assert.deepEqual(foreign.issues, []);
});

test("the field inventory puts every field in one group with a source", () => {
  assert.ok(INVENTORY.length > 100);
  assert.ok(INVENTORY.every((f) => ["AUTO", "DERIVED", "INPUT"].includes(f.group) && f.source.length > 3));
  for (const h of STUDENT_TEMPLATE.cols.map((c) => c.header)) assert.ok(INVENTORY.some((f) => f.form.startsWith("Students upload") && f.field === h), h);
  for (const h of FACULTY_TEMPLATE.cols.map((c) => c.header)) assert.ok(INVENTORY.some((f) => f.form.startsWith("Faculty upload") && f.field === h), h);
});
