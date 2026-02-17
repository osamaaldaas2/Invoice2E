# Identity Domain

## Purpose

The **identity** bounded context handles authentication, user management, roles (RBAC), and audit logging.

## Responsibilities

- User authentication and session management
- User profile CRUD
- Role-based access control (RBAC) via CASL
- Audit log management (tamper-evident chain)

## Key Files

| File | Purpose |
|---|---|
| `types.ts` | Identity-specific types and interfaces |
| `identity.service.ts` | Orchestrates auth, user, and audit operations |
| `index.ts` | Barrel exports (public API) |

## Dependencies

- **Adapters**: Supabase auth adapter
- **Shared types**: `User`, `UserRole`, `AuditLog` from `types/`

## Migration Notes

Currently delegates to:
- `services/auth.service.ts` — Authentication
- `services/user.db.service.ts` — User DB operations
- `services/audit.db.service.ts` — Audit log DB operations
