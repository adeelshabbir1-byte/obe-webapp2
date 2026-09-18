import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

// Without this, Next.js's build-time static optimizer sees a GET
// handler with no dynamic API calls (no cookies/headers — this route
// intentionally has no auth check, since landing page content is
// public) and tries to pre-render it at BUILD time, which means it
// actually queries the live database during the build itself. If the
// build environment's DB credentials are ever invalid or the database
// is briefly unreachable, that fails the entire deployment over a page
// that should just be a normal per-request API call at runtime.
export const dynamic = "force-dynamic";

async function getOrCreate() {
  const existing = await prisma.landingPageContent.findFirst();
  if (existing) return existing;
  return prisma.landingPageContent.create({ data: {} });
}

export async function GET() {
  const content = await getOrCreate();
  return NextResponse.json({ content });
}

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user || user.role !== "SUPER_USER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const existing = await getOrCreate();
  const body = await req.json();

  const updated = await prisma.landingPageContent.update({
    where: { id: existing.id },
    data: {
      headline: body.headline ?? existing.headline,
      subheadline: body.subheadline ?? existing.subheadline,
      aboutText: body.aboutText ?? existing.aboutText,
      missionText: body.missionText ?? existing.missionText,
      contactEmail: body.contactEmail ?? existing.contactEmail,
      contactPhone: body.contactPhone ?? existing.contactPhone,
      pricingNote: body.pricingNote ?? existing.pricingNote,
      featuresJson: body.features ? JSON.stringify(body.features) : existing.featuresJson,
      testimonialsJson: body.testimonials ? JSON.stringify(body.testimonials) : existing.testimonialsJson,
    },
  });

  return NextResponse.json({ content: updated });
}
