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

## Amendment (2026-11-08): the exported fix names before 1.0

The public API audit before 1.0 (finding P2-1) found four exported names where decision 1 promised
two: `OutputFix` was both a union and a `const` object with `SCREAMING_CASE` keys
(`OutputFix.ALLOF_REQUIRED`), next to the `OUTPUT_FIXES` list, the `OutputFixName` union, and
`ALL_OUTPUT_FIXES`, a string `"all"` whose name reads like a list of every fix. After 1.0 each name
and each of the 17 object keys stays for all of 1.x.

1. The entry exports what decision 1 names, plus the option's element type:
   - `OutputFix`: the string-literal union of the fix names (a type only);
   - `OUTPUT_FIXES`: the list of every fix of the installed version, in the order of the docs;
   - `OutputFixName`: `OutputFix | "all"`, the element type of the `fix` option.
2. The `OutputFix` object and `ALL_OUTPUT_FIXES` are no longer exported. The generator keeps an
   internal object (`FIX` in `src/domain/output-fixes.ts`) for its own code. They shipped only in
   rc versions, which are not a contract, so there is no alias; the changeset names them.
3. The 17 names were checked once more against decision 2 (kebab-case, the schema construct, no
   issue number). None is renamed. `ref-pointers` names the construct of ADR-026 (`$ref` pointers
   into schema keywords) and `read-write-refs` the `readOnly` / `writeOnly` flags that a `$ref`
   or an `allOf` member carries. Both read well next to the docs table, and a rename would break
   the configs of rc users for no gain in meaning. From 1.0 every name is frozen (ADR-034).

| Option | Pros | Cons |
| --- | --- | --- |
| Union, list and `OutputFixName` (chosen) | what decision 1 promised; the names users write are the strings they also write in `redocly.yaml` and on the CLI | no constant to import for `"all"` |
| Keep the object and the list | constants with autocomplete | 17 more stable key names; two ways to spell each fix; `OutputFix` is a value and a type |
| Rename `ALL_OUTPUT_FIXES` to `OUTPUT_FIX_ALL` | a constant for `"all"` | one more export for a one-word literal that the union already checks |

## Amendment (2026-11-08): which rc.4 output changes need a fix name

The review before rc.4 (`RC4_BUGS.md`) found six output bugs. Decision 5 keeps output that
compiles byte-identical without `fix`; it was written for type rules that give valid but too
wide types (the table above). We apply it to each finding with one test: **does the change touch
output that compiles and means what the document says?** If it does, it needs a fix name. If the
output did not compile, or compiled only because two declarations collided so that a type means
something the document does not say, the change is the default, as the other "Output fixes" of
the migration guide are.

| Finding | Before | Default or fix | Why |
| --- | --- | --- | --- |
| G9: an enum named `Record`, `Omit`, `Partial` | Did not compile (TS2315) | Default: `Record_2` | No working output changes |
| G7: an enum named `Blob` with `--binary-as-blob` | Compiled, but every `format: binary` field had the enum's type | Default: `Blob_2` | `--binary-as-blob` is new in openapi-typesafe, so no upstream output changes; the field type contradicted the document |
| G8: enums of two schemas with one name (`status`, `Status`) | Compiled, TypeScript merged them, each schema accepted the other's values | Default: `Status_2` | The type contradicted the document and depended on schema order; the generator never meant to merge them. Measured below |
| G8, G10: a schema enum or a root alias named `ApiPaths` with `--make-paths-enum` | Merged into the paths enum, or did not compile (TS2567) | Default: `ApiPaths_2` | As above |
| G15: a repeated `operationId` | Did not compile (TS2300) | Default: `dup2` | No working output changes |
| G16: keywords next to a 3.1 `$ref`; a parameter with `content` | Compiled, types too wide (`Base`, `string`) | Fix: `ref-siblings`, `parameter-content` | Valid output that code relies on, the case decision 5 is for |

How the names stay as they were where nothing collides:

1. An enum keeps its name unless another enum of a different schema location asked for it first,
   or the finished output needs it. Requests of one location (a property and an inline `allOf`
   item) still share one enum, as before.
2. Which global types the output refers to is known only at the end, and a reference to the
   global `Blob` cannot be told from one to an enum `Blob`. So an enum avoids every name the
   output may need (the globals of `global-type-references.ts`, the helper types, the
   `--read-write-markers` types, `ApiPaths`, the root names) while the document is transformed,
   and gets its own name back at the end where the output does not need it (`EnumNameClaims`,
   `withEnumsRenamed`). An enum named `Blob` without `--binary-as-blob` is still `Blob`.
3. The number is the one `--root-types` uses for its own conflicts (`Name_2`, `Name_3`, …), and
   root aliases give way to every other declaration, so all generated declarations follow one
   rule. A repeated `operationId` gets the number `--make-paths-enum` already gives its `ApiPaths`
   member (`listItems2`), so the two names match.

Measured on the 200-document compat corpus against the fork base, over eight option sets
(`default`, `enum`, `dedupe-enums`, `enum+dedupe-enums`, `enum+enum-values`, `make-paths-enum`,
`root-types`, `root-types+root-types-no-schema-prefix`): output that compiled changed in one
document, Apple App Store Connect, under `enum` and `enum+enum-values`. Its `Certificate.type`
(`"certificates"`) and the schema `CertificateType` (nine certificate kinds) merged into one enum
`CertificateType`, so a certificate resource accepted any certificate kind as its `type`. Now the
first is `CertificateType` and the second `CertificateType_2`. Every other changed case changed
output that did not compile. The harness counts a golden file whose enums merged, where ours keeps
them apart and compiles no worse, as a fix of invalid output (`golden-invalid`), so the release
gate still fails on any other change of compiling output.

The two new fixes follow decisions 1 to 7: `ref-siblings` needs no other option and changes only
OpenAPI 3.1 and 3.2 documents (3.0 says that keywords next to a `$ref` are ignored);
`parameter-content` applies to every version. The compat harness has an option set for each.

| Option | Pros | Cons |
| --- | --- | --- |
| Default for collisions, fix names for type rules (chosen) | Output that did not compile, or whose types a name collision changed, is correct without a flag; valid output stays byte-identical | A schema whose enum was merged gets a new enum name |
| A fix name for G7 and G8 too | No output that compiled changes | The default output keeps types that contradict the document; with `--binary-as-blob`, an option of ours, there is no upstream output to keep |
| Rename every enum that has a global's name, used or not | One step, no renaming back | An enum named `Blob` without `--binary-as-blob` changes for no reason |
| G16 as a default | 3.1 output follows JSON Schema without a flag | Changes valid output of every 3.1 document with such siblings, against decision 5 |

## Amendment (2026-11-09): a document key is one pointer segment

The generator built its location pointers with the original `createRef`, which reads any part that
contains `#/` as a `$ref`. Document keys (paths, property names, media types, parameter names) went
in as parts, so a key like `#/%zz` threw `URIError`, and a key like `a#/b` named its node by the
text after the last `#/`: with `--enum` and `--enum-values` the property `a#/b` of `Rate` gave
`RateB`, two such keys could give the same name, and the values array lost its type lookup.

1. One rule builds every pointer, in the generator and in the loader: `appendPointer` and
   `childPointer` (`src/domain/openapi/json-pointer.ts`) escape each raw key with
   `escapePointerSegment` and never parse it. That escapes `~` and `/` (RFC 6901) and `%` and `#`
   (`%25`, `%23`): a URI fragment cannot hold either as written (RFC 6901 §6, RFC 3986), and
   reading a pointer back percent-decodes it and starts at the first `#/`. The exported
   `createRef` keeps the original parsing of its parts (ADR-034).
2. This is a bug fix, not an output fix under this ADR, as the `%` escape before it (upstream
   #2251): the old names came from a pointer that does not name the node. Without `--enum` or
   `--enum-values` the output does not change; with them it changes only for keys that contain
   `#/` or end in `#`, which upstream also misnamed. No flag keeps the old names.
3. The discriminator code, a port of the original `scanDiscriminators`, matched the pointers it
   builds with `$ref` and `mapping` texts as the document writes them. That held only while both
   sides escaped alike: Redocly writes a bundled `mapping` value percent-decoded (`.../a#b`,
   `.../50%`) and keeps the escapes of a `$ref` (`.../a%23b`), so with `#` escaped a schema named
   `a#b` lost its mapped value, and a `mapping` to `50%` threw URIError. These comparisons now use
   `canonicalRef`, which writes a local `$ref` or `mapping` text in the form `appendPointer`
   builds; a text that is no pointer (`.../50%`) is read as written. A value inferred from a `$ref`
   is still the name as the `$ref` writes it, as in the original. We checked names `a#b`, `#x`,
   `a b`, `a%41`, `50%` and `a#`, with `$ref`s written as is and percent-encoded, with no options,
   `--enum`, `--enum-values`, `--root-types` and `--fix all`: the output is the same as before
   except for `a#` (decision 2) and the `mapping` to `50%`, which threw before. Escaping `#` only
   before a separator, our first take, kept the text equal but was a second rule next to
   RFC 6901, and the check made a deep document walk quadratic.
4. The loader's messages (unsupported keys, malformed `$ref`s) name a key with `%` or `#` in the
   same escaped form, so each pointer they print reads back to its key.

## Review trigger

Upstream merges one of the PRs above with a different default or flag: decide whether to follow
it. A tester reports that `all` changed their output on an update in a way they did not expect.
The 2.0 planning.
