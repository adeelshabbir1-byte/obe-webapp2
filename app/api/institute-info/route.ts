import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../../lib/session";
import { getBrandingFor } from "../../../lib/branding";
import { withErrors } from "../../../lib/apiHandler";

// Logos are returned as cacheable image URLs (usable directly as <img src>)
// rather than inline base64, so this response stays a few hundred bytes.
async function GET_handler() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const branding = await getBrandingFor(user);

  return NextResponse.json({
    instituteName: branding.instituteName,
    instituteLogo: branding.instituteLogoUrl,
    ownerLogo: branding.ownerLogoUrl,
    nceacLogo: branding.nceacLogoUrl,
  });
}
export const GET = withErrors(GET_handler);
