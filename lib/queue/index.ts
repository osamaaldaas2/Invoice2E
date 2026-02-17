/**
 * BullMQ Queue Module — Public API
 *
 * Re-exports all queue infrastructure for convenient imports.
 *
 * @module lib/queue
 */

export { getQueueConnection, getWorkerConnection, closeAllConnections } from './connection';
export {
  getQueue,
  getExtractionQueue,
  getConversionQueue,
  getBatchQueue,
  getEmailQueue,
  closeAllQueues,
} from './queues';
export { createWorker, shutdownAllWorkers } from './workers';
export { handleDeadLetter, retryFromDeadLetter } from './dead-letter';
export { QUEUE_NAMES } from './types';
export type {
  QueueName,
  ExtractionJobPayload,
  ExtractionJobResult,
  ConversionJobPayload,
  ConversionJobResult,
  BatchJobPayload,
  BatchJobResult,
  EmailJobPayload,
  EmailJobResult,
  JobStatusResponse,
  DeadLetterEntry,
} from './types';
