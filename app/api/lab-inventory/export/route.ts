import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { buildExcelResponse } from "../../../../lib/excelExport";
import { labScope } from "../../../../lib/resources";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });
  const scope = await labScope(user);
  if (!scope) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const labs = await prisma.labInfo.findMany({ where: { chairmanId: scope.chairmanId, ...(scope.departmentIds ? { departmentId: { in: scope.departmentIds.length ? scope.departmentIds : ["none"] } } : {}) }, orderBy: { name: "asc" } });
  const depts = await prisma.department.findMany({ where: { chairmanId: scope.chairmanId }, select: { id: true, name: true } });
  const specs = await prisma.labComputerSpec.findMany({ where: { labId: { in: labs.length ? labs.map((l) => l.id) : ["none"] } }, orderBy: { purchaseYear: "desc" } });
  const nameOf = new Map(labs.map((l) => [l.id, l.name]));
  const dept = (id: string | null) => depts.find((d) => d.id === id)?.name || "Common";
  return buildExcelResponse("lab-inventory.xlsx", [
    { name: "Labs", columns: [
      { header: "Lab", key: "name", width: 26 }, { header: "Department", key: "dept", width: 22 }, { header: "Location", key: "loc", width: 22 }, { header: "Seats", key: "seats", width: 8 },
      { header: "Computers", key: "comp", width: 10 }, { header: "Working", key: "work", width: 8 }, { header: "Internet (Mbps)", key: "net", width: 14 }, { header: "Last stock check", key: "audit", width: 14 },
      { header: "Software", key: "sw", width: 40 }, { header: "Other equipment", key: "eq", width: 40 } ],
      rows: labs.map((l) => ({ name: l.name, dept: dept(l.departmentId), loc: l.location || "", seats: l.seats, comp: l.computers, work: l.computersWorking, net: l.internetMbps ?? "", audit: l.lastAudit ? l.lastAudit.toISOString().slice(0, 10) : "", sw: l.software || "", eq: l.equipment || "" })) },
    { name: "PC specifications", columns: [
      { header: "Lab", key: "lab", width: 26 }, { header: "Quantity", key: "qty", width: 9 }, { header: "Make / model", key: "mm", width: 24 }, { header: "Processor", key: "cpu", width: 26 }, { header: "RAM (GB)", key: "ram", width: 9 },
      { header: "Storage", key: "st", width: 18 }, { header: "Graphics", key: "gpu", width: 20 }, { header: "Operating system", key: "os", width: 20 }, { header: "Bought in", key: "yr", width: 10 }, { header: "Notes", key: "notes", width: 30 } ],
      rows: specs.map((s) => ({ lab: nameOf.get(s.labId) || "", qty: s.quantity, mm: s.makeModel || "", cpu: s.processor || "", ram: s.ramGb ?? "", st: s.storage || "", gpu: s.gpu || "", os: s.os || "", yr: s.purchaseYear ?? "", notes: s.notes || "" })) },
  ]);
}
