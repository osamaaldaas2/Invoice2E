# Contributing to Invoice2E

Thank you for your interest in contributing to Invoice2E! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful and constructive in all interactions.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/Invoice2E.git`
3. Create a branch: `git checkout -b feature/your-feature-name`

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- Supabase account (for database)
- Stripe account (for payments)
- Google AI API key (for Gemini)

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Fill in your environment variables
# See .env.example for required variables

# Run development server
npm run dev
```

### Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript (strict mode)
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Custom JWT
- **Payments**: Stripe
- **AI**: Google Gemini
- **Testing**: Vitest + React Testing Library
- **Styling**: CSS Modules

## Code Style

### ESLint

We use ESLint with strict TypeScript rules:

```bash
# Run linter
npm run lint

# Fix auto-fixable issues
npm run lint -- --fix
```

### Prettier

Code is formatted with Prettier:

```bash
# Format code
npx prettier --write .
```

### TypeScript

- Use strict mode
- Avoid `any` types
- Use proper type annotations
- Enable `strictNullChecks`

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(invoice): add bulk upload support
fix(auth): resolve session timeout issue
docs(api): add endpoint documentation
test(payment): add Stripe webhook tests
```

## Pull Request Process

1. **Update your branch** with the latest main:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Run all checks locally**:
   ```bash
   npm run lint
   npm run test
   npm run build
   ```

3. **Create a Pull Request** with:
   - Clear title following commit conventions
   - Description of changes
   - Screenshots for UI changes
   - Related issue numbers

4. **Code Review**:
   - Address reviewer feedback
   - Keep discussions constructive
   - Request re-review after changes

5. **Merge**:
   - Squash commits if needed
   - Delete your branch after merge

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

### Writing Tests

- Place tests in `tests/` directory
- Use descriptive test names
- Test user-facing behavior
- Mock external dependencies

### Test Coverage

We aim for 60%+ coverage. Check coverage with:

```bash
npm run test:coverage
```

## Questions?

If you have questions, please:

1. Check existing issues
2. Search the documentation
3. Open a new issue with the `question` label

Thank you for contributing! 🎉
