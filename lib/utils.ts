import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with Tailwind CSS conflict resolution
 * @param classes - Class names to merge
 * @returns Merged class string
 */
export const cn = (...classes: ClassValue[]): string => {
    return twMerge(clsx(classes));
};

/**
 * Format date to German locale format (DD.MM.YYYY)
 * @param date - Date to format
 * @returns Formatted date string
 */
export const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('de-DE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
};

/**
 * Format number to EUR currency
 * @param amount - Amount to format
 * @returns Formatted currency string
 */
export const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
    }).format(amount);
};

/**
 * Validate email format
 * @param email - Email to validate
 * @returns True if valid email format
 */
export const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

/**
 * Generate a timestamp in ISO format
 * @returns ISO timestamp string
 */
export const getTimestamp = (): string => {
    return new Date().toISOString();
};

/**
 * Safely parse JSON with error handling
 * @param jsonString - JSON string to parse
 * @returns Parsed object or null if invalid
 */
export const safeJsonParse = <T>(jsonString: string): T | null => {
    try {
        return JSON.parse(jsonString) as T;
    } catch {
        return null;
    }
};

/**
 * Create a delay promise
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after delay
 */
export const delay = (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};
