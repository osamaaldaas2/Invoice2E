# CLAUDE.md — Agent Operating System

> READ THIS ENTIRE FILE BEFORE DOING ANYTHING.
> Then read every file referenced below. This is mandatory, not optional.

---

## MANDATORY: Read These Files First

**At the start of EVERY task, before writing any code, you MUST read these files in order:**

1. Read `.claude/SOUL.md` — Your core principles and red lines
2. Read `.claude/MEMORY.md` — Project context, past decisions, known issues
3. Read `.claude/SKILL.md` — Technical standards for this project's stack
4. Read `.claude/GUARD.md` — Security rules you must follow
5. Read `.claude/WORKFLOW.md` — The mandatory work process
6. Read `.claude/REVIEW.md` — How to verify your own work
7. Read `.claude/PERSONA.md` — How to communicate

**If any of these files don't exist, tell the user immediately.**

Do NOT skip reading these files. Do NOT assume you know their contents from a previous session. Read them fresh every time.

---

## The One Rule That Matters Most

**NEVER write code before completing the PLAN phase from WORKFLOW.md.**

The process is: EXPLORE → PLAN → CODE → VERIFY → COMMIT. Every time. No exceptions.

---

## MEMORY.md Is Your Responsibility

You MUST actively maintain `.claude/MEMORY.md`:

**At session start:**

- Read MEMORY.md
- Summarize what you know about the project to the user
- Ask if anything has changed

**During the session:**

- When you encounter a new gotcha or surprising behavior, note it for MEMORY.md
- When a new dependency is added, track it for MEMORY.md
- When an architecture decision is made, draft an ADR entry

**At session end (EVERY session):**

- Ask the user: "Should I update MEMORY.md with what we learned today?"
- If yes, update these sections:
  - Session Log (what was done)
  - Error Log (if any errors occurred)
  - Verified Dependencies (if new packages were added)
  - Banned Patterns (if new anti-patterns were discovered)
  - Known Gotchas (if new surprises were found)
  - Architecture Decisions (if any were made)

**If MEMORY.md is empty**, that means this is a new project. Ask the user to help you fill in the Project Overview table (name, tech stack, database, etc.) before starting any work.

---

## Task Classification

When you receive a task, classify it first:

- 🟢 **Standard** — Clear requirements, no security sensitivity → Follow WORKFLOW.md normally
- 🟡 **Sensitive** — Involves auth, payments, PII, external APIs → Enhanced GUARD.md checks + ask for human approval
- 🔴 **Critical** — Production data, infrastructure, security changes → Full audit + human reviews every change
- ⚪ **Trivial** — Typo, comment, config value → Compressed workflow (1-sentence plan, quick verify)

---

## Escalation — Stop and Ask When:

- You're unsure if a package/library actually exists (DO NOT GUESS)
- The task involves authentication, payments, or encryption
- You find a security vulnerability in existing code
- Requirements are ambiguous and could go multiple ways
- You need to make a destructive change (delete, drop, truncate)
- The planned approach isn't working after starting implementation

Format: `🔴 ESCALATION: [one-line summary]` then explain context, risk, and options.

---

## Quick Checklist

```
BEFORE WRITING CODE:
□ Read all .claude/*.md files
□ Explored the codebase
□ Wrote a plan
□ Human approved the plan
□ Checked GUARD.md for security concerns

BEFORE DELIVERING CODE:
□ Ran REVIEW.md self-review protocol
□ Verified all dependencies are real
□ Checked for hallucinations
□ All tests pass
□ Confidence level stated

AFTER DELIVERING CODE:
□ Offered to update MEMORY.md
```

---

## File Locations

```
project-root/
├── CLAUDE.md              ← This file (auto-loaded)
└── .claude/
    ├── SOUL.md            ← Principles & red lines
    ├── SKILL.md           ← Technical standards
    ├── PERSONA.md         ← Communication style
    ├── WORKFLOW.md        ← Work process (EXPLORE→PLAN→CODE→VERIFY→COMMIT)
    ├── GUARD.md           ← Security rules & OWASP defenses
    ├── REVIEW.md          ← Self-review protocol
    └── MEMORY.md          ← Project memory (UPDATE THIS EVERY SESSION)
```

<!-- gitnexus:start -->

# GitNexus MCP

This project is indexed by GitNexus as **Invoice2E.1** (2847 symbols, 8356 relationships, 200 execution flows).

GitNexus provides a knowledge graph over this codebase — call chains, blast radius, execution flows, and semantic search.

## Always Start Here

For any task involving code understanding, debugging, impact analysis, or refactoring, you must:

1. **Read `gitnexus://repo/{name}/context`** — codebase overview + check index freshness
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 warns the index is stale, run `npx gitnexus analyze` in the terminal first.

## Skills

| Task                                         | Read this skill file                               |
| -------------------------------------------- | -------------------------------------------------- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"  | `.claude/skills/gitnexus/impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"             | `.claude/skills/gitnexus/debugging/SKILL.md`       |
| Rename / extract / split / refactor          | `.claude/skills/gitnexus/refactoring/SKILL.md`     |

## Tools Reference

| Tool             | What it gives you                                                        |
| ---------------- | ------------------------------------------------------------------------ |
| `query`          | Process-grouped code intelligence — execution flows related to a concept |
| `context`        | 360-degree symbol view — categorized refs, processes it participates in  |
| `impact`         | Symbol blast radius — what breaks at depth 1/2/3 with confidence         |
| `detect_changes` | Git-diff impact — what do your current changes affect                    |
| `rename`         | Multi-file coordinated rename with confidence-tagged edits               |
| `cypher`         | Raw graph queries (read `gitnexus://repo/{name}/schema` first)           |
| `list_repos`     | Discover indexed repos                                                   |

## Resources Reference

Lightweight reads (~100-500 tokens) for navigation:

| Resource                                       | Content                                   |
| ---------------------------------------------- | ----------------------------------------- |
| `gitnexus://repo/{name}/context`               | Stats, staleness check                    |
| `gitnexus://repo/{name}/clusters`              | All functional areas with cohesion scores |
| `gitnexus://repo/{name}/cluster/{clusterName}` | Area members                              |
| `gitnexus://repo/{name}/processes`             | All execution flows                       |
| `gitnexus://repo/{name}/process/{processName}` | Step-by-step trace                        |
| `gitnexus://repo/{name}/schema`                | Graph schema for Cypher                   |

## Graph Schema

**Nodes:** File, Function, Class, Interface, Method, Community, Process
**Edges (via CodeRelation.type):** CALLS, IMPORTS, EXTENDS, IMPLEMENTS, DEFINES, MEMBER_OF, STEP_IN_PROCESS

```cypher
MATCH (caller)-[:CodeRelation {type: 'CALLS'}]->(f:Function {name: "myFunc"})
RETURN caller.name, caller.filePath
```

<!-- gitnexus:end -->
