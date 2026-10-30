import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../../../lib/studentSession";
import { suggestSchedule } from "../../../../../lib/suggestSchedule";
import { withErrors } from "../../../../../lib/apiHandler";

// Preview only — computes a suggested semester-by-semester schedule but
// writes nothing. The student reviews it, then hits /suggest/apply to
// actually commit it to their DegreePlanEntry rows (still editable
// afterward, same as any manually-placed course).
async function GET_handler() {
  const student = await getAuthenticatedStudent();
  if (!student) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const schedule = await suggestSchedule(student.id);
  if (!schedule) return NextResponse.json({ error: "Nothing left to schedule — every course is already passed or in progress." }, { status: 400 });

  return NextResponse.json(schedule);
}
export const GET = withErrors(GET_handler);
