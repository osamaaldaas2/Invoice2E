# Invoice2E

Convert invoices to XRechnung compliant e-invoices.

## Tech Stack

- **Framework:** Next.js 14
- **Language:** TypeScript
- **Styling:** TailwindCSS
- **Database:** Supabase (PostgreSQL)
- **AI:** Google Gemini API
- **Validation:** Zod

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
npm install
```

### Environment Setup

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Testing

```bash
npm run test
npm run test:coverage
```

### Linting & Formatting

```bash
npm run lint
npm run format
```

## Supported Formats

Invoice2E supports 9 e-invoicing output formats:

| Format | Standard | Countries | Output |
|--------|----------|-----------|--------|
| XRechnung CII | EN 16931 / CII | DE | XML |
| XRechnung UBL | EN 16931 / UBL | DE | XML |
| PEPPOL BIS 3.0 | PEPPOL BIS Billing | 30 EU/EEA | XML |
| Factur-X EN 16931 | ZUGFeRD 2.x | FR, DE, AT, CH, LU, BE | PDF |
| Factur-X Basic | ZUGFeRD 2.x | FR, DE, AT, CH, LU, BE | PDF |
| FatturaPA | FatturaPA 1.2.2 | IT | XML |
| KSeF FA(2) | KSeF | PL | XML |
| NLCIUS / SI-UBL 2.0 | Dutch CIUS | NL | XML |
| CIUS-RO | Romanian CIUS | RO | XML |

See [docs/FORMAT-ARCHITECTURE.md](docs/FORMAT-ARCHITECTURE.md), [docs/FORMAT-REFERENCE.md](docs/FORMAT-REFERENCE.md), [docs/ADDING-NEW-FORMAT.md](docs/ADDING-NEW-FORMAT.md), and [docs/MIGRATION-MULTI-FORMAT.md](docs/MIGRATION-MULTI-FORMAT.md) for details.

## Project Structure

- `app/` - Next.js app directory
- `components/` - React components
- `lib/` - Utilities and services
- `services/` - Business logic
- `types/` - TypeScript definitions
- `hooks/` - Custom React hooks
- `messages/` - i18n translations
- `styles/` - Global styles
- `tests/` - Test files

## API Routes

### Health Check

```bash
GET /api/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-30T10:00:00Z",
  "version": "1.0.0"
}
```

## Invoice Format Validation

Validate generated invoices against official standards (XRechnung, PEPPOL, Factur-X, FatturaPA, KSeF, NLCIUS, CIUS-RO).

```bash
# Generate test invoices in all 9 formats
npx tsx scripts/generate-test-invoices.ts

# Validate with KoSIT Validator + xmllint (requires Java 17+)
bash scripts/validate-with-kosit.sh
```

Results are saved to `tmp/validation-reports/`. This also runs automatically in CI on every push/PR to main.

## CONSTITUTION Rules

All code follows CONSTITUTION.md:
- TypeScript strict mode
- Single responsibility functions
- Comprehensive error handling
- Type safety everywhere
- No implicit any
- Proper testing

## Development Rules

- Run `npm run lint` before committing
- Run `npm run type-check` before committing
- All tests must pass: `npm run test`
- Follow commit message format: [TYPE] Description

## License

MIT
