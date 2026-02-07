/**
 * Database helper functions for key conversion
 * Converts between camelCase (TypeScript) and snake_case (PostgreSQL)
 */

/**
 * Convert snake_case string to camelCase
 */
export const snakeToCamel = (str: string): string => {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
};

/**
 * Convert camelCase string to snake_case
 */
export const camelToSnake = (str: string): string => {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
};

type JsonValue = string | number | boolean | null | undefined | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

/**
 * Recursively convert object keys using provided converter function
 */
const convertKeys = <T extends JsonValue>(
    obj: T,
    converter: (key: string) => string
): T => {
    if (Array.isArray(obj)) {
        return obj.map((item) => convertKeys(item, converter)) as T;
    }

    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    const result: JsonObject = {};
    for (const key of Object.keys(obj as JsonObject)) {
        const value = (obj as JsonObject)[key];
        result[converter(key)] = convertKeys(value, converter);
    }
    return result as T;
};

/**
 * Convert all keys in object from snake_case to camelCase
 */
export const snakeToCamelKeys = <T>(obj: unknown): T => {
    return convertKeys(obj as JsonValue, snakeToCamel) as T;
};

/**
 * Convert all keys in object from camelCase to snake_case
 */
export const camelToSnakeKeys = <T>(obj: unknown): T => {
    return convertKeys(obj as JsonValue, camelToSnake) as T;
};

/**
 * Check if a value is a valid UUID
 */
export const isValidUUID = (value: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
};

/**
 * Sanitize string for database operations
 */
export const sanitizeString = (str: string): string => {
    return str.trim().replace(/[<>]/g, '');
};
