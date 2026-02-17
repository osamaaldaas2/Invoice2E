-- Transactional outbox for reliable domain event publishing

CREATE TABLE IF NOT EXISTS outbox_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type  TEXT NOT NULL,
    aggregate_id    TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'published', 'failed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at    TIMESTAMPTZ,
    retry_count     INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_events_status_created
    ON outbox_events (status, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_outbox_events_published_at
    ON outbox_events (published_at) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_outbox_events_aggregate
    ON outbox_events (aggregate_type, aggregate_id);

ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
