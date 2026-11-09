# ADR-043: The CLI output guard and input checks of the rc.3 hunt

- Status: Accepted
- Date: 2026-11-08

## Context

The hunt on `main` after 1.0.0-rc.3 found these problems in the CLI and the Node API:

| Finding | What happened |
| --- | --- |
| G1, G2 | `CLI_OUTPUT_DUPLICATE` missed `gen/Types.ts` and `gen/types.ts`, or a path through a symlinked directory, when the files did not exist yet: on the first run one API overwrote the other |
| G3 | `-o newdir/` wrote a file named `newdir` and exited with `0` |
| G4 | `-o https://…` and an `https:` `x-openapi-ts.output` exited with `70` and a stack trace |
| G5 | An API without a string `root` exited with `70`, and no other API was generated |
| G6 | `file:a.yaml` became `/a.yaml`, so the output guard compared the output with a file the run did not read |
| G11 | The output guard knew the root schemas only: `-o models.yaml` replaced a `$ref`'d schema file, and an output named `redocly.yaml` replaced the config |
| G12 | IR callback results such as `{}`, `42` or `""` crashed the printer without a code or printed `a?: ;`; `fix: "all"` gave a `TypeError` |
| G13 | `root-types: "true"` was ignored without a word; an unknown fix of an API did not name the API |
| G14 | Text on stdin that is only a YAML string got advice for the Node API |
| #42 | Without `--output`, the CLI silenced the generator, so every warning was lost; debug lines went to stdout, into the types |
| #43 | `silent: true` still printed `Can't resolve $ref` |

## Decision

1. **File identity.** Two paths are one file when their keys are equal: the real path of the
   nearest existing ancestor (links resolved, letter case as stored) followed by the segments that
   do not exist yet. Those segments compare in the letter case rules of the file system that will
   hold them, which the CLI asks the file system: an entry of the directory is looked up in the
   other case. It is not assumed from the OS, since macOS and Windows volumes can be
   case-sensitive and Linux mounts can ignore case. With nothing to look up, names are taken as
   case-sensitive. Unicode normalization (APFS ignores it) is not compared.
2. **An output must be a file.** A URL of another scheme, a `file:` URL without a local path, a
   path that ends with a separator and an existing directory fail with the new usage error
   `CLI_OUTPUT_INVALID` (exit code `2`) before anything is generated. With several APIs only that
   API fails. The file adapter names a location without a local path by its URL, so its own errors
   stay typed.
3. **Relative `file:` URLs** resolve against the working directory, or against `redocly.yaml` for
   an API, as in openapi-typescript (`new URL(location, base)`).
4. **The guard covers every local file the run reads that a user writes**: the schema, every local
   file a `$ref` loads, and the Redocly config file. The schema loader reports the local files it
   read with the bundled document (`LoadedSchema.localFiles`, an internal port). The roots and the
   config are checked before generating; the `$ref`'d files after the documents are read and
   before anything is written. With several APIs, every API is generated first and written after,
   so no output replaces a file another API still reads, and no output may be a file any API
   read. Files the Redocly config loads by itself (a lint ignore file, configs that `extends`
   names, plugins) are not checked: the docs name the checked files exactly.
5. **API entries fail one by one.** An API without a string `root`, an `x-openapi-ts` that is no
   map, an `output` that is no text and a known setting of the wrong type fail that API with
   `CLI_CONFIG_INVALID`, naming the API and the key as written; an unknown fix of an API fails
   with `OPTION_FIX_UNKNOWN`, naming the API. The other APIs are generated. A wrong type fails
   instead of warning: ignoring it generates other types than the config asks for.
6. **Diagnostics go to stderr.** The CLI no longer passes `silent` when the types go to stdout,
   and the terminal logger writes debug lines to stderr too. `silent: true` in the Node API hides
   warnings and the problem lines of a failing document, which the rejected `SCHEMA_INVALID` lists
   in `details.problems`; deprecations and `DEBUG` lines still show. The CLI's logger is never
   silent.
7. **IR callback results are checked** against the IR the printer writes as TypeScript: every
   node kind and its fields, no cycle, a non-empty union, a block comment without `*/`. A bad
   result fails with `CALLBACK_RESULT_UNREADABLE`, as the legacy callbacks do. Type text is printed
   as written and not parsed, because parsing needs the `typescript` package that IR callbacks
   exist to avoid; only blank text fails. A `fix` option that is no list fails with
   `OPTION_FIX_UNKNOWN` instead of being read as a list.
8. **stdin advice.** The loader marks text that came from a stream (`details.received:
   "stream"`), and the CLI tells its users to pass the path as an argument.

`CLI_OUTPUT_INVALID` is a new code, which a minor release may add (ADR-034, decision 2).

## Alternatives

| Option | Pros | Cons |
| --- | --- | --- |
| Letter case from `process.platform` | no file-system query | wrong on case-sensitive APFS and NTFS directories and on case-insensitive Linux mounts |
| Leave non-file outputs to the writer (before) | no new code | exit code `70`, which the docs reserve for bugs |
| Check the `$ref`'d files after writing | no change to the write order | the file is gone before the check runs |
| Parse IR type text with TypeScript when it is installed | catches `"string \|"` | output and errors would depend on whether an optional package is installed |
| Warn about a wrong-typed setting | the run goes on | the output silently differs from what the config asks for |

## Consequences

- With several APIs, the outputs are written after every API is generated, in the order of the
  config, and the generated texts are held in memory until then.
- `silent: true` users no longer see the problem lines on stderr; they read
  `error.details.problems` as before.
- The deprecated `debug()` export writes to stderr, as the docs already said.

## Amendment (2026-11-09): the file system decides output identity; `.` and `..` name directories

The round-2 hunt found two APIs that still overwrote each other on the first run, although their
outputs were one file on disk: `café.ts` written in NFC and in NFD on APFS, `straße.ts` and
`STRASSE.ts` (full case folding), `_/Types.ts` and `_/types.ts` in an empty directory whose name
has no letters (nothing to probe the letter case rules with), and `link/x.ts` next to
`missingdir/x.ts` with `link -> missingdir`. And `-o newdir/.`, `-o a/b/..` and
`output: ./gen/.` wrote a file named like the directory, with exit code `0`.

Decision 1 now reads:

1. **File identity is the file system's own.** Names can prove that two paths are one file, never
   that they are two: no rule on names can follow every file system's normalization and case
   folding. So the name key above stays as an early check, before anything is generated, and
   resolves a link to a missing file or directory by its target (`readlink`, at most 40 hops,
   the Linux limit), and the decision is made at write time: with several APIs, every output is
   claimed before the first byte is written. A claim opens the file for appending, which creates
   it empty when it is missing (through a link too) and never truncates it; the device and file
   number of the open file are its identity, or its real path on a file system without file
   numbers. APIs whose claimed files have one identity all fail with `CLI_OUTPUT_DUPLICATE`, and
   their claims are released: a file and directories a claim created are removed, a directory
   that holds another file since stays, an existing file keeps its content. A failed write
   releases its claim too. `--check` claims nothing: it writes nothing, and every output it
   compares must exist, so its file number already decides. The claim is the `FileClaims` port,
   with an in-memory fake in tests.

Decision 2 adds: a path whose last segment is `.` or `..`, checked as written before resolving
drops it, and a `file:` URL whose parsed path ends with `/` (the URL parser drops `.`, `..` and
`%2E`) name a directory and fail with `CLI_OUTPUT_INVALID`, as a trailing separator does.

| Option | Pros | Cons |
| --- | --- | --- |
| Normalize names (NFC, Unicode case folding) in the key | no file is created early | still a guess: each file system folds and normalizes in its own way, and HFS+ uses NFD |
| Create each output exclusively (`wx`) | a collision is an `EEXIST` | fails for an existing output and for a link to a missing file, which the CLI must write through |
| Claim, then compare file numbers (chosen) | the file system decides; exact for links, case and normalization | outputs exist, empty, for a moment before the types are written |

Consequences: with several APIs, missing outputs exist as empty files between the claim and the
write, which is the same run; a run that fails on a duplicate leaves no new file or directory.
Review trigger: a file system on which two open files of different paths share a device and file
number (then the claim would see a duplicate that is none).

## Amendment (2026-11-09): reference names are checked

Decision 7 checked every IR field except the `name` of a `reference`, which only had to be
non-blank, so `{ kind: "reference", name: "a b" }` from an IR callback printed invalid
TypeScript. A reference name must now be a type name as TypeScript reads one: identifiers (the
property name rules) joined by `.`, optionally after `typeof ` (the generator writes
`typeof Status` and `Status.active`); anything else fails with `CALLBACK_RESULT_UNREADABLE`. The
generator itself wrote one name with type arguments in it, `FlattenedDeepRequired<components>`;
it is now a reference with a type argument, which prints the same text.
