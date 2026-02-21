# REVIEW.md — Self-Review Protocol

> This file defines HOW the agent verifies its own work.
> Based on: RCI technique (49-65% flaw detection), SUSVIBES benchmark
> (47.5% functionally correct but only 8.25% secure), and the documented
> overconfidence problem in LLMs (Harvard DSR, Winter 2025).

---

## Why Self-Review Is Mandatory

LLMs have a documented overconfidence problem: they report high confidence even when wrong, and their output contains no visual or textual cues distinguishing correct from incorrect code. Without structured self-review, 40-50% of generated code contains exploitable flaws.

**You must NEVER present code to the human without completing this protocol.**

---

## The RCI Protocol (Recursive Criticism and Improvement)

### Round 1: Functional Criticism

After writing code, switch to critic mode and ask:

```
FUNCTIONAL REVIEW CHECKLIST:

□ Does this actually solve the stated problem?
□ Does it handle the happy path correctly?
□ What happens with empty input?
□ What happens with null/undefined input?
□ What happens with extremely large input?
□ What happens with malformed input?
□ What happens when external services fail?
□ What happens under concurrent access?
□ Are there race conditions?
□ Are there deadlock possibilities?
□ Does it handle timeouts?
□ Does it handle partial failures?
□ Does it maintain data consistency on failure?
□ Are all promises/async operations properly awaited?
□ Are all resources properly cleaned up (connections, files, streams)?
```

**Fix everything found. Then proceed to Round 2.**

### Round 2: Security Criticism

Switch to adversarial security reviewer mode:

```
SECURITY REVIEW CHECKLIST:

□ Can user input reach a SQL query unsanitized?
□ Can user input be reflected in HTML unsanitized (XSS)?
□ Can user input control file paths (path traversal)?
□ Can user input control OS commands (command injection)?
□ Are authentication checks present on every endpoint?
□ Are authorization checks present (not just auth)?
□ Can a user access another user's data?
□ Are secrets hardcoded anywhere?
□ Does error output reveal internal details?
□ Can rate limiting be bypassed?
□ Are CORS settings appropriate?
□ Is HTTPS enforced?
□ Are security headers set?
□ Can the deserialization of any input execute code?
```

**Fix everything found. Then proceed to Round 3.**

### Round 3: Quality Criticism

Switch to code reviewer mode:

```
QUALITY REVIEW CHECKLIST:

□ Is every function under 50 lines?
□ Is every file under 300 lines?
□ Does every function have a single responsibility?
□ Are variable names descriptive and consistent?
□ Is there code duplication that should be extracted?
□ Are there magic numbers that should be constants?
□ Is error handling consistent across the codebase?
□ Are types properly defined (no `any` in TypeScript)?
□ Are all dependencies actually used?
□ Are all imported modules actually used?
□ Is the code following project conventions (from MEMORY.md)?
□ Would a new developer understand this code without explanation?
```

**Fix everything found.**

---

## The Hallucination Check 🎯

This is the MOST CRITICAL check. Run it on EVERY response that references external resources.

```
FOR EACH dependency/package referenced:
  → Does this exact package name exist on the official registry?
  → Is the version I specified actually published?
  → Does the API/function I'm calling actually exist in that version?
  → Is the function signature correct (parameters, return type)?

FOR EACH API endpoint referenced:
  → Does this endpoint actually exist in the service documentation?
  → Are the request/response shapes accurate?
  → Are the authentication requirements correctly stated?

FOR EACH configuration option referenced:
  → Does this option exist in the tool's documentation?
  → Is the syntax correct for the current version?
  → Are the default values I'm assuming actually the defaults?

FOR EACH error message or behavior claimed:
  → Is this how the tool/library actually behaves?
  → Am I mixing up behavior from a different tool/version?
```

**If you cannot verify something, say so explicitly:**

> "I'm referencing `package-name@2.3.0` for the `doThing()` function. Please verify this exists and has this API — I cannot confirm this from my training data."

---

## The Happy Path Trap Detector

LLMs disproportionately generate "happy path" code. After every implementation, explicitly ask:

```
1. What is the UNHAPPY path?
   - User provides bad input → [handler exists? Y/N]
   - Network request fails → [handler exists? Y/N]
   - Database query returns nothing → [handler exists? Y/N]
   - File doesn't exist → [handler exists? Y/N]
   - Permission is denied → [handler exists? Y/N]
   - Operation times out → [handler exists? Y/N]
   - Disk is full → [handler exists? Y/N]
   - Memory limit reached → [handler exists? Y/N]

2. What is the ADVERSARIAL path?
   - User sends SQL in form fields → [protected? Y/N]
   - User sends 10MB in a text field → [limited? Y/N]
   - User calls endpoint 10,000 times/second → [rate limited? Y/N]
   - User modifies client-side JavaScript → [server validates? Y/N]
   - User replays a captured request → [idempotent/protected? Y/N]

3. What is the CONCURRENT path?
   - Two users update same record → [conflict resolution? Y/N]
   - Same user submits form twice → [idempotent? Y/N]
   - Long operation interrupted midway → [rollback/resume? Y/N]
```

Every "N" must be converted to "Y" or explicitly documented as an accepted risk with human approval.

---

## Pre-Delivery Final Check

Before presenting ANY code to the human, answer these 5 questions:

### Question 1: Is It Real?

"Have I fabricated any package names, API endpoints, function signatures, or configuration options?"

### Question 2: Is It Complete?

"Does this handle errors, edge cases, and malicious input — or only the happy path?"

### Question 3: Is It Safe?

"Could an attacker exploit any part of this code? Have I checked all GUARD.md rules?"

### Question 4: Is It Necessary?

"Does every line serve a purpose? Is there dead code, unused imports, or over-engineering?"

### Question 5: Is It Clear?

"Would a developer seeing this code for the first time understand it without my explanation?"

**All 5 must be "YES" before delivery.**

---

## Confidence Calibration

After self-review, rate your confidence and communicate it:

| Confidence Level    | When to Use                                     | What to Say                                                                                                        |
| ------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **HIGH** (90%+)     | Well-known pattern, fully tested, verified deps | "This follows the standard pattern for X. All tests pass."                                                         |
| **MEDIUM** (60-90%) | Correct approach but some uncertainty           | "This should work correctly, but I'd recommend testing [specific area] carefully."                                 |
| **LOW** (<60%)      | Unfamiliar territory, unverifiable claims       | "⚠️ I'm less confident about this approach. Specifically, [concern]. Please verify [specific thing] before using." |

**Never present LOW confidence code without the warning.**

---

## Review Shortcuts (When Full Protocol Is Disproportionate)

For trivial changes only (typo, config value, comment update):

```
Quick Review:
□ Change is isolated (only affects intended target)
□ No logic changes
□ No security implications
□ Existing tests still pass
→ If all YES: deliver with note "Trivial change — abbreviated review"
```

For everything else: full protocol, no exceptions.
