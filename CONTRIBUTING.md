# Contributing to Invoice2E

Thank you for your interest in contributing to Invoice2E. This document outlines the guidelines and processes for contributing to this project.

## Local Setup

1. **Clone the repository**

   ```bash
   git clone <repo-url>
   cd Invoice2E.1
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

   Requires Node.js >= 18.17.0 and npm >= 9.0.0.

3. **Configure environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Fill in the required values in `.env.local`. Never commit `.env.local` or any file containing secrets.

4. **Run the development server**

   ```bash
   npm run dev
   ```

5. **Run tests**

   ```bash
   npm test
   ```

## Branch Naming

Use the following prefixes for branch names:

| Prefix   | Purpose                          |
| -------- | -------------------------------- |
| `feat/`  | New features                     |
| `fix/`   | Bug fixes                        |
| `docs/`  | Documentation changes            |
| `chore/` | Maintenance, dependencies, CI/CD |

Examples: `feat/bulk-upload-redesign`, `fix/double-credit-deduction`, `docs/add-adr-template`.

## Commit Format

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description>

[optional body]

[optional footer]
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`.

Examples:

- `feat: add batch download endpoint`
- `fix: prevent double credit deductions on multi-invoice uploads`
- `docs: add ADR for adapter pattern`

## Pull Request Process

1. Create a branch from `main` using the naming convention above.
2. Make your changes and commit using conventional commit format.
3. Ensure all CI checks pass before requesting review:
   - **Lint**: `npm run lint`
   - **Type-check**: `npm run type-check` (or `npx tsc --noEmit`)
   - **Tests**: `npx vitest run`
4. Open a pull request against `main`.
5. At least **one reviewer** must approve before merging.
6. Squash-merge is preferred for feature branches.

## Definition of Done

A change is considered done when:

- All existing tests pass (`npx vitest run`).
- No lint errors (`npm run lint`).
- No TypeScript type errors (`npx tsc --noEmit`).
- Test coverage does not decrease (check with `npm run test:coverage`).
- The PR has been reviewed and approved by at least one team member.

## Security

- **No secrets in code.** Never commit API keys, tokens, passwords, or connection strings. Use environment variables.
- **Run `npm audit`** before submitting a PR and address any high or critical vulnerabilities.
- If you discover a security vulnerability, report it privately -- do not open a public issue.

## Code Style

- The project uses ESLint and Prettier. Run `npm run format` to auto-format before committing.
- Husky pre-commit hooks are configured via the `prepare` script.

## Questions

If you have questions about contributing, open a discussion or reach out to the maintainers.
