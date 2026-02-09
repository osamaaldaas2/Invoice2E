-- Migration 020: Add unique constraint on webhook_events for idempotency
-- Prevents duplicate webhook processing via race conditions

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_event_provider
    ON webhook_events(event_id, provider);
