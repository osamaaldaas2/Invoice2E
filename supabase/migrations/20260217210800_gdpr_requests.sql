-- GDPR data subject requests tracking

CREATE TABLE IF NOT EXISTS gdpr_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID NOT NULL REFERENCES users(id),
  request_type TEXT NOT NULL CHECK (request_type IN ('access', 'erasure', 'rectification', 'portability')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected', 'failed')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_by TEXT,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gdpr_requests_subject_id ON gdpr_requests(subject_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_status ON gdpr_requests(status);
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_type ON gdpr_requests(request_type);
CREATE INDEX IF NOT EXISTS idx_gdpr_requests_status_type ON gdpr_requests(status, request_type);

CREATE OR REPLACE FUNCTION update_gdpr_requests_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gdpr_requests_updated_at ON gdpr_requests;
CREATE TRIGGER trg_gdpr_requests_updated_at BEFORE UPDATE ON gdpr_requests FOR EACH ROW EXECUTE FUNCTION update_gdpr_requests_updated_at();

ALTER TABLE gdpr_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gdpr_requests_select ON gdpr_requests;
CREATE POLICY gdpr_requests_select ON gdpr_requests FOR SELECT
  USING (auth.uid() = subject_id OR auth.jwt() ->> 'role' IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS gdpr_requests_insert ON gdpr_requests;
CREATE POLICY gdpr_requests_insert ON gdpr_requests FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' IN ('admin', 'super_admin') OR auth.uid() = subject_id);

DROP POLICY IF EXISTS gdpr_requests_update ON gdpr_requests;
CREATE POLICY gdpr_requests_update ON gdpr_requests FOR UPDATE
  USING (auth.jwt() ->> 'role' IN ('admin', 'super_admin'));
