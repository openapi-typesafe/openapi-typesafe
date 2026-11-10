# ADR-045: Terminal output shows control characters as escapes

- Status: Accepted
- Date: 2026-11-10

## Context

The generator's messages quote the document: a path key, an `operationId`, a pointer. The
migration report quotes the project: file names and text from scripts and configs. Both were
printed as they are. A line break in a path key started a new line in the CI job log, and CI
reads such a line as a command: `::error title=…::…` in GitHub Actions adds a forged annotation,
`##vso[…]` in Azure Pipelines can set variables. An escape sequence (`ESC [2K`) moves the cursor
or erases the lines before it, so it can hide a real warning. The audit of rc.4 showed both with a
document and with a file name in a project.

## Decision

1. Each package has one function, `terminalSafeText` (`src/domain/terminal-text.ts`), that shows
   every control character as an escape: `\n` and `\r`, and `\uXXXX` for the other C0 controls
   but the tab, DEL, the C1 controls, the Unicode line and paragraph separators and the
   bidirectional controls. Other text, the tab included, is kept as it is.
2. The terminal logger of the generator applies it to every message, after the URL secrets are
   hidden. Every message is one line, so a message never needs a line break of its own.
3. The migration report applies it to each line it prints, and the command to the message of a
   failed run. The report's own line breaks are between its lines, so they stay.
4. The function is written once in each of the two packages: the migration command does not
   depend on the generator, and two copies of a small function are cheaper than a shared package
   (CODING_PRINCIPLES 4, rule of three).

## Alternatives

- **Drop the control characters.** Rejected: the user then cannot see why a path key looks
  different from what the document seems to hold.
- **Indent the lines after a line break.** Rejected: GitHub Actions reads a command after leading
  spaces too, and an escape sequence works anywhere in a line.
- **Escape only in CI.** Rejected: a terminal is open to the same escape sequences, and the output
  would depend on the environment (CODING_PRINCIPLES 7.4).

## Consequences

- A message about a path key with a line break shows `\n` where the key has one.
- The generated file is not affected: its text is escaped by the printer (threat model T1).
- The threat model lists the threat as T4c.

## Review trigger

A CI system that reads a command from text that holds no control character.
