import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { prisma } from "../../../lib/db";
import { computeReadiness } from "../../../lib/readiness";
import { OVERVIEW_ROLES, leadsInScope } from "../../../lib/readinessScope";

// Save today's readiness scores so progress can be compared later. body: { leadId, label }
export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !OVERVIEW_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const { chairmanId, leads } = await leadsInScope(user);
  const lead = leads.find((l) => l.id === b.leadId);
  if (!lead) return NextResponse.json({ error: "That program is not in your area" }, { status: 403 });
  const label = String(b.label || "").trim().slice(0, 80) || `Snapshot ${new Date().toLocaleDateString("en-GB")}`;
  const data = await computeReadiness({ id: lead.id, managedById: chairmanId, departmentId: lead.departmentId }, "");
  const areas = data.scored.map((x: { a: { no: number; title: string }; s: number | null }) => ({ no: x.a.no, title: x.a.title, score: x.s }));
  await prisma.readinessSnapshot.create({ data: { chairmanId, leadId: lead.id, label, overall: data.overall, areas: JSON.stringify(areas), takenById: user.id } as never });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !OVERVIEW_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { leads } = await leadsInScope(user);
  const r = await prisma.readinessSnapshot.deleteMany({ where: { id: req.nextUrl.searchParams.get("id") || "", leadId: { in: leads.map((l) => l.id).concat(["none"]) } } as never });
  return r.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not found" }, { status: 404 });
}
