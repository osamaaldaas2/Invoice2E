import { describe, it, expect } from 'vitest';
import {
    snakeToCamel,
    camelToSnake,
    snakeToCamelKeys,
    camelToSnakeKeys,
    isValidUUID,
    sanitizeString,
} from '@/lib/database-helpers';

describe('Database Helpers', () => {
    describe('snakeToCamel', () => {
        it('should convert snake_case to camelCase', () => {
            expect(snakeToCamel('user_id')).toBe('userId');
            expect(snakeToCamel('created_at')).toBe('createdAt');
            expect(snakeToCamel('first_name')).toBe('firstName');
        });

        it('should handle strings without underscores', () => {
            expect(snakeToCamel('email')).toBe('email');
            expect(snakeToCamel('id')).toBe('id');
        });

        it('should handle multiple underscores', () => {
            expect(snakeToCamel('user_first_name')).toBe('userFirstName');
        });
    });

    describe('camelToSnake', () => {
        it('should convert camelCase to snake_case', () => {
            expect(camelToSnake('userId')).toBe('user_id');
            expect(camelToSnake('createdAt')).toBe('created_at');
            expect(camelToSnake('firstName')).toBe('first_name');
        });

        it('should handle strings without capitals', () => {
            expect(camelToSnake('email')).toBe('email');
            expect(camelToSnake('id')).toBe('id');
        });

        it('should handle multiple capitals', () => {
            expect(camelToSnake('userFirstName')).toBe('user_first_name');
        });
    });

    describe('snakeToCamelKeys', () => {
        it('should convert all object keys from snake_case to camelCase', () => {
            const input = {
                user_id: '123',
                first_name: 'John',
                created_at: '2024-01-01',
            };

            const result = snakeToCamelKeys(input);

            expect(result).toEqual({
                userId: '123',
                firstName: 'John',
                createdAt: '2024-01-01',
            });
        });

        it('should handle nested objects', () => {
            const input = {
                user_data: {
                    first_name: 'John',
                    last_name: 'Doe',
                },
            };

            const result = snakeToCamelKeys(input);

            expect(result).toEqual({
                userData: {
                    firstName: 'John',
                    lastName: 'Doe',
                },
            });
        });

        it('should handle arrays', () => {
            const input = [
                { user_id: '1', first_name: 'John' },
                { user_id: '2', first_name: 'Jane' },
            ];

            const result = snakeToCamelKeys(input);

            expect(result).toEqual([
                { userId: '1', firstName: 'John' },
                { userId: '2', firstName: 'Jane' },
            ]);
        });
    });

    describe('camelToSnakeKeys', () => {
        it('should convert all object keys from camelCase to snake_case', () => {
            const input = {
                userId: '123',
                firstName: 'John',
                createdAt: '2024-01-01',
            };

            const result = camelToSnakeKeys(input);

            expect(result).toEqual({
                user_id: '123',
                first_name: 'John',
                created_at: '2024-01-01',
            });
        });
    });

    describe('isValidUUID', () => {
        it('should return true for valid UUIDs', () => {
            expect(isValidUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
            expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
        });

        it('should return false for invalid UUIDs', () => {
            expect(isValidUUID('not-a-uuid')).toBe(false);
            expect(isValidUUID('123')).toBe(false);
            expect(isValidUUID('')).toBe(false);
        });
    });

    describe('sanitizeString', () => {
        it('should trim whitespace', () => {
            expect(sanitizeString('  hello  ')).toBe('hello');
        });

        it('should remove angle brackets', () => {
            expect(sanitizeString('hello<script>world')).toBe('helloscriptworld');
        });
    });
});
