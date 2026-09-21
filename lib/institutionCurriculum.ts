import { prisma } from "./db";

// Walks managedBy up from any user until it finds their owning
// Chairman. Used everywhere a page/endpoint needs to scope data to
// "this user's own institution" rather than every institution's data
// at once — which became a real bug once every institution got its
// own full curriculum clone with identical course titles.
export async function findOwningChairmanId(userId: string): Promise<string | null> {
  let current = await prisma.user.findUnique({ where: { id: userId } });
  for (let i = 0; i < 5 && current; i++) {
    if (current.role === "CHAIRMAN") return current.id;
    if (!current.managedById) break;
    current = await prisma.user.findUnique({ where: { id: current.managedById } });
  }
  return null;
}

// The one curriculum this user's institution should see: their own
// Chairman's clone if it exists, otherwise the one shared official
// curriculum (chairmanId null) as a fallback for institutions that
// haven't cloned their own copy yet.
export async function findOwnInstitutionCurriculum(userId: string) {
  const chairmanId = await findOwningChairmanId(userId);
  if (chairmanId) {
    const own = await prisma.masterCurriculum.findFirst({ where: { chairmanId, status: "PUBLISHED" } });
    if (own) return own;
  }
  return prisma.masterCurriculum.findFirst({ where: { chairmanId: null, status: "PUBLISHED" } });
}
