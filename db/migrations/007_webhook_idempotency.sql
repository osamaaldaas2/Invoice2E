-- Migration 007: Webhook Idempotency Table
-- SECURITY FIX (BUG-004): Prevent duplicate credit allocation from webhook replays
-- Created: 2026-02-04

-- Create webhook_events table for idempotency tracking
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('stripe', 'paypal')),
    event_type VARCHAR(100) NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    credits_added INTEGER DEFAULT 0,
    payment_amount DECIMAL(10,2),
    currency VARCHAR(3) DEFAULT 'EUR',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique constraint to prevent duplicate processing
    CONSTRAINT unique_webhook_event UNIQUE (event_id, provider)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON webhook_events(provider);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON webhook_events(processed_at);
CREATE INDEX IF NOT EXISTS idx_webhook_events_user_id ON webhook_events(user_id);

-- Add comment
COMMENT ON TABLE webhook_events IS 'Tracks processed webhook events to prevent duplicate credit allocation';
COMMENT ON COLUMN webhook_events.event_id IS 'Unique event ID from payment provider (Stripe event.id or PayPal resource.id)';
COMMENT ON COLUMN webhook_events.provider IS 'Payment provider: stripe or paypal';

-- Enable RLS
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can insert/select (webhooks are server-side only)
CREATE POLICY "Service role access only" ON webhook_events
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
