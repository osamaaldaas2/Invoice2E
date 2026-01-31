import { z } from 'zod';

// Email validation schema
export const EmailSchema = z.string().email('Invalid email address');

// Password validation schema with complexity requirements
export const PasswordSchema = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number');

// Signup form validation schema
export const SignupSchema = z.object({
    email: EmailSchema,
    password: PasswordSchema,
    firstName: z.string().min(2, 'First name too short'),
    lastName: z.string().min(2, 'Last name too short'),
});

// Login form validation schema
export const LoginSchema = z.object({
    email: EmailSchema,
    password: z.string().min(1, 'Password required'),
});

// User profile update schema
export const UpdateProfileSchema = z.object({
    firstName: z.string().min(2).optional(),
    lastName: z.string().min(2).optional(),
    addressStreet: z.string().optional(),
    addressPostalCode: z.string().max(10).optional(),
    addressCity: z.string().optional(),
    addressCountry: z.string().length(2).optional(),
    phone: z.string().optional(),
    taxId: z.string().optional(),
    language: z.enum(['en', 'de']).optional(),
});

// Pagination query params schema
export const PaginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    sort: z.string().optional(),
    order: z.enum(['asc', 'desc']).optional(),
});

// Type exports from schemas
export type SignupInput = z.infer<typeof SignupSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
