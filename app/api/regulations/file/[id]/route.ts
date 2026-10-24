import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../../lib/session";
import { rdb, canSee, signedUrl, type RegDoc, type RegFile } from "../../../../../lib/regulations";

// A document's file, for signed-in users who may see the document: a five-minute signed link to the private bucket.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const f = (await rdb.regFile.findUnique({ where: { id: params.id } }).catch(() => null)) as RegFile | null;
  const d = f ? ((await rdb.regDocument.findUnique({ where: { id: f.docId } })) as RegDoc | null) : null;
  if (!f || !d || !(await canSee(user, d))) return NextResponse.json({ error: "not found" }, { status: 404 });
  try { return NextResponse.redirect(await signedUrl(f.path, req.nextUrl.searchParams.get("download") ? f.name : undefined)); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 404 }); }
}
