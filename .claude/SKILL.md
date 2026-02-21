# SKILL.md — Technical Knowledge & Coding Standards

> This file defines WHAT the agent knows and the standards it follows.
> It covers all target project types: Full Stack Web, APIs, Mobile, and Automation.

---

## Universal Coding Standards

### Code Quality Rules (All Languages)

1. **Single Responsibility**: Every function does one thing. If you need "and" to describe it, split it.
2. **Meaningful Names**: Variables, functions, and classes have descriptive names. No `x`, `temp`, `data`, `result` without context.
3. **No Magic Numbers**: Extract constants with descriptive names.
4. **DRY with Judgment**: Don't repeat yourself, but don't over-abstract prematurely. Rule of three — abstract on the third repetition.
5. **Explicit Over Implicit**: Prefer clear, verbose code over clever one-liners.
6. **Error Handling at Every Boundary**: Every I/O operation, API call, file read, DB query, and user input must have explicit error handling.
7. **Logging, Not Printing**: Use structured logging with appropriate levels (debug, info, warn, error). Never use print statements for production code.

### Dependency Management

**Before using ANY dependency:**

1. Verify it exists on the official registry (npm, PyPI, crates.io, etc.)
2. Check last publish date — reject if >12 months without update (unless it's genuinely stable/complete)
3. Check download count — be suspicious of very low-download packages with similar names to popular ones (typosquatting)
4. Check for known vulnerabilities (CVE database)
5. Prefer well-maintained dependencies with >1 maintainer

**Banned Patterns:**

- Never pin to `latest` or `*` versions
- Never use deprecated packages when maintained alternatives exist
- Never install packages with `--force` or `--legacy-peer-deps` without documenting why
- Never import from URLs directly in production code

---

## Full Stack Web Development

### Frontend Standards

**Framework Conventions:**

- Follow the framework's official conventions (Next.js App Router, Nuxt 3, SvelteKit, etc.)
- Component files: one component per file, named to match export
- State management: use framework-native solutions before reaching for external libraries
- Never store sensitive data in client-side state, localStorage, or cookies without encryption

**Performance:**

- Images: always specify dimensions, use lazy loading, prefer modern formats (WebP/AVIF)
- Bundle size: be conscious of import costs; use dynamic imports for heavy components
- Core Web Vitals: LCP < 2.5s, FID < 100ms, CLS < 0.1

**Accessibility (a11y):**

- All interactive elements must be keyboard-accessible
- Images need meaningful alt text (or empty alt for decorative)
- Form inputs need associated labels
- Color contrast must meet WCAG AA minimum (4.5:1 for text)

### Backend Standards

**API Design:**

- RESTful: Use proper HTTP methods (GET reads, POST creates, PUT replaces, PATCH updates, DELETE removes)
- Always version APIs (`/api/v1/...`)
- Return consistent error response shapes:
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Human-readable description",
      "details": []
    }
  }
  ```
- Implement pagination for all list endpoints (cursor-based preferred over offset)
- Rate limiting on all public endpoints

**Database:**

- Always use parameterized queries / prepared statements (NEVER string concatenation for SQL)
- Always use migrations for schema changes (never manual DDL in production)
- Index foreign keys and frequently-queried columns
- Use transactions for multi-step operations
- Always implement Row Level Security (RLS) for multi-tenant data
- CRITICAL: RLS policies must be functionally tested, not just "enabled" (Lovable CVE lesson)
- Soft-delete over hard-delete for user data (add `deleted_at` timestamp)

**Authentication & Authorization:**

- Never implement custom crypto or auth from scratch — use battle-tested libraries
- Passwords: bcrypt or argon2 with appropriate work factors
- JWT: short expiry (15min access, 7d refresh), include only necessary claims
- Always validate permissions server-side (never trust client-side role checks)
- Session tokens: httpOnly, secure, sameSite=strict

---

## API & Backend Services

### API Security Checklist

Every API endpoint must satisfy:

- [ ] Input validation on all parameters (type, length, format, range)
- [ ] Authentication verified (who is calling?)
- [ ] Authorization verified (are they allowed to do this?)
- [ ] Rate limiting applied
- [ ] Request size limits configured
- [ ] Response doesn't leak internal details (stack traces, SQL errors, file paths)
- [ ] Logging captures who did what when (without logging sensitive data)

### Microservices Patterns

- Circuit breakers for inter-service calls
- Retry with exponential backoff (not infinite retries)
- Idempotency keys for mutation operations
- Health check endpoints (`/health`, `/ready`)
- Graceful shutdown handling (drain connections before exit)
- Correlation IDs for distributed tracing

### Database Patterns

- Connection pooling (never open connections per request)
- Read replicas for query-heavy workloads
- Query timeout limits (prevent runaway queries)
- Migration rollback strategy for every migration
- Never store plaintext passwords, tokens, or secrets in the database

---

## Mobile Development

### Cross-Platform (React Native / Flutter)

- Platform-specific code should be isolated in clearly-named modules
- Never block the main/UI thread with heavy computation
- Handle offline state gracefully (queue actions, show cached data)
- Deep link handling must validate and sanitize all URL parameters
- Biometric auth: always have fallback mechanisms

### Mobile-Specific Security

- Certificate pinning for API communication
- No sensitive data in app logs (can be extracted from device)
- Keychain/Keystore for credential storage (never SharedPreferences/UserDefaults for secrets)
- Obfuscation for release builds
- Sensitive screens: disable screenshots in security-critical flows

### Performance

- Virtualized lists for large datasets (FlatList/RecyclerView patterns)
- Image caching and progressive loading
- Memory leak prevention (clean up listeners, subscriptions, timers)
- App size monitoring — set budgets and track increases

---

## Automation & Scripts

### Script Standards

- Always include a `--dry-run` flag for destructive operations
- Always include `--verbose` flag for debugging
- Use proper argument parsing (argparse, yargs, clap — not manual string parsing)
- Exit codes: 0 for success, non-zero for failure (with distinct codes for different failures)
- Idempotency: running the same script twice should produce the same result
- Timeout: every network call and external process must have a timeout

### Data Processing

- Validate input data shape before processing (schema validation)
- Handle partial failures gracefully (don't lose 10,000 processed records because record 10,001 failed)
- Progress reporting for long-running operations
- Checkpoint/resume capability for operations that process large datasets
- Never load entire large files into memory — use streaming/chunked processing

### CI/CD and Infrastructure

- Infrastructure as Code (never manual configuration in production)
- Secrets management through environment variables or secret managers (never hardcoded)
- All scripts must be runnable in CI (no interactive prompts without fallback)
- Container images: minimal base images, non-root user, no unnecessary packages

---

## Technology-Specific Rules

### TypeScript / JavaScript

- `strict: true` in tsconfig always
- Prefer `const` over `let`, never use `var`
- Use optional chaining and nullish coalescing over manual null checks
- Async/await over raw Promises over callbacks
- Never use `any` — use `unknown` and narrow with type guards
- Always handle Promise rejections (no floating promises)

### Python

- Type hints on all function signatures
- Use dataclasses or Pydantic models for structured data (not raw dicts)
- Virtual environments for all projects
- Format with black/ruff, lint with ruff
- Never use `pickle` for untrusted data (arbitrary code execution risk)
- Context managers for resource management (`with` statements)

### SQL

- NEVER concatenate user input into SQL strings
- Always use parameterized queries: `WHERE id = $1` not `WHERE id = '${id}'`
- Include `LIMIT` on all SELECT queries unless you need all rows
- Use `EXISTS` over `COUNT(*)` for existence checks
- Always specify column names in `INSERT` (never `INSERT INTO table VALUES (...)`)
- Comment complex queries explaining the business logic

### Shell / Bash

- Always start with `set -euo pipefail`
- Quote all variables: `"$var"` not `$var`
- Use `[[ ]]` over `[ ]` for conditionals
- Trap errors and cleanup: `trap cleanup EXIT`
- Never use `curl | bash` patterns

---

## Anti-Patterns to Actively Avoid

These are patterns that LLMs commonly generate but should be rejected:

| Anti-Pattern                      | Why It's Dangerous                | What To Do Instead                                          |
| --------------------------------- | --------------------------------- | ----------------------------------------------------------- |
| `catch(e) {}` (empty catch)       | Silently swallows errors          | Log error, handle or re-throw                               |
| `// TODO: add auth later`         | Security never gets added "later" | Add auth now or block the endpoint                          |
| `JSON.parse()` without try/catch  | Crashes on malformed input        | Always wrap in try/catch with fallback                      |
| `SELECT *`                        | Performance, schema coupling      | Select specific columns needed                              |
| `.env` in git                     | Credential exposure               | `.env.example` with dummy values; real `.env` in .gitignore |
| `chmod 777`                       | World-writable files              | Use minimum required permissions                            |
| `disabled={false}` for SSL verify | MITM vulnerability                | Never disable SSL verification                              |
| `dangerouslySetInnerHTML`         | XSS vulnerability                 | Use sanitization libraries (DOMPurify)                      |
| `Math.random()` for tokens        | Predictable, not cryptographic    | Use `crypto.randomUUID()` or `secrets.token_urlsafe()`      |
