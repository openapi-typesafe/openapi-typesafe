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
`parameter-content` (since renamed `parameter-header-content`, see below) applies to every
version. The compat harness has an option set for each.

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

## Amendment (2026-11-09): bundler copies of mapped schemas are removed

Redocly 1.x bundles every discriminator `mapping` value like an external `$ref` and stores its
target under the raw last segment of the pointer. A `mapping` to a local schema whose key needs an
escape (`a~b` written `.../a~0b`, `c/d` written `.../c~1d`) therefore added `a~0b` and `c~1d` to
`components.schemas` as copies, and the output declared each type twice. A `$ref` from another
file back into the root document to such a key (`./root.yaml#/components/schemas/a~0b`) is
bundled the same way and gave the same copy. openapi-typescript 7.13 does the same. Fixing it in Redocly is outside our control while ADR-005 pins Redocly 1.34, so the
loader repairs the bundled document, as it repairs the bundled `$ref`s (PB-14):

1. It records the keys of `components.schemas` before bundling (the bundle edits the document in
   place). A key the bundle added whose value is the very object of a key the document had is a
   copy: it is removed, and the `mapping` values and `$ref`s that name it point at the original.
   Object identity is exact: a schema loaded from another document, or two keys of the document
   that share one object through a YAML alias, stay.
2. By the test of the rc.4 amendment this is the default, not a fix name: the copies are keys the
   document does not have, and the types of the document's own schemas do not change. Code that
   used a copy (`components["schemas"]["a~0b"]`) uses the schema's own key instead; the major
   changeset and the migration guide list it.

Normalizing the `mapping` values before bundling does not help: any pointer to such a key has an
escape, and the bundler names the copy by the escaped segment.

## Amendment (2026-11-10): `parameter-content` covers headers and is renamed

A Header Object has the same `schema` or `content` choice as a Parameter Object (OpenAPI 3.1
§4.8.21). The original typed a header with `content` as a map of its media types
(`{ "application/json": { limit: number } }`), a type no header value has. That output compiles
and code may rely on it, so by decisions 5 and 6 the change needs a fix name, and the fix that
already types a parameter by its media type's schema is the one users would look for.

1. The fix types a header with `content` and no `schema` by the schema of its first media type,
   as it types a parameter. A header with no media type is `unknown`.
2. It is renamed `parameter-header-content`, so the name says what it changes (decision 2). It
   shipped in rc.4 only, and rc versions are not a contract, so there is no alias: the unknown-fix
   error lists the new name, and the changeset names the rename.

| Option | Pros | Cons |
| --- | --- | --- |
| Extend the fix and rename it (chosen) | One fix for the one OpenAPI rule; the name says both places | rc.4 configs with the old name fail until renamed |
| Extend it and keep `parameter-content` | No config changes | The name hides that headers change |
| A second fix `header-content` | Each name changes one place | Two names for one rule; `all` users see no difference |

## Amendment (2026-11-10): `default-input-locations`

With `--default-non-nullable` the original keeps a defaulted property optional where its location
holds the word `parameters`, `requestBody` or `requestBodies`, so the name of a path or a schema
decides it (`/system-parameters`, a property named `hyperparameters`). Reading the place from the
document's structure changes output that compiles in one direction only: such properties become
required. Under a component schema used as a request body, which no rule can tell from a response
schema, that makes a client send a field it could leave out (the openai document of the compat
corpus has one). By decisions 5 and 6 the change is the fix `default-input-locations`, not the
default.

| Option | Pros | Cons |
| --- | --- | --- |
| An opt-in fix (chosen) | Output of the default run stays the original's; the place rule is named and documented | The name of a path or schema still decides by default |
| The structural rule by default | Responses are typed the same whatever their path is named | Request-body components named `*parameters*` gain required fields on an update |
| Keep the words, document them only | No new name | No way to get the structural rule |

## Amendment (2026-11-10): default fixes of the hunt after rc.4

The test of the rc.4 amendment decides these too: output that compiles and means what the
document says keeps its form; output whose type contradicts the document changes by default.

| Finding | Before | Default or fix | Why |
| --- | --- | --- | --- |
| `--dedupe-enums` paired sorted values with names in document order | Compiled; `[desc, asc]` and `[asc, desc]`, both named `[Desc, Asc]`, shared one enum, so `asc` was `Desc = "desc"` | Default: two enums | The type contradicted the document. Enums the original kept apart stay apart: the key is the original key and each value's own name and description |
| A `mapping` by schema name in a document a `$ref` loads | Failed with "Can't resolve $ref" | Default: names that document's schema | No working output changes |
| A `mapping` inside `example`, `default`, `const`, `enum` or an `x-` value | Rewritten to a pointer, also in a `const` type | Default: data stays as written | The type rejected the value the document gives |

## Amendment (2026-11-12): tuple element enums and numbers next to component names

Two follow-ups of the enum names of the rc.4 amendment, both defaults by its test:

1. **Tuple elements wherever the tuple is.** The elements of a `prefixItems` tuple share the
   tuple's location, so with `--enum` their enums asked for one name and TypeScript merged the
   declarations: each element accepted the other elements' values. rc.8 numbered the elements
   (`Pair`, `Pair_2`) only where the tuple is a whole component schema, because it compared the
   element with the location's root schema. An element is now found by the schema that transforms
   it (`SchemaRequest.parent`), so a tuple in a property, an `items`, a union member, a parameter
   or a body is numbered the same way, with `--dedupe-enums` too. Only direct elements count: an
   enum in an element's `allOf`, and a property next to an inline `allOf` item, still share one
   enum. A `$ref` to an element (`…/prefixItems/1`) is typed with that element's enum.
2. **A number skips a component name.** Point 1 of the rc.4 amendment gives a name to the first
   location that asks for it and the next free number to a later one. A number could take the name
   of a component schema that comes later (`Pair_2` for a tuple element, before the component
   `Pair_2`), so the component's enum became `Pair_2_2`. A component's name comes from its schema
   name, so the names that component schemas give their enums are known before any schema is
   transformed (`componentEnumNames`), and a number skips them. Which location keeps an
   unnumbered name is unchanged: the first one that asks.

## Amendment (2026-11-13): enum names do not depend on traversal order

Point 2 of the amendment above kept numbers off component names only. A number could still take
the name a property asks for later: a tuple property `sort` (two enum elements) next to an enum
property `sort_2` of `Holder` gave `[HolderSort, HolderSort_2]`, and the `sort_2` enum, named
`HolderSort_2` in rc.8, became `HolderSort_2_2`. Element numbers also followed the order the
generator met the elements: a path parameter `$ref` to `Tup/prefixItems/1`, met before the
component, gave `[Tup_2, Tup]`. An unrelated `$ref` changed public enum names. Both are defaults
by the test of the rc.4 amendment: the output contradicted the name the document gives a
location, and changed with the order of the document.

The rule: **first collect every name each location asks for, then number.**

1. While the document is transformed, each owner gets a name as before (`EnumNameClaims.nameFor`),
   and the claims record the name asked for, the order of asking, and a tuple element's position
   (`EnumDeclarationRequest.tupleIndex`; elements of the same values share one owner, at the
   lowest position).
2. At the end, when every request is known, `finalEnumNames` decides the names, and
   `withEnumsRenamed` renames the output, the step that already gave back the names the output
   turned out not to need:
   - The first owner of a name keeps it; a name the output may need goes to a number first and
     comes back where the finished output does not need it, as before.
   - The elements of a tuple rank together, where the first of them asked, and among themselves by
     position, so the first element keeps the tuple's name and the later ones are numbered in
     position order.
   - Every later owner gets the next free number, which skips every name any location asked for,
     the component enum names and the names the output may need.
3. A number of one name can never be a number of another (`A_2` is no `A_2_<n>`), and every name
   asked for is skipped, so the order of names does not change any number.

Output where no number met a name asked for later, and where tuples are met in position order
(every document before a `$ref` to a later element), keeps every name: the final names equal the
ones the run gave. The per-object functions (`transformSchemaObject` and the others) have no end
of document, so they keep the names given as they go.

## Amendment (2026-11-13): the same rule with `--dedupe-enums` and for `--enum-values`

The amendment above left two paths that still named by traversal order:

1. **`--dedupe-enums`.** An enum of the same members as one declared already took the stored
   name before its owner's claim saw the request, so the claim kept the position of the element
   met first. A tuple `[a], [b], [a]` with a `$ref` to `prefixItems/2` met first gave
   `[Tup_2, Tup, Tup_2]`, `Tup` holding `b`. Now a request of the owner that declared the enum
   still reports its position to that claim; a request of another owner (another schema with the
   same members) does not, since its position is in another tuple.
2. **`--enum-values` arrays.** The arrays of one name (the elements of a tuple, typed at the
   tuple's location; `Discount/type` and `discount/type`) were numbered as they came, so the same
   `$ref` swapped `tupValues` and `tupValues_2`. The arrays now get the same two steps
   (`EnumValuesNames`): a name as they come, then the final names once every array is known, with
   the elements of a tuple ranked together by position (`inNamingOrder`). Every array name ends
   with `Values`, so a number of one name is never another name asked for, and the other arrays
   keep their order of arrival, as before.

Both are defaults by the test of the rc.4 amendment. Output where the elements are met in position
order keeps every name; a generator fuzz of shuffled documents names the same enums and arrays in
every order (0 of 300 documents differ, against 21 with `--dedupe-enums` and 134 with
`--enum-values` before).

## Amendment (2026-11-14): owners rank by their place in the walk of the document

The two amendments above ranked the claims of one name by when each owner first asked, and the
elements of a tuple together "where the first of them asked". The claims did not record which
tuple an element belongs to, so all tuple elements of one name ranked as one tuple:

- Two tuples that ask for one name (a tuple property `Order.sort` and a tuple schema `OrderSort`,
  both `OrderSort`; schemas `Tup`, `tup`, `TUP`) were numbered together by position:
  `OrderSort = name, _2 = id, _3 = asc, _4 = up`. A query `$ref` to `OrderSort/prefixItems/1`,
  typed before the components, moved the rank and swapped `asc` and `up`. With `--enum-values`
  rc.10 numbered by arrival (`_2 = asc, _3 = id`); rc.11 interleaved them, so that output changed
  from rc.10 without any `$ref`.
- With `--dedupe-enums --fix dedupe-enum-names`, `Sort: [a]` and `Pair: [b], [a]` share `[a]` as
  `Pair`. Its claim ranked at the position of the request that declared it (`Sort`'s 0), so `Pair`
  was `[Pair_2, Pair]`; a `$ref` to `Pair/prefixItems/1`, met first, declared it from `Pair` and
  gave `[Pair, Pair_2]`. The order of `Sort` and `Pair` in the document decided the name of
  `Pair`'s elements.
- The generator fuzz of colliding names (`Tup`, `tup`, `TUP` and their holders, 300 documents)
  gave other names when its `$ref`s were removed in 27 documents with `--enum` and 35 with
  `--dedupe-enums`.

The rule: **an owner ranks by its place in the generator's walk of the document.**

1. The walk meets every location of the document in the order the output is written: the roots
   in their fixed order (`paths`, `webhooks`, `components`, `$defs`), then the document's keys in
   the document's order (sorted with `--alphabetize`). A request records the location the walk
   types it at (`walkedAt`; a tuple element's is its tuple's location) and its position in a
   tuple. A schema typed for a `$ref` into it (`SchemaRequest.isThroughRef`: the
   ADR-026 pointer types, and everything nested in such a target) and a request that only refers
   to an enum (`isOwnerReference`, `discriminator-values`) have no place: the walk meets that
   location elsewhere.
2. `WalkRanks` ranks a place by when the walk first met its location, then by position. A claim
   keeps the earliest place of its requests. The claims of a name get names in rank order
   (`inNamingOrder`): the first owner in the document keeps the name, the elements of a tuple are
   numbered together and in position order, and the next tuple of that name follows. An owner that
   only `$ref`s typed (a location the walk does not visit) comes after every ranked one, in the
   order it asked.
3. With `--dedupe-enums`, a request gives the shared enum's claim its place only where its own
   location gives that name; a request that shares the enum under another schema's name has no
   place among the owners of this one. Any request of that name counts, whichever schema declared
   the enum first.

The run still gives names as it goes and `finalNames` renames at the end, so a document where no
claim changes rank keeps every name. Names that change from rc.10, and why each depended on order:

- `--enum` (and `--dedupe-enums` without the fix), where two tuples ask for one enum name: the
  elements after the first tuple's are numbered tuple by tuple (`OrderSort_2 = asc`,
  `OrderSort_3 = id`), where rc.10 interleaved them by position across tuples, a ranking any
  `$ref` to an element changed. The first tuple's first element keeps the unnumbered name.
- `--enum-values` in the same documents: the rc.10 names come back (rc.11 had interleaved them).
- `--dedupe-enums --fix dedupe-enum-names`, where tuples share an enum under the name of a tuple
  that did not declare it: it is numbered at its position in that tuple (`Pair: [Pair, Pair_2]`);
  rc.10 numbered it by the tuple met first.
- An owner whose first request came through a `$ref` or an owner reference, next to another owner
  of its name: it now ranks where the walk meets it.

Measured: the colliding-names fuzz (300 documents, six option sets) gives the same names with and
without its `$ref`s, and when the `$ref` schemas, paths and webhooks are shuffled while the owners
keep their order (0 documents differ in every set); without colliding names, a full shuffle of
the components changes no name either (18 documents with `--dedupe-enums` before). With colliding
names, a full shuffle changes names by design: the owner first in the document keeps the name (G8).
The 1806 documents of the compat corpus give the same output over ten option sets (`--enum`,
`--enum-values`, `--dedupe-enums` with and without `dedupe-enum-names`, `--alphabetize`,
`--root-types`, `ref-pointers`, `all`, the defaults): none has two tuples of one name.

## Amendment (2026-11-15): enums at a shared location, and ranks without `$ref`s

The 2026-11-12 amendment numbered the enums of `prefixItems` elements, which are typed at their
tuple's location. Everything inside such an element is typed at the tuple's location too, and so
are the `items` of an array and the record values of an object (`additionalProperties`,
`patternProperties`, `unevaluatedProperties`). The rule was keyed on the element itself
(`tupleIndex`), so the properties of these schemas still merged:

- `Shape: [{ kind: [point] }, { kind: [line] }]` declared `ShapeKind` twice; TypeScript merged
  the declarations, so both elements accepted `point` and `line`. The same for `Settings` with an
  own `mode: [auto, manual]` and record values with `mode: [on, off]`. The output compiled, so
  the error was silent (also in the compat corpus: `sendgrid.com` merged a `bounce_type` of
  `bounced | blocked | expired` with one of `soft | hard`).
- Tuple elements inside a nested tuple or an `allOf` of tuples ranked by position alone, so two
  elements at one location and position tied, and a `$ref` met first decided their names.
- With `--fix dedupe-enum-names`, a `$ref` into a schema the walk does not type (a `$defs` entry
  of an enum schema) was a name candidate, so adding such a `$ref` renamed a shared enum.

The rules:

1. A schema typed at its holder's location next to other schemas is at a shared location
   (`SchemaRequest.isAtSharedLocation`): tuple elements, `items`, record values and everything
   in them. An `allOf` item is not (it is intersected with its parent), nor are the own keywords
   of a discriminated union typed at the union's location, and a `$ref` target typed through a
   pointer is at a shared location only where its pointer goes through one
   (`GeneratedLocation.isShared`).
2. An enum at a shared location is owned by its location and its set of values (`EnumOwners`).
   Enums of the same values there share one enum, and they share the enum of the location's own
   schema when that enum has exactly their values. An object types its own properties before its
   record values, so that enum is complete when they ask. An enum at a shared location with other
   values is numbered as another owner.
3. Two places of one location and position rank by the order of the walk's requests (the third
   part of `WalkRank`), so the names follow the document and no `$ref` changes them.
4. `dedupe-enum-names` reads its candidates only from requests the walk makes (`walkedAt`).

Changes from rc.12: in the cases above, an enum with other values than its neighbours at the
shared location now gets a number (`ShapeKind_2`, `SettingsMode_2`) and the property's type
changes to it. Names that a `$ref` decided in the tied cases now follow the document. Correct
output does not change: an enum whose values equal its neighbours' keeps its name and
declaration.

Measured: the colliding-names fuzz (150 + 300 + 300 documents) gives no type error that rc.12
does not give, and no name change but the ones above and the order-dependent `--dedupe-enums`
names (G8); with its `$ref`s removed it gives the same names (rc.12 differed in 4 to 16
documents per set). The compat corpus (1806 documents; the defaults, `--enum`, `--enum-values`,
`--dedupe-enums` with and without the fix, `--alphabetize --root-types`, `ref-pointers`, `all`,
`--immutable`) changes only the merged `bounce_type` above (with `--enum`, `all`,
`--dedupe-enums` and `--alphabetize`) and, with `dedupe-enum-names`, one document whose shared
enums took the names of `definitions` entries only `$ref`s typed (`codat.io_accounting`).

## Amendment (2026-11-15): owners joined at the end, ties by values

Rule 2 of the amendment above assumed that an object types its own properties before its record
values. An inline `allOf` item is typed after them, so the decision depended on the typing order:

- `Settings: { allOf: [{ mode: [fast, slow] }], additionalProperties: { mode: [fast, slow] } }`
  gave `SettingsMode` (the record value) and `SettingsMode_2` (the own property) with the same
  members. rc.12 gave one enum, so code that compiled with rc.12 failed (TS2322). A regression.
- An own `mode: [a]`, a record value `mode: [a]` and an `allOf` item `mode: [a, b]`: the record
  value shared the own enum while it held `{a}`, then the `allOf` item added `b`, so the record
  value accepted `b` (rc.12 too).
- With `dedupe-enum-names`, two enums of other values whose best names are the same (`Pet` and
  `Pet-` both give `PetState`, or two `patternProperties` of one object) both asked for that
  name; the run numbered them in document order, so swapping the schemas swapped the names,
  against the documented rule.

The rules:

1. During the run an enum at a shared location has the owner of its location and values, never
   the own location's (`EnumOwners.ownerOf`), whatever was typed before. At the end
   (`EnumOwners.mergedOwners`) such an owner joins the location's own owner when the own enum's
   values, collected from every own request whose enum the run declares, are exactly its values.
   The joined claims are one enum (`EnumNameClaims.finalNames`): named where the walk met either
   first, and its declarations merge (`withEnumDeclarationsMerged`, repeated members dropped).
   Other values stay apart, never merged.
2. `dedupe-enum-names` resolves a tie in key order (the order of the values): the later key takes
   its next free name, or else the next number of its best name that no schema gives as its own
   (`PetState_2`), so the run never numbers two keys of one name by document order.

Changes from rc.13: the first case gets one `SettingsMode` again (rc.12's output); the second
gives the record value `SettingsMode_2 { a }`; with `dedupe-enum-names` the tie names follow the
values in both orders (behind the fix, so the names may change).

## Amendment (2026-11-15): one declaration per owner, requests narrowed to their values

The requests of one owner share one enum (rule 1 above), but the footer wrote a declaration for
each value set, with the members an earlier one had left out. TypeScript merges declarations of
one name, so every request accepted the values of all of them: `T` with an own `mode: [a]` and an
inline `allOf` item `mode: [a, b]` gave `enum TMode { a }` and `enum TMode { b }`, and the own
`mode` accepted `TMode.b`. The output compiled, so the error was silent (fixed by default).

The rules:

1. One enum name has one declaration (`withEnumDeclarationsMerged`): the first, with the members
   of every later declaration of the name appended in the order they were asked for. Members keep
   their names and numbering as before (`withoutDeclaredMembers`). This covers the requests of one
   owner and two owners joined at the end. No output declares an enum name twice.
2. Each `--enum` reference carries the values its schema lists (`IrReferenceType.enumValues`, set
   by the generator, gone from the output). The run's end (`withEnumReferencesNarrowed`) types a
   reference whose values are fewer than its enum's by the union of their members (`TMode.a`,
   `TMode.a | TMode.c`; the first member of a value names it, a quoted one is read by index), and
   one with every value by the enum. The intersection with the `allOf` item stays satisfiable
   (`TMode.a & TMode` is `TMode.a`); two requests without a common value intersect to `never`,
   which is what the schema says. Values are known only at the end, so no order of typing
   decides a type, and the narrowing reads the finished declarations, not run state.
3. The values ride on the reference, so a callback that hands the reference back (in a union, or
   spread) keeps the narrowing, and one that writes the reference's name as type text gets the
   whole enum, which compiles. The deprecated TypeScript-node callbacks convert the type to a
   compiler node and back, which drops the values: those references stay the whole enum (rc.13's
   type). A name placeholder resolved at the end was rejected: callbacks see it, and a callback
   result with an unknown name fails (`CALLBACK_RESULT_UNREADABLE`) or does not compile.
4. `--enum-values` writes no arrays for TypeScript enums, `--dedupe-enums` shares an enum only
   between requests of the same values, and `dedupe-enum-names` names those value sets, so all
   three agree with one declaration; a request that shares another owner's enum is narrowed by
   its own values the same way (`U: { mode: [a] }` sharing `TMode` gets `TMode.a`).
5. Outside a run (the exported legacy transformers) there is no end: the references stay the
   whole enum and the declarations are written as before.

Changes from rc.13, only where one owner's requests list other values: one declaration instead
of several, and the requests of fewer values typed by their members. Code that used a member a
request does not list for that request no longer compiles; that is the fix.

Measured: the compat corpus (1806 documents) declares no enum name twice, before or after, in
nine option sets (the defaults, `--enum`, `--enum --enum-values`, `--dedupe-enums` with and
without `dedupe-enum-names`, `discriminator-values`, `--alphabetize --root-types`, `all`,
`--enum-values` alone): rc.13 dropped a later declaration whose members were all declared already,
so its request silently got the whole enum. Output changes in 8 documents (the GitHub
descriptions) with `--enum`, `--enum-values`, `discriminator-values`, `--alphabetize` and `all`,
and only by narrowing: a webhook's `allOf` item that lists fewer `state` values than its
`discussion` / `alert` gets their members (`…DiscussionState.open | …converting |
…transferring`, not the enum with `locked`; 5 references per document, 1 in `github.ae`). The
defaults, `--dedupe-enums` and `--enum-values` alone do not change; the changed output compiles.

## Amendment (2026-11-16): one owner for everything TypeScript intersects

The owners above joined a property and an inline `allOf` item of one schema, but not what is
inside them, and `--dedupe-enums` shared enums per request before the owners were known:

- `T: { mode: [a], allOf: [{ mode: [a, b] }] }` next to a schema `U: { mode: [a] }` gave, with
  `--enum --dedupe-enums` (rc.13 and upstream too) and with `dedupe-enum-names` or `all`,
  `{ mode?: TMode_2 } & { mode?: TMode }`: the request `[a]` shared `U`'s enum, the request
  `[a, b]` got another, and the intersection was `never`. With a discriminator, the union and its
  members were `never` too. The output compiled, so the error was silent.
- The items, record values, tuple elements and nested properties of a property and of an inline
  `allOf` item got two enums (`TList.a[] & TList_2[]`, `TRec & TRec_2`): each was a shared
  location of its own.

The rules:

1. A schema typed at its holder's location next to other schemas has a slot
   (`SchemaRequest.sharedSlot`): the steps from the location's schema into it (`["items"]`,
   `["prefixItems", 1]`, `["additionalProperties"]`, `["patternProperties", "^x"]`,
   `["unevaluatedProperties"]`), with the holder's slot and path. A property and an inline
   `allOf` item of one schema are typed at one location with the same slots, so their parts meet
   in one slot; the own keywords of a discriminated union start again at their own place. A
   pointer into a shared location has a slot of its own (`["$ref", ref]`).
2. Requests of one slot share one owner whatever their values (they are intersected); requests of
   the same values at a location share one owner whatever their slot (as before). Both rules join
   groups (`EnumOwners`, a union-find; the group that asked first keeps its key), and a group
   still joins the location's own enum when the values are exactly its values. The owner of a
   request is known only at the end of the run.
3. `--dedupe-enums` shares enums at the end of the run, between owners, by the whole members of
   each owner (`enumGrouping`): never one request of an owner with another schema. The first
   pass that recorded the names before the run is gone; the naming rules (the first schema that
   declares the values, `dedupe-enum-names`' best name) read the requests of each shared enum at
   the end (`SharedEnumNames`). A request that only refers to an owner's enum
   (`isOwnerReference`: a `discriminator-values` member's value, an inherited enum narrowed by an
   `allOf` item) declares nothing and names no shared enum.
4. The end of the run merges the declarations of each enum, renames them to their final names,
   and only then narrows each reference to its values (`withWholeEnums` after the rename), so a
   narrowed reference names the final enum.

Changes from rc.14, only with `--enum`: the cases above get one enum (`TMode.a & TMode`,
`TList.a[] & TList[]`), so their types are satisfiable again. With `--dedupe-enums`, a schema
that lists the values of only one request of another owner gets its own enum (`U: UMode`, not
`TMode.a`), and two owners of the same whole values share one enum named by the same rule as
before.

Measured: a property test (random schemas of own properties, inline `allOf` items, items, record
values, pattern properties, tuples, nested properties, `$ref` bases, members and `null`, under
`--enum`, `--enum-values`, `--dedupe-enums`, `dedupe-enum-names` and `all`; 2000 cases) finds no
`never` where both sides list a value, no admitted value the schema forbids, and no enum name
declared twice. The compat corpus (1820 documents, against rc.14): the defaults and `all` do not
change. With `--dedupe-enums` (also with `dedupe-enum-names` and `all`) the 8 GitHub descriptions
change: a webhook's `allOf` item `state` that shared another schema's enum
(`{ state: DiscussionState } & { state: WebhookDiscussionCreatedDiscussionState }`, `never`) now
gets its owner's members (`DiscussionState.open | …`); with `all`, openai.com's members
`FunctionToolCall` and `FunctionToolCallOutput` get one enum for their `type`. With `--enum`,
sendgrid.com's `events` items intersect `bounce_type` of `bounced | blocked | expired` with one of
`soft | hard`: one enum and both narrowed (`never` as the document says, as without `--enum`).
Every changed output compiles as before. Speed on the Microsoft Graph descriptions is unchanged
(within the noise of two runs), and `dedupe-enum-names` no longer types the document twice.

## Amendment (2026-11-16): an inherited enum narrowed by an `allOf` item

`Cat: allOf: [{ $ref: Pet }, { properties: { mode: { enum: [a] } } }]` with `Pet.mode: [a, b, c]`
is a common way to narrow an inherited enum. With `--enum` it gave `Pet & { mode?: CatMode }`:
two TypeScript enums intersect to `never`, so `Cat` had no value for `mode` (also rc.13 and
upstream). The output compiled, so the error was silent; it is fixed by default under `--enum`.

The rules:

1. The own keywords and the inline items of an `allOf` get the schemas of its `$ref` items as
   bases (`SchemaRequest.baseSchemas`), but for the keys the item's type omits (a
   discriminator's property and the other owners' properties, `Omit<Pet, "kind">`); the own
   keywords of a discriminated union that a member inherits are no base. Each step into
   `properties`, `items`, `prefixItems`, `additionalProperties`, `patternProperties`,
   `unevaluatedItems`, `contains` and `unevaluatedProperties` steps into the base's schema at the
   same place, every `$ref` on the way followed (`baseSchemasAt`). The variants of an `anyOf` /
   `oneOf` and the types of a `type` list keep the bases (a base intersects each of them); a
   `$ref` property, a `$ref` target and `$defs` start without bases, and a base whose property
   comes from its own `allOf` is not read (no change there).
2. An `--enum` enum with a base whose schema at that place is a TypeScript enum is typed by the
   base's enum (declared where the generator types the base, so it is the base's own enum) with
   the values both list, narrowed at the end of the run like any other reference (`PetMode.a`).
   Its own enum (`CatMode`) is still declared, so code that imports it keeps compiling; the type
   no longer uses it.
3. Values the base's enum does not list can never be valid: the type lists the common values,
   and the warning `ENUM_VALUES_NOT_INHERITED` names the others once per place and base. With no
   common value the own enum stays, the type is `never` as the document says, and the warning
   says so.
4. Without `--enum` the types are unions of literals, which intersect correctly; nothing changes.
5. The request for the base's enum only refers to it (`isOwnerReference`): with `--dedupe-enums`
   it does not name the enum the base shares with other schemas, which keeps the name of the
   first schema that declares the values, as upstream. A `Cat` before `Kind: [a, b]` and
   `Pet.mode: [a, b]` gives `Kind.a`, not `PetMode.a` with `Kind` renamed to `PetMode`.

Changes from rc.14, only with `--enum`: in the case above the type is satisfiable
(`PetMode.a`, not `CatMode`), and a document that adds values to an inherited enum warns.

Measured: the compat corpus with `--enum` and `--enum --enum-values` changes 9 documents
(influxdata.com, ix-api.net, just-eat.co.uk, microcks.local, motaword.com, two nexmo.com,
sendgrid.com, cloudflare.com), each by narrowing: a member such as `HTTPNotificationEndpoint`
that lists its `type` of its base's enum gets `NotificationEndpointType.http` instead of an enum
of its own, which made the member `never`. The changed outputs compile as before (cloudflare.com
keeps its 4 errors of rc.14). Two `$ref` items whose schemas have other TypeScript enums at one
place still intersect to `never` (rc.14 too): that is a conflict between the bases, not one the
inline item can narrow.

## Review trigger

Upstream merges one of the PRs above with a different default or flag: decide whether to follow
it. A tester reports that `all` changed their output on an update in a way they did not expect.
The 2.0 planning.
