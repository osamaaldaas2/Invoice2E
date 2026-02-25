/**
 * Zod schemas for POST route input validation (H-001).
 * Centralised to avoid duplication and ensure consistency.
 */
import { z } from 'zod';

// ── Auth ─────────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
  privacyConsent: z.boolean().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8),
  token: z.string().min(1).optional(),
  access_token: z.string().min(1).optional(),
  refresh_token: z.string().min(1).optional(),
});

// ── User / GDPR ──────────────────────────────────────────────────────────────

export const dataDeletionSchema = z.object({
  confirmation: z.literal(true),
});

export const dataExportSchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
});

// ── Payments ─────────────────────────────────────────────────────────────────

export const createCheckoutSchema = z.object({
  packageId: z.string().optional(),
  packageSlug: z.string().optional(),
  method: z.enum(['stripe', 'paypal']).optional(),
  paymentMethod: z.enum(['stripe', 'paypal']).optional(),
});

// ── API Keys ─────────────────────────────────────────────────────────────────

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string().min(1)).min(1),
  expiresAt: z.string().optional(),
});

// ── Invoices ─────────────────────────────────────────────────────────────────

export const batchApplySchema = z.object({
  extractionIds: z.array(z.string()).min(1).max(500),
  fields: z.record(z.string()),
});

export const batchDownloadSchema = z.object({
  extractionIds: z.array(z.string().uuid()).min(1).max(100),
  format: z.string().optional(),
});

export const batchFormatSchema = z.object({
  extractionIds: z.array(z.string().uuid()).min(1).max(100),
  outputFormat: z.string().min(1),
});

export const batchValidateSchema = z.object({
  extractionIds: z.array(z.string().uuid()).min(1).max(100),
});

export const templateSchema = z
  .object({
    name: z.string().min(1).max(200),
  })
  .passthrough();

// ── Vouchers ─────────────────────────────────────────────────────────────────

export const redeemVoucherSchema = z.object({
  code: z.string().min(1).max(50),
});

// ── Internal ─────────────────────────────────────────────────────────────────

export const batchWorkerSchema = z.object({
  batchId: z.string().uuid(),
  extractionId: z.string().uuid().optional(),
});

// ── Helper ───────────────────────────────────────────────────────────────────

/**
 * Parse and validate request body with a Zod schema.
 * Returns { success: true, data } or { success: false, error: string }.
 */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<{ success: true; data: z.infer<T> } | { success: false; error: string }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { success: false, error: 'Invalid JSON body' };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return { success: false, error: msg };
  }
  return { success: true, data: result.data };
}
