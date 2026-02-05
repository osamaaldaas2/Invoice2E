import type {
    User,
    UserCredits,
    InvoiceExtraction,
    InvoiceConversion,
    PaymentTransaction,
    AuditLog,
} from '@/types';
import { userService } from './database/user.service';
import { creditService } from './database/credit.service';
import { extractionService } from './database/extraction.service';
import { conversionService } from './database/conversion.service';
import { paymentService } from './database/payment.service';
import { auditService } from './database/audit.service';
import {
    CreateUserData,
    UpdateUserData,
    CreateExtractionData,
    CreateConversionData,
    UpdateConversionData,
    CreatePaymentData,
    CreateAuditLogData
} from './database/types';

// Export types for backward compatibility
export type {
    CreateUserData,
    UpdateUserData,
    CreateExtractionData,
    CreateConversionData,
    UpdateConversionData,
    CreatePaymentData,
    CreateAuditLogData
};

/**
 * Database service for all Supabase operations
 * Follows CONSTITUTION rules for error handling and logging
 * Refactored to delegate to domain-specific services
 */
export class DatabaseService {

    // ==================== USER OPERATIONS ====================

    async createUser(data: CreateUserData): Promise<User> {
        return userService.createUser(data);
    }

    async getUserById(userId: string): Promise<User> {
        return userService.getUserById(userId);
    }

    async getUserByEmail(email: string): Promise<User | null> {
        return userService.getUserByEmail(email);
    }

    async updateUser(userId: string, data: UpdateUserData): Promise<User> {
        return userService.updateUser(userId, data);
    }

    // ==================== CREDITS OPERATIONS ====================

    async getUserCredits(userId: string): Promise<UserCredits> {
        return creditService.getUserCredits(userId);
    }

    async createUserCredits(userId: string, initialCredits: number = 0): Promise<UserCredits> {
        return creditService.createUserCredits(userId, initialCredits);
    }

    async deductCredits(userId: string, amount: number = 1): Promise<boolean> {
        return creditService.deductCredits(userId, amount);
    }

    async addCredits(userId: string, amount: number): Promise<UserCredits> {
        return creditService.addCredits(userId, amount);
    }

    // ==================== EXTRACTION OPERATIONS ====================

    async createExtraction(data: CreateExtractionData): Promise<InvoiceExtraction> {
        return extractionService.createExtraction(data);
    }

    async getExtractionById(extractionId: string): Promise<InvoiceExtraction> {
        return extractionService.getExtractionById(extractionId);
    }

    async getUserExtractions(userId: string, limit: number = 10): Promise<InvoiceExtraction[]> {
        return extractionService.getUserExtractions(userId, limit);
    }

    // ==================== CONVERSION OPERATIONS ====================

    async createConversion(data: CreateConversionData): Promise<InvoiceConversion> {
        return conversionService.createConversion(data);
    }

    async updateConversion(conversionId: string, data: UpdateConversionData): Promise<InvoiceConversion> {
        return conversionService.updateConversion(conversionId, data);
    }

    async getConversionById(conversionId: string): Promise<InvoiceConversion> {
        return conversionService.getConversionById(conversionId);
    }

    async getUserConversions(userId: string, limit: number = 10): Promise<InvoiceConversion[]> {
        return conversionService.getUserConversions(userId, limit);
    }

    // ==================== PAYMENT OPERATIONS ====================

    async createPayment(data: CreatePaymentData): Promise<PaymentTransaction> {
        return paymentService.createPayment(data);
    }

    async getUserPayments(userId: string, limit: number = 10): Promise<PaymentTransaction[]> {
        return paymentService.getUserPayments(userId, limit);
    }

    // ==================== AUDIT LOG OPERATIONS ====================

    async createAuditLog(data: CreateAuditLogData): Promise<void> {
        return auditService.createAuditLog(data);
    }

    async getUserAuditLogs(userId: string, limit: number = 50): Promise<AuditLog[]> {
        return auditService.getUserAuditLogs(userId, limit);
    }
}

// Export singleton instance
export const databaseService = new DatabaseService();
