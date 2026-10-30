import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";
import { withErrors } from "../../../../lib/apiHandler";

async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUBJECT_EXPERT") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const courses = await prisma.course.findMany({
    where: { subjectExpertId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ courses });
}
export const GET = withErrors(GET_handler);
