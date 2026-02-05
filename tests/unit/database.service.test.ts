import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Supabase client
vi.mock('@/lib/supabase.server', () => ({
    createServerClient: vi.fn(() => ({
        from: vi.fn(() => ({
            insert: vi.fn(() => ({
                select: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
            })),
            select: vi.fn(() => ({
                eq: vi.fn(() => ({
                    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
                })),
            })),
            update: vi.fn(() => ({
                eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                        single: vi.fn(() => Promise.resolve({ data: null, error: null })),
                    })),
                })),
            })),
        })),
        rpc: vi.fn(() => Promise.resolve({ data: true, error: null })),
    })),
}));

// Import after mocking
import { DatabaseService } from '@/services/database.service';
import type { CreateUserData, CreateExtractionData } from '@/services/database.service';

describe('DatabaseService', () => {
    let service: DatabaseService;

    beforeEach(() => {
        service = new DatabaseService();
        vi.clearAllMocks();
    });

    describe('User Operations', () => {
        const mockUserData: CreateUserData = {
            email: 'test@example.com',
            passwordHash: 'hashed_password_123',
            firstName: 'Test',
            lastName: 'User',
        };

        it('should have createUser method', () => {
            expect(typeof service.createUser).toBe('function');
        });

        it('should have getUserById method', () => {
            expect(typeof service.getUserById).toBe('function');
        });

        it('should have getUserByEmail method', () => {
            expect(typeof service.getUserByEmail).toBe('function');
        });

        it('should have updateUser method', () => {
            expect(typeof service.updateUser).toBe('function');
        });

        it('should validate user data structure', () => {
            expect(mockUserData.email).toBeDefined();
            expect(mockUserData.passwordHash).toBeDefined();
            expect(mockUserData.firstName).toBeDefined();
            expect(mockUserData.lastName).toBeDefined();
        });
    });

    describe('Credits Operations', () => {
        it('should have getUserCredits method', () => {
            expect(typeof service.getUserCredits).toBe('function');
        });

        it('should have createUserCredits method', () => {
            expect(typeof service.createUserCredits).toBe('function');
        });

        it('should have deductCredits method', () => {
            expect(typeof service.deductCredits).toBe('function');
        });

        it('should have addCredits method', () => {
            expect(typeof service.addCredits).toBe('function');
        });
    });

    describe('Extraction Operations', () => {
        const mockExtractionData: CreateExtractionData = {
            userId: '123e4567-e89b-12d3-a456-426614174000',
            extractionData: {
                invoiceNumber: 'INV-001',
                amount: 100.00,
            },
            confidenceScore: 0.95,
            geminiResponseTimeMs: 1500,
        };

        it('should have createExtraction method', () => {
            expect(typeof service.createExtraction).toBe('function');
        });

        it('should have getExtractionById method', () => {
            expect(typeof service.getExtractionById).toBe('function');
        });

        it('should have getUserExtractions method', () => {
            expect(typeof service.getUserExtractions).toBe('function');
        });

        it('should validate extraction data structure', () => {
            expect(mockExtractionData.userId).toBeDefined();
            expect(mockExtractionData.extractionData).toBeDefined();
            expect(mockExtractionData.confidenceScore).toBeGreaterThan(0);
            expect(mockExtractionData.confidenceScore).toBeLessThanOrEqual(1);
        });
    });

    describe('Conversion Operations', () => {
        it('should have createConversion method', () => {
            expect(typeof service.createConversion).toBe('function');
        });

        it('should have updateConversion method', () => {
            expect(typeof service.updateConversion).toBe('function');
        });

        it('should have getConversionById method', () => {
            expect(typeof service.getConversionById).toBe('function');
        });

        it('should have getUserConversions method', () => {
            expect(typeof service.getUserConversions).toBe('function');
        });
    });

    describe('Payment Operations', () => {
        it('should have createPayment method', () => {
            expect(typeof service.createPayment).toBe('function');
        });

        it('should have getUserPayments method', () => {
            expect(typeof service.getUserPayments).toBe('function');
        });
    });

    describe('Audit Log Operations', () => {
        it('should have createAuditLog method', () => {
            expect(typeof service.createAuditLog).toBe('function');
        });

        it('should have getUserAuditLogs method', () => {
            expect(typeof service.getUserAuditLogs).toBe('function');
        });
    });
});
