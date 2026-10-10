import { NextResponse } from "next/server";

/** Once the OMC approves a template it is frozen. The SE has to request a change (and the OMC has to agree) before editing again. */
export function templateLockResponse(course: { templateStatus: string }) {
  if (course.templateStatus !== "approved") return null;
  return NextResponse.json({
    error: "This template is approved by the OMC and locked. To change it, press \"Request Change\" at the top of the page and give a reason — the OMC will reopen it if they agree.",
  }, { status: 423 });
}
