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

## Amendment (2026-11-09): the recheck of claims and reference names

The recheck of the amendments above found four gaps.

- **A claim through a link to a missing directory failed.** `mkdir` with `recursive: true` fails
  on the link itself. A trailing separator makes it follow the link on macOS only; Linux and
  Windows still fail. Claims and writes now follow such links themselves, as the identity key
  does, and create the real path of the target: `link/x.ts` with `link -> missing` creates
  `missing`. The directories they created are then real paths, which a failed run removes.
- **A failed claim kept the directories it created**, and so did a failed single-output write
  (a file name too long for the file system). Both now remove them, deepest first, as a released
  claim does. A directory that was removed since needs no removal, and its new parents are still
  removed; any other failure to remove one fails the run with `OUTPUT_WRITE_FAILED`. Windows
  reports a file put in place of the directory as missing too (ENOENT), so a path that still
  exists is never taken as removed.
- **Reference names that are TypeScript keywords passed.** `keyof`, `typeof`, `readonly`,
  `unique`, `infer` and `new` start a type operator where a type is expected, and `import`,
  `let`, `yield` and the strict-mode reserved words cannot start a type name. The first name of a
  reference is checked against these lists, which were found by compiling `typeof <name>` and
  `<name>` with TypeScript 5.4 and 6.0 over every reserved word and contextual keyword; a name
  after a `.` may be any identifier.
- **An index signature's parameter type of `{}` printed a syntax error** (TS1268). The parameter
  type must now be `string`, `number`, a reference, raw type text, or a union of these.

A rest element whose type is not an array (TS2574) still prints: it is a type error, as a
reference to a missing name is, and decision 7 checks only what can print as TypeScript syntax.

## Amendment (2026-11-09): the third recheck of output paths and index signatures

- **A relative link inside a linked directory was read from the wrong place.** With `a -> real/sub`
  and `real/sub/link -> ../missing`, the identity key and the creation path read `a/link` as
  `missing`, while the system reads `real/missing`, so the write failed with ENOENT. A relative link
  target is now read from the real directory of the link.
- **A recursive `mkdir` that failed part of the way kept the directories above the failing one**
  (`new1/<a name too long>/types.ts` kept `new1`). The directories that exist after the failure
  are removed again, as after a failed write.
- **The index signature check refused types that TypeScript takes.** TS1268 and TS1337 are
  decided by the resolved type, not by syntax: `K["a"]` and a tagged primitive (`string & {}`)
  are valid, and a reference can fail as well. The check now refuses only what can never be a
  parameter type (an object, an array, a tuple, a literal, `readonly`, other keywords) and passes
  an indexed access and an intersection with one valid part; TypeScript checks the rest.

## Amendment (2026-11-09): intersections are reduced as TypeScript reduces them

The third recheck passed an intersection with one valid part. That let through intersections that
TypeScript reduces to something else: `string & "a"` is the literal `"a"` (TS1337), and
`string & number` is `never` (TS1268). The check now reduces the type as TypeScript does, over
atoms: `string`, `number`, and a tag (an object type, as in `string & {}`). A union joins the
atoms of its members; an intersection spreads over unions and keeps the atoms both sides share,
where a tag keeps the other side. The type is a valid parameter type when it reduces to at least
one atom and to no bare tag; a name, an indexed access or type text in it leaves the decision to
TypeScript, as before.

## Amendment (2026-11-10): arguments as written, locations, `--check` and per-stream colors

1. **A flag that takes a value has no `--no-` form.** yargs-parser reads `--no-output` as
   `output: false`, which the CLI used as the text `false` (a file named `false`, a local root
   `<cwd>/false`). The `--no-` form of `--output`, `--redocly`, `--fix`, `--local-ref-root`,
   `--remote-ref-hosts` and their aliases fails with `CLI_FLAG_INVALID`, as a boolean flag with
   another value does. Reading it as "unset" was rejected: the flag is unset when it is left out,
   and `--no-redocly` meaning "no config" would be a new feature.
2. **One schema argument.** A second positional argument fails with the new `CLI_INPUT_EXTRA`
   (exit code 2): an unquoted glob that the shell expanded generated its first file and passed,
   and `CLI_GLOB_UNSUPPORTED` never saw the `*`. A notice was rejected: the run would still
   generate only one of the schemas the user named.
3. **An unknown flag takes no value.** yargs-parser gives an undeclared flag the next argument,
   so `--alphabetise api.yaml` read stdin. Unknown flags, as written, are declared boolean before
   parsing; `--flag=value` still parses, and the notice names the flag as before. Positional
   arguments are not coerced to numbers (`1.10`, `0x10`).
4. **What a URL is.** A location is a URL when it starts with a scheme the generator reads
   (`http:`, `https:`, `file:`), or with any scheme and `//`. Any other text before a colon is part
   of a file name (`-o out:v2.ts`), as the docs promised ("a path is never read as a URL").
5. **`--check` compares lines.** Both texts are compared with LF line ends, so an output that Git
   checked out with CRLF (`core.autocrlf`) is up to date when its lines are.
6. **Colors per stream.** The logger writes to stderr and decides its colors by stderr; the CLI's
   own lines, and the exported `c`, follow stdout.
7. **An API's output errors name the API.** With several APIs, every failure of an API's output
   (`CLI_OUTPUT_*`, `OUTPUT_*`) is an `ApiFailure`, so the line starts with `API <name>:`, and
   `CLI_OUTPUT_DUPLICATE` no longer names the API a second time inside the message.


## Amendment (2026-11-11): redirected names, `file:` URLs, flag spellings and the `c` type

1. **A redirected document keeps its requested URL as its name.** The lint ignore file lists
   problems by the URL `redocly lint` requested, so naming the document by its final URL dropped
   its entries. Only the base of its relative `$ref`s is the final URL (RFC 3986, section
   5.1.3); ADR-033 is amended. Accepting both URLs as keys was rejected: Redocly never writes the
   final one, and two names for one document would also show two names in its problems.
2. **A `file:` URL that names no local path is checked once.** `file://specs/a.yaml` (a host,
   where `file:specs/a.yaml` was meant) and `file:///a%2Fb` name no path, and Node.js throws on
   every file operation with them. One check (`isLocalFileUrl`) serves the `cwd` and
   `localRefRoot` options, `--local-ref-root`, `local-ref-root` in `redocly.yaml` and the output
   guard. A local root that names no path fails before loading (`OPTION_INVALID`,
   `CLI_FLAG_INVALID`, `CLI_CONFIG_INVALID`), as `cwd` does. The output guard compares only
   locations that are local files: a schema or `root` with such a URL is no file an output can
   be, and fails where it is read (`SCHEMA_LOAD_FAILED`, as in the Node API), for its API alone;
   such an output fails with `CLI_OUTPUT_INVALID`, also for its API alone. Failing the schema
   with a CLI code was rejected: the Node API reports the same source as `SCHEMA_LOAD_FAILED`.
3. **A long flag is known only in the spellings yargs-parser is told about.** Those are the
   kebab-case and camelCase names, with or without `--no-`. Kebab-casing the written name first
   made `--Enum`, `--root_types` and `--enum-Values` known, so they took the schema as a value,
   and the notice named another flag. Declaring such a flag boolean is not enough: yargs-parser
   also turns `--enum-Values` into `enumValues`, which set the option. Unknown long flags are
   therefore removed from the arguments before parsing (with their `=value`), and the notice
   names each unknown flag as written. Unknown letters of a short group are still declared
   boolean, since a group can hold known letters too.
4. **The exported `c` is typed by a namespace import.** Its declaration was
   `import colors from 'ansi-colors'`, a default import of a CommonJS module, which is TS1259
   with `module: commonjs` and no `esModuleInterop` (a fifth error beyond the documented four).
   The type is now the return type of `create()` from a namespace import, which is the instance
   type in every module setting. The namespace type itself was rejected: in an ES module the
   namespace of a CommonJS module has a `default` member that the instance has not. The
   declaration test checks such a project with TypeScript 5.4; TypeScript 6 deprecates and 7
   removes its node10 resolution.

## Amendment (2026-11-12): URL text is a URL, flag spellings with `--no-`, redirect duplicates

1. **A source that is URL text is resolved into that URL once, before the load.** A string,
   `Buffer` or stream (CLI stdin) that holds only text starting with `file://`, `http://` or
   `https://` was parsed as a URL late, inside the parser, while the root's name, the redirect
   rule of ADR-017 and the output guard asked whether the source was a `URL` object. So the same
   URL as text threw a `TypeError` for a `file:` URL that names no local path, failed its
   redirects with `SCHEMA_REF_FORBIDDEN`, and let `-o` overwrite the schema it read from stdin.
   The loader now reads a stream or buffer and turns URL text into a `URL` first; every later
   step sees one resolved source (a URL, document text with its origin, or an object), so text
   and a `URL` take one code path. Patching each check for text as well was rejected: a fourth
   check would miss it again.
2. **A `--no-` flag and a removed flag are matched in the spellings yargs-parser reads.** As in
   item 3 of the previous amendment, only the kebab-case and camelCase names, with or without
   `--no-`, name a flag. Kebab-casing the written name made `--no-Output` and `--no-O` a value
   flag (`CLI_FLAG_INVALID`) and `--Immutable-Types` a removed flag (`CLI_FLAG_REMOVED`), while
   `--no-Enum` was unknown. They are now unknown flags with a notice. "Either form" of a removed
   flag in docs/cli.md meant with or without a value; it now says so, and other spellings are
   unknown, as yargs-parser would not have read them as that flag in openapi-typescript either.
3. **A document reached through a redirect and through its final URL stays two documents.** When
   `/latest` redirects to `/pet.yaml` and another `$ref` names `/pet.yaml` itself, the bundle has
   two equal components (`latest-pet` and `pet`); the types are correct. Merging them by final URL
   was rejected: the document is named by the URL it was requested by (item 1 of the previous
   amendment), and here it was requested by two, so a merge must drop one name. Its problems
   would then name one URL only, and the lint ignore entries `redocly lint` writes for the other
   would no longer apply; `redocly lint` itself also reads two documents.
