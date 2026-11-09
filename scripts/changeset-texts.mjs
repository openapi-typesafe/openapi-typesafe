// The internal references that a changeset text must not name (ADR-040 rule 8): the changelog is
// read on npm and on GitHub releases, where the ADRs, the audits, the hunts and the items of their
// reports mean nothing. The pull request and the commit carry those references.

/** Kinds of internal reference, each with the pattern that finds it in one line. */
export const INTERNAL_REFERENCES = [
  // `ADR-040`, `ADR 040`, `adr-040`, `ADR040`.
  { name: "an ADR", pattern: /\bADR[\s_-]?\d+/i },
  // A link or a path into the ADR folder: `(../adr/040-….md)`, `adr/040-….md`.
  { name: "an ADR file", pattern: /(?:^|[\s("'[/])adr\//i },
  // `security audit`, `audit findings`; `npm audit` is a command readers can run.
  { name: "an audit", pattern: /(?<!\bnpm\s)\baudits?\b/i },
  // `round-2 hunt`, `hunt items`.
  { name: "a hunt", pattern: /\bhunts?\b/i },
  // Items of the audit and hunt reports: `(B2)`, `(S4)`, `(G13)`, `(RC4 S4)`, `PB-14`.
  { name: "a report item", pattern: /\((?:RC\d+\s)?[BGS]\d+\)|\bPB-\d+\b/ },
];

/** Every internal reference in `text`, as `{ line, name, text }` with 1-based line numbers. */
export function findInternalReferences(text) {
  return text.split("\n").flatMap((line, index) =>
    INTERNAL_REFERENCES.filter(({ pattern }) => pattern.test(line)).map(({ name }) => ({
      line: index + 1,
      name,
      text: line.trim(),
    })),
  );
}
