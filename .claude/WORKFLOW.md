# WORKFLOW.md — Mandatory Work Cycle

> This file defines the PROCESS the agent must follow for every task.
> Skipping phases is the #1 cause of AI coding failures.
> The METR study (2025) showed AI made developers 19% SLOWER because
> the AI skipped planning and verification, requiring extensive rework.

---

## The Iron Rule

**No code is written before Phase 2 (PLAN) is complete and approved.**

This is non-negotiable. The research is clear: AI agents that jump straight to code produce more bugs, more security vulnerabilities, and ultimately waste more time than agents that plan first.

---

## Phase 1: EXPLORE 🔍

**Goal**: Understand before acting.

**Actions:**

1. **Read the existing codebase** — Before changing anything, understand what already exists:
   - Project structure and conventions
   - Related files and modules that might be affected
   - Existing tests and how they're structured
   - Configuration files and environment setup

2. **Understand the request** — Parse what the human is actually asking for:
   - What is the desired outcome? (not just the described task)
   - What are the acceptance criteria?
   - Are there edge cases implied but not stated?

3. **Map the blast radius** — Identify everything that could be affected:
   - Which files will change?
   - Which existing features might break?
   - Which tests need updating?
   - Are there database migrations needed?

**Output**: A brief summary of findings (2-5 sentences).

**🚫 FORBIDDEN in this phase**: Writing any implementation code, creating new files, modifying existing files.

---

## Phase 2: PLAN 📋

**Goal**: Think on paper before thinking in code.

**Actions:**

1. **Write the plan in plain language** — Not pseudocode. English sentences that a non-technical person could follow.

2. **Structure the plan:**

   ```
   ## Task Understanding
   [One sentence: what the human wants and why]

   ## Approach
   [Step-by-step plan in plain language]

   ## Files to Change
   - `path/to/file.ts` — [what changes and why]
   - `path/to/new-file.ts` — [what it does]

   ## Tests Required
   - [Test 1 description]
   - [Test 2 description]

   ## Risks & Edge Cases
   - [Risk 1 and mitigation]
   - [Risk 2 and mitigation]

   ## Security Considerations
   - [Any auth/input/data concerns]

   ## Estimated Complexity
   [Low / Medium / High] — [one sentence justification]
   ```

3. **Present plan to human for approval**

**Output**: The plan document above.

**🚫 FORBIDDEN in this phase**: Writing implementation code. The plan must be approved first.

**⚡ EXCEPTION**: For trivial changes (typo fix, config value change, simple rename), Phases 1-2 can be compressed into a one-line explanation: "Fixing typo in README.md line 42: 'recieve' → 'receive'."

---

## Phase 3: CODE ⌨️

**Goal**: Implement the approved plan with discipline.

**Rules:**

### 3a. Tests First (TDD Flow)

For every feature or fix:

1. Write the test that should pass when the work is complete
2. Run the test — confirm it fails (red)
3. Write the minimum code to make it pass (green)
4. Refactor while keeping tests green

**CRITICAL WARNING — The Cheating Problem:**
AI agents have a documented tendency to "cheat" on tests:

- ❌ Deleting or commenting out failing tests
- ❌ Modifying assertions to match wrong output
- ❌ Writing tautological tests (`expect(true).toBe(true)`)
- ❌ Testing only the happy path

If you catch yourself doing any of these: STOP. Re-read the test intent and fix the implementation, not the test.

### 3b. Small, Atomic Changes

- One logical change per step
- Each step should leave the codebase in a working state
- If a change requires modifying more than 5 files, break it into sub-tasks

### 3c. Defensive Coding

For every function, consciously consider:

- What if the input is null/undefined?
- What if the input is empty?
- What if the input is absurdly large?
- What if the input contains malicious content?
- What if the network call fails?
- What if the database is unreachable?
- What if the operation times out?
- What if two requests hit this simultaneously?

### 3d. No Dead Code

- Don't leave commented-out code blocks
- Don't write functions "for later"
- Don't add unused imports or dependencies

---

## Phase 4: VERIFY ✅

**Goal**: Prove the code works and is safe before presenting it.

**Mandatory Checks:**

### 4a. Functional Verification

```
□ All new tests pass
□ All existing tests still pass
□ Manual trace through happy path
□ Manual trace through error paths
□ Edge cases tested
```

### 4b. Security Verification (from GUARD.md)

```
□ No hardcoded secrets or credentials
□ All user input validated and sanitized
□ SQL queries parameterized
□ Authentication checked on all endpoints
□ Authorization checked (not just auth)
□ Error responses don't leak internal details
□ No new dependencies without verification
```

### 4c. Quality Verification

```
□ No linting errors or warnings
□ No TypeScript `any` types (if applicable)
□ No TODO/FIXME without linked issue
□ Functions under 50 lines
□ Files under 300 lines (with rare documented exceptions)
□ No code duplication
```

### 4d. Self-Review (from REVIEW.md)

Execute the RCI (Recursive Criticism and Improvement) protocol:

1. Criticize your own code: "What could go wrong?"
2. Fix everything you found
3. Criticize again: "Did I miss anything?"
4. Final version

**Output**: A verification summary:

```
## Verification Results
- Tests: X passed, 0 failed
- Security: All GUARD.md checks passed
- Quality: No warnings
- Self-Review: [Issues found and fixed]
```

**🚫 FORBIDDEN in this phase**: Skipping checks "because the change is small." Small changes cause big outages.

---

## Phase 5: COMMIT 📦

**Goal**: Package the work clearly for the human and for future reference.

**Actions:**

1. **Write a clear commit message:**

   ```
   feat(auth): add rate limiting to login endpoint

   - Add sliding window rate limiter (10 attempts/15min per IP)
   - Return 429 with Retry-After header when limit exceeded
   - Add rate limit bypass for health check endpoints
   - Add integration tests for rate limiting behavior

   Closes #142
   ```

   Format: `type(scope): concise description`
   Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `security`

2. **Summarize for the human:**

   ```
   ## What Changed
   [2-3 sentences max]

   ## How to Test
   [Steps to verify manually if desired]

   ## What to Watch
   [Anything that might need monitoring after deployment]
   ```

3. **Update MEMORY.md** if any lessons were learned.

---

## Phase Transitions — Decision Gates

```
EXPLORE ──→ Can I explain what the codebase does and what needs to change?
             YES → proceed to PLAN
             NO  → keep exploring

PLAN ──→ Has the human approved the plan?
          YES → proceed to CODE
          NO  → revise plan based on feedback

CODE ──→ Is the implementation complete per the plan?
          YES → proceed to VERIFY
          NO  → continue implementing

VERIFY ──→ Do ALL checks pass?
            YES → proceed to COMMIT
            NO  → go back to CODE and fix
                  (if the fix changes the plan, go back to PLAN)

COMMIT ──→ Is the summary clear and the commit message descriptive?
            YES → present to human
            NO  → revise
```

---

## Complexity Calibration

| Task Complexity | EXPLORE | PLAN             | CODE            | VERIFY          | Example                        |
| --------------- | ------- | ---------------- | --------------- | --------------- | ------------------------------ |
| **Trivial**     | 10 sec  | 1 sentence       | Direct          | Quick scan      | Typo fix, config value         |
| **Simple**      | 1 min   | Bullet points    | TDD             | Standard checks | Bug fix, simple feature        |
| **Medium**      | 5 min   | Full plan doc    | TDD + phases    | Full protocol   | New endpoint, new component    |
| **Complex**     | 15 min  | Architecture doc | Phased delivery | Security audit  | New service, data model change |
| **Critical**    | 30 min  | Design review    | Paired phases   | External review | Auth system, payment flow      |

Even trivial tasks follow all 5 phases — just at proportional depth.
