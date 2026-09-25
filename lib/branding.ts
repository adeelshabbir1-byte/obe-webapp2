import crypto from "crypto";
import { unstable_cache, revalidateTag } from "next/cache";
import { prisma } from "./db";

// Logos are stored in the database as base64 data URIs. Shipping those
// strings inside every page (or every /api/institute-info response) made each
// navigation download the same images again, uncached. Instead we hand the UI
// short, content-versioned URLs (/api/branding/<kind>?v=<hash>) that the
// browser caches forever; the version only changes when the logo does.

export type LogoKind = "institute" | "owner" | "nceac";

export type Branding = {
  instituteName: string | null;
  instituteLogoUrl: string | null;
  ownerLogoUrl: string | null;
  nceacLogoUrl: string | null;
};

const TAG_PLATFORM = "branding:platform";
const tagInstitute = (chairmanId: string) => `branding:institute:${chairmanId}`;
const tagChairmanOf = (userId: string) => `branding:chairman-of:${userId}`;

export function logoVersion(data: string) {
  return crypto.createHash("sha1").update(data).digest("hex").slice(0, 12);
}

const platformLogoVersions = unstable_cache(
  async () => {
    const p = await prisma.platformSettings.findUnique({ where: { id: "singleton" }, select: { ownerLogo: true, nceacLogo: true } });
    return {
      owner: p?.ownerLogo ? logoVersion(p.ownerLogo) : null,
      nceac: p?.nceacLogo ? logoVersion(p.nceacLogo) : null,
    };
  },
  ["branding-platform-v1"],
  { tags: [TAG_PLATFORM], revalidate: 3600 },
);

function instituteBranding(chairmanId: string) {
  return unstable_cache(
    async () => {
      const c = await prisma.user.findUnique({ where: { id: chairmanId }, select: { instituteName: true, instituteLogo: true } });
      return { instituteName: c?.instituteName ?? null, logo: c?.instituteLogo ? logoVersion(c.instituteLogo) : null };
    },
    ["branding-institute-v1", chairmanId],
    { tags: [tagInstitute(chairmanId)], revalidate: 3600 },
  )();
}

type ScopeUser = { id: string; role: string; managedById: string | null };

/** Same rules as lib/reportScope.chairmanIdFor, but cached — used for display only, never for access control. */
export function cachedChairmanIdFor(user: ScopeUser): Promise<string> {
  if (user.role === "CHAIRMAN") return Promise.resolve(user.id);
  if (user.role === "OMC" || user.role === "PROGRAM_COORDINATOR" || user.role === "COURSE_ASSIGNER") return Promise.resolve(user.managedById || "");
  if (!user.managedById) return Promise.resolve("");
  const managerId = user.managedById;
  return unstable_cache(
    async () => {
      const coordinator = await prisma.user.findUnique({ where: { id: managerId }, select: { managedById: true } });
      return coordinator?.managedById || "";
    },
    ["branding-chairman-of-v1", managerId],
    { tags: [tagChairmanOf(managerId)], revalidate: 3600 },
  )();
}

export async function getBrandingFor(user: ScopeUser | null): Promise<Branding> {
  const chairmanId = !user || user.role === "SUPER_USER" ? "" : await cachedChairmanIdFor(user);
  const [platform, inst] = await Promise.all([
    platformLogoVersions(),
    chairmanId ? instituteBranding(chairmanId) : Promise.resolve(null),
  ]);
  return {
    instituteName: inst?.instituteName ?? null,
    instituteLogoUrl: inst?.logo ? `/api/branding/institute?v=${inst.logo}` : null,
    ownerLogoUrl: platform.owner ? `/api/branding/owner?v=${platform.owner}` : null,
    nceacLogoUrl: platform.nceac ? `/api/branding/nceac?v=${platform.nceac}` : null,
  };
}

export function invalidatePlatformBranding() {
  revalidateTag(TAG_PLATFORM);
}

export function invalidateInstituteBranding(chairmanId: string) {
  revalidateTag(tagInstitute(chairmanId));
}

/** Decodes a stored logo (data URI or plain URL) for the image route. */
export function decodeLogo(stored: string): { kind: "bytes"; contentType: string; body: Buffer } | { kind: "url"; url: string } | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(stored);
  if (m) {
    const contentType = m[1] || "application/octet-stream";
    if (!/^image\//.test(contentType)) return null;
    const body = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]), "utf8");
    return { kind: "bytes", contentType, body };
  }
  if (/^https?:\/\//i.test(stored)) return { kind: "url", url: stored };
  return null;
}
