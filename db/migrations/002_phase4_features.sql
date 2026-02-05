-- Invoice2E Database Schema - Phase 4 Migration
-- Migration: 002_phase4_features.sql
-- Created: 2026-01-31
-- Features: Batch Jobs, User Templates, Analytics

-- =====================================================
-- BATCH JOBS TABLE (Feature B: Bulk Upload)
-- =====================================================
CREATE TABLE IF NOT EXISTS batch_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed, cancelled
  total_files INT NOT NULL DEFAULT 0,
  completed_files INT DEFAULT 0,
  failed_files INT DEFAULT 0,
  results JSONB, -- Array of {filename, status, error, xml_path}
  input_file_path TEXT, -- Path to uploaded ZIP
  output_file_path TEXT, -- Path to result ZIP
  error_message TEXT,
  processing_started_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

-- Indexes for batch_jobs
CREATE INDEX IF NOT EXISTS idx_batch_jobs_user_id ON batch_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_jobs(status);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_created_at ON batch_jobs(created_at DESC);

-- RLS for batch_jobs
ALTER TABLE batch_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own batch jobs" ON batch_jobs
  FOR SELECT USING (user_id::text = auth.uid()::text);

CREATE POLICY "Users can insert own batch jobs" ON batch_jobs
  FOR INSERT WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY "Users can update own batch jobs" ON batch_jobs
  FOR UPDATE USING (user_id::text = auth.uid()::text);

-- =====================================================
-- USER TEMPLATES TABLE (Feature C: Templates)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  -- Seller information
  seller_name VARCHAR(255),
  seller_email VARCHAR(255),
  seller_phone VARCHAR(50),
  seller_tax_id VARCHAR(50),
  seller_iban VARCHAR(34),
  seller_bic VARCHAR(11),
  seller_address_street VARCHAR(255),
  seller_address_postal_code VARCHAR(10),
  seller_address_city VARCHAR(100),
  seller_address_country VARCHAR(2) DEFAULT 'DE',
  seller_contact_name VARCHAR(255),
  -- Buyer information
  buyer_name VARCHAR(255),
  buyer_email VARCHAR(255),
  buyer_address_street VARCHAR(255),
  buyer_address_postal_code VARCHAR(10),
  buyer_address_city VARCHAR(100),
  buyer_address_country VARCHAR(2) DEFAULT 'DE',
  buyer_reference VARCHAR(100),
  -- Payment information
  payment_terms VARCHAR(100),
  payment_instructions TEXT,
  -- Metadata
  is_default BOOLEAN DEFAULT FALSE,
  usage_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for user_templates
CREATE INDEX IF NOT EXISTS idx_user_templates_user_id ON user_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_user_templates_name ON user_templates(name);

-- RLS for user_templates
ALTER TABLE user_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own templates" ON user_templates
  FOR SELECT USING (user_id::text = auth.uid()::text);

CREATE POLICY "Users can insert own templates" ON user_templates
  FOR INSERT WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY "Users can update own templates" ON user_templates
  FOR UPDATE USING (user_id::text = auth.uid()::text);

CREATE POLICY "Users can delete own templates" ON user_templates
  FOR DELETE USING (user_id::text = auth.uid()::text);

-- =====================================================
-- UPDATE PAYMENT_TRANSACTIONS (Feature A: PayPal support)
-- =====================================================
ALTER TABLE payment_transactions 
  ADD COLUMN IF NOT EXISTS paypal_order_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- =====================================================
-- UPDATE INVOICE_CONVERSIONS (Feature F: UBL format)
-- =====================================================
-- Ensure conversion_format column can store 'CII' or 'UBL'
-- (Already exists from initial schema)

-- Add processing time tracking
ALTER TABLE invoice_conversions
  ADD COLUMN IF NOT EXISTS processing_time_ms INT,
  ADD COLUMN IF NOT EXISTS xml_file_path TEXT;

-- =====================================================
-- ANALYTICS VIEWS (Feature E: Analytics Dashboard)
-- =====================================================
-- Daily conversion stats view
CREATE OR REPLACE VIEW user_daily_stats AS
SELECT 
  user_id,
  DATE(created_at) as date,
  COUNT(*) as total_conversions,
  SUM(CASE WHEN validation_status = 'valid' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN validation_status != 'valid' THEN 1 ELSE 0 END) as failed,
  SUM(credits_used) as credits_used,
  AVG(processing_time_ms) as avg_processing_time
FROM invoice_conversions
GROUP BY user_id, DATE(created_at);

-- Format distribution view
CREATE OR REPLACE VIEW user_format_stats AS
SELECT 
  user_id,
  conversion_format,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY user_id), 2) as percentage
FROM invoice_conversions
WHERE conversion_format IS NOT NULL
GROUP BY user_id, conversion_format;

-- =====================================================
-- TRIGGERS
-- =====================================================
-- Update timestamp triggers for new tables
CREATE TRIGGER update_batch_jobs_updated_at
  BEFORE UPDATE ON batch_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_templates_updated_at
  BEFORE UPDATE ON user_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- FUNCTIONS
-- =====================================================
-- Function to add credits after payment
CREATE OR REPLACE FUNCTION add_credits(p_user_id UUID, p_amount INT)
RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO user_credits (user_id, available_credits)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
  SET 
    available_credits = user_credits.available_credits + p_amount,
    updated_at = CURRENT_TIMESTAMP;
  
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user statistics
CREATE OR REPLACE FUNCTION get_user_stats(p_user_id UUID)
RETURNS TABLE(
  total_conversions BIGINT,
  successful_conversions BIGINT,
  failed_conversions BIGINT,
  total_credits_used BIGINT,
  success_rate NUMERIC,
  avg_processing_time NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_conversions,
    SUM(CASE WHEN validation_status = 'valid' THEN 1 ELSE 0 END)::BIGINT as successful_conversions,
    SUM(CASE WHEN validation_status != 'valid' THEN 1 ELSE 0 END)::BIGINT as failed_conversions,
    COALESCE(SUM(credits_used), 0)::BIGINT as total_credits_used,
    CASE 
      WHEN COUNT(*) > 0 THEN ROUND(SUM(CASE WHEN validation_status = 'valid' THEN 1 ELSE 0 END)::NUMERIC / COUNT(*) * 100, 2)
      ELSE 0
    END as success_rate,
    COALESCE(AVG(processing_time_ms), 0)::NUMERIC as avg_processing_time
  FROM invoice_conversions
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- SEED DATA (Optional - for testing)
-- =====================================================
-- Insert sample credit packages (for reference)
-- Package 1: 10 credits for €5.00
-- Package 2: 50 credits for €20.00 (20% discount)
-- Package 3: 100 credits for €35.00 (30% discount)
-- Package 4: 500 credits for €150.00 (40% discount)
