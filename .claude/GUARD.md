# GUARD.md — Security Rules & Protections

> This file defines the security boundaries the agent NEVER crosses.
> Based on: Veracode 2025 (45% AI code has OWASP vulns), Stanford CCS 2023
> (AI users write less secure code with more confidence), and Escape.tech
> (2,000+ vulnerabilities in 5,600 vibe-coded apps).

---

## Security Mindset

You operate under the assumption that:

1. **Every input is an attack** until validated
2. **Every dependency is compromised** until verified
3. **Every error message is a data leak** until sanitized
4. **Every endpoint is public** until explicitly protected
5. **Every "temporary" security bypass becomes permanent**

---

## OWASP Top 10 — Active Defenses

### A01: Broken Access Control

- Every endpoint checks authentication AND authorization
- Never rely on client-side access control
- Default deny: block access unless explicitly granted
- Always verify resource ownership: `WHERE user_id = $authenticated_user`
- RLS policies must be tested with malicious queries, not just "enabled"
- Never use sequential/guessable IDs for sensitive resources (use UUIDv4)

### A02: Cryptographic Failures

- Never implement custom cryptography
- Use established libraries: `bcrypt`/`argon2` for passwords, `libsodium` for encryption
- TLS everywhere — no HTTP exceptions
- Never log or expose sensitive data (passwords, tokens, PII)
- Generate random values with cryptographic functions only:
  - JS: `crypto.randomUUID()`, `crypto.getRandomValues()`
  - Python: `secrets.token_urlsafe()`, `secrets.token_hex()`
  - NEVER: `Math.random()`, `random.random()`

### A03: Injection

- **SQL**: Parameterized queries ALWAYS. Never string concatenation.

  ```sql
  -- ✅ CORRECT
  SELECT * FROM users WHERE email = $1

  -- ❌ NEVER
  SELECT * FROM users WHERE email = '${email}'
  ```

- **NoSQL**: Use driver-level query builders, not raw JSON construction
- **OS Commands**: Avoid `exec`/`system` calls. If unavoidable, use allowlists not denylists
- **LDAP/XPath/Template**: Same principle — parameterize, never concatenate

### A04: Insecure Design

- Never trust client-provided data for authorization decisions
- Implement rate limiting on all authentication endpoints
- Business logic validation happens server-side
- Multi-step operations use proper state machines, not client-side flow control

### A05: Security Misconfiguration

- No default credentials in any configuration
- Remove all debug endpoints before production
- Security headers on every response:
  ```
  Content-Security-Policy: default-src 'self'
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  ```
- CORS: specific origins, never `Access-Control-Allow-Origin: *` in production

### A06: Vulnerable Components

- Verify every dependency exists and is legitimate before using
- Check for known CVEs in dependencies
- Pin exact versions (lockfiles committed to repo)
- Regular dependency audits (`npm audit`, `pip audit`, `cargo audit`)
- Remove unused dependencies immediately

### A07: Authentication Failures

- Password requirements: minimum 8 characters, check against breached password lists
- Account lockout after failed attempts (with rate limiting, not permanent lockout)
- Session management:
  - Generate new session ID on login
  - Invalidate session on logout (server-side)
  - Session timeout for inactive users
- Multi-factor authentication for sensitive operations

### A08: Data Integrity Failures

- Verify integrity of all deserialized data
- Never use `pickle`, `yaml.load()` (use `yaml.safe_load()`), or `eval()` for data parsing
- CI/CD pipelines: verify artifact integrity
- Software updates: verify signatures

### A09: Logging & Monitoring Failures

- Log all authentication events (success and failure)
- Log all access control failures
- Log all input validation failures
- NEVER log: passwords, tokens, credit card numbers, PII
- Use structured logging (JSON) with correlation IDs
- Alerting on anomalous patterns

### A10: Server-Side Request Forgery (SSRF)

- Validate and sanitize all URLs before server-side requests
- Use allowlists for permitted external services
- Block requests to internal network ranges (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
- Never pass user-provided URLs directly to server-side HTTP clients

---

## Human-Only Security Zones 🚫

The following areas require HUMAN implementation and review. The agent proposes architecture and provides guidance but DOES NOT write the final implementation:

| Zone                          | Why Human-Only                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| **Authentication flows**      | 72% AI failure rate on Java auth (Veracode); Stanford study shows AI users write less secure auth |
| **Payment processing**        | Financial liability; PCI-DSS compliance requirements                                              |
| **Encryption key management** | Subtle errors cause catastrophic, silent failures                                                 |
| **Access control policies**   | Business logic that AI cannot fully understand from code alone                                    |
| **PII handling / GDPR flows** | Legal compliance requirements vary by jurisdiction                                                |
| **Certificate management**    | Expiry, rotation, pinning decisions require ops context                                           |

**What the agent CAN do for these zones:**

- Propose the architecture and approach
- Write test cases that the implementation must pass
- Review human-written code for common vulnerabilities
- Set up the scaffolding and integration points

---

## Secrets Management

### Never Hardcode

```
# ❌ NEVER — even in "test" code
API_KEY = "sk-12345abcde"
DATABASE_URL = "postgres://admin:password@prod-db:5432/app"

# ✅ ALWAYS
API_KEY = os.environ["API_KEY"]
DATABASE_URL = os.environ["DATABASE_URL"]
```

### Required Protections

- `.env` files in `.gitignore` ALWAYS
- Provide `.env.example` with dummy/placeholder values
- Production secrets in dedicated secret managers (not env files)
- Rotate secrets if they ever appear in: logs, error messages, git history, client-side code
- Pre-commit hooks to catch accidental secret commits (e.g., gitleaks)

---

## Input Validation Rules

### All User Input Must Be:

1. **Type-checked**: Is it the expected type?
2. **Length-limited**: Is it within acceptable bounds?
3. **Format-validated**: Does it match the expected pattern?
4. **Range-checked**: Is it within acceptable numerical limits?
5. **Sanitized**: Are dangerous characters escaped/removed?
6. **Encoded properly**: For the output context (HTML, SQL, URL, JS)

### Validation Placement

```
Client-side validation    → UX only (fast feedback)
Server-side validation    → REQUIRED (actual security)
Database constraints      → REQUIRED (last line of defense)
```

All three layers. Never skip server-side "because the client validates."

---

## Database Security Specifics

### Row Level Security (RLS)

When using Supabase, Postgres RLS, or similar:

```sql
-- ❌ DANGEROUS: Policy exists but is effectively a no-op
CREATE POLICY "users_read" ON profiles FOR SELECT USING (true);

-- ✅ CORRECT: Actually restricts access
CREATE POLICY "users_read_own" ON profiles
  FOR SELECT USING (auth.uid() = user_id);
```

**CRITICAL**: The Lovable CVE (2025) happened because RLS was "enabled" but policies were misconfigured. Always TEST policies with:

1. Unauthenticated requests (should be denied)
2. Authenticated user trying to access another user's data (should be denied)
3. Legitimate access (should be allowed)

### Migration Safety

- Every migration must have a rollback plan
- Test migrations on copy of production data before applying
- Never `DROP TABLE` or `DROP COLUMN` without data backup confirmation
- Add columns as nullable first, then backfill, then add constraints
- The SaaStr lesson: AI agents will execute destructive DDL if not explicitly constrained

---

## Dependency Verification Protocol

Before adding any new package:

```
Step 1: Does this package actually exist?
        → Check official registry (npmjs.com, pypi.org)
        → Verify exact name (watch for typosquatting)

Step 2: Is it what it claims to be?
        → Check repository link matches
        → Check maintainer reputation
        → Check for suspicious install scripts

Step 3: Is it safe?
        → Run `npm audit` / `pip audit` / equivalent
        → Check CVE databases
        → Review open security issues

Step 4: Is it necessary?
        → Can the functionality be achieved with existing deps?
        → Can it be implemented in <50 lines without a dependency?
        → Is the dependency maintained?

Step 5: Pin the version
        → Lock exact version in lockfile
        → Document why this dependency was chosen
```

---

## Emergency Protocols

### If Credentials Are Exposed

1. **STOP** all other work immediately
2. **Alert** the human: 🔴 "Credentials may have been exposed in [location]"
3. **Do not** attempt to "undo" the exposure (git history is permanent)
4. **Recommend**: Immediate rotation of all affected credentials
5. **Audit**: Check for unauthorized access during exposure window

### If Data Breach Suspected

1. **STOP** and alert the human immediately
2. **Preserve** all logs and evidence (do not clean up)
3. **Document** timeline of events
4. **Do not** attempt to fix without human authorization
