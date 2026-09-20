import type { Request } from 'express';
import type { Role } from '@delivery/shared';
import { prisma } from '../lib/prisma';
import { clientIp } from '../lib/http';
import { logger } from '../lib/logger';

export interface ActivityInput {
  action: string;
  entity: string;
  entityId?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  userId?: string | null;
  actorEmail?: string | null;
  actorRole?: Role | null;
  request?: Request | null;
}

/**
 * Writes an audit trail entry. Failures never break the business operation that
 * triggered them, they are logged instead.
 */
export async function logActivity(input: ActivityInput): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        description: input.description ?? null,
        metadata: (input.metadata ?? undefined) as never,
        userId: input.userId ?? null,
        actorEmail: input.actorEmail ?? null,
        actorRole: input.actorRole ?? null,
        ip: input.request ? clientIp(input.request) : null,
        userAgent: input.request?.headers['user-agent'] ?? null,
      },
    });
  } catch (error) {
    logger.warn('Could not write activity log entry', {
      action: input.action,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}