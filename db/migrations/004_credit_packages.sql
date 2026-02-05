-- Credit Packages Table (Admin-controlled dynamic pricing)
-- Migration: 004_credit_packages.sql
-- Purpose: Store credit packages that can be modified via admin dashboard

CREATE TABLE IF NOT EXISTS credit_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Package Identity
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  name_de VARCHAR(100),
  description VARCHAR(255),
  description_de VARCHAR(255),
  
  -- Pricing
  credits INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  
  -- Display Options
  is_popular BOOLEAN DEFAULT FALSE,
  savings_percent INTEGER,
  sort_order INTEGER DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Provider IDs (for future subscription support)
  stripe_price_id VARCHAR(255),
  paypal_plan_id VARCHAR(255),
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE credit_packages ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active packages (public pricing page)
CREATE POLICY "Anyone can view active packages" ON credit_packages
  FOR SELECT USING (is_active = TRUE);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_credit_packages_active ON credit_packages(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_credit_packages_slug ON credit_packages(slug);

-- Insert default packages
INSERT INTO credit_packages (slug, name, name_de, description, description_de, credits, price, is_popular, savings_percent, sort_order) VALUES
  ('starter', 'Starter Pack', 'Starter Paket', '10 invoice conversions', '10 Rechnungskonvertierungen', 10, 9.99, FALSE, NULL, 1),
  ('professional', 'Professional Pack', 'Professional Paket', '50 invoice conversions', '50 Rechnungskonvertierungen', 50, 39.99, TRUE, 20, 2),
  ('enterprise', 'Enterprise Pack', 'Enterprise Paket', '100 invoice conversions', '100 Rechnungskonvertierungen', 100, 69.99, FALSE, 30, 3)
ON CONFLICT (slug) DO NOTHING;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_credit_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_credit_packages_updated_at
  BEFORE UPDATE ON credit_packages
  FOR EACH ROW EXECUTE FUNCTION update_credit_packages_updated_at();
