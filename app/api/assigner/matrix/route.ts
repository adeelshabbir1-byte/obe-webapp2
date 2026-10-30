import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { loadMatrix } from "../../../../lib/assignerMatrix";
import { experienceMap } from "../../../../lib/autoAllocate";
import { withErrors } from "../../../../lib/apiHandler";

async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "COURSE_ASSIGNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { coordinatorIds, ...data } = await loadMatrix(user);
  const experience = await experienceMap(user, coordinatorIds, data.instructors.map((i) => i.id)).catch(() => ({}));
  return NextResponse.json({ ...data, experience });
}
export const GET = withErrors(GET_handler);
