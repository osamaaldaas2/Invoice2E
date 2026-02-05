# Security & Compliance Documentation
## Invoice2E - Security Specifications

| Property | Value |
|----------|-------|
| **Version** | 1.0.0 |
| **Last Updated** | 2026-02-01 |
| **Compliance** | GDPR, XRechnung Standards |

---

## 1. Authentication & Authorization

### 1.1 Authentication Flow

```
┌──────────┐     ┌───────────────┐     ┌──────────┐
│  Client  │────▶│ Custom Auth   │────▶│ Database │
│          │◀────│ (bcrypt+HMAC) │◀────│          │
└──────────┘     └───────────────┘     └──────────┘
     │                   │
     │  Session Cookie   │
     │◀──────────────────┘
     │
     ▼
┌──────────┐
│   API    │
│  Routes  │
└──────────┘
```

### 1.2 Session Configuration

| Property | Value |
|----------|-------|
| Algorithm | HMAC-SHA256 |
| Expiry | 24 hours |
| Storage | HttpOnly cookie |
| Payload | userId, email, firstName, lastName, role |

### 1.3 Password Requirements

- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

### 1.4 Role-Based Authorization (Admin System)

**User Roles:**
| Role | Description | Access Level |
|------|-------------|--------------|
| `user` | Standard user | Own data only |
| `admin` | Administrator | All user data, management |
| `super_admin` | Super Administrator | Full access, destructive ops |

**Authorization Functions:**
| Function | Purpose | Throws |
|----------|---------|--------|
| `requireAdmin()` | Verify admin or super_admin role | 401/403 |
| `requireSuperAdmin()` | Verify super_admin role only | 401/403 |

**Protected Operations:**
| Operation | Required Role |
|-----------|---------------|
| View dashboard stats | admin |
| View/manage users | admin |
| Modify user credits | admin |
| Ban/unban users | admin |
| Create/update packages | admin |
| Delete packages | super_admin |
| Refund transactions | super_admin |
| Change user roles | super_admin |

### 1.5 Admin Audit Logging

All admin actions are logged to `admin_audit_logs` table:
- Admin user ID
- Target user ID (if applicable)
- Action performed
- Before/after values (JSONB)
- IP address
- User agent
- Timestamp

**Logged Actions:**
- `user_banned`, `user_unbanned`
- `credits_added`, `credits_removed`
- `role_changed`
- `transaction_refunded`
- `package_created`, `package_updated`, `package_deleted`

---

## 2. Data Protection

### 2.1 Encryption

| Data State | Method |
|------------|--------|
| In Transit | TLS 1.3 |
| At Rest | AES-256 (Supabase) |
| Passwords | bcrypt (cost 12) |

### 2.2 Sensitive Data Handling

| Data Type | Storage | Access |
|-----------|---------|--------|
| Passwords | Hashed (bcrypt) | Never retrieved |
| API Keys | Env variables | Server-side only |
| Invoice Data | Encrypted DB | RLS protected |
| Payment Info | Not stored | Stripe/PayPal handles |

---

## 3. Row-Level Security (RLS)

### 3.1 Policy Pattern

All tables implement RLS policies ensuring users can only access their own data.

```sql
-- Example: Users can only view their own data
CREATE POLICY "Users can view own data" ON table_name
  FOR SELECT USING (user_id::text = auth.uid()::text);
```

### 3.2 Table Policies (User Access)

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| users | Own only | ❌ | Own only | ❌ |
| user_credits | Own only | ❌ | ❌ | ❌ |
| invoice_extractions | Own only | Own only | ❌ | ❌ |
| invoice_conversions | Own only | Own only | Own only | ❌ |
| payment_transactions | Own only | ❌ | ❌ | ❌ |
| user_templates | Own only | Own only | Own only | Own only |

### 3.3 Table Policies (Admin Access)

Admin roles have elevated access through `is_admin()` helper function:

| Table | Admin SELECT | Admin UPDATE | Super Admin DELETE |
|-------|--------------|--------------|-------------------|
| users | ✅ All | ✅ All | ❌ |
| user_credits | ✅ All | ✅ All | ❌ |
| invoice_conversions | ✅ All | ❌ | ❌ |
| payment_transactions | ✅ All | ✅ All | ❌ |
| credit_packages | ✅ All (inc. inactive) | ✅ All | ✅ super_admin only |
| admin_audit_logs | ✅ All | ❌ | ❌ |

**Admin RLS Pattern:**
```sql
CREATE POLICY "Users view own or admins view all" ON table_name
  FOR SELECT USING (
    user_id::text = auth.uid()::text
    OR is_admin(auth.uid()::uuid)
  );
```

---

## 4. API Security

### 4.1 Rate Limiting

| Endpoint | Limit |
|----------|-------|
| General API | 100/min |
| File upload | 10/min |
| Authentication | 5/min |

### 4.2 Input Validation

All inputs validated using Zod schemas:

```typescript
const SignupSchema = z.object({
    email: z.string().email(),
    password: PasswordSchema,
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100)
});
```

### 4.3 Error Handling

- Never expose stack traces in production
- Generic error messages for security failures
- Detailed logging on server side only

---

## 5. XRechnung Compliance

### 5.1 BR-DE Rules Implemented

| Rule | Description |
|------|-------------|
| BR-DE-2 | Seller contact required |
| BR-DE-3 | Seller city required |
| BR-DE-4 | Seller postal code required |
| BR-DE-15 | Buyer reference (Leitweg-ID) required |
| BR-DE-21 | XRechnung 3.0 profile required |
| BR-DE-23-a | IBAN required for credit transfer |

### 5.2 Validation

Generated XML is validated against:
- EN16931 Business Rules
- XRechnung 3.0 Schematron
- CII/UBL Schema

---

## 6. GDPR Compliance

### 6.1 Data Subject Rights

| Right | Implementation |
|-------|----------------|
| Access | Export via dashboard |
| Rectification | Profile editing |
| Erasure | Account deletion |
| Portability | Data export |

### 6.2 Data Processing

| Data | Purpose | Retention |
|------|---------|-----------|
| User profile | Account management | Until deletion |
| Invoice data | Conversion service | 90 days |
| Audit logs | Security | 1 year |
| Payment data | Billing | 7 years |

### 6.3 Consent

- Explicit consent at registration
- Marketing opt-in separate
- Cookie consent banner

---

## 7. Third-Party Security

### 7.1 Services Used

| Service | Purpose | Security |
|---------|---------|----------|
| Supabase | Database/Auth | SOC 2 Type II |
| Vercel | Hosting | SOC 2 Type II |
| Stripe | Payments | PCI DSS Level 1 |
| PayPal | Payments | PCI DSS Level 1 |
| Google AI | Extraction | Enterprise compliance |
| SendGrid | Email | SOC 2 Type II |

### 7.2 API Key Management

| Key | Rotation | Storage |
|-----|----------|---------|
| Supabase | Annual | Vercel env |
| AI APIs | Quarterly | Vercel env |
| Payment gateways | Quarterly | Vercel env |
| SendGrid | Quarterly | Vercel env |

---

## 8. Security Incident Response

### 8.1 Classification

| Severity | Examples | Response |
|----------|----------|----------|
| Critical | Data breach | Immediate |
| High | Auth bypass | < 1 hour |
| Medium | XSS vulnerability | < 24 hours |
| Low | Minor exposure | Next sprint |

### 8.2 Response Steps

1. **Detect** - Monitor alerts
2. **Contain** - Isolate affected systems
3. **Analyze** - Determine scope
4. **Remediate** - Apply fixes
5. **Notify** - Inform affected users (if required)
6. **Document** - Post-mortem

---

## 9. Security Checklist

### 9.1 Development

- [ ] No secrets in code
- [ ] Input validation on all endpoints
- [ ] Output encoding for XSS
- [ ] SQL parameterization (via Supabase)
- [ ] Error handling without leaks

### 9.2 Deployment

- [ ] HTTPS enforced
- [ ] Security headers configured
- [ ] Environment variables secured
- [ ] Production logging configured

### 9.3 Operations

- [ ] Regular dependency updates
- [ ] Security monitoring enabled
- [ ] Backup verification
- [ ] Access review quarterly

---

## Document References

| Document | Path |
|----------|------|
| Database | [02-architecture/03-database.md](../02-architecture/03-database.md) |
| Operations | [04-operations/02-operations-maintenance.md](../04-operations/02-operations-maintenance.md) |
