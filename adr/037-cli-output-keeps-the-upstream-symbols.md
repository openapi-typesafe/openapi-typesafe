# ADR-037: CLI output keeps the upstream symbols

- Status: Accepted
- Date: 2026-11-07

## Context

CODING_PRINCIPLES §7.12 forbids emoji and dingbat glyphs as icons in a user interface. The
code-quality audit before 1.0 (B7, finding P2-6) found four in the generator's CLI output:

| Symbol | Where | Line |
|---|---|---|
| `✨` | `src/cli/run-cli.ts` | `✨ openapi-typesafe 1.0.0`, before a run with `--output` |
| `🚀` | `src/cli/cli-output.ts` | `🚀 schema.yaml → schema.ts [50ms]`, after each file it writes |
| `⚠` | `src/adapters/terminal-logger/terminal-logger.ts` | ` ⚠  <warning>` |
| `✘` | `src/adapters/terminal-logger/terminal-logger.ts` | ` ✘  <error>` |

These are the lines that openapi-typescript prints, and openapi-typesafe is a drop-in replacement
for it. Users read them in terminals and CI logs, and scripts match them: our own tests match
`✘  ` in stderr, and `docs/cli.md` shows the `✨` and `🚀` lines. §7.12 is written for UI icons
(a component library, theme colors, accessibility labels). A terminal line has none of those, and
the reasons of §7.12 (rendering per platform, color, alignment) apply only in part to a text
stream.

What the code does with a terminal that is not interactive, checked in the source:

- Colors come from `supports-color` 11 (`terminalSupportsColor` in `src/api/default-ports.ts` and
  `terminalStyle` in `src/cli/main.ts`). They are off when stdout is not a TTY, with
  `FORCE_COLOR=0` or `FORCE_COLOR=false`, and with `TERM=dumb`; `FORCE_COLOR` and some CI systems
  (GitHub Actions among them) turn them on without a TTY. `NO_COLOR` is not read by this version of
  `supports-color`, and our code does not read it either.
- The symbols do not depend on colors: they are written in every case.
- The `✨` line is printed only with `--output`, and a `🚀` line only after a file is written
  (with `--output`, or for each API of a `redocly.yaml`; not with `--check`). Types written to
  stdout never have them in front.

## Decision

1. In 1.x the CLI keeps the four symbols and the line formats above, for parity with
   openapi-typescript. A change of them is a breaking change of the output that users and scripts
   read.
2. §7.12 applies to graphical interfaces. A new line in the CLI output uses plain text; the four
   symbols are not used for new kinds of lines.
3. Plain text markers (for example `warning:` and `error:`) may replace the symbols in 2.0, with a
   migration note.

## Alternatives

| Option | Pros | Cons |
|---|---|---|
| Keep the upstream symbols in 1.x (chosen) | Output stays the same as openapi-typescript; no script breaks | Emoji in a terminal can render as boxes in some fonts |
| Plain text markers now | Meets §7.12 to the letter | Breaks scripts and log filters that match `✘` or `⚠`, in a drop-in replacement |
| Symbols only on a TTY | Clean logs in CI | A second output format to test and document; logs would differ between a terminal and CI |

## Consequences

- The CLI output stays as it was; `docs/cli.md` stays correct.
- A user who wants no color can redirect the output or set `FORCE_COLOR=0`. The symbols stay.
- The 2.0 plan has one more output change to decide.

## Review trigger

The 2.0 planning, or a report that a symbol breaks a terminal or a log tool that users rely on.
