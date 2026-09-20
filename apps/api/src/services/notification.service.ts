import type { NotificationAudience, NotificationDTO, Role } from '@delivery/shared';
import { prisma } from '../lib/prisma';
import { emitToUser } from '../realtime/socket';

export type NotificationType =
  | 'ORDER_UPDATE'
  | 'PROMOTION'
  | 'BUSINESS_ALERT'
  | 'LOW_STOCK'
  | 'SYSTEM';

export interface NotifyInput {
  title: string;
  body: string;
  type: NotificationType;
  audience: NotificationAudience;
  orderId?: string | null;
  link?: string | null;
  createdById?: string | null;
}

type NotificationRow = {
  id: string;
  title: string;
  body: string;
  type: string;
  audience: string;
  orderId: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: Date;
};

export function serializeNotification(row: NotificationRow): NotificationDTO {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    type: row.type as NotificationDTO['type'],
    audience: row.audience as NotificationDTO['audience'],
    orderId: row.orderId,
    link: row.link,
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function notifyUser(userId: string, input: NotifyInput): Promise<NotificationDTO> {
  const row = await prisma.notification.create({
    data: {
      userId,
      audience: input.audience,
      type: input.type,
      title: input.title,
      body: input.body,
      orderId: input.orderId ?? null,
      link: input.link ?? null,
      createdById: input.createdById ?? null,
    },
  });
  const dto = serializeNotification(row);
  emitToUser(userId, 'notification:new', { notification: dto });
  return dto;
}

/** Fans a message out to every active user that holds the given role. */
export async function notifyRole(role: Role, input: NotifyInput): Promise<number> {
  const recipients = await prisma.user.findMany({
    where: { role, isActive: true },
    select: { id: true },
  });
  if (recipients.length === 0) return 0;

  const created = await prisma.notification.createManyAndReturn({
    data: recipients.map((recipient) => ({
      userId: recipient.id,
      audience: role as NotificationAudience,
      type: input.type,
      title: input.title,
      body: input.body,
      orderId: input.orderId ?? null,
      link: input.link ?? null,
      createdById: input.createdById ?? null,
    })),
  });

  for (const row of created) {
    emitToUser(row.userId, 'notification:new', { notification: serializeNotification(row) });
  }
  return created.length;
}

export async function notifyAdmins(input: NotifyInput): Promise<number> {
  return notifyRole('ADMIN', { ...input, audience: 'ADMIN' });
}

export async function notifyKitchen(input: NotifyInput): Promise<number> {
  return notifyRole('KITCHEN', { ...input, audience: 'KITCHEN' });
}

export async function notifyDrivers(input: NotifyInput): Promise<number> {
  return notifyRole('DRIVER', { ...input, audience: 'DRIVER' });
}

export async function notifyCustomer(input: NotifyInput & { userId: string }): Promise<void> {
  await notifyUser(input.userId, { ...input, audience: 'CUSTOMER' });
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<boolean> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true, readAt: new Date() },
  });
  return result.count > 0;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return result.count;
}