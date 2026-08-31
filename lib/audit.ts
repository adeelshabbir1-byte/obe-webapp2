import { prisma } from "./db";

type SafeMetadata = Record<string, string | number | boolean | null | undefined>;
type ForbiddenKeys = "password" | "passwordHash" | "hash" | "token" | "rawToken" | "secret";
type Guarded<T extends SafeMetadata> = { [K in keyof T]: K extends ForbiddenKeys ? never : T[K] };

export async function writeAuditLog<T extends SafeMetadata>(entry: {
  actorUserId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Guarded<T>;
}) {
  await prisma.auditLog.create({
    data: {
      actorUserId: entry.actorUserId ?? undefined,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata as any,
    },
  });
}
