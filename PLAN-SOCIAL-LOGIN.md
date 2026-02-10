# Social Login: Google & Apple Sign-In — Implementation Plan

**Created:** 2026-02-10
**Status:** Planned (not yet implemented)

---

## Context
The app uses custom auth (bcrypt passwords + HMAC-SHA256 session tokens) with no OAuth support. Users can only sign in with email/password. Adding Google and Apple sign-in reduces friction — users can sign up/log in with one click without filling in the full address/phone form. Both flows converge into the existing `setSessionCookie()` path.

**Key facts about current system:**
- `password_hash` is NOT NULL in DB — must be made nullable for social users
- `setSessionCookie(user)` in `lib/session.ts` takes `{ id, email, firstName, lastName, role? }` — reusable as-is
- Signup requires address/phone — social login users skip this, fill in later via profile
- Supabase is used as database only (NOT Supabase Auth)
- No OAuth libraries installed yet

---

## Critical Audit: What Could Break & What's Safe

### WILL BREAK (must fix during implementation)

| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `services/auth.service.ts` line ~178 | `bcrypt.compare(password, user.password_hash)` **crashes** if `password_hash` is null (social user tries email login) | Add null guard before bcrypt.compare: throw friendly error "This account uses social login" |
| 2 | `services/auth.service.ts` line ~37 | `DbUser` type has `password_hash: string` — won't accept null from DB | Change to `password_hash: string \| null` |
| 3 | `services/auth.service.ts` `requestPasswordReset()` | Sends reset email to social-only users who have no password | Add guard: if `auth_provider !== 'email'`, throw error "Use Google/Apple to sign in" |
| 4 | `services/auth.service.ts` `verifyPassword()` line ~286 | Same bcrypt crash risk for null password_hash | Add null check |
| 5 | `db/migrations/001_initial_schema.sql` | `password_hash VARCHAR(255) NOT NULL` constraint | Migration 027 must run `ALTER COLUMN password_hash DROP NOT NULL` |
| 6 | `next.config.js` line 22-23 | CSP blocks Google/Apple external scripts | Must add domains to `script-src`, `connect-src`, `frame-src` |
| 7 | `app/(auth)/signup/page.tsx` | Social signup bypasses `SignupSchema` Zod validation (address, phone required) | OAuth service creates user with minimal fields; address/phone are already nullable in DB |

### SAFE — No Changes Needed (verified by audit)

| # | File(s) | Why It's Safe |
|---|---------|---------------|
| 1 | `lib/session.ts` — `setSessionCookie()`, `createSessionToken()`, `verifySessionToken()` | Purely token-based. Takes `{ id, email, firstName, lastName, role? }` — no password reference anywhere. Social login reuses this as-is. |
| 2 | `components/ProtectedRoute.tsx`, `components/admin/AdminProtectedRoute.tsx` | Check session existence + role, never touch password |
| 3 | `lib/client-auth.ts` — `fetchSessionUser()`, `emitAuthChanged()` | Client-side session helpers, password-independent |
| 4 | `app/api/auth/me/route.ts` | Returns user fields from session cookie, no password involved |
| 5 | `app/api/users/profile/route.ts` | GET/PUT profile data, doesn't touch password_hash |
| 6 | `services/admin/user.admin.service.ts` | Admin queries don't expose or check password_hash |
| 7 | `services/email/templates/*` | Email templates use name/URL only |
| 8 | `types/index.ts` — `User.passwordHash` | Already declared as `passwordHash?: string` (optional) — compatible |
| 9 | `lib/rate-limiter.ts` | Generic rate limiting, reusable for OAuth routes |

### Edge Cases to Handle

| # | Scenario | How We Handle It |
|---|----------|-----------------|
| 1 | User has email account, then signs in with Google (same email) | Auto-link: add oauth_accounts row, user can now use both methods |
| 2 | Social user tries "Forgot Password" | Guard in `requestPasswordReset()` returns error: "This account uses social login" |
| 3 | Social user tries email login | Guard in `login()` before bcrypt: "Please sign in with Google or Apple" |
| 4 | Race condition: two simultaneous signups with same Google email | Unique constraint on `oauth_accounts(provider, provider_user_id)` catches it; retry as account link |
| 5 | Banned social user tries to log in | `findOrCreateOAuthUser()` checks `is_banned` flag, rejects |
| 6 | Apple hides email (private relay) | Store Apple's relay email; user can update later via profile |
| 7 | Social user profile is incomplete (no address/phone) | DB allows nulls for address/phone; user fills in via profile page later |

---

## Phase 1: Prerequisites (env vars + dependencies)

### 1A. Install dependencies
```
npm install google-auth-library jose
```
- `google-auth-library` — Google's official lib for verifying ID tokens
- `jose` — lightweight JWT lib for Apple token verification

### 1B. Environment variables
```
# Google OAuth (get from https://console.cloud.google.com/apis/credentials)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com

# Apple OAuth (get from https://developer.apple.com)
APPLE_CLIENT_ID=com.invoice2e.web
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_KEY_ID=XXXXXXXXXX
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
NEXT_PUBLIC_APPLE_CLIENT_ID=com.invoice2e.web
```

### 1C. Google Cloud Console setup
1. Create OAuth 2.0 Client ID (type: Web Application)
2. Authorized JavaScript origins: `https://yourdomain.com` + `http://localhost:3000`
3. No redirect URIs needed (ID token flow, not authorization code flow)

### 1D. Apple Developer setup
1. Register a Services ID (e.g. `com.invoice2e.web`)
2. Enable "Sign In with Apple", configure domain + return URL: `https://yourdomain.com/api/auth/apple/callback`
3. Create a key for Sign In with Apple, download `.p8` file
4. Note Key ID and Team ID

---

## Phase 2: Database Migration

**New file: `db/migrations/027_social_login.sql`**

```sql
-- Make password_hash nullable (social users won't have one)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Track how user originally signed up
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'email';

-- OAuth accounts table (supports multiple providers per user)
CREATE TABLE IF NOT EXISTS oauth_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,           -- 'google' or 'apple'
    provider_user_id VARCHAR(255) NOT NULL,  -- provider 'sub' claim
    provider_email VARCHAR(320),
    provider_name VARCHAR(200),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE UNIQUE INDEX idx_oauth_provider_user ON oauth_accounts(provider, provider_user_id);
CREATE UNIQUE INDEX idx_oauth_user_provider ON oauth_accounts(user_id, provider);
CREATE INDEX idx_oauth_user_id ON oauth_accounts(user_id);

-- RLS + updated_at trigger
ALTER TABLE oauth_accounts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_oauth_accounts_updated_at
    BEFORE UPDATE ON oauth_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## Phase 3: Backend — OAuth Service

**New file: `services/oauth.service.ts`**

Core class `OAuthService` with methods:

| Method | Purpose |
|--------|---------|
| `verifyGoogleToken(idToken)` | Verify Google ID token via `google-auth-library`, return `OAuthUserInfo` |
| `verifyAppleAuth(code, user?)` | Exchange Apple auth code for ID token, verify with `jose`, return `OAuthUserInfo` |
| `findOrCreateOAuthUser(info)` | Core upsert: check oauth_accounts → check users by email → create or link |

**`findOrCreateOAuthUser` logic:**
1. Check `oauth_accounts` for existing `(provider, provider_user_id)` → if found, log in that user
2. Check `users` for matching `email` → if found, link OAuth account to existing user (account linking)
3. Otherwise → create new user (no password, minimal fields) + `user_credits` row + `oauth_accounts` row

**Account linking rules:**
- Same email from social provider → auto-link to existing password-based account
- Banned users are rejected
- Race condition on duplicate email → catch unique constraint, retry as link

**Reuses from existing code:**
- `createServerClient()` from `lib/supabase.server.ts`
- `DEFAULT_CREDITS_ON_SIGNUP` from `lib/constants.ts`
- `AppError`, `ValidationError` from `lib/errors.ts`
- Same user_credits creation + rollback pattern from `auth.service.ts:signup()`

---

## Phase 4: Backend — API Routes

### 4A. **New file: `app/api/auth/google/route.ts`**
- Validate body with Zod: `{ credential: string }`
- Rate limit with `checkRateLimitAsync(id, 'login')`
- Call `oauthService.verifyGoogleToken(credential)`
- Call `oauthService.findOrCreateOAuthUser(userInfo)`
- Call `setSessionCookie(user)` — same as email login
- Set locale cookie from `user.language`
- Return `{ success: true, data: user }`

### 4B. **New file: `app/api/auth/apple/route.ts`**
- Validate body: `{ code: string, user?: { firstName?, lastName? } }`
- Rate limit
- Call `oauthService.verifyAppleAuth(code, user)`
- Same session + locale cookie pattern as Google route

### 4C. **Modify: `services/auth.service.ts`**
- Change `DbUser.password_hash` type to `string | null`
- Add null check in `login()` before `bcrypt.compare`:
  ```ts
  if (!user.password_hash) {
      throw new UnauthorizedError('This account uses social login. Please sign in with Google or Apple.');
  }
  ```
- Add guard in `requestPasswordReset()` for social-only users
- Add null check in `verifyPassword()`

---

## Phase 5: Frontend — Social Login Components

### 5A. **New file: `components/auth/GoogleSignInButton.tsx`**
- Client component that loads Google Identity Services script (`https://accounts.google.com/gsi/client`)
- Renders Google's official "Continue with Google" button via `google.accounts.id.renderButton()`
- On callback: POST `credential` to `/api/auth/google`, then `emitAuthChanged()` + `router.push(redirectTarget)`
- Dark theme + pill shape to match app design

### 5B. **New file: `components/auth/AppleSignInButton.tsx`**
- Loads Apple JS SDK (`https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js`)
- Uses `usePopup: true` mode (no full-page redirect)
- Custom-styled button (white bg, Apple logo SVG, "Continue with Apple")
- On success: POST `{ code, user }` to `/api/auth/apple`

### 5C. **New file: `components/auth/SocialAuthDivider.tsx`**
- Simple "or continue with email" divider line

### 5D. **Modify: `app/(auth)/login/page.tsx`**
Add social buttons above `<LoginForm />`:
```tsx
<GoogleSignInButton />
<AppleSignInButton />
<SocialAuthDivider />
<LoginForm />
```

### 5E. **Modify: `app/(auth)/signup/page.tsx`**
Same pattern — social buttons above `<SignupForm />`

---

## Phase 6: CSP + Config Update

**Modify: `next.config.js`** (line 22-23)

Add to CSP:
- `script-src`: add `https://accounts.google.com https://appleid.cdn-apple.com`
- `connect-src`: add `https://accounts.google.com https://appleid.apple.com`
- `frame-src`: add `https://accounts.google.com`

---

## Phase 7: i18n Strings

**Modify: `messages/en.json`** and **`messages/de.json`** — add to `"auth"` section:

```json
"continueWithGoogle": "Continue with Google",
"continueWithApple": "Continue with Apple",
"orContinueWith": "or continue with email",
"socialLoginFailed": "Social login failed. Please try again.",
"signingInWith": "Signing in with {provider}...",
"socialAccountOnly": "This account uses social login. Please use Google or Apple to sign in."
```

---

## Implementation Order

| Step | What | Files |
|------|------|-------|
| 1 | Install deps | `npm install google-auth-library jose` |
| 2 | Run migration | `db/migrations/027_social_login.sql` |
| 3 | Create OAuth service | `services/oauth.service.ts` (new) |
| 4 | Modify auth service | `services/auth.service.ts` (nullable password_hash + login guard) |
| 5 | Create API routes | `app/api/auth/google/route.ts`, `app/api/auth/apple/route.ts` (new) |
| 6 | Update CSP | `next.config.js` |
| 7 | Create UI components | `components/auth/GoogleSignInButton.tsx`, `AppleSignInButton.tsx`, `SocialAuthDivider.tsx` (new) |
| 8 | Update auth pages | `app/(auth)/login/page.tsx`, `app/(auth)/signup/page.tsx` |
| 9 | Add i18n strings | `messages/en.json`, `messages/de.json` |
| 10 | Update signup test | `tests/unit/routes/auth.signup.route.test.ts` (if needed) |

---

## Files Summary

**New files (7):**
- `db/migrations/027_social_login.sql`
- `services/oauth.service.ts`
- `app/api/auth/google/route.ts`
- `app/api/auth/apple/route.ts`
- `components/auth/GoogleSignInButton.tsx`
- `components/auth/AppleSignInButton.tsx`
- `components/auth/SocialAuthDivider.tsx`

**Modified files (6):**
- `services/auth.service.ts` — nullable password_hash, login guard, password reset guard, verifyPassword guard
- `app/(auth)/login/page.tsx` — add social buttons
- `app/(auth)/signup/page.tsx` — add social buttons
- `next.config.js` — CSP update
- `messages/en.json` — i18n strings
- `messages/de.json` — i18n strings

**Reused as-is:**
- `lib/session.ts` — `setSessionCookie()` works for social login without changes
- `lib/rate-limiter.ts` — same rate limiting for OAuth routes
- `lib/client-auth.ts` — `emitAuthChanged()` + `fetchSessionUser()` work as-is
- `lib/constants.ts` — `LOCALE_COOKIE_NAME`, `DEFAULT_LOCALE`, `SUPPORTED_LOCALES`, `DEFAULT_CREDITS_ON_SIGNUP`

---

## Verification
- `npx tsc --noEmit` — zero errors
- `npx vitest run` — all tests pass
- Google sign-in with new email → creates account, lands on `/dashboard`
- Google sign-in with existing password account → links, logs in
- Apple sign-in with new email → creates account
- Apple sign-in with existing account → links, logs in
- Password login for social-only user → shows helpful error message
- Password reset for social-only user → shows helpful error message
- Rate limiting works on `/api/auth/google` and `/api/auth/apple`
