import { NextRequest, NextResponse } from "next/server";
import { withErrors } from "../../../../lib/apiHandler";
import { runJobs } from "../../../../lib/jobs";

export const maxDuration = 60;
// Runs queued background jobs that are due (retries, and anything a stopped function left). Protected by CRON_SECRET
// ("Authorization: Bearer <secret>", as Vercel Cron sends it).
async function GET_handler(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await runJobs({ limit: 200 }));
}
export const GET = withErrors(GET_handler);
