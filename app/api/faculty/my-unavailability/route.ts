import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { withErrors } from "../../../../lib/apiHandler";

const ALLOWED_ROLES = ["SUBJECT_EXPERT", "INSTRUCTOR"];

async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const records = await prisma.facultyUnavailability.findMany({ where: { facultyId: user.id }, orderBy: [{ dayOfWeek: "asc" }, { startHour: "asc" }] });
  return NextResponse.json({ records });
}

async function POST_handler(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || !ALLOWED_ROLES.includes(user.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.dayOfWeek || body.startHour === undefined || body.endHour === undefined) {
    return NextResponse.json({ error: "dayOfWeek, startHour, and endHour are required" }, { status: 400 });
  }
  const record = await prisma.facultyUnavailability.create({
    data: { facultyId: user.id, dayOfWeek: body.dayOfWeek, startHour: parseFloat(body.startHour), endHour: parseFloat(body.endHour), setById: user.id, note: body.note || null },
  });
  return NextResponse.json({ record }, { status: 201 });
}
export const GET = withErrors(GET_handler);
export const POST = withErrors(POST_handler);
