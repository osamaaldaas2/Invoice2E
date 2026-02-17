-- File quarantine lifecycle table

CREATE TABLE IF NOT EXISTS quarantine_files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_name   TEXT        NOT NULL,
  mime_type       TEXT        NOT NULL,
  size            BIGINT      NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'quarantined'
                    CHECK (status IN ('quarantined', 'scanning', 'clean', 'rejected', 'promoted')),
  scan_result     JSONB,
  uploaded_by     UUID        NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  promoted_at     TIMESTAMPTZ,
  rejected_at     TIMESTAMPTZ,
  rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_quarantine_files_uploaded_by ON quarantine_files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_quarantine_files_status ON quarantine_files(status);
CREATE INDEX IF NOT EXISTS idx_quarantine_files_created_at ON quarantine_files(created_at) WHERE status NOT IN ('promoted');

ALTER TABLE quarantine_files ENABLE ROW LEVEL SECURITY;
