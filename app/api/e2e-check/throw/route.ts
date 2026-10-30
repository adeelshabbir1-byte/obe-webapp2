import { NextResponse } from "next/server";
import { withErrors } from "../../../../lib/apiHandler";

export const dynamic = "force-dynamic";

// Test-only (E2E_TEST_ROUTES=1): an API route that fails, and one that fails the way a missing migration does.
async function GET_handler(req: Request) {
  if (process.env.E2E_TEST_ROUTES !== "1") return NextResponse.json({ error: "not found" }, { status: 404 });
  if (new URL(req.url).searchParams.get("kind") === "migration") throw Object.assign(new Error('The table `public.SomethingNew` does not exist in the current database.'), { code: "P2021" });
  throw new Error("E2E check: this API fails on purpose");
}
export const GET = withErrors(GET_handler);
