# ADR-011: Typed errors with stable codes, and CLI exit codes

- Status: Accepted
- Date: 2026-11-02

## Context

ENGINEERING_PLAN 4.6 asks for typed errors with a stable `code` and structured `details`, and for a CLI that
maps codes to messages and exit codes (task 7.2). Before this decision:

- The schema loader threw plain `Error`s, and passed reader and parser errors (`ENOENT`, JSON and YAML syntax
  errors) through unchanged. The ported transformers had their own `Error` subclasses without codes.
- The CLI printed a message, then threw; Node exited with code 1 through the unhandled rejection and printed a
  stack trace after the message. `--check` with stale output exited with 1 on purpose. No exit code was
  documented.
- Users of the Node API match on messages: the inherited tests do (`toThrowError("Unsupported OpenAPI version:
  2.0")`), so messages are part of what a drop-in replacement keeps.

## Decision

1. **One base class.** `OpenAPITypesafeError` (`src/domain/errors.ts`) carries `code`, `details` (plain,
   JSON-serializable facts) and the standard `cause`. It is exported with `ERROR_CODES`, the `ErrorCode` type
   and `isOpenAPITypesafeError()`, which also accepts the same shape from another copy of the class (the CJS
   and ESM builds are separate copies).
2. **A closed set of codes.** `ERROR_CODES` lists every code. The existing error classes keep their names and
   extend the base. Loader failures are created by small factory functions (`lib/schema-load-errors.ts`);
   a new class per code is not needed, because code is the discriminator.
3. **Messages do not change.** Every typed error keeps the original message. A wrapped reader or parser error
   uses the original error's message and keeps it as `cause`. The code doubles as the message key for a
   future localized CLI (CODING_PRINCIPLES §7.8); the Node API keeps English messages.
4. **Bugs stay untyped.** A broken invariant (`assertNever`, an invalid IR constructor argument) is a plain
   `Error`.
5. **The CLI maps every code.** `src/cli/cli-errors.ts` has an exhaustive `Record<ErrorCode, …>` table, so a
   new code does not compile until the CLI handles it. Exit codes: `0` success, `1` stale output with
   `--check` (as before), `2` usage or configuration, `3` input document, `4` output files, `70` unexpected
   error (sysexits `EX_SOFTWARE`), with the stack trace. The CLI prints one line: the message and the code.
   For `SCHEMA_INVALID` the problems were printed while linting, so the line only counts them.
6. Documented in `docs/cli.md` (exit codes) and `docs/node.md` (errors).

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Chosen: one base class, closed code set, original messages, exhaustive CLI table | Programs decide by code; messages stay compatible; the compiler finds unhandled codes | Two places to touch for a new code (the code list and the CLI table) |
| One class per code | `instanceof` checks per failure | Many tiny classes; `instanceof` breaks across the CJS and ESM copies anyway |
| New, clearer messages | Better text | Breaks users and tests that match on messages; a drop-in must not |
| Keep exit code 1 for every failure | No change for scripts that test for 1 | Scripts cannot tell a stale `--check` from a broken schema; failures print a stack trace |

## Consequences

- A failure that used to exit with 1 (through the unhandled rejection) now exits with 2, 3, 4 or 70. Scripts
  that test for a non-zero code are unaffected; `--check` keeps exit code 1 for stale output. The changeset
  says so.
- Errors thrown by the Node API for unreadable sources and documents are now `OpenAPITypesafeError`s; the
  original reader or parser error is the `cause`, and the message is unchanged. Code that checked
  `error.code === "ENOENT"` must read `error.cause.code`.
- Task 7.3 moves `bin/cli.js` into `src/cli/`; the error table is already there.

## Review trigger

- A user reports a script that depends on exit code 1 for a failure other than `--check`, or
- the CLI gets localized messages (then the code becomes the message key), or
- 2.0 planning starts.
