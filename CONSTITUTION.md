{
  "AI_PROJECT_CONSTITUTION_INVOICE2E": {
    "philosophy": [
      "Treat all AI-generated code as a proposal, not truth.",
      "Prefer clarity over cleverness.",
      "All code must be strategic, modular, and designed for future extensibility.",
      "Small, reversible changes are mandatory.",
      "Code must be easy to delete, not hard to change."
    ],
    "core_rules": [
      "Never use an API, function, or library without official documentation or verified type definitions.",
      "All public APIs must have explicit contracts (types, interfaces, or schemas).",
      "No change is accepted without passing tests.",
      "Never delete or disable tests without providing equivalent or stronger replacements.",
      "All code must follow the existing architecture and folder boundaries.",
      "Only provide diffs or minimal patches; never rewrite entire files unless explicitly approved.",
      "Every function must have a single responsibility.",
      "Business logic must never live in UI layers.",
      "Prefer simple solutions first; abstraction is allowed only after duplication appears.",
      "All changes must include error handling.",
      "Secrets must never appear in code or logs.",
      "Forbidden operations: eval, exec, unsafe dynamic imports, raw SQL string concatenation.",
      "All dependencies must be actively maintained.",
      "Public interfaces must remain backward compatible unless versioned.",
      "All resources must be properly closed or disposed.",
      "Concurrency must be handled explicitly and safely.",
      "Code must be readable by another engineer without explanation.",
      "Every change must include a short explanation of intent."
    ],
    "validation_requirements": [
      "Unit tests for normal and edge cases.",
      "Type checking enabled (strict mode).",
      "Linting and formatting enabled (ESLint + Prettier).",
      "Security scanning enabled.",
      "Performance-sensitive code must include a basic benchmark.",
      "All failing checks block merging.",
      "No TODO comments without assigned owner and deadline.",
      "No commented-out code blocks (delete or track in issue).",
      "No console.log() in production code (use logger service).",
      "Database queries must include indexes for performance."
    ],
    "architecture_constraints": [
      "Separate domain logic from infrastructure and interface layers.",
      "Use services or use-cases for business rules.",
      "Use adapters for external integrations.",
      "Avoid circular dependencies.",
      "Modules must be independently testable.",
      "API routes must be thin orchestrators, not logic containers.",
      "No direct database queries in API routes (use services).",
      "No external API calls in services (use adapters).",
      "All error types must be explicitly defined (no generic Error).",
      "All async operations must have timeout handling."
    ],
    "change_process": [
      "Provide a brief plan before coding.",
      "List files to be modified.",
      "List acceptance criteria.",
      "Implement smallest possible change.",
      "Run validations.",
      "Submit patch.",
      "MUST include: why this change, not just what.",
      "MUST include: potential side effects or risks.",
      "MUST include: testing approach and test results."
    ],
    "strategic_code_requirements": [
      "Design for future extension without modifying existing behavior.",
      "Prefer composition over inheritance.",
      "Use clear boundaries and contracts.",
      "Avoid hard-coded assumptions.",
      "All strategic decisions must be documented.",
      "All constants must be centralized (no magic numbers).",
      "All configuration must be environment-based (not hardcoded).",
      "All feature flags must be in a dedicated config file."
    ],

    "AI_SPECIFIC_RULES": {
      "description": "Rules for AI agents to avoid common mistakes",
      "rules": [
        {
          "name": "Hallucination Prevention",
          "rule": "Never import or use a function/class that doesn't exist in the codebase or installed packages. Always verify with code inspection first.",
          "example_bad": "import { InvoiceConverter } from '@/services/converter'; // If not verified to exist",
          "example_good": "// First verify the file exists, then import"
        },
        {
          "name": "Type Safety",
          "rule": "Every function parameter and return type must be explicitly typed. No implicit any.",
          "example_bad": "function processInvoice(data) { return data; }",
          "example_good": "function processInvoice(data: InvoiceData): ProcessedInvoice { return data; }"
        },
        {
          "name": "Error Boundaries",
          "rule": "Every async operation and API call must have explicit error handling. Never let errors bubble up unhandled.",
          "example_bad": "const data = await gemini.extract(pdf); // What if it fails?",
          "example_good": "try { const data = await gemini.extract(pdf); } catch(e) { logger.error('Extraction failed', e); throw new ExtractionError(e.message); }"
        },
        {
          "name": "Dependency Injection",
          "rule": "Never hardcode external dependencies. Always inject via constructor or parameter. Makes testing easier.",
          "example_bad": "class InvoiceService { private gemini = new GeminiClient(); }",
          "example_good": "class InvoiceService { constructor(private gemini: GeminiClient) {} }"
        },
        {
          "name": "Data Validation",
          "rule": "All external data (API responses, user input, database results) must be validated with Zod schemas before use.",
          "example_bad": "const { name, email } = req.body; // What if missing?",
          "example_good": "const validated = UserSchema.parse(req.body);"
        },
        {
          "name": "No Side Effects in Pure Functions",
          "rule": "Pure functions must not modify external state, call APIs, or have random outputs. Keep them pure.",
          "example_bad": "function calculateTotal(items) { db.save(...); return sum; } // Side effect!",
          "example_good": "function calculateTotal(items): number { return items.reduce((sum, item) => sum + item.price, 0); }"
        },
        {
          "name": "API Response Consistency",
          "rule": "All API responses must follow the same format. Define a standard response envelope.",
          "format": "{ success: boolean, data?: T, error?: string, timestamp: ISO8601 }"
        },
        {
          "name": "No Duplicate Logic",
          "rule": "If code appears in 2+ places, extract it immediately into a shared utility or service. DRY principle.",
          "example_bad": "// In UserService and AdminService",
          "example_good": "// Create ValidationService shared by both"
        },
        {
          "name": "Explicit Null Handling",
          "rule": "Never assume null/undefined won't happen. Use optional chaining (?.) and nullish coalescing (??) explicitly.",
          "example_bad": "const name = user.profile.name; // What if null?",
          "example_good": "const name = user?.profile?.name ?? 'Unknown';"
        },
        {
          "name": "Configuration Over Convention",
          "rule": "All configurable values (URLs, timeouts, limits) must be in .env or config file, never hardcoded.",
          "example_bad": "const GEMINI_API_URL = 'https://api.gemini.com'; // Hardcoded",
          "example_good": "const GEMINI_API_URL = process.env.GEMINI_API_URL;"
        },
        {
          "name": "Logging Strategy",
          "rule": "Use structured logging. Include: level, timestamp, context, error details. No console.log().",
          "example_bad": "console.log('Error: ' + error);",
          "example_good": "logger.error('Invoice extraction failed', { extractionId, error: error.message, stack: error.stack });"
        },
        {
          "name": "Test File Proximity",
          "rule": "Test files must be in same directory as source file with .test.ts extension.",
          "structure": "services/invoice.service.ts + services/invoice.service.test.ts"
        },
        {
          "name": "Mock External Dependencies",
          "rule": "All external calls (APIs, DB, Gemini) must be mockable in tests. Use dependency injection for this.",
          "pattern": "interface IGeminiClient { extract(pdf: Buffer): Promise<Data>; } class MockGemini implements IGeminiClient { ... }"
        },
        {
          "name": "Avoid Promise.all() Unless Certain",
          "rule": "Promise.all() fails if any promise rejects. Use Promise.allSettled() unless all must succeed.",
          "use_case": "Promise.allSettled() for batch processing where partial failure is acceptable"
        },
        {
          "name": "Database Transaction Handling",
          "rule": "Any multi-step operation affecting DB must use transactions. All or nothing.",
          "example": "Credit deduction + Invoice save = must be in same transaction"
        },
        {
          "name": "Cache Invalidation",
          "rule": "If implementing cache, document invalidation strategy. Cache without invalidation = time bomb.",
          "pattern": "On mutation → invalidate related cache immediately"
        },
        {
          "name": "String Interpolation Over Concatenation",
          "rule": "Use template literals, not string concatenation. More readable.",
          "example_bad": "const msg = 'Hello ' + name + '!';",
          "example_good": "const msg = `Hello ${name}!`;"
        },
        {
          "name": "Named Arguments for Clarity",
          "rule": "For functions with 3+ parameters, use object destructuring for clarity.",
          "example_bad": "createInvoice(data, true, false, 100);",
          "example_good": "createInvoice({ data, validate: true, notify: false, retries: 100 });"
        },
        {
          "name": "Avoid Nested Ternaries",
          "rule": "Max 1 level of ternary. Use if/else or switch for complex conditions.",
          "example_bad": "const status = x ? y ? 'a' : 'b' : 'c';",
          "example_good": "if (x && y) status = 'a'; else if (x) status = 'b'; else status = 'c';"
        },
        {
          "name": "API Request Timeout",
          "rule": "All external API calls must have explicit timeout. No infinite waits.",
          "example": "gemini.extract(pdf, { timeout: 30000 }) // 30 second timeout"
        },
        {
          "name": "Resource Cleanup",
          "rule": "Any opened resource (file, connection, stream) must be closed. Use try/finally.",
          "pattern": "try { open } finally { close }"
        },
        {
          "name": "Pagination by Default",
          "rule": "Any list endpoint must support pagination. No loading entire DB into memory.",
          "params": "limit: number, offset: number, sort: string"
        },
        {
          "name": "API Documentation",
          "rule": "Every endpoint must have JSDoc or OpenAPI doc. Include: params, returns, errors, example.",
          "example": "/**\n * @param pdf PDF file buffer\n * @returns Extracted invoice data\n * @throws ExtractionError\n */"
        }
      ]
    },

    "anti_spaghetti_code_rules": [
      "No file may exceed 500 lines without explicit approval.",
      "No function may exceed 40 lines.",
      "Every function must perform exactly one responsibility.",
      "Business logic must never be placed in UI or controller layers.",
      "All complex logic must live in services or use-case modules.",
      "No function may access more than one external dependency directly.",
      "Deep nesting (more than 3 levels) is forbidden.",
      "Extract helper functions instead of adding nested blocks.",
      "Prefer early returns over nested conditionals.",
      "Each module must have a single, clear purpose.",
      "No circular dependencies between modules.",
      "Shared logic must be moved to a dedicated service or domain module.",
      "Every public function must have a clear name describing intent.",
      "Avoid generic names like utils, helpers, common.",
      "Duplicate logic must be refactored into a shared abstraction.",
      "Controllers must only orchestrate, never decide business rules.",
      "State mutations must occur in one dedicated place.",
      "All new features must include tests before merging.",
      "Refactor when adding a third responsibility to a file or class.",
      "Complex workflows must be represented as small composable steps.",
      "No more than 5 parameters per function (use object for more).",
      "No negative naming (isNotValid). Use positive (isValid).",
      "Boolean properties should start with is, has, or can (isActive, hasPermission).",
      "Async functions should have Async suffix or Async in name (fetchUserAsync)."
    ],

    "file_structure_rules": {
      "required_structure": {
        "description": "Mandatory folder structure for Invoice2E",
        "structure": {
          "app/": "Next.js app directory",
          "components/": "React components (grouped by feature)",
          "lib/": "Utilities and helpers (no business logic)",
          "services/": "Business logic and external integrations",
          "types/": "TypeScript type definitions",
          "hooks/": "Custom React hooks",
          "messages/": "i18n translation files",
          "tests/": "Test files (mirror source structure)"
        }
      },
      "rules": [
        "No services in components/ folder.",
        "No UI components in services/ folder.",
        "No types in lib/ folder (use types/ only).",
        "No direct API calls in components (use hooks or services).",
        "No direct DB calls outside of services (use adapters/repositories).",
        "All shared utilities go to lib/, not scattered around."
      ]
    },

    "naming_conventions": {
      "files": {
        "components": "PascalCase.tsx (e.g., FileUploader.tsx)",
        "services": "camelCase.service.ts (e.g., invoice.service.ts)",
        "utilities": "camelCase.ts (e.g., formatDate.ts)",
        "types": "camelCase.ts (e.g., invoice.types.ts)",
        "tests": "same as source + .test.ts (e.g., invoice.service.test.ts)",
        "hooks": "useXxx.ts (e.g., useAuth.ts)"
      },
      "variables": {
        "constants": "UPPER_SNAKE_CASE (const MAX_FILE_SIZE = 25)",
        "variables": "camelCase (let userName = 'Ahmed')",
        "booleans": "isXxx or hasXxx or canXxx (const isValid = true)"
      },
      "functions": {
        "regular": "camelCase (function processData() {})",
        "async": "camelCase, no Async suffix (async function fetchUser() {})",
        "event_handlers": "onXxx or handleXxx (onClick={handleSubmit})"
      },
      "classes": {
        "all": "PascalCase (class InvoiceService {})"
      }
    },

    "git_and_commits": {
      "commit_format": "[TYPE] Brief description (50 chars max)",
      "types": [
        "FEATURE: New feature or capability",
        "BUGFIX: Bug fix",
        "REFACTOR: Code refactoring (no feature change)",
        "PERF: Performance improvement",
        "DOCS: Documentation only",
        "TEST: Test addition or fix",
        "CHORE: Dependencies, config, etc"
      ],
      "examples": [
        "[FEATURE] Add invoice extraction with Gemini API",
        "[BUGFIX] Fix token refresh not working after 1 hour",
        "[REFACTOR] Extract validation logic to separate service",
        "[PERF] Optimize database queries with indexes"
      ],
      "rules": [
        "One logical change per commit.",
        "No 'WIP' or 'temp' commits in main.",
        "Squash multiple commits before merging.",
        "Always include issue number: [FEATURE] (#123) Description"
      ]
    },

    "code_review_checklist": [
      "✅ All tests pass (unit, integration, E2E)",
      "✅ No TypeScript errors (strict mode)",
      "✅ No linting errors (ESLint)",
      "✅ No commented-out code",
      "✅ No console.log() (use logger)",
      "✅ No hardcoded secrets",
      "✅ Error handling present",
      "✅ Types explicitly defined (no any)",
      "✅ Function signatures clear (JSDoc)",
      "✅ No circular dependencies",
      "✅ Database queries optimized (with indexes)",
      "✅ External API calls have timeout",
      "✅ Security: Input validation with Zod",
      "✅ Security: No SQL injection risk",
      "✅ Performance: No N+1 queries",
      "✅ Documentation: API endpoints documented",
      "✅ Backward compatibility: No breaking changes",
      "✅ Files under 500 lines",
      "✅ Functions under 40 lines",
      "✅ Commit message clear and descriptive"
    ],

    "common_ai_mistakes_AND_FIXES": {
      "description": "Common mistakes AI makes and how to fix them",
      "mistakes": [
        {
          "mistake": "Importing non-existent modules",
          "cause": "AI hallucinates file structure",
          "fix": "Always verify file exists first: view /path/to/file.ts",
          "prevention": "Start code with: 'First, let me check the existing structure...'"
        },
        {
          "mistake": "Missing error handling",
          "cause": "AI focuses on happy path",
          "fix": "Add try-catch around all async operations",
          "prevention": "Include error types: throw new InvoiceExtractionError(...)"
        },
        {
          "mistake": "Unused imports",
          "cause": "AI imports everything upfront",
          "fix": "Run linting to catch unused imports",
          "prevention": "Only import what you actually use"
        },
        {
          "mistake": "Implicit any types",
          "cause": "AI skips type definitions",
          "fix": "Enable TypeScript strict mode, fix all errors",
          "prevention": "Every parameter must have explicit type"
        },
        {
          "mistake": "Circular dependencies",
          "cause": "AI doesn't track module imports",
          "fix": "Refactor to separate concerns",
          "prevention": "Services -> Hooks -> Components (one direction only)"
        },
        {
          "mistake": "No validation of external data",
          "cause": "AI assumes data is valid",
          "fix": "Validate ALL external input with Zod",
          "prevention": "const validated = Schema.parse(data)"
        },
        {
          "mistake": "Hardcoded values",
          "cause": "AI doesn't know env config",
          "fix": "Move to .env or config file",
          "prevention": "process.env.GEMINI_API_URL (never hardcode)"
        },
        {
          "mistake": "Missing database indexes",
          "cause": "AI generates queries without optimization",
          "fix": "Identify slow queries, add indexes",
          "prevention": "Every frequently queried column needs an index"
        },
        {
          "mistake": "Unhandled promise rejections",
          "cause": "AI uses await without try-catch",
          "fix": "Wrap all await in try-catch",
          "prevention": "async/await must have error handling"
        },
        {
          "mistake": "Global state mutations",
          "cause": "AI doesn't use dependency injection",
          "fix": "Inject dependencies via constructor",
          "prevention": "Never use global variables for state"
        },
        {
          "mistake": "Functions doing too many things",
          "cause": "AI doesn't refactor aggressively",
          "fix": "Split into smaller, single-responsibility functions",
          "prevention": "If function > 40 lines, refactor immediately"
        },
        {
          "mistake": "No timeout on external API calls",
          "cause": "AI assumes APIs always respond",
          "fix": "Add explicit timeout: { timeout: 30000 }",
          "prevention": "All fetch/axios calls need timeout"
        }
      ]
    },

    "testing_strategy": {
      "unit_tests": {
        "coverage_target": "80% minimum",
        "what_to_test": [
          "All business logic (services)",
          "Utility functions",
          "Type definitions (test invalid inputs)",
          "Error cases (what happens if API fails?)"
        ],
        "what_not_to_test": [
          "React component rendering (use integration tests)",
          "Third-party libraries",
          "Database implementation"
        ]
      },
      "integration_tests": {
        "what_to_test": [
          "Complete user flows (signup -> login -> upload -> convert)",
          "Service integration (Gemini + Validator + DB)",
          "API endpoints (request -> response)",
          "Error recovery"
        ]
      },
      "naming": {
        "pattern": "should[Action]When[Condition]And[AdditionalContext]",
        "examples": [
          "shouldExtractInvoiceDataWhenPdfIsValid",
          "shouldThrowErrorWhenGeminiApiTimesOut",
          "shouldDeductCreditsWhenConversionSucceeds"
        ]
      }
    }
  }
}
