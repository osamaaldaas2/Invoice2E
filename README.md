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
