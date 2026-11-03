# ADR-021: Opt-in output fixes are named values of one `fix` option

- Status: Accepted
- Date: 2026-11-03

## Context

Six roadmap steps fix the output of valid schemas (`research/roadmap-plan.md`, R6, R8, R9, R11,
R12, R13). Today's output for them compiles but is wrong or incomplete:

| Step | Today | Fixed |
| --- | --- | --- |
| R6 | an `allOf` member `{ required: [name] }` adds `& Record<string, never>` | `name` becomes required |
| R8 | `properties` next to `anyOf` become one more union member | an intersection with the union |
| R9 | `--array-length` with `minItems: 1`, nested arrays, `min..max` ranges gives wrong tuples | the right tuples |
| R11 | `unevaluatedProperties` is ignored | it is typed |
| R12 | a schema named by a parent `mapping` and a discriminated `oneOf` gets both values (`never`) | one value |
| R13 | `--root-types-no-schema-prefix`: of `Void` and `void` only the last gets an alias | numbered aliases |

Changing the output of a valid schema breaks the drop-in promise of 1.x: a project that upgrades
from openapi-typescript 7.13 gets other types and may stop compiling (plan §3, ADR-020 for the
one exception, OpenAPI 3.2). So each fix must be opt-in in 1.x.

Upstream has no flag to follow: its open PRs for these issues (#2850, #2858, #2608, #2546,
#2330, #2880) change the default output. Texts in `.logs/roadmap/R5/`.

The options today are booleans that switch a feature (`--enum`, `--immutable`, `--array-length`),
the same in three places: CLI flags, the Node API, and `x-openapi-ts` in `redocly.yaml`.

## Decision

1. **One option, a list of fix names.** CLI `--fix <names>` (comma-separated, repeatable), Node
   API `fix?: readonly OutputFix[]`, `redocly.yaml` `x-openapi-ts.fix: [names]`. The name is the
   same in all three, like the other options. `OutputFix` is a string-literal union, exported
   with an `OUTPUT_FIXES` list.
2. **Names** are kebab-case and name the schema construct, not an issue number:
   `allof-required` (R6), `anyof-properties` (R8), `array-length-tuples` (R9),
   `unevaluated-properties` (R11), `discriminator-values` (R12), `root-type-numbering` (R13).
   A step may rename its fix before the first release that has it; after that a name is stable.
3. **`all`** turns on every fix of the installed version. A minor release that adds a fix changes
   the output of `all` users; that is what `all` asks for ("the 2.0 output now"), and the
   changeset of every new fix says it. To keep the output stable across updates, list the names.
4. **Unknown names fail** with a typed error `OPTION_FIX_UNKNOWN` (ADR-011) that lists the known
   names. A typo must not give the old output silently.
5. **No fix changes anything else.** Without `fix`, the output is byte-identical to today's. Each
   fix changes only the cases it names; the compat harness checks both (an option set per fix and
   one for `all`).
6. **A fix that needs another option** (R9 needs `--array-length`, R13 needs `--root-types`) does
   nothing without it, and the CLI prints a notice, as for `--root-types-keep-casing` today.
7. **`redocly.yaml` per API replaces** the CLI list, as the boolean settings of an API win over
   CLI flags today. It does not merge.
8. **In 2.0 every fix is the default** and the old output is gone; there is no switch back to
   wrong types. `fix` stays accepted in 2.x with a deprecation notice per name, so 1.x configs
   keep working, and is removed in 3.0. A fix added in 2.x after that is again opt-in under this
   ADR until the next major.
9. **Docs:** `docs/cli.md` gets a `fix` section with a table (name, what changes, upstream
   issue, the release that added it); `docs/node.md`, the migration guide ("New options") and the
   skill's `references/generator.md` link to it. `--help` gets one line for `--fix`; it does not
   list the names.

## Alternatives

| Option | Pros | Cons |
| --- | --- | --- |
| One `fix` list (chosen) | `--help` grows by one line; one place to learn about fixes; `all` gives the corrected output in one word; 2.0 deprecates one option | Not a boolean like the other options; the list needs its own parsing and an error for unknown names |
| One boolean flag per fix (`--allof-required`, …) | Same shape as every other option; each is in `--help` | Six flags that mean "fix this bug"; most users want all and must find six; 2.0 deprecates six flags; a flag name reads like a feature, not a fix |
| One switch `--output-version 2` | One word, no names | Cannot pick one fix; the same "changes on update" effect as `all` without the choice; a version number for a 1.x output is confusing |
| Fixes on by default, `--legacy-*` to switch back | Correct types for new users | Changes valid output in a minor version, against the drop-in promise (plan §3) |
| No fixes until 2.0 | No new options | The fixes wait a major; beta users who hit them have no way out |

## Consequences

- The CLI parser gets one string option (`--fix`) next to the `$ref` limits; the Redocly API
  settings read one array. The first fix step (R6) adds the option, its error code, its docs and
  the harness option sets; later steps add a name and a docs row.
- Each fix step checks its name alone, with `all`, and with the flags it interacts with.
- 2.0 planning has one list to flip.

## Review trigger

Upstream merges one of the PRs above with a different default or flag: decide whether to follow
it. A tester reports that `all` changed their output on an update in a way they did not expect.
The 2.0 planning.
