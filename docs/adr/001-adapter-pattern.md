# ADR-001: Ports and Adapters Pattern for External Services

## Status

Accepted

## Context

Invoice2E integrates with multiple external services: AI providers (Gemini, DeepSeek),
payment processors (Stripe, PayPal), email (SendGrid), and database (Supabase).
Direct coupling to these services would make testing difficult, switching providers
expensive, and business logic fragile to API changes.

## Decision

Use the Ports and Adapters (Hexagonal Architecture) pattern:

- **Adapters** (`adapters/`) encapsulate all external service communication
- Each adapter implements an **interface** (`adapters/interfaces/`)
- **Services** (`services/`) contain business logic and depend on interfaces, not implementations
- **API routes** (`app/api/`) are thin orchestrators that call services

Dependency direction: Routes -> Services -> Adapters -> External APIs.

## Consequences

- Adding a new AI provider requires only a new adapter implementing `IAIExtractor`
- Switching payment processors requires only a new adapter implementing the payment interface
- Unit tests mock at the adapter interface boundary
- Slight overhead in boilerplate (interface + adapter per integration)
