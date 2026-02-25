// Application constants
export const APP_NAME = 'Invoice2E';
export const APP_VERSION = '1.0.0';

// API Timeouts (in milliseconds)
// CONSTITUTION RULE: All external API calls must have explicit timeout
export const API_TIMEOUTS = {
  GEMINI_EXTRACTION: 90000, // 90 seconds (AI processing, large batches)
  OPENAI_EXTRACTION: 90000, // 90 seconds (AI processing, large batches)
  MISTRAL_OCR: 60000, // 60 seconds (Mistral OCR step)
  MISTRAL_EXTRACTION: 90000, // 90 seconds (Mistral Chat extraction)
  BOUNDARY_DETECTION: 30000, // 30 seconds (lighter AI call)
  STRIPE_API: 30000, // 30 seconds (payment processing)
  PAYPAL_API: 30000, // 30 seconds (payment processing)
  BREVO_API: 10000, // 10 seconds (email sending)
  DATABASE_QUERY: 10000, // 10 seconds (database operations)
  DEFAULT: 30000, // 30 seconds (fallback)
} as const;

// File Handling Constraints
// CONSTITUTION RULE: All configuration must be centralized
export const FILE_LIMITS = {
  MAX_FILE_SIZE_BYTES: 25 * 1024 * 1024, // 25MB - SINGLE SOURCE OF TRUTH
  MAX_FILE_SIZE_MB: 25,
  ALLOWED_MIME_TYPES: ['application/pdf', 'image/jpeg', 'image/png'] as const,
  MAX_BULK_FILES: 100,
  MAX_ZIP_SIZE_BYTES: 500 * 1024 * 1024, // 500MB
  MAX_ZIP_SIZE_MB: 500,
  MAX_ZIP_FILES: 100, // Max files per batch
} as const;

// Credit system
export const CREDITS_PER_CONVERSION = 1;
export const DEFAULT_CREDITS_ON_SIGNUP = 0;

// PDF boundary detection
export const MAX_PAGES_FOR_BOUNDARY_DETECTION = 50;

// Tax configuration (German VAT rates)
// FIX (QA-BUG-4): Centralized VAT rate configuration
export const DEFAULT_VAT_RATE = 19; // Standard German VAT rate
export const REDUCED_VAT_RATE = 7; // Reduced German VAT rate

// Internationalization
export const SUPPORTED_LOCALES = ['de', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE = 'de';
export const LOCALE_COOKIE_NAME = 'locale';

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;

// Session configuration
export const ACCESS_TOKEN_EXPIRY = 60 * 60; // 1 hour in seconds
export const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

// File download
export const DOWNLOAD_URL_EXPIRY = 24 * 60 * 60; // 24 hours in seconds

// Input validation limits
// FIX-012: Prevent DoS/DB bloat from extremely long strings
export const INPUT_LIMITS = {
  EMAIL_MAX: 320,
  PASSWORD_MAX: 128,
  NAME_MAX: 100,
  ADDRESS_MAX: 255,
  CITY_MAX: 100,
  POSTAL_CODE_MAX: 10,
  PHONE_MAX: 20,
  TAX_ID_MAX: 50,
  SEARCH_MAX: 100,
} as const;

// Batch processing limits
// FIX-030: Limit concurrent batch jobs per user
export const MAX_CONCURRENT_BATCH_JOBS = 3;

// Multi-invoice parallel extraction concurrency
export const MULTI_INVOICE_CONCURRENCY = 5;

// Batch AI extraction throttling
export const BATCH_EXTRACTION = {
  CONCURRENCY: 5, // Process up to 5 files in parallel
  MAX_RETRIES: 3, // Max retries on 429/transient errors
  INITIAL_BACKOFF_MS: 5000, // 5s initial backoff
  BACKOFF_MULTIPLIER: 2, // Exponential backoff multiplier
  MAX_BACKOFF_MS: 60000, // 60s max backoff
} as const;

// OpenAI API rate limiting (token bucket)
export const OPENAI_RATE_LIMIT = {
  MAX_TOKENS: 5, // Burst capacity
  REFILL_PER_SEC: 2, // Tokens refilled per second
} as const;

// Multi-format feature flag
// When false, only xrechnung-cii and xrechnung-ubl are available
export const ENABLE_MULTI_FORMAT = (process.env.ENABLE_MULTI_FORMAT ?? 'true') === 'true';

// Extraction upgrade feature flags
export const ENABLE_TEXT_EXTRACTION = true;
export const ENABLE_STRUCTURED_OUTPUTS = true;
export const ENABLE_EXTRACTION_RETRY = true;
// Extraction retry configuration
export const EXTRACTION_MAX_RETRIES = 2;

// Extraction validation tolerances
export const EXTRACTION_VALIDATION_TOLERANCE = {
  LINE_ITEM: 0.02, // unitPrice × quantity ≈ totalPrice
  SUBTOTAL: 0.1, // sum(lineItems.totalPrice) ≈ subtotal
  TAX: 0.05, // taxAmount ≈ subtotal × taxRate / 100
  TOTAL: 0.05, // subtotal + taxAmount ≈ totalAmount
} as const;

// Text extraction thresholds
/** FIX: Re-audit #25 — document AI text truncation limit.
 *  50,000 chars ≈ 12,500 tokens (at ~4 chars/token). Prevents excessive
 *  token usage and stays within model context window limits. */
export const TEXT_EXTRACTION = {
  MIN_CHARS_PER_PAGE: 50, // Below this → treat as scanned
  MAX_TEXT_LENGTH: 50_000, // Truncate extracted text beyond this
} as const;

export const GEMINI_RATE_LIMIT = {
  MAX_TOKENS: 5, // Burst capacity (5 calls fire instantly, then 2/sec sustained)
  REFILL_PER_SEC: 2, // Tokens refilled per second (~120 RPM, under Gemini's 150 RPM)
} as const;

export const MISTRAL_RATE_LIMIT = {
  MAX_TOKENS: 5, // Scale plan — higher burst allowed
  REFILL_PER_SEC: 2, // 2/sec sustained (~120 RPM)
} as const;
