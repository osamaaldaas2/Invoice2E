# Hardening a production e-invoicing SaaS platform

**An existing Node.js/TypeScript e-invoicing platform with AI extraction, multi-format validation, and background job processing sits at approximately MVP+ maturity — functional but architecturally fragile for the compliance-critical workloads it serves.** This whitepaper provides a complete architectural blueprint for safe retrofit to enterprise-grade readiness. The system's most critical risks are tenant data isolation in shared background workers, absence of idempotency guarantees in the credit system, and unversioned format engines that cannot safely absorb quarterly Peppol updates. The recommendations below are ordered by risk severity and designed for incremental adoption — every change can be introduced behind feature flags without disrupting the running system.

The platform already demonstrates meaningful capability: multi-format support (UBL, CII, FatturaPA, Peppol), AI-powered extraction via Mistral/Gemini, BullMQ-based job processing, format-specific validators, and a review-convert-download flow with credit mechanics. What follows is the engineering roadmap from "it works" to "it's auditable, resilient, and certifiable."

---

## 1. Architecture that evolves safely under production load

### The modular monolith is the correct retrofit target

The system should be hardened as a **modular monolith**, not decomposed into microservices. Shopify's evolution of their 2.8M+ LOC codebase — handling **32M+ requests/minute** across hundreds of daily deployments — validates this pattern definitively for teams that haven't yet crossed the "design payoff line" where bad structure impedes feature velocity. Martin Fowler's guidance is unambiguous: almost every system built as microservices from scratch ends in serious trouble.

The practical implementation starts with reorganizing code by **business domain rather than technical layer**. Instead of `controllers/`, `services/`, `repositories/`, the top-level structure becomes `extraction/`, `validation/`, `format-generation/`, `conversion/`, `billing/`, `storage/`. Each module exposes a public API via TypeScript barrel exports (`index.ts`) and enforces boundaries using `eslint-plugin-boundaries` or `dependency-cruiser` at CI time. The minimum baseline is domain-organized directories with ESLint import restrictions. The enterprise target adds NX monorepo tooling with per-module builds and tests, separate PostgreSQL schemas per domain, and an in-process event bus for cross-module communication.

Extracting to microservices should happen only when a component has fundamentally different scaling requirements (the format generation engine is stateless and CPU-intensive — a future extraction candidate) or processes data requiring physical isolation (credit/billing with PCI implications). The **strangler fig pattern** governs any extraction: introduce a routing facade, shadow-test new implementations against production traffic, and use feature flags for per-tenant migration control.

**Anti-patterns that will kill this system**: premature microservices decomposition before domain boundaries stabilize (creating a "distributed monolith"); organizing by technical layer instead of business domain (guaranteeing shotgun surgery on every feature); Big Bang rewrites that pause feature development for months while the regulatory landscape shifts beneath you.

### DDD bounded contexts map directly to the invoice lifecycle

Seven bounded contexts emerge naturally from the e-invoicing domain. **Document Ingestion** manages upload and raw file handling with `RawDocument` as its aggregate root. **Extraction** owns AI/ML data extraction and confidence scoring via `ExtractionResult`. **Validation** enforces compliance rules across EN 16931, Peppol BIS, and country-specific CIUS rules through `ValidationReport`. **Format Generation** converts the canonical invoice model to target formats (UBL, CII, FatturaPA) with `FormattedInvoice`. **Invoice Lifecycle** manages the core entity, status tracking, and versioning with `Invoice` as the primary aggregate. **Credit/Billing** handles the credit system via `CreditAccount` and `UsageRecord`. **Storage/Archive** manages retention policies and legal archival through `ArchivedDocument`.

The critical architectural decision is defining a **canonical invoice model aligned with EN 16931's semantic model** (business terms BT-1 through BT-158). This becomes the shared kernel. Every format engine translates between this canonical model and its target format through Anti-Corruption Layers, ensuring format-specific XML namespaces and structural quirks never leak into the core domain. Domain events (`ExtractionCompleted`, `ValidationPassed`, `InvoiceFormatGenerated`, `CreditConsumed`) drive the pipeline forward while maintaining loose coupling between contexts.

### Hexagonal architecture makes the system testable and infrastructure-swappable

The port-and-adapter pattern structures each bounded context into four layers. The **domain layer** (innermost) contains entities, value objects, domain events, and repository interfaces (ports). The **application layer** holds use cases and application services. The **adapter layer** provides controllers, presenters, and gateways. The **infrastructure layer** (outermost) implements the ports with concrete technology: `PostgresInvoiceRepository` implements `InvoiceRepository`, `S3StorageAdapter` implements `StoragePort`, `MistralExtractionAdapter` implements `ExtractionPort`.

Dependency inversion in TypeScript requires a DI container. **Awilix** (v10.x) provides function-based auto-scanning without decorators — the lightest-weight option. **Inversify** (v6.x) offers full-featured IoC with decorator-based injection for teams preferring explicit registration. Architectural boundaries are enforced through TypeScript path aliases (`@/domain/*`, `@/infrastructure/*`) combined with `dependency-cruiser` rules that fail CI when inner layers import outer layers.

### Plugin architecture for format engines prevents shotgun surgery

Format engines must follow the **Strategy + Registry pattern**. Each engine implements a `FormatEngine` interface declaring `formatId`, `version`, `supportedProfiles`, and methods for `generate()`, `parse()`, and `validate()`. A `FormatEngineRegistry` maps format identifiers to engine instances, resolving by format ID or Peppol profile.

Each format engine is versioned independently using semantic versioning. When Peppol updates BIS Billing from 3.0.19 to **3.0.20** (mandatory by February 23, 2026), the new engine version deploys alongside the old one, controlled by feature flags. Parallel execution (shadow mode) runs both engines, compares outputs, logs discrepancies, and serves the old output until confidence thresholds are met.

The technology stack for XML processing: **fast-xml-parser** (v4.x) for parsing and generation (safe by default against XXE), **saxon-js** (v2.6) for Schematron XSLT validation transforms, and **pdf-lib** (v1.17.x) for Factur-X/ZUGFeRD PDF/A-3 generation. **Risk if not addressed: CRITICAL** — format errors mean rejected invoices, which in Italy's SDI system constitutes invoices "not issued," requiring correction within 5 days under penalty of 90-180% of the VAT amount.

### BullMQ production hardening is a P0 prerequisite

The Redis backing BullMQ must be configured with `maxmemory-policy: noeviction` — the **only acceptable policy**, since BullMQ cannot function if Redis evicts keys. On AWS, this means ElastiCache Redis 7.x+ with cluster mode disabled, `r6g` or `r7g` instance types, AOF persistence enabled with `appendfsync everysec`, and Multi-AZ for high availability.

Worker configuration requires explicit tuning: **concurrency set to match I/O characteristics** (5-10 for I/O-bound AI extraction, 2-4 for CPU-bound format conversion), `lockDuration: 60000` for stall detection, `stalledInterval: 30000`, and `maxStalledCount: 2`. Completed jobs must be cleaned with `removeOnComplete: { age: 3600, count: 1000 }` to prevent Redis memory exhaustion — the single most common BullMQ production failure. Graceful shutdown handling is mandatory for ECS/Kubernetes: `worker.close()` must be called on SIGTERM to allow in-flight jobs to complete.

Job payloads must be kept small — store data in S3/PostgreSQL and pass only reference IDs through Redis. Large payloads cause memory pressure, slow serialization, and Redis replication lag.

---

## 2. Data flow designed for consistency under partial failure

### State machine governance prevents impossible transitions

The invoice lifecycle is a finite state machine: `draft → uploading → extracting → review → converting → validating → validated → storing → stored → archived`, with per-stage failure states (`extraction_failed`, `validation_failed`, `conversion_failed`) carrying retry metadata. **XState v5** is the recommended library for complex workflows with sub-states, guards, and invoked services.

State is persisted in PostgreSQL with a `status` column constrained by CHECK, plus a `version` INTEGER column incremented on every transition for optimistic locking. The critical pattern is **atomic conditional updates**: `UPDATE invoices SET status = 'converting', version = version + 1 WHERE id = $1 AND status = 'review' AND version = $2 RETURNING *`. Zero rows returned means a concurrent modification — retry or error, never silently overwrite.

### Context propagation requires explicit serialization across job boundaries

**AsyncLocalStorage** (Node.js built-in since v16.4.0, ~8% overhead) propagates context within a single process — correlation IDs, tenant IDs, user IDs, and format types flow automatically through async/await chains. However, AsyncLocalStorage **does not cross process boundaries**. BullMQ workers run in separate processes, so context must be serialized into job payloads and re-hydrated on the worker side. This is the most commonly missed pattern: the producer serializes `{ correlationId, tenantId, userId, formatType }` into job data, and the worker wraps its processor in `asyncContext.run(job.data, () => process(job))`.

OpenTelemetry's SDK uses AsyncLocalStorage internally, so trace context propagates automatically within a process. For cross-process propagation, inject W3C Traceparent headers into outbound HTTP calls and serialize trace IDs into BullMQ job payloads.

### Transaction boundaries must match domain operation scope

Single invoice CRUD operations use standard short transactions. **Credit deduction combined with state change** requires pessimistic locking via `SELECT ... FOR UPDATE` on the credit balance row, followed by the deduction and state change in the same transaction. The AI extraction → validation → conversion pipeline spans minutes and must **never** be wrapped in a single transaction (holding locks for the duration of an AI API call is a guaranteed deadlock source).

Instead, this pipeline follows the **saga pattern with orchestration**. Each step is a local transaction with a compensating action: extraction saves results (compensated by clearing extraction data), conversion generates output (compensated by deleting converted files), credit deduction reduces balance (compensated by refund). A `SagaOrchestrator` tracks recovery points in PostgreSQL, enabling resumption from the last completed step after failures.

The **transactional outbox pattern** prevents the dual-write problem (business state change + event publication). Business data and outbox event are written in the same PostgreSQL transaction. A separate poller or CDC process reads unpublished events and delivers them to message consumers, marking them published. This guarantees exactly-once semantics for event-driven flows without distributed transactions.

### Idempotency is the single most important reliability pattern

API-level idempotency follows the **Stripe model**: clients send an `Idempotency-Key` header (UUID). The server upserts a key record with the request hash, locks it with `SELECT ... FOR UPDATE`, and executes the operation through atomic phases with recovery points. If the key exists and the recovery point is "finished," the stored response is returned immediately. Keys are reaped after 24 hours.

BullMQ job idempotency uses two complementary mechanisms: built-in `jobId` deduplication (duplicate job IDs are silently ignored) and **worker-side state checks** that verify the invoice hasn't already been processed before performing work. Database unique constraints provide the final safety net: `CREATE UNIQUE INDEX idx_one_active_processing ON invoice_processing_jobs (invoice_id) WHERE status IN ('pending', 'active')`.

For the credit system specifically, **double deduction and double refund are CRITICAL risks**. Credits must be deducted in the same transaction as the state change that triggers processing. Refunds require a unique constraint on `(invoice_id, refund_reason)` to prevent duplicate issuance.

### Retry policies must distinguish transient from permanent failures

**Cockatiel** (268K+ weekly downloads) provides composable resilience policies: retry with exponential backoff, circuit breakers, timeouts, and bulkhead isolation. For AI extraction calls, the composed policy stack is timeout (30s cooperative) → circuit breaker (open at 50% failure rate over 60s, half-open after 30s) → retry (3 attempts, exponential backoff 1s→30s).

The critical discrimination: **429 Rate Limit** errors respect `Retry-After` headers with up to 5 retries. **500/502/503** errors get exponential backoff with 3 retries. **400 Bad Request** errors are **never retried** (permanent failure). AI hallucination or structurally invalid extraction output is routed to manual review, never retried — re-running the same document through the same model produces the same garbage.

### Batch processing isolates individual failures

Multi-invoice processing creates **one BullMQ job per invoice** with a shared batch tracker in PostgreSQL. When 3 of 50 invoices fail, the other 47 complete independently. Progress tracking updates `completedCount` and `failedCount` atomically on the batch record. A batch completion check fires when `completedCount + failedCount === totalCount`. The API exposes partial results: `{ total: 50, completed: 47, failed: 3, failures: [...] }`. The all-or-nothing batch is the anti-pattern — one corrupt PDF should never block 49 valid invoices.

---

## 3. Security for multi-tenant financial document processing

### Row-Level Security is the non-negotiable tenant isolation boundary

PostgreSQL RLS enforces tenant isolation at the database level, making application-code bypass impossible. Every tenant-scoped table gets `ALTER TABLE invoices ENABLE ROW LEVEL SECURITY` with a policy: `CREATE POLICY tenant_isolation ON invoices USING (tenant_id = current_setting('app.current_tenant')::uuid)`. The application sets `app.current_tenant` at the start of every request via middleware and at the start of **every BullMQ job processor** before any database query.

Three critical requirements: the application must use a **non-superuser database role** (superusers bypass RLS), `FORCE ROW LEVEL SECURITY` must be set on table owners, and with PgBouncer connection pooling, tenant context must be set at **transaction level**, not session level. The shared-schema approach with RLS is recommended for standard tenants; schema-per-tenant isolation is reserved for enterprise customers requiring regulatory separation.

**In BullMQ workers**, tenant data leakage is the highest-probability security failure. Every job payload must include `tenantId` as a mandatory field. The worker sets `app.current_tenant` before any DB query and resets it in a `finally` block. Job payloads must never contain raw invoice data — only reference IDs. Sensitive payloads should be encrypted if Redis is shared across environments.

### XML-specific attacks are the platform's most distinctive threat vector

XXE (XML External Entity) attacks exploit invoice XML to read server files or perform SSRF. The defense is straightforward but format-engine-specific: **fast-xml-parser** is safe by default (no entity processing). **libxmljs2** is unsafe by default and must be configured with `{ noent: false, nonet: true, dtdload: false }`. The platform must **reject any XML containing `<!DOCTYPE` declarations** — legitimate invoice XML never needs DTDs, and stripping them eliminates both XXE and XML bomb (billion laughs) attack surfaces.

For UBL/CII parsing specifically: validate XML namespace URIs against an allowlist (`urn:oasis:names:specification:ubl:*`), validate against XSD schemas only from **locally cached copies** (never fetch schemas from URLs in the document), set maximum document size to 10MB and maximum element depth to 100 levels, and use streaming parsers for large documents.

### AI extraction introduces a novel threat model

**Indirect prompt injection** is the primary AI-specific threat: adversarial invoices embed hidden instructions in text fields, metadata, or invisible PDF text layers. Research shows **56% of prompt injection tests succeed** against production LLMs. Mitigations: sanitize all invoice text before sending to AI providers, use **structured extraction mode** (function calling / structured output) rather than free-text generation, validate all extracted values against expected schemas (amounts must be numbers, dates must be valid dates), and cross-validate extracted data against invoice XML fields where available.

Data exfiltration through AI providers requires contractual and technical controls: ensure Data Processing Agreements (DPAs) with Mistral and Google, use API tiers that **don't use data for model training**, minimize data sent (extract only relevant invoice sections), and log all data transmitted to AI providers for audit. For highest-sensitivity tenants, offer self-hosted model inference as an enterprise option.

### Authentication follows the BFF pattern, never exposing tokens to browsers

The Backend-for-Frontend pattern is strongly recommended per the IETF draft on OAuth 2.0 for browser-based applications. The BFF acts as a confidential OAuth client, handling all OIDC protocol interactions. Tokens never leave the backend. The frontend uses HttpOnly, Secure, SameSite=Strict cookies for session management, with CSRF protection via custom header requirements.

JWTs are validated using the provider's JWKS endpoint with cached key rotation. Validation must check `iss`, `aud`, `exp`, `iat`, and a custom `tenant_id` claim against the request context. API keys are generated as 256-bit cryptographically random tokens, stored as **SHA-256 hashes only**, and prefixed for identification (`einv_live_...`, `einv_test_...`).

RBAC uses **CASL.js** for isomorphic authorization with Prisma integration via `@casl/prisma` for SQL-level filtering. Abilities are defined as tuples: `can('update', 'Invoice', { tenantId: user.tenantId })`. Organization-level roles (owner, admin, member) and project-level roles (editor, viewer, approver) form a hierarchy where project roles inherit from organization membership.

### Rate limiting must be multi-dimensional for AI endpoints

AI extraction endpoints consume 100x more resources than standard API calls and require dedicated protection. The recommended stack uses **rate-limiter-flexible** with Redis (0.7ms average, atomic increments) implementing five layers: global per-IP (1000 req/min against DDoS), per-tenant (500 req/min against noisy neighbors), per-API-key (100 req/min for fine-grained control), per-endpoint (AI extraction = 10 req/min vs. list invoices = 100 req/min), and credit-based (deduct from tenant balance before processing). Sliding window log algorithm on Redis ZSETs provides the accuracy needed for financial operations.

### Encryption operates at three levels

RDS encryption at rest with AWS KMS Customer Managed Keys covers storage, backups, replicas, and snapshots with negligible performance impact (hardware-accelerated AES-NI). Application-level **envelope encryption** protects sensitive fields (tax IDs, bank accounts, IBANs) from anyone with database access: KMS generates a Data Encryption Key, the DEK encrypts the field, and only the encrypted DEK is stored alongside the encrypted data. The minimum baseline encrypts tax IDs and bank details. The enterprise target uses per-tenant CMKs with encryption context for audit.

Secure file handling uses a quarantine pattern: S3 pre-signed PUT URLs with content-type restrictions (`application/pdf` only), size limits (max 25MB), and 5-15 minute expiry upload to a quarantine bucket. An S3 ObjectCreated event triggers a Lambda running ClamAV, which tags objects as CLEAN or INFECTED. A bucket policy denies read access to infected objects. Only clean files are moved to the production bucket. Magic byte validation (`%PDF-`) prevents content-type spoofing.

---

## 4. Observability that enables confident production operation

### Pino provides the structured logging foundation

**Pino** outperforms Winston by 5-10x in benchmarks (10,000+ logs/s with minimal overhead), writes JSON by default, and supports asynchronous logging via worker threads that keep the event loop unblocked. Every log line must include: timestamp, level, message, `correlationId`, `traceId`, `spanId` (from OpenTelemetry), service name, environment, version, `userId`, `tenantId`, hostname, and PID.

PII protection uses Pino's built-in redaction: paths for `req.headers.authorization`, `invoice.taxId`, `invoice.bankAccount`, `invoice.iban`, `user.email`, `*.accessToken`, `*.apiKey`, and `*.secret` are replaced with `[REDACTED]`. The field name remains visible for debugging while the value is suppressed. For e-invoicing, **never log**: full invoice XML content (may contain PII), VAT numbers, bank account numbers, personal addresses, or AI provider API keys.

### OpenTelemetry replaces the AWS X-Ray SDK

AWS X-Ray SDK enters maintenance mode **February 25, 2026**. AWS officially recommends migrating to OpenTelemetry via the AWS Distro (ADOT). The setup uses `@opentelemetry/sdk-node` with `@opentelemetry/auto-instrumentations-node` for HTTP, Express, pg, ioredis, and AWS SDK auto-instrumentation. The `AWSXRayIdGenerator` and `AWSXRayPropagator` ensure X-Ray compatibility. Traces export to X-Ray via the ADOT Collector running as an ECS sidecar.

Manual spans wrap business operations: `extract-invoice`, `validate-invoice`, `convert-invoice` with attributes for `invoice.format`, `ai.provider`, `ai.confidence`, `tenant.id`, and `validation.rule_count`. Auto-instrumentation adds **1-5% overhead**; production sampling at 10% (100% on errors) controls costs while maintaining debugging capability.

### Key metrics divide into business-critical and infrastructure signals

Business metrics that require immediate alerting: `invoice_extraction_total` by status/provider/format (Counter), `invoice_extraction_duration_seconds` (Histogram, buckets 0.5-60s), `invoice_validation_total` by status/format/error_type, `ai_provider_request_total` by provider/status, `ai_provider_retry_total` by provider/attempt, and **`credit_deduction_total`** by status including rollbacks. These are collected via `prom-client` exposing a `/metrics` endpoint, scraped by Prometheus or pushed to CloudWatch as custom metrics.

Infrastructure metrics include BullMQ queue depth per status (waiting, active, delayed, failed), job processing latency histograms, PostgreSQL connection pool utilization, Redis memory usage and connected clients, and Node.js event loop lag and heap usage.

### Alerting follows the Google SRE tiered model

**Page-worthy events** (immediate response required): API error rate exceeding 5% for 5 minutes, extraction queue depth above 1000 and growing, all AI providers failing simultaneously, database connection pool exhausted above 90%, zero successful extractions in 10 minutes during business hours, credit deduction failure rate above 1%.

**Ticket-worthy events** (next business day): single AI provider failure rate above 20% for 30 minutes, extraction p95 latency above 30 seconds, validation failure rate spiking above 2x normal, queue depth growing steadily. Multi-burn-rate alerting prevents both alert fatigue and missed incidents: fast burn (2% error budget consumed per hour) triggers pages, slow burn (10% over 3 days) creates tickets.

### SLOs define the contract with customers

Recommended SLO targets: **API availability at 99.9%** (43.2 minutes monthly downtime budget), API latency p95 under 200ms, extraction success rate at 99.5%, extraction latency p95 under 30 seconds (p99 under 60 seconds), and validation accuracy at 99.9%. Error budget policy governs development velocity: above 50% remaining means normal velocity; 25-50% means increased review; 10-25% triggers feature freeze; below 10% is emergency mode with deployment freeze and all-hands reliability focus.

The dependency chain constrains SLOs: Mistral/Gemini APIs at ~99.5% availability mean extraction SLOs cannot meaningfully exceed 99.5% without provider redundancy. Multi-provider failover (Mistral primary, Gemini fallback) is the path to higher extraction availability.

### Six dashboards provide comprehensive visibility

**System Health** (SRE on-call): RED method panels — request rate, error rate percentage, p50/p95/p99 latency, saturation gauges, traffic lights per service, deployment annotations. **Business Metrics** (Product/Engineering): extraction success/failure by provider, validation failure breakdown by format, conversion success rates, credit consumption trends, AI provider comparison. **Queue Health** (Operations): queue depth per queue, job processing latency histograms, failed job count and DLQ depth, stalled job alerts, worker count vs. active jobs. **SLO Compliance** (Management): SLO status indicators, error budget remaining with burn rate trend, time-to-exhaust projection. **Infrastructure** (Platform): PostgreSQL connections/query latency/table sizes, Redis memory/clients/evictions, Node.js event loop lag/heap/GC pauses. **Audit & Security** (Compliance): login attempts, API key usage, permission changes, data export/deletion requests. The recommended stack is Grafana with Prometheus, Loki, and Tempo (the LGTM stack), with CloudWatch as secondary for AWS-native integration.

---

## 5. Testing that catches compliance regressions before production

### The test pyramid enforces 70/20/10 ratios

**Unit tests (70%)** cover validators, parsers, transformers, and calculation engines using **Vitest** (v3.x) — 10-20x faster than Jest on large TypeScript codebases with native ESM support and a Jest-compatible API. **Integration tests (20%)** cover API routes with real PostgreSQL, worker processors with real Redis, and validator execution against Schematron artifacts. **E2E tests (5-10%)** cover 3-5 critical flows: invoice creation → validation → download, the convert flow, and Peppol submission.

Contract testing between API and workers uses **shared Zod schemas** as the single source of truth for BullMQ job payloads. Both the producer (API that enqueues) and consumer (worker that processes) validate against the same schema at runtime. TypeScript types alone are insufficient — they vanish at compile time, and a mismatched job payload will silently corrupt data at runtime.

### Golden file testing with semantic XML comparison catches format drift

Generated invoice XML is compared against known-good reference files stored in `test/golden/{format}/{scenario}.xml`. The critical requirement: **never use string-based XML comparison**. Parse both XMLs to canonical form (sorted elements, normalized whitespace), replace dynamic values (dates, UUIDs) with placeholders, and deep-compare the canonical structures. `fast-xml-parser` parsing to JavaScript objects followed by deep comparison is the most reliable Node.js approach.

Snapshot testing has specific, well-documented failure modes in evolving format engines: snapshot rot from blind `--update` approvals, brittle tests from whitespace and attribute ordering changes, and format evolution causing mass snapshot updates that mask real regressions. The recommended hybrid: schema validation (XSD + Schematron) for compliance, structural assertions for key business fields, golden file comparison with semantic XML diff for drift detection, and snapshot testing only for small stable structures like error messages. ESLint's `no-large-snapshots` rule should cap snapshots at 20 lines.

### Validator integration testing runs official Schematron artifacts in CI

E-invoicing validation requires three sequential layers: XSD schema validation, EN 16931 Schematron business rules, and format-specific Schematron (Peppol BIS, country CIUS). The **easybill/e-invoice-validator** Docker container exposes validation as an HTTP API and runs as a CI sidecar. Feed generated XML to the validator endpoint and assert both `is_valid: true` and absence of specific error codes. Pin Schematron versions and test against the **next version pre-release** (non-blocking) to provide early warning of upcoming compliance failures.

Test matrices cover `{format} × {scenario} × {spec_version}`: UBL × standard B2B × Peppol 3.0.20, CII × ZUGFeRD Basic × EN 16931 1.3.11, FatturaPA × standard × SDI 1.9. Each cell validates against current Schematron (blocking) and next version (non-blocking).

### CI/CD pipeline enforces 14 stages for compliance-critical deployment

The pipeline progresses through: lint and type-check (2 min), unit tests (3 min), security scan SAST + SCA in parallel (5 min), integration tests with real DB and Redis (10 min), Docker build (5 min), container scan with Trivy (3 min), E2E tests (15 min), migration dry-run against staging-like database, compliance validation with golden files and Schematron, staging deployment, DAST scan with OWASP ZAP (30 min), manual approval gate, production deployment via blue-green or canary, and post-deploy smoke tests with monitoring verification.

Release gates that must pass before production: **100% test pass rate** (unit + integration), code coverage above 70% (enterprise target: 85%), zero SAST critical findings, zero SCA critical CVEs, zero container critical vulnerabilities, migration dry-run passes, all golden file validations pass, all Schematron compliance checks pass, and no secrets detected.

### Chaos testing validates worker resilience

BullMQ workers face specific failure modes that must be tested: Redis disconnection mid-job (tested via Toxiproxy), worker crash during processing (verified by killing processes and confirming job retry), job timeout with stale job handling (tested via short `lockDuration`), duplicate processing from lock expiry (verified via idempotency assertions), and poison pill messages (tested via direct Redis insertion of malformed payloads). **Toxiproxy** (v2.9+) is the primary tool for injecting Redis connection failures and latency into integration tests.

---

## 6. Compliance governance for a shifting regulatory landscape

### The EU e-invoicing regulatory timeline demands proactive format management

The regulatory environment is accelerating. **ViDA (VAT in the Digital Age)**, adopted March 11, 2025, permits Member States to mandate domestic e-invoicing without EU permission starting April 14, 2025, with mandatory Digital Reporting Requirements for intra-EU B2B transactions by **July 1, 2030** and full harmonization of all national systems by January 1, 2035.

Country-specific mandates create immediate platform requirements. **France**: production pilot begins February 23, 2026; all companies must receive e-invoices by September 1, 2026 (large/medium must also issue); SMEs by September 2027. **Germany**: companies above €800K turnover must issue e-invoices by January 1, 2027; all companies by January 2028. **Belgium**: B2B mandatory via Peppol from January 1, 2026. **Italy**: SDI derogation extended to December 2027 with FatturaPA v1.9 effective April 2025.

Peppol BIS Billing follows a **quarterly release cadence** with approximately 3 months between publication and mandatory adoption. The November 2025 release (v3.0.20) becomes mandatory **February 23, 2026**. Rules are introduced as warnings in one release and escalated to fatal errors in subsequent releases, creating a predictable but unforgiving update cycle.

### Validator lifecycle follows a 4-phase transition strategy

**Pre-release (T-90 days)**: subscribe to OpenPeppol release notifications, download draft Schematron from GitHub (ConnectingEurope/eInvoicing-EN16931). **Testing (T-60 days)**: run new rules against the production invoice corpus, identify failures, assess tenant impact. **Parallel validation (T-30 days)**: run both old and new validators simultaneously, log discrepancies without blocking, build confidence in the new rules. **Cutover (T-0)**: switch to the new validator, retain the old one for archived invoice re-validation. **Deprecation (T+90)**: remove the old validator from the active pipeline. The enterprise target automates this entire pipeline: Schematron deployment via CI/CD, differential validation reporting, tenant-configurable rule severity overrides, and regression testing against 10,000+ historical invoices.

### Archived invoices require byte-level immutability with jurisdictional retention

Retention periods vary by jurisdiction: **Italy, Germany, France** require **10 years**; UK requires 6 years (10 for MOSS/digital services); Netherlands 7 years; Spain 4-6 years. Retention starts at the end of the calendar year of invoice issuance.

Archived invoices must be stored byte-for-byte with SHA-256 cryptographic hashes. The original validation result, XSD version, and Schematron version used at validation time are stored alongside. **Archived invoices must never be re-validated against newer schemas** — the original validation result is the legally relevant one. For Italian compliance, conservazione sostitutiva requires qualified electronic signatures and timestamps on archived packets, with a designated Conservation Manager.

The GDPR-retention tension resolves through **pseudonymization**: when a deletion request arrives but legal retention requirements apply, personal identifiers (name, email, address) are replaced with pseudonymous tokens while financial/tax data required by law is retained. The mapping table entry is deleted after the retention period expires. The legal basis is GDPR Article 6(1)(c) — compliance with legal obligations overrides the right to erasure.

### Certification follows a deliberate sequence

**Year 1**: ISO 27001 certification (6-12 months, mandatory prerequisite for Peppol AP status). **Year 1-2**: Peppol Access Point certification including AS4 protocol implementation, SMP/SML support, and Peppol Testbed qualification. **Year 2**: SOC 2 Type II (leveraging ~60-70% overlap with ISO 27001 controls). **Year 2-3**: Country-specific certifications (France PDP/accredited platform, Italy SDI intermediary) based on market priorities.

---

## 7. Maturity assessment, risk inventory, and retrofit roadmap

### Current maturity sits at late MVP, pre-production-hardened

A system matching this description — functional multi-format support, AI extraction, background processing, validators, credit system, recent work on format-aware validation and observability — sits at approximately **Level 2 on a 5-level maturity model**. It works, it serves real users, and it processes real invoices. What it likely lacks: enforced architectural boundaries between domains, idempotency guarantees across the pipeline, formal multi-tenant isolation at the database level, versioned format engines with safe rollout mechanisms, comprehensive observability beyond basic logging, automated compliance validation in CI, and the documentation and controls required for certification audits.

### Top 10 architectural risks

**1. No enforced tenant isolation at database level (CRITICAL).** Without RLS, a single application bug can expose one tenant's invoices to another. In financial document processing, this is an existential risk — a single data breach incident can destroy customer trust irreversibly.

**2. Format engines without versioning or plugin architecture (CRITICAL).** Quarterly Peppol updates and country-specific mandate changes require deploying new format logic alongside existing versions. Without a plugin registry, every format update risks breaking all formats simultaneously.

**3. Missing idempotency in the credit deduction/refund system (CRITICAL).** Double deductions erode customer trust immediately. Double refunds hemorrhage revenue silently. Without idempotency keys and unique constraints on credit operations, both are probabilistically certain under concurrent load.

**4. No saga pattern for the extraction-to-storage pipeline (HIGH).** When AI extraction succeeds but conversion fails, credits may be deducted without producing output. Without compensating transactions and recovery points, partial failures leave the system in inconsistent states requiring manual intervention.

**5. Monolithic code organization by technical layer (HIGH).** Adding a new country format requires changes across controllers, services, repositories, validators, and workers — classic shotgun surgery that makes safe, incremental change impossible.

**6. BullMQ running without production hardening (HIGH).** Missing `noeviction` policy, no graceful shutdown, large job payloads in Redis, and no completed job cleanup will cause cascading failures under production load — Redis memory exhaustion, stalled jobs, and duplicate processing.

**7. No canonical invoice model aligned with EN 16931 (HIGH).** Without a shared semantic model, each format engine reinvents invoice representation, creating inconsistencies and making it impossible to add new formats without understanding all existing formats.

**8. Tight coupling between infrastructure and business logic (MEDIUM-HIGH).** Without hexagonal architecture ports, switching AI providers, changing storage backends, or adding new extraction methods requires modifying core business logic.

**9. No feature flag system for safe rollout (HIGH).** Every deployment is a big-bang release affecting all tenants simultaneously. For a compliance-critical system where a format change can cause invoice rejection, this is an unacceptable blast radius.

**10. Missing architectural boundary enforcement in CI (MEDIUM).** Without `dependency-cruiser` or `eslint-plugin-boundaries`, architectural decisions exist only as conventions that erode with every PR.

### Top 10 operational risks

**1. No structured observability beyond basic logging (CRITICAL).** Without correlation IDs flowing across HTTP → BullMQ → AI providers, diagnosing extraction failures requires manual log correlation across multiple services — hours per incident instead of minutes.

**2. Missing health checks for background workers (CRITICAL).** If a BullMQ worker silently stops processing jobs, queue depth grows until users notice delayed invoices. Without liveness/readiness probes, orchestrators cannot detect or remediate the failure.

**3. No dead letter queue strategy (HIGH).** A single corrupt PDF causing a worker to crash-loop can block the entire extraction queue. Without poison message detection and DLQ routing, one bad document impacts all tenants.

**4. No alerting on business metrics (HIGH).** Without monitoring extraction success rates per AI provider, a Mistral API degradation goes unnoticed until customers report failed extractions.

**5. No SLO definitions or error budgets (HIGH).** Without formal SLOs, there's no objective basis for prioritizing reliability work over feature development, and no mechanism for the feature freeze that should follow a reliability incident.

**6. Missing audit trail for compliance operations (CRITICAL).** Without an immutable audit log capturing every invoice state transition, validation result, and credit operation, the system cannot pass a SOC 2 or ISO 27001 audit.

**7. No automated Schematron validation in CI (HIGH).** Format output changes that violate Peppol rules reach production, causing invoice rejection. The quarterly Peppol update cycle means this risk materializes 4 times per year.

**8. Unmonitored Redis memory and connection health (HIGH).** Redis backing BullMQ is a single point of failure. Without memory usage monitoring and connection pool alerts, an OOM event takes down the entire processing pipeline.

**9. No database migration testing or rollback procedures (HIGH).** A failed migration against production data — especially one that alters invoice tables — can cause extended downtime with compliance implications (invoice processing halted).

**10. No incident response runbooks (MEDIUM-HIGH).** When an AI provider outage or format validation spike occurs at 3 AM, the on-call engineer needs documented procedures — not tribal knowledge — to assess impact, engage circuit breakers, and communicate to affected tenants.

### Prioritized roadmap to enterprise-grade readiness

**Phase 0 — Emergency hardening (Weeks 1-2, zero production risk)**

Enable RLS on all tenant-scoped tables. Configure BullMQ Redis with `maxmemory-policy: noeviction`, enable completed job cleanup, and implement graceful shutdown. Add Pino structured logging with correlation IDs via AsyncLocalStorage. Deploy health check endpoints for API servers and workers. These changes are additive — they constrain existing behavior without modifying business logic.

**Phase 1 — Foundation (Weeks 3-6, minimal production risk)**

Implement idempotency keys for the credit deduction/refund system using pessimistic locking and unique constraints. Add optimistic locking (version columns) to the invoice state machine. Deploy Unleash (self-hosted) for feature flags. Instrument business metrics via prom-client: extraction success rates, AI provider latency, validation failure rates by format, credit operation counts. Configure alerting on the 6 page-worthy conditions. All changes deploy behind feature flags or are purely additive (metrics, logging).

**Phase 2 — Architectural boundaries (Weeks 7-14, controlled risk via feature flags)**

Reorganize code by business domain (extraction, validation, format-generation, billing, storage). Define the canonical invoice model aligned with EN 16931. Implement the FormatEngine interface and registry pattern, migrating existing format logic into discrete plugins. Add `dependency-cruiser` rules enforcing bounded context boundaries in CI. Introduce the transactional outbox pattern for cross-domain events. Deploy OpenTelemetry with X-Ray integration. Build the first 4 dashboards (system health, business metrics, queue health, SLO compliance).

**Phase 3 — Compliance hardening (Weeks 15-22, validated via parallel running)**

Implement the immutable audit log table with REVOKE DELETE/UPDATE and hash chaining. Build the automated Schematron validation pipeline in CI using easybill/e-invoice-validator Docker sidecar. Create golden file test suites for all supported formats with semantic XML comparison. Implement the validator lifecycle management system with parallel validation mode for Peppol updates. Build the data retention engine with per-jurisdiction policies. Deploy envelope encryption for sensitive fields via AWS KMS.

**Phase 4 — Operational maturity (Weeks 23-30)**

Implement the saga orchestrator for the extraction-to-storage pipeline with compensating transactions. Build DLQ infrastructure with poison message detection, admin retry API, and per-domain DLQ queues. Implement multi-dimensional rate limiting for AI endpoints. Deploy chaos testing with Toxiproxy for Redis failure scenarios. Define formal SLOs with error budget policies. Establish the change management RFC process for compliance-critical changes. Begin ISO 27001 gap analysis.

**Phase 5 — Certification readiness (Months 8-12)**

Complete ISO 27001 documentation and controls implementation. Build the full audit documentation package (processing records, architecture docs, risk register, incident response plan, BCP/DR plan). Conduct annual penetration testing. Implement SLO-based multi-burn-rate alerting. Build the security and compliance dashboards. Achieve ISO 27001 certification. Begin Peppol Access Point qualification on testbed.

Each phase produces a **release gate**: Phase 0 gates on health checks responding and RLS verified. Phase 1 gates on idempotency tests passing under concurrent load and alerting confirmed operational. Phase 2 gates on architectural boundary rules passing in CI and all format engines registered in the plugin registry. Phase 3 gates on Schematron validation passing for all formats in CI and audit log immutability verified. Phase 4 gates on chaos tests passing for all identified failure modes and SLOs defined for all services. Phase 5 gates on ISO 27001 Stage 1 audit passed.

The total timeline to enterprise-grade readiness is **10-12 months**, with the system becoming materially safer at each phase boundary. The key insight is that no phase requires a big-bang migration — every change is incremental, feature-flagged, and independently reversible. The system continues processing invoices throughout the entire hardening journey.
