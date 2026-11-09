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
