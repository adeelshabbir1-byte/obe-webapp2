import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { withErrors } from "../../../../lib/apiHandler";

async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const bundles = await prisma.reportBundle.findMany({ where: { scope: "PLATFORM" } });
  return NextResponse.json({ bundles: bundles.map((b) => ({ ...b, reportIds: JSON.parse(b.reportIds) })) });
}

async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.name || !Array.isArray(body.reportIds) || body.reportIds.length === 0) {
    return NextResponse.json({ error: "name and at least one report are required" }, { status: 400 });
  }

  const bundle = await prisma.reportBundle.create({
    data: { name: body.name, description: body.description || null, scope: "PLATFORM", ownerId: null, reportIds: JSON.stringify(body.reportIds) },
  });

  return NextResponse.json({ bundle: { ...bundle, reportIds: body.reportIds } }, { status: 201 });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
