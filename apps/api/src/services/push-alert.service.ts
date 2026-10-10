import webPush, { type PushSubscription as WebPushSubscription } from 'web-push';
import type { Role } from '@delivery/shared';
import { prisma } from '../lib/prisma';
import { env, webPushEnabled } from '../config/env';
import { logger } from '../lib/logger';

const ALERT_REPEAT_MS = 30_000;
const ALERT_BATCH_SIZE = 100;
const PUSH_TTL_SECONDS = 60;

if (webPushEnabled) {
  webPush.setVapidDetails(
    env.PUSH_VAPID_SUBJECT,
    env.PUSH_VAPID_PUBLIC_KEY,
    env.PUSH_VAPID_PRIVATE_KEY,
  );
}

export function getPushConfig(): { enabled: boolean; publicKey: string | null } {
  return {
    enabled: webPushEnabled,
    publicKey: webPushEnabled ? env.PUSH_VAPID_PUBLIC_KEY : null,
  };
}

export async function savePushSubscription(
  userId: string,
  subscription: WebPushSubscription,
): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userId,
    },
    update: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userId,
    },
  });
}

export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

export async function schedulePushAlert(params: {
  orderId: string;
  userId: string;
  title: string;
  body: string;
  link: string;
}): Promise<void> {
  if (!webPushEnabled) return;
  const { orderId, userId, title, body, link } = params;
  await prisma.pushAlert.upsert({
    where: { orderId_userId: { orderId, userId } },
    create: { orderId, userId, title, body, link },
    update: { title, body, link, nextAttemptAt: new Date(), active: true },
  });
}

export async function scheduleRolePushAlerts(
  role: Extract<Role, 'KITCHEN'>,
  alert: Omit<Parameters<typeof schedulePushAlert>[0], 'userId'>,
): Promise<void> {
  if (!webPushEnabled) return;
  const users = await prisma.user.findMany({
    where: { role, isActive: true },
    select: { id: true },
  });
  await Promise.all(users.map(({ id }) => schedulePushAlert({ ...alert, userId: id })));
}

export async function activeDriverPushAlerts(userId: string): Promise<string[]> {
  const alerts = await prisma.pushAlert.findMany({
    where: { userId, active: true },
    select: { orderId: true },
  });
  return alerts.map(({ orderId }) => orderId);
}

export async function acknowledgeDriverPushAlert(userId: string, orderId: string): Promise<boolean> {
  const result = await prisma.pushAlert.updateMany({
    where: { userId, orderId, active: true },
    data: { active: false },
  });
  return result.count > 0;
}

export async function stopKitchenPushAlerts(orderId: string): Promise<void> {
  const kitchenUsers = await prisma.user.findMany({
    where: { role: 'KITCHEN' },
    select: { id: true },
  });
  if (kitchenUsers.length === 0) return;
  await prisma.pushAlert.updateMany({
    where: { orderId, userId: { in: kitchenUsers.map(({ id }) => id) }, active: true },
    data: { active: false },
  });
}

async function deliverDueAlerts(): Promise<void> {
  if (!webPushEnabled) return;
  const now = new Date();
  const alerts = await prisma.pushAlert.findMany({
    where: { active: true, nextAttemptAt: { lte: now } },
    include: {
      user: { select: { role: true, isActive: true, pushSubscriptions: true } },
      order: { select: { status: true, driverId: true } },
    },
    orderBy: { nextAttemptAt: 'asc' },
    take: ALERT_BATCH_SIZE,
  });

  for (const alert of alerts) {
    const claimed = await prisma.pushAlert.updateMany({
      where: { id: alert.id, active: true, nextAttemptAt: { lte: now } },
      data: { nextAttemptAt: new Date(Date.now() + ALERT_REPEAT_MS) },
    });
    if (claimed.count === 0) continue;

    if (!alert.user.isActive) {
      await prisma.pushAlert.update({ where: { id: alert.id }, data: { active: false } });
      continue;
    }

    if (
      (alert.user.role === 'KITCHEN' && alert.order.status !== 'RECEIVED') ||
      (alert.user.role === 'DRIVER' &&
        (alert.order.driverId !== alert.userId || ['DELIVERED', 'CANCELLED'].includes(alert.order.status)))
    ) {
      await prisma.pushAlert.update({ where: { id: alert.id }, data: { active: false } });
      continue;
    }

    const payload = JSON.stringify({
      title: alert.title,
      body: alert.body,
      link: alert.link,
      alertId: alert.id,
      orderId: alert.orderId,
      role: alert.user.role,
    });

    await Promise.all(alert.user.pushSubscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          payload,
          { TTL: PUSH_TTL_SECONDS, urgency: 'high' },
        );
      } catch (error) {
        const statusCode =
          typeof error === 'object' && error !== null && 'statusCode' in error
            ? Number(error.statusCode)
            : undefined;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
        } else {
          logger.warn('Web push delivery failed', {
            errorType: error instanceof Error ? error.name : typeof error,
            statusCode,
          });
        }
      }
    }));

  }
}

let workerTimer: ReturnType<typeof setInterval> | null = null;
let workerRunning = false;

export function startPushAlertWorker(): void {
  if (workerTimer || !webPushEnabled) return;
  const run = async () => {
    if (workerRunning) return;
    workerRunning = true;
    try {
      await deliverDueAlerts();
    } catch (error) {
      logger.error('Web push alert worker failed', {
        errorType: error instanceof Error ? error.name : typeof error,
      });
    } finally {
      workerRunning = false;
    }
  };
  void run();
  workerTimer = setInterval(() => void run(), 5_000);
  workerTimer.unref();
}
