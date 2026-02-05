-- Invoice2E Database Schema
-- Migration: 001_initial_schema.sql
-- Created: 2026-01-31

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(255),
  postal_code VARCHAR(20),
  country VARCHAR(2),
  phone VARCHAR(20),
  tax_id VARCHAR(50),
  language VARCHAR(5) DEFAULT 'en',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Credits table
CREATE TABLE user_credits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  available_credits INT NOT NULL DEFAULT 0,
  used_credits INT NOT NULL DEFAULT 0,
  credits_expiry_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoice Extractions table
CREATE TABLE invoice_extractions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  extraction_data JSONB NOT NULL,
  confidence_score FLOAT,
  gemini_response_time_ms INT,
  status VARCHAR(50) DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invoice Conversions table
CREATE TABLE invoice_conversions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  extraction_id UUID NOT NULL REFERENCES invoice_extractions(id),
  invoice_number VARCHAR(100),
  buyer_name VARCHAR(255),
  conversion_format VARCHAR(10),
  validation_status VARCHAR(50),
  validation_errors JSONB,
  conversion_status VARCHAR(50),
  email_sent BOOLEAN DEFAULT FALSE,
  email_sent_at TIMESTAMP,
  email_recipient VARCHAR(255),
  file_download_triggered BOOLEAN DEFAULT FALSE,
  download_triggered_at TIMESTAMP,
  credits_used INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Payment Transactions table
CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_payment_id VARCHAR(255),
  amount DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  credits_purchased INT NOT NULL,
  payment_method VARCHAR(50),
  payment_status VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  changes JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX idx_invoice_extractions_user_id ON invoice_extractions(user_id);
CREATE INDEX idx_invoice_conversions_user_id ON invoice_conversions(user_id);
CREATE INDEX idx_invoice_conversions_extraction_id ON invoice_conversions(extraction_id);
CREATE INDEX idx_payment_transactions_user_id ON payment_transactions(user_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users (can only see own user)
CREATE POLICY "Users can view own user" ON users
  FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own user" ON users
  FOR UPDATE USING (auth.uid()::text = id::text);

-- RLS Policies for user_credits (can only see own credits)
CREATE POLICY "Users can view own credits" ON user_credits
  FOR SELECT USING (user_id::text = auth.uid()::text);

-- RLS Policies for invoice_extractions (can only see own extractions)
CREATE POLICY "Users can view own extractions" ON invoice_extractions
  FOR SELECT USING (user_id::text = auth.uid()::text);

CREATE POLICY "Users can insert own extractions" ON invoice_extractions
  FOR INSERT WITH CHECK (user_id::text = auth.uid()::text);

-- RLS Policies for invoice_conversions (can only see own conversions)
CREATE POLICY "Users can view own conversions" ON invoice_conversions
  FOR SELECT USING (user_id::text = auth.uid()::text);

CREATE POLICY "Users can insert own conversions" ON invoice_conversions
  FOR INSERT WITH CHECK (user_id::text = auth.uid()::text);

CREATE POLICY "Users can update own conversions" ON invoice_conversions
  FOR UPDATE USING (user_id::text = auth.uid()::text);

-- RLS Policies for payment_transactions (can only see own transactions)
CREATE POLICY "Users can view own transactions" ON payment_transactions
  FOR SELECT USING (user_id::text = auth.uid()::text);

-- RLS Policies for audit_logs (can only see own logs)
CREATE POLICY "Users can view own audit logs" ON audit_logs
  FOR SELECT USING (user_id::text = auth.uid()::text);

-- Function to deduct credits
CREATE OR REPLACE FUNCTION deduct_credits(p_user_id UUID, p_amount INT)
RETURNS BOOLEAN AS $$
DECLARE
  current_credits INT;
BEGIN
  SELECT available_credits INTO current_credits
  FROM user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF current_credits IS NULL OR current_credits < p_amount THEN
    RETURN FALSE;
  END IF;

  UPDATE user_credits
  SET 
    available_credits = available_credits - p_amount,
    used_credits = used_credits + p_amount,
    updated_at = CURRENT_TIMESTAMP
  WHERE user_id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_credits_updated_at
  BEFORE UPDATE ON user_credits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoice_extractions_updated_at
  BEFORE UPDATE ON invoice_extractions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoice_conversions_updated_at
  BEFORE UPDATE ON invoice_conversions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_transactions_updated_at
  BEFORE UPDATE ON payment_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
