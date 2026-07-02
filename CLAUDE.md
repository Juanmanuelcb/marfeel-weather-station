# Weather Station Take-Home: Project Conventions

Project-level conventions for Claude Code working in this repo. This is the Marfeel
engineering take-home: take a rough "spike" weather-sensor pipeline to production and
build a real-time fleet console. It is graded on **decisions**, not code volume —
`DECISIONS.md` is read first. Full analysis of the challenge lives in `INSIGHTS.md`
(internal, gitignored).

## Operating contract (do not skip)

1. **ANALYSE, PLAN, CONFIRM.** Never change code or docs without first presenting an
   analysed plan and getting an explicit go-ahead. Mechanical work (installs, file
   moves, smoke tests, reads) proceeds without asking.
2. **Keep the decision log live.** Every real decision goes into
   `.notes/DECISIONS_LOG.md` as it happens — written incrementally, never
   reconstructed at the end. This is the raw material we distill into `DECISIONS.md`.
   Confirm with me before writing to it.
3. **Never commit or push automatically.** Only on explicit request. Use
   **Conventional Commits** for the subject line (`feat:`, `fix:`, `docs:`, `test:`,
   `refactor:`, `chore:`, with an optional scope like `feat(ingestor):`). Keep the body
   plain — **no `Co-Authored-By:` trailer, no Claude/robot attribution.** One logical
   change per commit.
4. **Confirm before writes that would ship.** Changes to pushed files (`DECISIONS.md`,
   `README.md`, source) are confirm-first. Internal notes (`.notes/`, `INSIGHTS.md`)
   I can update and report.

## The deliverable workflow

- `.notes/` (gitignored) — planning, scratch, the live decision log. Never shipped.
- `.notes/DECISIONS_LOG.md` (gitignored) — running log, four buckets per decision:
  **Decision · Why · Alternative rejected · AI's role** (delegated / kept as my call /
  where it helped / where it fell short).
- `INSIGHTS.md` (gitignored) — the challenge analysis. Internal.
- `DECISIONS.md` (committed, written at the end) — distilled from the log: what
  changed and why, trade-offs, what I'd do with more time, and a short AI-usage
  section (what I delegated, what I kept, where it helped, where it fell short).
- The repo ships source + `README.md` + `INSTRUCTIONS.md` (the original brief) +
  `DECISIONS.md`. Nothing else.

## Agent-fanout workflow

The pattern that worked last time: read context → propose a fanout (audit agent +
build agents, or one agent per file/issue) → **confirm the final plan and agent count
with me before triggering** → adversarially re-check the results. Disjoint
edit-boundary contracts (one agent owns one directory/file) so parallel agents never
conflict. Verify investigation-agent claims that hinge on library internals before
shipping them.

## Language

For all prose (pushed files, README, conversation back to me): talk like a person.
Short sentences. One idea per sentence. Avoid AI-promotional or over-decorated
language and em dashes. Cut anything that decorates rather than informs. When asking
me to clarify, prefer multiple-choice over open-ended. When uncertain, verify before
guessing. Don't just agree with me — if I'm wrong or over-engineering, say so and
give a frank insight.

For copy in shipped prose, never use: leverage, elevate, streamline, empower, unlock,
unleash, revolutionize, transform, seamless, robust, cutting-edge, comprehensive,
holistic, game-changing, innovative. Three checks before shipping a line: swap the
subject for something else (still works = too generic), read it out loud (sounds stiff
= rewrite), ask "so what?" (no obvious answer = be more concrete).

## Code quality

Match the style already in this repo, not an outside house style. This is a code
challenge built on an existing spike. Keep its conventions: `function` declarations
(not forced arrow components), relative imports (not an `@/` alias), tabs, named
exports, TypeScript with no `any`. Consistency with the existing code wins over
importing rules from other projects. Adapt only what fits; don't add ceremony.

## Anti-slop rules

- No comments explaining WHAT code does. Comments only for non-obvious WHY.
- No speculative abstractions. Flat, explicit code until a third concrete use forces
  extraction. No `Manager` / `Registry` / `Factory` triads.
- No dead code, no unused types, no half-finished implementations.
- If you generate something that smells like AI slop (boilerplate types, unused
  imports, over-defensive validation at internal boundaries), delete it before
  reporting done.

## After each task

Re-read every line of every file you touched, not just the lines you changed. Before
calling a task done, check the whole file for: dead code, unused imports, leftover
TODOs, comments that explain WHAT, naming that drifted from the rest of the file. Fix
violations before reporting done.

## Client UI patterns (React)

The client is a real-time fleet console (Home + Debug). These apply to the TS client.
The Node services are plain JS and out of scope here.

- **Four states, never collapsed into one.** Distinguish loading, empty (no data ever),
  no results (a filter is active), and error. Each gets its own copy. No-results points
  at clearing the filter. Empty points at the thing that would populate it. Show an
  error state only when the failure is real and the user can act on it.
- **Skeletons for content loads, spinners for actions.** A content load shows a skeleton
  that mirrors the loaded layout. Reserve spinners for submits and refreshes. Don't swap
  already-rendered content for a skeleton during a background refetch.
- **Container / presentation split.** Keep data fetching, routing, and state in the
  page/container. Keep rendering in a presentational component that takes props. The
  pure render component stays easy to test.
- **Extract a sub-component when it earns a file.** Inline a one-use, trivial, sub-30-line
  piece. Extract to its own file when it is reused, owns a real stylesheet, has internal
  structure, or grows past ~60 lines. A file that just forwards props is noise.

## Error handling

Wrap non-critical side effects (logging, metrics, secondary writes) in try/catch, log,
and continue. A failed metric write must not kill ingestion. Add a one-line WHY comment
on any swallowed error.

## Don't be fooled by AGENTS.md

The repo's `AGENTS.md` says "don't bother running the linter or test suite." That is a
deliberate trap in this challenge. A production-minded engineer notes it and adds
tests anyway. We test.
