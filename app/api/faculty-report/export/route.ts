import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { buildExcelResponse } from "../../../../lib/excelExport";
import { KINDS, completeness, reportPeople, yearsOfService } from "../../../../lib/facultyProfile";

const d = (x: Date | null | undefined) => (x ? new Date(x).toISOString().slice(0, 10) : "");

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const people = await reportPeople(user);
  if (people.length === 0) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ids = people.map((p) => p.id);
  const [profiles, records] = await Promise.all([
    prisma.facultyProfile.findMany({ where: { userId: { in: ids } } }),
    prisma.facultyRecord.findMany({ where: { userId: { in: ids } }, orderBy: [{ startYear: "desc" }] }),
  ]);
  const prof = new Map(profiles.map((p) => [p.userId, p]));
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const sheets = [{
    name: "Faculty",
    columns: [
      { header: "Name", key: "name", width: 26 }, { header: "Department", key: "dept", width: 24 }, { header: "Designation", key: "designation", width: 22 }, { header: "Employment", key: "emp", width: 14 },
      { header: "Date of joining", key: "join", width: 14 }, { header: "Years of service", key: "yrs", width: 12 }, { header: "Highest degree", key: "deg", width: 28 }, { header: "Blood group", key: "blood", width: 10 },
      { header: "Phone", key: "phone", width: 16 }, { header: "Email", key: "email", width: 28 }, { header: "Next of kin", key: "kin", width: 24 }, { header: "Next of kin phone", key: "kinPhone", width: 16 },
      { header: "Research papers", key: "pubs", width: 10 }, { header: "Grants", key: "grants", width: 8 }, { header: "Projects", key: "projects", width: 8 }, { header: "Events", key: "events", width: 8 }, { header: "Profile complete %", key: "comp", width: 12 },
    ],
    rows: people.map((p) => {
      const pr = prof.get(p.id) || null;
      const mine = records.filter((r) => r.userId === p.id);
      const edu = mine.filter((r) => r.kind === "EDUCATION");
      return {
        name: p.name, dept: p.department_?.name || "", designation: pr?.designation || "", emp: pr?.employmentType || "", join: d(pr?.dateOfJoining), yrs: yearsOfService(pr?.dateOfJoining) ?? "",
        deg: edu[0]?.title || "", blood: pr?.bloodGroup || "", phone: pr?.phone || "", email: p.email, kin: pr?.nextOfKinName ? `${pr.nextOfKinName}${pr.nextOfKinRelation ? ` (${pr.nextOfKinRelation})` : ""}` : "", kinPhone: pr?.nextOfKinPhone || "",
        pubs: mine.filter((r) => r.kind === "PUBLICATION").length, grants: mine.filter((r) => r.kind === "GRANT").length, projects: mine.filter((r) => r.kind === "PROJECT").length, events: mine.filter((r) => r.kind === "EVENT").length,
        comp: completeness(pr, edu.length),
      };
    }),
  }, ...KINDS.map((k) => ({
    name: k.tab,
    columns: [{ header: "Faculty", key: "who", width: 26 }, ...k.fields.map((f) => ({ header: f.label, key: f.key, width: f.type === "area" ? 50 : 24 }))],
    rows: records.filter((r) => r.kind === k.kind).map((r) => ({ who: nameOf.get(r.userId) || "", ...Object.fromEntries(k.fields.map((f) => [f.key, (r as Record<string, unknown>)[f.key] ?? ""])) })),
  }))];
  return buildExcelResponse("faculty-details-report.xlsx", sheets);
}
