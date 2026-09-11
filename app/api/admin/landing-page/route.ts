import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../../lib/session";
import { prisma } from "../../../../lib/db";

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
