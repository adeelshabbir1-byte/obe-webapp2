import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { reviewBatchWhere } from "../../../lib/reviewScope";
import { loadResults, pivot, DIMS, METRICS, type BRow } from "../../../lib/benchmark";
import { toCsv } from "../../../lib/outcomesReport";
import { withErrors } from "../../../lib/apiHandler";

// CSV download of a report-builder table.
async function GET_handler(req: Request) {
  const user = await getAuthenticatedUser();
  if (!user || !user.mfaVerified) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const where = await reviewBatchWhere(user);
  if (!where) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const by = [q.get("by1"), q.get("by2")].filter((d): d is string => !!d && DIMS.some((x) => x[0] === d)) as (keyof BRow)[];
  const ms = q.getAll("m").filter((m) => METRICS.some((x) => x[0] === m));
  const rows = (await loadResults(where)).filter((r) => (!q.get("fprogram") || r.program === q.get("fprogram")) && (!q.get("fyear") || String(r.year) === q.get("fyear")));
  const res = pivot(rows, by.length ? by : ["program"], ms.length ? ms : ["count"]);
  const head = [...(by.length ? by : ["program"]).map((d) => DIMS.find((x) => x[0] === d)![1]), ...(ms.length ? ms : ["count"]).map((m) => METRICS.find((x) => x[0] === m)![1])];
  return new NextResponse(toCsv([head, ...res.map((r) => [...r.keys, ...r.values])]), { headers: { "Content-Type": "text/csv", "Content-Disposition": 'attachment; filename="obehub-report.csv"' } });
}
export const GET = withErrors(GET_handler);
