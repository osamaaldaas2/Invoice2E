-- Migration: Create saga_executions table
-- Tracks saga orchestrator runs for the extraction→conversion pipeline.

CREATE TABLE IF NOT EXISTS saga_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL,
  user_id         UUID NOT NULL,
  status          TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'completed', 'compensating', 'failed')),
  steps_completed TEXT[] NOT NULL DEFAULT '{}',
  steps_compensated TEXT[] NOT NULL DEFAULT '{}',
  failed_step     TEXT,
  error           TEXT,
  context_snapshot JSONB NOT NULL DEFAULT '{}',
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_saga_executions_invoice_id ON saga_executions (invoice_id);
CREATE INDEX IF NOT EXISTS idx_saga_executions_user_id ON saga_executions (user_id);
CREATE INDEX IF NOT EXISTS idx_saga_executions_status ON saga_executions (status);
CREATE INDEX IF NOT EXISTS idx_saga_executions_started_at ON saga_executions (started_at DESC);

-- Saga log table for step-level debugging
CREATE TABLE IF NOT EXISTS saga_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saga_id    UUID NOT NULL,
  step_name  TEXT NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('execute', 'compensate', 'error')),
  success    BOOLEAN NOT NULL,
  error      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saga_log_saga_id ON saga_log (saga_id);
CREATE INDEX IF NOT EXISTS idx_saga_log_created_at ON saga_log (created_at DESC);
