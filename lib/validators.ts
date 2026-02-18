import { z } from 'zod';
import { INPUT_LIMITS } from '@/lib/constants';

// Email validation schema
// FIX-012: Add max length (RFC 5321 allows up to 320 chars)
export const EmailSchema = z
  .string()
  .email('Invalid email address')
  .max(INPUT_LIMITS.EMAIL_MAX, 'Email too long');

// Password validation schema with complexity requirements
// FIX-012: Add max length to prevent DoS with extremely long passwords
// FIX: Re-audit #9 — match Supabase config: min 10 chars + lower_upper_letters_digits_symbols
export const PasswordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(INPUT_LIMITS.PASSWORD_MAX, 'Password too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one symbol');

// FIX-013: Phone number validation with format check
const PhoneSchema = z
  .string()
  .min(4, 'Phone is required')
  .max(INPUT_LIMITS.PHONE_MAX, 'Phone number too long')
  .regex(/^\+?[\d\s\-().]{4,20}$/, 'Invalid phone number format');

// Signup form validation schema
// FIX-012: All string fields now have max length constraints
export const SignupSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  firstName: z
    .string()
    .min(2, 'First name too short')
    .max(INPUT_LIMITS.NAME_MAX, 'First name too long'),
  lastName: z
    .string()
    .min(2, 'Last name too short')
    .max(INPUT_LIMITS.NAME_MAX, 'Last name too long'),
  addressLine1: z
    .string()
    .min(2, 'Address is required')
    .max(INPUT_LIMITS.ADDRESS_MAX, 'Address too long'),
  addressLine2: z.string().max(INPUT_LIMITS.ADDRESS_MAX, 'Address too long').optional(),
  city: z.string().min(2, 'City is required').max(INPUT_LIMITS.CITY_MAX, 'City name too long'),
  postalCode: z
    .string()
    .min(3, 'Postal code is required')
    .max(INPUT_LIMITS.POSTAL_CODE_MAX, 'Postal code too long'),
  country: z.string().length(2, 'Country must be 2-letter code'),
  phone: PhoneSchema,
});

// Login form validation schema
export const LoginSchema = z.object({
  email: EmailSchema,
  password: z
    .string()
    .min(1, 'Password required')
    .max(INPUT_LIMITS.PASSWORD_MAX, 'Password too long'),
});

// User profile update schema
// FIX-012: All string fields now have max length constraints
export const UpdateProfileSchema = z.object({
  firstName: z.string().min(2).max(INPUT_LIMITS.NAME_MAX).optional(),
  lastName: z.string().min(2).max(INPUT_LIMITS.NAME_MAX).optional(),
  addressStreet: z.string().max(INPUT_LIMITS.ADDRESS_MAX).optional(),
  addressPostalCode: z.string().max(INPUT_LIMITS.POSTAL_CODE_MAX).optional(),
  addressCity: z.string().max(INPUT_LIMITS.CITY_MAX).optional(),
  addressCountry: z.string().length(2).optional(),
  phone: z
    .string()
    .max(INPUT_LIMITS.PHONE_MAX)
    .regex(/^\+?[\d\s\-().]*$/, 'Invalid phone format')
    .optional(),
  taxId: z.string().max(INPUT_LIMITS.TAX_ID_MAX).optional(),
  language: z.enum(['en', 'de']).optional(),
});

// Forgot password schema
export const ForgotPasswordSchema = z.object({
  email: EmailSchema,
});

// Reset password schema
export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: PasswordSchema,
});

// Pagination query params schema
export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sort: z.string().max(50).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

// Type exports from schemas
export type SignupInput = z.infer<typeof SignupSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
