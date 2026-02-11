# ADR-003: Supabase (Managed PostgreSQL) for Data Storage

## Status

Accepted

## Context

The application needs persistent storage for users, invoices, payments, credits,
and audit logs. Options considered: self-hosted PostgreSQL, Firebase/Firestore,
PlanetScale (MySQL), Supabase (managed PostgreSQL).

## Decision

Use Supabase as the database and auth infrastructure provider:

- PostgreSQL with Row Level Security (RLS) policies
- Supabase JS SDK for queries (`@supabase/supabase-js`)
- Server-side client via `@supabase/ssr`
- Database migrations managed in `db/migrations/` (27 sequential SQL files)
- Custom auth implementation (not Supabase Auth) using bcrypt + HMAC-signed sessions

## Consequences

- Managed infrastructure reduces operational burden
- PostgreSQL provides strong ACID guarantees for financial data (credits, payments)
- RLS adds defense-in-depth for multi-tenant data isolation
- Vendor lock-in to Supabase SDK (mitigated by adapter pattern)
- Custom auth allows full control over session management and security
- Migration management is manual (no ORM, raw SQL)
