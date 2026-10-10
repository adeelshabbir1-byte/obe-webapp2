import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db";
import { getAuthenticatedUser } from "../../../../lib/session";
import { cachedChairmanIdFor, decodeLogo, logoVersion, type LogoKind } from "../../../../lib/branding";

const KINDS: LogoKind[] = ["institute", "owner", "nceac"];

// Serves a stored logo as a real image with long-lived caching. URLs carry a
// content hash (?v=…), so a changed logo gets a new URL and the old cache
// entry is simply never requested again.
export async function GET(req: NextRequest, { params }: { params: { kind: string } }) {
  const kind = params.kind as LogoKind;
  if (!KINDS.includes(kind)) return new NextResponse("Not found", { status: 404 });

  let stored: string | null = null;
  let isPrivate = false;

  if (kind === "institute") {
    // Institute logos are per tenant — only signed-in staff of that institution.
    const user = await getAuthenticatedUser();
    if (!user) return new NextResponse("Unauthorized", { status: 401 });
    const chairmanId = user.role === "SUPER_USER" ? "" : await cachedChairmanIdFor(user);
    if (!chairmanId) return new NextResponse("Not found", { status: 404 });
    const chairman = await prisma.user.findUnique({ where: { id: chairmanId }, select: { instituteLogo: true } });
    stored = chairman?.instituteLogo || null;
    isPrivate = true;
  } else {
    // Platform-wide marks (NCEAC, platform owner) are shown on every page and are not tenant data.
    const settings = await prisma.platformSettings.findUnique({
      where: { id: "singleton" },
      select: kind === "owner" ? { ownerLogo: true } : { nceacLogo: true },
    });
    stored = (kind === "owner" ? (settings as { ownerLogo?: string | null } | null)?.ownerLogo : (settings as { nceacLogo?: string | null } | null)?.nceacLogo) || null;
  }

  if (!stored) return new NextResponse("Not found", { status: 404 });

  const version = logoVersion(stored);
  const etag = `"${version}"`;
  const requested = req.nextUrl.searchParams.get("v");
  const cacheControl = requested === version
    ? `${isPrivate ? "private" : "public"}, max-age=31536000, immutable`
    : `${isPrivate ? "private" : "public"}, max-age=0, must-revalidate`;

  if (req.headers.get("if-none-match") === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag, "Cache-Control": cacheControl } });
  }

  const decoded = decodeLogo(stored);
  if (!decoded) return new NextResponse("Not found", { status: 404 });
  if (decoded.kind === "url") return NextResponse.redirect(decoded.url, { status: 302 });

  return new NextResponse(decoded.body, {
    status: 200,
    headers: {
      "Content-Type": decoded.contentType,
      "Content-Length": String(decoded.body.length),
      "Cache-Control": cacheControl,
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
      // An uploaded SVG must never be able to run script on our origin.
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
    },
  });
}
