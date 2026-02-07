# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Additional CodeRabbit security fixes
- Rate limiter with Redis/Upstash support
- CORS configuration module
- Input sanitization with DOMPurify

## [1.0.0] - 2024-02-07

### Added
- **Invoice Extraction**: AI-powered invoice data extraction using Google Gemini
- **XRechnung Conversion**: Convert extracted invoices to XRechnung 3.0 (CII format)
- **UBL Conversion**: Convert extracted invoices to UBL 2.1 format
- **Bulk Upload**: Process multiple invoices via ZIP file upload
- **Payment Processing**: Stripe integration for credit purchases
- **Credit System**: Credit-based usage model with packages
- **Admin Dashboard**: User management, transaction history, voucher system
- **Authentication**: Custom JWT-based authentication with session management
- **Internationalization**: Multi-language support (English, German, Arabic)
- **Rate Limiting**: API rate limiting with configurable presets
- **Security Headers**: CSP, HSTS, X-Frame-Options, and more
- **Input Validation**: Zod schemas for all API endpoints

### Security
- Security headers in next.config.js
- Rate limiting on all critical endpoints
- CSRF protection
- Input sanitization
- Error message sanitization in production

### Technical
- Next.js 14 with App Router
- TypeScript with strict mode
- Supabase for database and authentication
- Vitest for unit testing
- ESLint + Prettier for code quality

[Unreleased]: https://github.com/osamaaldaas2/Invoice2E/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/osamaaldaas2/Invoice2E/releases/tag/v1.0.0
