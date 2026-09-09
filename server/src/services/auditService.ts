import { prisma } from "../config/prisma";
import { AuditAction, Prisma } from "@prisma/client";

export async function recordAudit(params: {
  organizationId?: string | null;
  actorId?: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId ?? null,
        actorId: params.actorId ?? null,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId ?? null,
        metadata: params.metadata,
      },
    });
  } catch (err) {
    // Audit logging must never break the primary request flow.
    console.error("Failed to record audit log", err);
  }
}
