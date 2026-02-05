# Database Documentation
## Invoice2E - PostgreSQL Schema

| Property | Value |
|----------|-------|
| **Version** | 1.0.0 |
| **Last Updated** | 2026-02-01 |
| **Database** | PostgreSQL 15 (Supabase) |
| **Migrations** | 2 files |

---

## 1. Schema Overview

### 1.1 Entity Relationship Diagram

```
┌─────────────┐      1:1      ┌───────────────┐
│    users    │──────────────▶│  user_credits │
│             │               │               │
└──────┬──────┘               └───────────────┘
       │
       │ 1:N
       │
       ├──────────────────────────────────────┐
       │                    │                 │
       ▼                    ▼                 ▼
┌──────────────────┐ ┌──────────────────┐ ┌─────────────────┐
│invoice_extractions│ │payment_transactions│ │   audit_logs   │
│                  │ │                  │ │                 │
└────────┬─────────┘ └──────────────────┘ └─────────────────┘
         │
         │ 1:N
         ▼
┌──────────────────┐
│invoice_conversions│
│                  │
└──────────────────┘

  Phase 4 Tables:
┌──────────────┐      ┌──────────────┐
│  batch_jobs  │      │user_templates│
│              │      │              │
└──────────────┘      └──────────────┘
```

### 1.2 Table Summary

| Table | Rows (Est) | Purpose | RLS |
|-------|------------|---------|-----|
| `users` | N/A | User accounts | ✅ |
| `user_credits` | N/A | Credit balances | ✅ |
| `invoice_extractions` | N/A | AI extraction results | ✅ |
| `invoice_conversions` | N/A | XRechnung outputs | ✅ |
| `payment_transactions` | N/A | Payment history | ✅ |
| `audit_logs` | N/A | Activity tracking | ✅ |
| `batch_jobs` | N/A | Bulk upload jobs | ✅ |
| `user_templates` | N/A | Saved templates | ✅ |

---

## 2. Table Definitions

### 2.1 users

**Migration:** [001_initial_schema.sql](file:///c:/Users/osama/Desktop/Invoice2E.1/db/migrations/001_initial_schema.sql)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `uuid_generate_v4()` | Primary key |
| `email` | VARCHAR(255) | NO | - | Unique email |
| `password_hash` | VARCHAR(255) | NO | - | bcrypt hash |
| `first_name` | VARCHAR(255) | NO | - | First name |
| `last_name` | VARCHAR(255) | NO | - | Last name |
| `address_line1` | VARCHAR(255) | YES | - | Street address |
| `address_line2` | VARCHAR(255) | YES | - | Address line 2 |
| `city` | VARCHAR(255) | YES | - | City |
| `postal_code` | VARCHAR(20) | YES | - | Postal code |
| `country` | VARCHAR(2) | YES | - | ISO country code |
| `phone` | VARCHAR(20) | YES | - | Phone number |
| `tax_id` | VARCHAR(50) | YES | - | Tax ID / VAT |
| `language` | VARCHAR(5) | NO | `'en'` | Preferred language |
| `role` | user_role | NO | `'user'` | user/admin/super_admin |
| `is_banned` | BOOLEAN | NO | `FALSE` | Account suspended |
| `banned_at` | TIMESTAMP | YES | - | When banned |
| `banned_reason` | TEXT | YES | - | Reason for ban |
| `last_login_at` | TIMESTAMP | YES | - | Last login time |
| `login_count` | INTEGER | NO | `0` | Total logins |
| `created_at` | TIMESTAMP | NO | `CURRENT_TIMESTAMP` | Creation time |
| `updated_at` | TIMESTAMP | NO | `CURRENT_TIMESTAMP` | Last update |

**Indexes:**
- `idx_users_email` - UNIQUE index on `email`
- `idx_users_role` - Index on `role`
- `idx_users_is_banned` - Partial index on `is_banned` WHERE `is_banned = TRUE`

---

### 2.2 user_credits

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `uuid_generate_v4()` | Primary key |
| `user_id` | UUID | NO | - | FK → users.id |
| `available_credits` | INT | NO | `0` | Current balance |
| `used_credits` | INT | NO | `0` | Total spent |
| `credits_expiry_date` | DATE | YES | - | Expiration date |
| `created_at` | TIMESTAMP | NO | `CURRENT_TIMESTAMP` | Creation time |
| `updated_at` | TIMESTAMP | NO | `CURRENT_TIMESTAMP` | Last update |

**Indexes:**
- `idx_user_credits_user_id` on `user_id`

---

### 2.3 invoice_extractions

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `uuid_generate_v4()` | Primary key |
| `user_id` | UUID | NO | - | FK → users.id |
| `extraction_data` | JSONB | NO | - | AI-extracted fields |
| `confidence_score` | FLOAT | YES | - | 0.0 - 1.0 score |
| `gemini_response_time_ms` | INT | YES | - | API latency |
| `status` | VARCHAR(50) | NO | `'pending'` | Processing status |
| `error_message` | TEXT | YES | - | Error details |
| `created_at` | TIMESTAMP | NO | `CURRENT_TIMESTAMP` | Creation time |
| `updated_at` | TIMESTAMP | NO | `CURRENT_TIMESTAMP` | Last update |

**Indexes:**
- `idx_invoice_extractions_user_id` on `user_id`

---

### 2.4 invoice_conversions

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `uuid_generate_v4()` | Primary key |
| `user_id` | UUID | NO | - | FK → users.id |
| `extraction_id` | UUID | NO | - | FK → invoice_extractions.id |
| `invoice_number` | VARCHAR(100) | YES | - | Invoice number |
| `buyer_name` | VARCHAR(255) | YES | - | Buyer company |
| `conversion_format` | VARCHAR(10) | YES | - | CII or UBL |
| `validation_status` | VARCHAR(50) | YES | - | valid/invalid |
| `validation_errors` | JSONB | YES | - | Error details |
| `conversion_status` | VARCHAR(50) | YES | - | Status |
| `credits_used` | INT | NO | `1` | Credits consumed |
| `processing_time_ms` | INT | YES | - | Conversion time |
| `xml_file_path` | TEXT | YES | - | Storage path |
| `email_sent` | BOOLEAN | NO | `FALSE` | Delivery status |
| `email_sent_at` | TIMESTAMP | YES | - | Sent time |
| `email_recipient` | VARCHAR(255) | YES | - | Email address |
| `file_download_triggered` | BOOLEAN | NO | `FALSE` | Downloaded? |
| `download_triggered_at` | TIMESTAMP | YES | - | Download time |
| `created_at` | TIMESTAMP | NO | `CURRENT_TIMESTAMP` | Creation time |
| `updated_at` | TIMESTAMP | NO | `CURRENT_TIMESTAMP` | Last update |

**Indexes:**
- `idx_invoice_conversions_user_id` on `user_id`
- `idx_invoice_conversions_extraction_id` on `extraction_id`

---

### 2.5 payment_transactions

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `uuid_generate_v4()` | Primary key |
| `user_id` | UUID | NO | - | FK → users.id |
| `stripe_payment_id` | VARCHAR(255) | YES | - | Stripe session ID |
| `paypal_order_id` | VARCHAR(255) | YES | - | PayPal order ID |
| `amount` | DECIMAL(10,2) | NO | - | Payment amount |
| `currency` | VARCHAR(3) | NO | `'EUR'` | Currency code |
| `credits_purchased` | INT | NO | - | Credits bought |
| `payment_method` | VARCHAR(50) | YES | - | stripe/paypal |
| `payment_status` | VARCHAR(50) | YES | - | pending/completed/failed |
| `email` | VARCHAR(255) | YES | - | Receipt email |
| `receipt_url` | TEXT | YES | - | Receipt link |
| `created_at` | TIMESTAMP | NO | `CURRENT_TIMESTAMP` | Creation time |
| `updated_at` | TIMESTAMP | NO | `CURRENT_TIMESTAMP` | Last update |

**Indexes:**
- `idx_payment_transactions_user_id` on `user_id`

---

### 2.6 audit_logs

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `uuid_generate_v4()` | Primary key |
| `user_id` | UUID | YES | - | FK → users.id (nullable) |
| `action` | VARCHAR(255) | NO | - | Action name |
| `resource_type` | VARCHAR(100) | YES | - | Entity type |
| `resource_id` | VARCHAR(255) | YES | - | Entity ID |
| `changes` | JSONB | YES | - | Field changes |
| `ip_address` | VARCHAR(45) | YES | - | Client IP |
| `user_agent` | TEXT | YES | - | Browser info |
| `created_at` | TIMESTAMP | NO | `CURRENT_TIMESTAMP` | Event time |

**Indexes:**
- `idx_audit_logs_user_id` on `user_id`
- `idx_audit_logs_created_at` on `created_at`

---

### 2.7 batch_jobs (Phase 4)

**Migration:** [002_phase4_features.sql](file:///c:/Users/osama/Desktop/Invoice2E.1/db/migrations/002_phase4_features.sql)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `uuid_generate_v4()` | Primary key |
| `user_id` | UUID | NO | - | FK → users.id |
| `status` | VARCHAR(50) | NO | `'pending'` | Job status |
| `total_files` | INT | NO | `0` | Files in batch |
| `completed_files` | INT | NO | `0` | Processed ok |
| `failed_files` | INT | NO | `0` | Processed fail |
| `results` | JSONB | YES | - | Per-file results |
| `input_file_path` | TEXT | YES | - | Uploaded ZIP |
| `output_file_path` | TEXT | YES | - | Result ZIP |
| `error_message` | TEXT | YES | - | Job error |
| `processing_started_at` | TIMESTAMP | YES | - | Start time |
| `created_at` | TIMESTAMP | NO | `CURRENT_TIMESTAMP` | Creation time |
| `completed_at` | TIMESTAMP | YES | - | Completion time |

**Indexes:**
- `idx_batch_jobs_user_id` on `user_id`
- `idx_batch_jobs_status` on `status`
- `idx_batch_jobs_created_at` on `created_at DESC`

---

### 2.8 admin_audit_logs (Admin System)

**Migration:** [009_admin_system.sql](file:///c:/Users/osama/Desktop/Invoice2E.1/db/migrations/009_admin_system.sql)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `uuid_generate_v4()` | Primary key |
| `admin_user_id` | UUID | NO | - | FK → users.id (admin) |
| `target_user_id` | UUID | YES | - | FK → users.id (target) |
| `action` | VARCHAR(100) | NO | - | Action performed |
| `resource_type` | VARCHAR(50) | NO | - | user/package/transaction/system |
| `resource_id` | VARCHAR(255) | YES | - | Resource ID |
| `old_values` | JSONB | YES | - | Previous state |
| `new_values` | JSONB | YES | - | New state |
| `ip_address` | VARCHAR(45) | YES | - | Admin IP address |
| `user_agent` | TEXT | YES | - | Admin browser info |
| `created_at` | TIMESTAMP | NO | `CURRENT_TIMESTAMP` | Action time |

**Indexes:**
- `idx_admin_audit_admin_id` on `admin_user_id`
- `idx_admin_audit_target_id` on `target_user_id`
- `idx_admin_audit_action` on `action`
- `idx_admin_audit_resource` on `(resource_type, resource_id)`
- `idx_admin_audit_created_at` on `created_at DESC`

---

### 2.9 user_templates (Phase 4)

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `id` | UUID | NO | `uuid_generate_v4()` | Primary key |
| `user_id` | UUID | NO | - | FK → users.id |
| `name` | VARCHAR(100) | NO | - | Template name |
| `description` | TEXT | YES | - | Description |
| `seller_name` | VARCHAR(255) | YES | - | Seller name |
| `seller_email` | VARCHAR(255) | YES | - | Seller email |
| `seller_phone` | VARCHAR(50) | YES | - | Seller phone |
| `seller_tax_id` | VARCHAR(50) | YES | - | Seller VAT |
| `seller_iban` | VARCHAR(34) | YES | - | Bank IBAN |
| `seller_bic` | VARCHAR(11) | YES | - | Bank BIC |
| `seller_address_*` | VARCHAR | YES | - | Seller address |
| `buyer_name` | VARCHAR(255) | YES | - | Buyer name |
| `buyer_*` | VARCHAR | YES | - | Buyer fields |
| `buyer_reference` | VARCHAR(100) | YES | - | Leitweg-ID |
| `payment_terms` | VARCHAR(100) | YES | - | Payment terms |
| `is_default` | BOOLEAN | NO | `FALSE` | Default template |
| `usage_count` | INT | NO | `0` | Times used |
| `created_at` | TIMESTAMP | NO | `CURRENT_TIMESTAMP` | Creation time |
| `updated_at` | TIMESTAMP | NO | `CURRENT_TIMESTAMP` | Last update |

---

## 3. Row-Level Security (RLS)

All tables have RLS enabled. Users can only access their own data.

### 3.1 Policy Pattern

```sql
-- View own data
CREATE POLICY "Users can view own [table]" ON [table]
  FOR SELECT USING (user_id::text = auth.uid()::text);

-- Insert own data
CREATE POLICY "Users can insert own [table]" ON [table]
  FOR INSERT WITH CHECK (user_id::text = auth.uid()::text);

-- Update own data  
CREATE POLICY "Users can update own [table]" ON [table]
  FOR UPDATE USING (user_id::text = auth.uid()::text);
```

### 3.2 Policy Coverage (User Access)

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| users | ✅ own | ❌ | ✅ own | ❌ |
| user_credits | ✅ own | ❌ | ❌ | ❌ |
| invoice_extractions | ✅ own | ✅ own | ❌ | ❌ |
| invoice_conversions | ✅ own | ✅ own | ✅ own | ❌ |
| payment_transactions | ✅ own | ❌ | ❌ | ❌ |
| audit_logs | ✅ own | ❌ | ❌ | ❌ |
| batch_jobs | ✅ own | ✅ own | ✅ own | ❌ |
| user_templates | ✅ own | ✅ own | ✅ own | ✅ own |

### 3.3 Admin Policy Coverage

Admin roles (`admin` and `super_admin`) have elevated access via `is_admin()` function:

| Table | Admin SELECT | Admin UPDATE | Super Admin DELETE |
|-------|--------------|--------------|-------------------|
| users | ✅ all | ✅ all | ❌ |
| user_credits | ✅ all | ✅ all | ❌ |
| invoice_conversions | ✅ all | ❌ | ❌ |
| payment_transactions | ✅ all | ✅ all | ❌ |
| credit_packages | ✅ all (inc. inactive) | ✅ all | ✅ super_admin only |
| admin_audit_logs | ✅ all | ❌ | ❌ |

**Admin RLS Pattern:**
```sql
CREATE POLICY "Users view own or admins view all" ON table_name
  FOR SELECT USING (
    user_id::text = auth.uid()::text
    OR is_admin(auth.uid()::uuid)
  );
```

---

## 4. Database Functions

### 4.1 deduct_credits

**Purpose:** Atomically deduct credits from user balance

```sql
deduct_credits(p_user_id UUID, p_amount INT) RETURNS BOOLEAN
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `p_user_id` | UUID | User ID |
| `p_amount` | INT | Credits to deduct |
| **Returns** | BOOLEAN | Success status |

**Behavior:**
1. Acquires row lock (`FOR UPDATE`)
2. Checks if `available_credits >= p_amount`
3. Deducts from `available_credits`
4. Adds to `used_credits`
5. Returns `FALSE` if insufficient credits

### 4.2 add_credits

**Purpose:** Add credits after payment (with upsert)

```sql
add_credits(p_user_id UUID, p_amount INT) RETURNS BOOLEAN
```

**Behavior:**
- INSERTs if no record exists
- UPDATEs (adds to) existing balance

### 4.3 get_user_stats

**Purpose:** Calculate user analytics

```sql
get_user_stats(p_user_id UUID) RETURNS TABLE(...)
```

**Returns:**
| Column | Type | Description |
|--------|------|-------------|
| `total_conversions` | BIGINT | All conversions |
| `successful_conversions` | BIGINT | Valid count |
| `failed_conversions` | BIGINT | Invalid count |
| `total_credits_used` | BIGINT | Credits spent |
| `success_rate` | NUMERIC | % success |
| `avg_processing_time` | NUMERIC | Avg ms |

### 4.4 is_admin (Admin System)

**Purpose:** Check if user has admin role (for RLS policies)

```sql
is_admin(check_user_id UUID) RETURNS BOOLEAN
```

**Behavior:**
- Returns TRUE if user role is `admin` or `super_admin`
- Returns FALSE if user is banned
- SECURITY DEFINER for RLS policy usage

### 4.5 is_super_admin (Admin System)

**Purpose:** Check if user has super admin role

```sql
is_super_admin(check_user_id UUID) RETURNS BOOLEAN
```

**Behavior:**
- Returns TRUE only if user role is `super_admin`
- Returns FALSE if user is banned
- SECURITY DEFINER for RLS policy usage

### 4.6 increment_login_count (Admin System)

**Purpose:** Atomically update login statistics

```sql
increment_login_count(p_user_id UUID) RETURNS INTEGER
```

**Behavior:**
- Increments `login_count` by 1
- Updates `last_login_at` to current timestamp
- Returns new login count

### 4.7 admin_modify_credits (Admin System)

**Purpose:** Admin credit modification with audit trail

```sql
admin_modify_credits(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_amount INTEGER,
    p_reason TEXT,
    p_ip_address VARCHAR(45),
    p_user_agent TEXT
) RETURNS TABLE(new_balance INTEGER, audit_log_id UUID)
```

**Behavior:**
1. Verifies admin has permission via `is_admin()`
2. Acquires row lock on user credits
3. Calculates new balance (prevents negative)
4. Updates credits record
5. Creates audit log entry
6. Returns new balance and audit log ID

### 4.8 setup_first_admin (Admin System)

**Purpose:** One-time setup for first super admin

```sql
setup_first_admin(admin_email VARCHAR(255)) RETURNS TEXT
```

**Usage:**
```sql
SELECT setup_first_admin('admin@example.com');
```

**Behavior:**
- Only works if no super_admin exists yet
- Promotes specified user to super_admin role

---

## 5. Analytics Views

### 5.1 user_daily_stats

Daily conversion statistics per user.

```sql
SELECT * FROM user_daily_stats WHERE user_id = 'xxx';
```

| Column | Description |
|--------|-------------|
| `user_id` | User ID |
| `date` | Date (YYYY-MM-DD) |
| `total_conversions` | Daily count |
| `successful` | Valid conversions |
| `failed` | Invalid conversions |
| `credits_used` | Daily credits |
| `avg_processing_time` | Avg latency |

### 5.2 user_format_stats

Format distribution per user.

| Column | Description |
|--------|-------------|
| `user_id` | User ID |
| `conversion_format` | CII or UBL |
| `count` | Usage count |
| `percentage` | % of total |

---

## 6. Triggers

All tables with `updated_at` column have auto-update triggers.

```sql
CREATE TRIGGER update_[table]_updated_at
  BEFORE UPDATE ON [table]
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

**Tables with triggers:**
- users
- user_credits
- invoice_extractions
- invoice_conversions
- payment_transactions
- batch_jobs
- user_templates

---

## 7. Migrations

### Migration History

| Version | File | Description | Date |
|---------|------|-------------|------|
| 001 | `001_initial_schema.sql` | Core tables (6), RLS, functions | 2026-01-31 |
| 002 | `002_phase4_features.sql` | Batch, templates, analytics | 2026-01-31 |
| 009 | `009_admin_system.sql` | Admin roles, audit logs, RLS | 2026-02-05 |

### Running Migrations

```bash
# Via Supabase CLI
supabase db push

# Or manually via SQL Editor
# Paste migration content
```

---

## Document References

| Document | Path |
|----------|------|
| Architecture | [01-software-architecture.md](./01-software-architecture.md) |
| Technical Design | [02-technical-design.md](./02-technical-design.md) |
| API Reference | [03-development/02-api-reference.md](../03-development/02-api-reference.md) |
