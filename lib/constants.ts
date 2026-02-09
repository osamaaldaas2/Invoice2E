// Application constants
export const APP_NAME = 'Invoice2E';
export const APP_VERSION = '1.0.0';

// API Timeouts (in milliseconds)
// CONSTITUTION RULE: All external API calls must have explicit timeout
export const API_TIMEOUTS = {
    GEMINI_EXTRACTION: 60000,    // 60 seconds (AI processing)
    DEEPSEEK_EXTRACTION: 60000,  // 60 seconds (AI processing)
    BOUNDARY_DETECTION: 30000,   // 30 seconds (lighter AI call)
    STRIPE_API: 30000,           // 30 seconds (payment processing)
    PAYPAL_API: 30000,           // 30 seconds (payment processing)
    SENDGRID_API: 10000,         // 10 seconds (email sending)
    DATABASE_QUERY: 10000,       // 10 seconds (database operations)
    DEFAULT: 30000,              // 30 seconds (fallback)
} as const;

// File Handling Constraints
// CONSTITUTION RULE: All configuration must be centralized
export const FILE_LIMITS = {
    MAX_FILE_SIZE_BYTES: 25 * 1024 * 1024, // 25MB - SINGLE SOURCE OF TRUTH
    MAX_FILE_SIZE_MB: 25,
    ALLOWED_MIME_TYPES: [
        'application/pdf',
        'image/jpeg',
        'image/png',
    ] as const,
    MAX_BULK_FILES: 100,
    MAX_ZIP_SIZE_BYTES: 200 * 1024 * 1024, // 200MB (EXP-9: reduced from 500MB)
    MAX_ZIP_SIZE_MB: 200,
    MAX_ZIP_FILES: 50, // EXP-9: max files per batch to limit memory
} as const;

// Credit system
export const CREDITS_PER_CONVERSION = 1;
export const DEFAULT_CREDITS_ON_SIGNUP = 0;

// PDF boundary detection
export const MAX_PAGES_FOR_BOUNDARY_DETECTION = 50;

// Tax configuration (German VAT rates)
// FIX (QA-BUG-4): Centralized VAT rate configuration
export const DEFAULT_VAT_RATE = 19; // Standard German VAT rate
export const REDUCED_VAT_RATE = 7;  // Reduced German VAT rate

// Internationalization
export const SUPPORTED_LOCALES = ['en', 'de'] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];
export const DEFAULT_LOCALE = 'en';

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
    CONCURRENCY: 3,                // Process up to 3 files in parallel
    MAX_RETRIES: 3,                // Max retries on 429/transient errors
    INITIAL_BACKOFF_MS: 5000,      // 5s initial backoff
    BACKOFF_MULTIPLIER: 2,         // Exponential backoff multiplier
    MAX_BACKOFF_MS: 60000,         // 60s max backoff
} as const;
