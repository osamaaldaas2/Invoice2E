/**
 * Outbox Service — Transactional outbox for reliable event publishing.
 *
 * Implements the outbox pattern: domain events are inserted into the
 * `outbox_events` table within the same database transaction as the
 * business operation. A polling-based relay then publishes pending
 * events to BullMQ queues.
 *
 * @module lib/outbox/outbox
 */

import { createAdminClient } from '@/lib/supabase.server';
import { logger } from '@/lib/logger';
import { AppError } from '@/lib/errors';
import { publishToQueue } from './publisher';
import type {
  OutboxEvent,
  OutboxEventRow,
  AppendOutboxEventInput,
} from './types';

const TABLE = 'outbox_events';

/**
 * Convert a snake_case database row to a camelCase OutboxEvent.
 */
function rowToEvent(row: OutboxEventRow): OutboxEvent {
  return {
    id: row.id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    eventType: row.event_type as OutboxEvent['eventType'],
    payload: row.payload,
    status: row.status as OutboxEvent['status'],
    createdAt: row.created_at,
    publishedAt: row.published_at,
    retryCount: row.retry_count,
    lastError: row.last_error,
  };
}

/**
 * Transactional Outbox Service.
 *
 * Provides methods to:
 * - Append events within a database transaction
 * - Poll and publish pending events to BullMQ
 * - Retry failed events
 * - Clean up old published events
 */
export class OutboxService {
  /**
   * Append a domain event to the outbox table.
   *
   * This should be called within the same Supabase client/transaction context
   * as the business operation to guarantee atomicity. The event is persisted
   * with status `pending` and will be picked up by the relay.
   *
   * @param supabaseClient - A Supabase client (ideally from the same transaction context).
   * @param input - The event data to persist.
   * @returns The persisted outbox event.
   */
  async appendEvent(
    supabaseClient: ReturnType<typeof createAdminClient>,
    input: AppendOutboxEventInput,
  ): Promise<OutboxEvent> {
    const { data, error } = await supabaseClient
      .from(TABLE)
      .insert({
        aggregate_type: input.aggregateType,
        aggregate_id: input.aggregateId,
        event_type: input.eventType,
        payload: input.payload,
        status: 'pending',
        retry_count: 0,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to append outbox event', {
        error: error.message,
        eventType: input.eventType,
        aggregateId: input.aggregateId,
      });
      throw new AppError('OUTBOX_APPEND_FAILED', `Failed to append outbox event: ${error.message}`, 500);
    }

    const event = rowToEvent(data as OutboxEventRow);
    logger.info('Outbox event appended', {
      eventId: event.id,
      eventType: event.eventType,
      aggregateId: event.aggregateId,
    });
    return event;
  }

  /**
   * Poll for pending outbox events and publish them to BullMQ queues.
   *
   * Fetches a batch of unpublished events ordered by creation time,
   * publishes each to its destination queue, and marks them as `published`.
   * Events that fail to publish are marked with an incremented retry count
   * and the error message.
   *
   * @param batchSize - Maximum number of events to process per poll cycle. Defaults to 100.
   * @returns The number of events successfully published.
   */
  async pollAndPublish(batchSize: number = 100): Promise<number> {
    const supabase = createAdminClient();

    const { data: rows, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (error) {
      logger.error('Failed to poll outbox events', { error: error.message });
      throw new AppError('OUTBOX_POLL_FAILED', `Failed to poll outbox events: ${error.message}`, 500);
    }

    if (!rows || rows.length === 0) {
      return 0;
    }

    let published = 0;

    for (const row of rows as OutboxEventRow[]) {
      const event = rowToEvent(row);
      try {
        await publishToQueue(event);

        const { error: updateError } = await supabase
          .from(TABLE)
          .update({
            status: 'published',
            published_at: new Date().toISOString(),
          })
          .eq('id', event.id)
          .eq('status', 'pending'); // Optimistic concurrency: only update if still pending

        if (updateError) {
          logger.warn('Failed to mark outbox event as published', {
            eventId: event.id,
            error: updateError.message,
          });
        }

        published++;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('Failed to publish outbox event', {
          eventId: event.id,
          eventType: event.eventType,
          error: errorMessage,
        });

        await supabase
          .from(TABLE)
          .update({
            retry_count: event.retryCount + 1,
            last_error: errorMessage,
            status: event.retryCount + 1 >= 5 ? 'failed' : 'pending',
          })
          .eq('id', event.id);
      }
    }

    logger.info('Outbox poll cycle completed', {
      total: rows.length,
      published,
      failed: rows.length - published,
    });

    return published;
  }

  /**
   * Retry failed outbox events.
   *
   * Resets the status of failed events back to `pending` so they can be
   * picked up by the next poll cycle, up to a maximum retry count.
   *
   * @param maxRetries - Maximum total retry attempts before giving up. Defaults to 10.
   * @returns The number of events reset for retry.
   */
  async retryFailed(maxRetries: number = 10): Promise<number> {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from(TABLE)
      .update({
        status: 'pending',
        last_error: null,
      })
      .eq('status', 'failed')
      .lt('retry_count', maxRetries)
      .select('id');

    if (error) {
      logger.error('Failed to retry outbox events', { error: error.message });
      throw new AppError('OUTBOX_RETRY_FAILED', `Failed to retry outbox events: ${error.message}`, 500);
    }

    const count = data?.length ?? 0;
    if (count > 0) {
      logger.info('Outbox events reset for retry', { count, maxRetries });
    }
    return count;
  }

  /**
   * Clean up old published events.
   *
   * Deletes outbox events that were successfully published more than
   * the specified number of days ago. Keeps the table lean.
   *
   * @param olderThanDays - Remove published events older than this many days. Defaults to 30.
   * @returns The number of events deleted.
   */
  async cleanup(olderThanDays: number = 30): Promise<number> {
    const supabase = createAdminClient();

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const { data, error } = await supabase
      .from(TABLE)
      .delete()
      .eq('status', 'published')
      .lt('published_at', cutoff.toISOString())
      .select('id');

    if (error) {
      logger.error('Failed to clean up outbox events', { error: error.message });
      throw new AppError('OUTBOX_CLEANUP_FAILED', `Failed to clean up outbox events: ${error.message}`, 500);
    }

    const count = data?.length ?? 0;
    if (count > 0) {
      logger.info('Old outbox events cleaned up', { count, olderThanDays });
    }
    return count;
  }
}

/** Singleton outbox service instance. */
export const outboxService = new OutboxService();
