# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please follow these steps:

### How to Report

1. **Email**: Send a detailed report to the repository owner via GitHub
2. **Do NOT** create a public GitHub issue for security vulnerabilities
3. Include as much information as possible:
   - Type of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment**: We will acknowledge receipt within 48 hours
- **Assessment**: We will assess the vulnerability within 7 days
- **Fix Timeline**: Critical vulnerabilities will be addressed within 14 days
- **Disclosure**: We follow a 90-day disclosure timeline

### Security Practices

This project implements the following security measures:

#### Authentication & Authorization
- JWT-based session management with secure cookies
- Role-based access control (user, admin, super_admin)
- Session timeout and refresh token rotation

#### Input Validation
- Zod schema validation on all API endpoints
- Input sanitization with DOMPurify
- SQL injection prevention via parameterized queries

#### Rate Limiting
- Configurable rate limits per endpoint
- Redis-backed rate limiting for production
- IP-based and user-based limiting

#### Security Headers
- Content-Security-Policy (CSP)
- Strict-Transport-Security (HSTS)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin

#### CORS
- Configurable allowed origins
- Strict method and header validation
- Credentials handling

#### Error Handling
- Sanitized error messages in production
- No stack traces exposed to clients
- Structured logging for debugging

#### Data Protection
- Sensitive data not logged (PII protection)
- IBAN/BIC validation before storage
- Secure file handling

## Known Limitations

- File uploads are limited to 500MB
- Maximum 100 files per batch upload
- Rate limits may affect high-volume users

## Security Updates

Security updates are released as patch versions (e.g., 1.0.1) and announced via:
- GitHub Security Advisories
- CHANGELOG.md updates

## Acknowledgments

We appreciate security researchers who help improve our security. Contributors will be acknowledged (with permission) in our security advisories.
