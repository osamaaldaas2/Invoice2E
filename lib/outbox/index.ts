/**
 * Transactional Outbox Module — Public API
 *
 * Re-exports all outbox infrastructure for convenient imports.
 *
 * @module lib/outbox
 */

export { OutboxService, outboxService } from './outbox';
export { publishToQueue } from './publisher';
export {
  OUTBOX_EVENT_TYPES,
  type OutboxEventType,
  type OutboxStatus,
  type OutboxEvent,
  type AppendOutboxEventInput,
  type OutboxEventRow,
} from './types';
