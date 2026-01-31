// Application constants
export const APP_NAME = 'Invoice2E';
export const APP_VERSION = '1.0.0';

// File handling constraints
export const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
export const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

// API timeouts (in milliseconds)
export const API_TIMEOUT = 30000; // 30 seconds
export const DB_QUERY_TIMEOUT = 10000; // 10 seconds
export const GEMINI_TIMEOUT = 60000; // 60 seconds for AI extraction

// Credit system
export const CREDITS_PER_CONVERSION = 1;
export const DEFAULT_CREDITS_ON_SIGNUP = 0;

// Internationalization
export const SUPPORTED_LOCALES = ['en', 'de'] as const;
export const DEFAULT_LOCALE = 'en';

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 50;

// Session configuration
export const ACCESS_TOKEN_EXPIRY = 60 * 60; // 1 hour in seconds
export const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

// File download
export const DOWNLOAD_URL_EXPIRY = 24 * 60 * 60; // 24 hours in seconds
