# Domain Architecture

## Overview

Invoice2E follows a **domain-driven design** (DDD) approach with bounded contexts.
Each domain module encapsulates its own types, services, and repository interfaces.

## Domains

| Domain | Purpose | Key Entities |
|---|---|---|
| `extraction/` | Invoice data extraction from PDFs via AI | InvoiceExtraction, ExtractedInvoiceData |
| `conversion/` | Format conversion (e.g. ZUGFeRD, XRechnung) | InvoiceConversion, CanonicalInvoice |
| `billing/` | Credits, payments, and usage tracking | UserCredits, PaymentTransaction |
| `identity/` | Auth, users, roles (RBAC), audit | User, AuditLog |

## Architecture Rules

1. **Each domain owns its types, services, and repository interfaces.**
   - Domain types live in `domains/<name>/types.ts`, not in the shared `types/` directory.
   - Domain services orchestrate business logic within the bounded context.
   - Repository interfaces define the data access contract; implementations may delegate to existing `services/*.db.service.ts` during migration.

2. **Cross-domain communication via explicit service calls or domain events.**
   - Domains never import each other's internal modules directly.
   - Use the barrel `index.ts` exports as the public API surface.
   - Future: introduce a lightweight event bus for decoupled communication.

3. **No circular dependencies between domains.**
   - Enforced by `.dependency-cruiser.cjs` rules.
   - If two domains need each other, extract a shared interface into `types/` or introduce an event.

4. **Adapters remain in `adapters/` (shared infrastructure).**
   - Adapters are injected into domain services, never imported directly by domain code.
   - This keeps domains testable and infrastructure-agnostic.

5. **Incremental migration.**
   - Existing `services/`, `lib/`, `types/` code stays in place.
   - Domain modules initially delegate to existing code.
   - Over time, logic migrates into domains; old files become thin re-exports, then are removed.

## Migration Plan

### Phase 1 — Scaffold (current)
Create domain module structure with types, service interfaces, and repository interfaces.
Barrel exports establish the public API for each domain.

### Phase 2 — Wire Up
Domain services delegate to existing `services/*.service.ts` and `services/*.db.service.ts`.
New code starts importing from `domains/` instead of `services/` directly.

### Phase 3 — Migrate Logic
Move business logic from `services/` into domain services.
Move DB access logic into domain repositories.
Old service files become thin re-exports for backward compatibility.

### Phase 4 — Clean Up
Remove deprecated re-exports from `services/`.
Update all imports to use `domains/` paths.
Remove migration shims.

## Dependency Flow

```
app/api/ → domains/ → adapters/
              ↓
           types/ (shared primitives only)
```

Domains may import from `types/` for shared primitives (e.g. `ApiResponse`, `Versioned`).
Domains must NOT import from `app/`, `components/`, `hooks/`, or `lib/`.
