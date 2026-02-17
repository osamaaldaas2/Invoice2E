/**
 * Outbox Publisher — Maps domain events to BullMQ queue destinations.
 *
 * Handles serialization, routing, and delivery of outbox events to the
 * appropriate BullMQ queues. Each event type maps to a specific queue
 * and job name.
 *
 * @module lib/outbox/publisher
 */

import { QUEUE_NAMES } from '@/lib/queue/types';
import { getQueue } from '@/lib/queue/queues';
import { logger } from '@/lib/logger';
import type { OutboxEvent } from './types';
import { OUTBOX_EVENT_TYPES, type OutboxEventType } from './types';

/**
 * Routing configuration for an event type → BullMQ queue.
 */
interface EventRoute {
  /** BullMQ queue name. */
  queueName: string;
  /** Job name within the queue. */
  jobName: string;
}

/**
 * Maps each outbox event type to its BullMQ destination.
 * New event types must be registered here.
 */
const EVENT_ROUTES: Record<OutboxEventType, EventRoute> = {
  [OUTBOX_EVENT_TYPES.INVOICE_EXTRACTED]: {
    queueName: QUEUE_NAMES.EXTRACTION,
    jobName: 'invoice.extracted',
  },
  [OUTBOX_EVENT_TYPES.INVOICE_CONVERTED]: {
    queueName: QUEUE_NAMES.CONVERSION,
    jobName: 'invoice.converted',
  },
  [OUTBOX_EVENT_TYPES.CREDITS_DEDUCTED]: {
    queueName: QUEUE_NAMES.EXTRACTION,
    jobName: 'credits.deducted',
  },
  [OUTBOX_EVENT_TYPES.BATCH_COMPLETED]: {
    queueName: QUEUE_NAMES.BATCH,
    jobName: 'batch.completed',
  },
  [OUTBOX_EVENT_TYPES.USER_CREATED]: {
    queueName: QUEUE_NAMES.EMAIL,
    jobName: 'user.created',
  },
};

/**
 * Publishes an outbox event to the appropriate BullMQ queue.
 *
 * Uses the event's `id` as the BullMQ job ID to guarantee idempotent
 * delivery — if the same event is published twice, BullMQ will deduplicate.
 *
 * @param event - The outbox event to publish.
 * @throws {Error} If the event type has no configured route or queue delivery fails.
 */
export async function publishToQueue(event: OutboxEvent): Promise<void> {
  const route = EVENT_ROUTES[event.eventType];

  if (!route) {
    throw new Error(`No queue route configured for event type: ${event.eventType}`);
  }

  const queue = getQueue(route.queueName as Parameters<typeof getQueue>[0]);

  await queue.add(route.jobName, {
    outboxEventId: event.id,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    eventType: event.eventType,
    payload: event.payload,
    createdAt: event.createdAt,
  }, {
    jobId: `outbox:${event.id}`,
    attempts: 3,
    backoff: { type: 'exponential', delay: 2_000 },
  });

  logger.info('Outbox event published to queue', {
    eventId: event.id,
    eventType: event.eventType,
    queueName: route.queueName,
    jobName: route.jobName,
  });
}
