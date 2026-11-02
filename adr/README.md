# Architecture Decision Records

An ADR records one systemic decision: architecture, dependencies, supported versions, release process, or a
breaking change. Day-to-day choices belong in pull requests, not here.

## Rules

- One decision per file: `NNN-short-title.md`, numbered in order. Start from [`000-template.md`](./000-template.md).
- An accepted ADR is not rewritten. To change a decision, write a new ADR that supersedes it and set the old one's
  status to `Superseded by ADR-NNN`.
- Every ADR names a **review trigger**: the event that makes us look at the decision again.

## Index

| ADR | Title | Status |
|---|---|---|
| [001](./001-fork-with-full-history.md) | Fork with full history | Accepted |
| [002](./002-type-ir-and-string-printer.md) | Own Type IR and string printer instead of the TypeScript compiler API | Accepted |
| [003](./003-dependency-policy.md) | Dependency policy and initial dependency review | Accepted |
| 004 | Legacy `ts.Node` callbacks and `stringToAST` | Pending (after research task 3.1) |
| 005 | Schema loader and `$ref` bundling | Pending (after research task 3.5) |
| [006](./006-supported-versions.md) | Supported TypeScript and Node versions, strict compiler flags rollout | Accepted |
| 007 | Release, provenance and npm name reservation | Pending (Phase 9) |
| [008](./008-client-source-language.md) | Client source language | Accepted |
