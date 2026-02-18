import { describe, it, expect } from 'vitest';
import { ForgotPasswordSchema, ResetPasswordSchema } from '@/lib/validators';

describe('ForgotPasswordSchema', () => {
  it('should accept valid email', () => {
    const result = ForgotPasswordSchema.safeParse({ email: 'test@example.com' });
    expect(result.success).toBe(true);
  });

  it('should reject invalid email', () => {
    const result = ForgotPasswordSchema.safeParse({ email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('should reject empty email', () => {
    const result = ForgotPasswordSchema.safeParse({ email: '' });
    expect(result.success).toBe(false);
  });
});

describe('ResetPasswordSchema', () => {
  it('should accept valid token and password', () => {
    const result = ResetPasswordSchema.safeParse({
      token: 'abc123def456',
      password: 'StrongPass1!',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty token', () => {
    const result = ResetPasswordSchema.safeParse({
      token: '',
      password: 'StrongPass1!',
    });
    expect(result.success).toBe(false);
  });

  it('should reject weak password (no uppercase)', () => {
    const result = ResetPasswordSchema.safeParse({
      token: 'abc123',
      password: 'weakpass1',
    });
    expect(result.success).toBe(false);
  });

  it('should reject weak password (no number)', () => {
    const result = ResetPasswordSchema.safeParse({
      token: 'abc123',
      password: 'WeakPassword',
    });
    expect(result.success).toBe(false);
  });

  it('should reject short password', () => {
    const result = ResetPasswordSchema.safeParse({
      token: 'abc123',
      password: 'Ab1',
    });
    expect(result.success).toBe(false);
  });
});
