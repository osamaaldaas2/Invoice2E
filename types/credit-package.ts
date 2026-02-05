/**
 * Credit Package Types
 * Represents pricing packages loaded from database
 */

export interface CreditPackage {
  id: string;
  slug: string;
  name: string;
  name_de: string | null;
  description: string | null;
  description_de: string | null;
  credits: number;
  price: number;
  currency: string;
  is_popular: boolean;
  savings_percent: number | null;
  sort_order: number;
  is_active: boolean;
  stripe_price_id: string | null;
  paypal_plan_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Display-ready package with computed properties
 */
export interface CreditPackageDisplay extends CreditPackage {
  pricePerCredit: number;
  localizedName: string;
  localizedDescription: string;
}

/**
 * Create package input (admin)
 */
export interface CreatePackageInput {
  slug: string;
  name: string;
  name_de?: string;
  description?: string;
  description_de?: string;
  credits: number;
  price: number;
  currency?: string;
  is_popular?: boolean;
  savings_percent?: number;
  sort_order?: number;
}

/**
 * Update package input (admin)
 */
export interface UpdatePackageInput {
  name?: string;
  name_de?: string;
  description?: string;
  description_de?: string;
  credits?: number;
  price?: number;
  currency?: string;
  is_popular?: boolean;
  savings_percent?: number;
  sort_order?: number;
  is_active?: boolean;
}
