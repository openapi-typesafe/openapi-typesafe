# Real-world use of the generator Node API (research task 3.1)

Measured on 2026-11-02. Input for ADR-004 ("Legacy `ts.Node` callbacks and `stringToAST`").

## Summary

- The Node API is used mostly in one shape: `astToString(await openapiTS(source, options))`.
  826 of the 1,010 repositories in our sample import `astToString`. This pattern must keep working unchanged.
- `transform` is the only callback with real adoption: **319 repositories** in the sample. Of the 231 files
  that declare `openapi-typescript@7`, 176 (76%) return a `ts.TypeNode`, and almost all of those build it with
  `ts.factory` directly (often mixed with our helpers). Large projects do this: TabbyML/tabby (~34k stars),
  invoke-ai/InvokeAI (~29k), marimo-team/marimo (~23k), supabase/mcp (~3k), openmeterio/openmeter (~2.4k).
- `postTransform` is rare (**about 14 real repositories**) and `transformProperty` is very rare
  (**4 real repositories**, all with fewer than 10 stars).
- Exported AST helpers and constants (`tsUnion`, `NULL`, `UNKNOWN`, `STRING`, …) are imported by only
  **16 repositories**; exported transformers (`transformSchemaObject`, …) by **7**; `stringToAST` by **4**.
  Type-only imports (`OpenAPI3`, `SchemaObject`, `OperationObject`, …) are common (**134 repositories**).
- About 30% of `transform` users still return **strings**. Almost all of them (94 of 106) declare
  `openapi-typescript@6`, where callbacks returned strings. They are not 7.x users and are out of scope for a
  drop-in successor of 7.x.

## Method

1. **GitHub code search** (REST `search/code`, the legacy index, default branches only, files under 384 KB).
   For every name we ran `"openapi-typescript" <name> language:TypeScript` and the same with
   `language:JavaScript`, excluding `openapi-ts/openapi-typescript`. 41 names × 2 languages, plus extra pages
   for the four main names. Raw results: 1,967 unique files outside forks.
2. **Download and parse every file** from `raw.githubusercontent.com` (default branch, `HEAD`). We kept a file
   only if it really imports from `"openapi-typescript"` (ESM `import`, `require`, or dynamic `import`) and is
   not a vendored copy (`node_modules/`, `vendor/`, `openapi-typescript/src/`). Result: **1,124 files in
   1,010 repositories**.
3. For each file that uses a callback, we looked at the 2,500 characters after the callback and classified
   the return value: `ts.factory` / `ts.SyntaxKind`, our helpers, a string literal, or a `TransformObject`
   (`{ schema, questionToken }`). We also read the nearest `package.json` (walking up from the file) to get
   the declared `openapi-typescript` version.
4. Stars via the GitHub GraphQL API.
5. Published npm packages that call the Node API at runtime were checked by reading their published
   `dist/` files through jsDelivr (see "Published packages" below).

Scripts and raw data are kept outside the repository (scratchpad); the method above is enough to repeat them.

### Limitations (read before using the numbers)

- **Code search is a sample, not a census.** The REST API returns at most 1,000 results per query and only
  100 per page; we fetched up to 300 for the four main names. `astToString` alone has ~1,780 hits
  (813 TypeScript + 968 JavaScript), so the true number of `astToString` users is at least ~2× our sample.
- Generic names (`NULL`, `NEVER`, `UNKNOWN`, `STRING`, `NUMBER`, `BOOLEAN`, `UNDEFINED`) match tens of
  thousands of unrelated files. For them we only saw the first 100 results per language; the per-name counts
  for these constants are a lower bound. The other helper names (`tsUnion`, `tsRecord`, …) returned fewer
  than 100 results, so for them the sample is the complete code-search result.
- Code search does not index private code, forks (unless they have more stars than the parent), or
  non-default branches. Monorepo tools and company-internal generators are invisible.
- The classifier is a regex heuristic. We checked samples by hand: 45 v7 `transform` users could not be
  classified from the callback body alone; a file-level re-check found that 29 of them build nodes with
  `ts.factory` or helpers somewhere in the same file (often in a helper function), and 20 return values that
  are built in another file.
- Some hits for `postTransform` / `transformProperty` were false positives (a local function named
  `postTransform` that edits the output string, or `postTransform: undefined`). The numbers below are after
  manual removal of those.

## Results

### Search totals (GitHub code search, `total_count`)

| Name | TypeScript | JavaScript | Kept after parsing (repos that really import it) |
|---|---:|---:|---:|
| `astToString` | 813 | 968 | 826 |
| `openapiTS` + `transform` | 238 | 125 | 319 use `transform` |
| `postTransform` | 32 | 12 | ~14 real users |
| `transformProperty` | 14 | 1 | 4 real users |
| `COMMENT_HEADER` | 61 | 111 | 146 |
| `stringToAST` | 9 | 1 | 4 |
| `tsUnion` | 9 | 6 | 5 |
| `tsLiteral` | 21 | 2 | 1 |
| `tsNullable` | 8 | 2 | 2 |
| `tsRecord`, `tsModifiers`, `tsEnum`, `tsPropertyIndex`, `tsOmit`, `tsWithRequired`, `tsIntersection`, `tsDedupe`, `tsIsPrimitive`, `tsArrayLiteralExpression`, `tsEnumMember`, `tsReadonlyArray` | 5–30 each | 0–1 | 0–1 each (the rest are vendored copies of our source) |
| `oapiRef`, `addJSDocComment`, `QUESTION_TOKEN` | 13–16 each | 0–1 | 1 each |
| `NULL` / `UNKNOWN` / `STRING` / `NUMBER` / `NEVER` | 23k–117k (noise) | 400–1,900 | 5 / 4 / 3 / 3 / 1 |
| `transformSchemaObject` (+ `WithComposition`) | 12 | 5 | 7 |
| `transformComponentsObject`, `transformPathsObject`, `transformOperationObject` | 3–8 | 0 | 0 |
| `resolveRef` | 62 | 22 | 3 |
| `enumCache` | 6 | 0 | 0 |
| Types: `OpenAPI3` / `OperationObject` / `PathItemObject` / `SchemaObject` / `OpenAPITSOptions` / `TransformNodeOptions` / `TransformObject` | — | — | 109 / 42 / 39 / 34 / 17 / 5 / 5 |

Most hits for the rare helper names are copies of our own `src/lib/ts.ts` inside other repositories
(vendored generators, AI-agent corpora). They were removed by the parsing step because they do not import
from `"openapi-typescript"`.

### `transform`: what the callback returns

338 files in 319 repositories. Classification by callback body and declared version:

| Return style | Declared `openapi-typescript@7` | `@6` | Other / unknown |
|---|---:|---:|---:|
| Builds `ts.TypeNode` (`ts.factory`, helpers, or `TransformObject` with a node) | 176 | 0 | 5 |
| Returns a string (v6 API) | 10 | 94 | 2 |
| Not classifiable from the body | 45 | 5 | 1 |

Inside the `ts.TypeNode` group: 80 use only `ts.factory`, 60 use `ts.factory` together with our helpers,
7 use only our helpers (`NUMBER`, `UNKNOWN`, `tsNullable([...])`), and 15 return a `TransformObject`
(`{ schema, questionToken }`). The 10 string-returning v7 files are bugs in the user code (strings are not
accepted by the v7 types) or dead code.

The most common reasons to use `transform`, from reading the samples:

1. `format: binary` → `Blob` / `File` (the documented recipe; dozens of copies).
2. `format: date-time` → `Date` (or a branded string).
3. Replace one schema by `metadata.path` with an imported, hand-written type.
4. Branded strings (`TypedString<"uuid">`) from `format`.
5. Re-enter the generator: call `transformSchemaObject(schema, { ...options, ctx: { ...options.ctx, transform: undefined } })`
   and then edit the returned node with `ts.factory.update*` (compozy, shopware/frontends).

### `postTransform` and `transformProperty`

| Callback | Real users | Notable | What they do |
|---|---:|---|---|
| `postTransform` | ~14 repos (17 files declare v7) | vriteio/andesine (~2k stars), Polycentric-Labs/evidentia, terraware/terraware-web | Replace a node by path; read `options.ctx.resolve(path)` to inspect the schema; strip or rewrite unions |
| `transformProperty` | 4 repos | Pentadome/nuxt-openAPI-wrapper, ma9o/grassmoth, two others (0–5 stars) | Add or remove `readonly` / `?` on `ts.PropertySignature` with `ts.factory.updatePropertySignature` |

### Notable repositories (by stars)

| Repository | Stars | What it uses | Declared version |
|---|---:|---|---|
| [TabbyML/tabby](https://github.com/TabbyML/tabby/blob/21b29048d7bcf6b94f9f482f2d0fd05efadfd19f/clients/tabby-openapi/scripts/codegen.js) | 33,922 | `transform` → `ts.factory.createTypeReferenceNode`; `astToString`; `COMMENT_HEADER` | ^7.0.2 |
| [invoke-ai/InvokeAI](https://github.com/invoke-ai/InvokeAI/blob/3e4b7e3bb6f418ba2c8eb7fc46516442ac8665ea/invokeai/frontend/api/scripts/typegen.js) | 28,958 | `transform` → `ts.factory` + helpers (`Blob`) | 7.10.1 |
| [marimo-team/marimo](https://github.com/marimo-team/marimo/blob/9f313fccf324b9bd0875a88a725418b0c3dd9075/packages/openapi/convert_types.js) | 23,399 | `transform` → `ts.factory` (branded strings); string post-processing of `astToString` output | ^7.8.0 |
| [supabase/mcp](https://github.com/supabase/mcp/blob/ed5084d1957541c5130f551d5f7e0fee5e3ddfeb/packages/mcp-server-supabase/scripts/generate-management-api-types.mjs) | 2,990 | `transform` → `UNKNOWN` constant | ^7.5.0 |
| [compozy/compozy](https://github.com/compozy/compozy/blob/de5ab2f4d5703f933f3134d2cf6844d99eb39b9f/internal/codegen/openapits/generate.mjs) | 2,828 | `transform` re-enters `transformSchemaObject` with `options.ctx`, edits result with `ts.factory.update*` and `tsUnion` | 7.13.0 |
| [openmeterio/openmeter](https://github.com/openmeterio/openmeter/blob/24eece4506f1d7643e1def70e0dc6548b301e82b/api/client/javascript/scripts/generate.ts) | 2,432 | `transform` → `TransformObject` with `STRING`, `factory` | 7.13.0 |
| [vriteio/andesine](https://github.com/vriteio/andesine/blob/68d99b13a00ea1675423b8f8ede0f27f21af716b/packages/public/sdk/scripts/generate.ts) | 2,005 | `transform` + `postTransform`, reads `ctx.resolve(path)` | 7.13.0 |
| [shopware/frontends](https://github.com/shopware/frontends/blob/14fb0946f8e7d12720b28cf9c6ccac05a4f72789/packages/api-gen/src/commands/generate.ts) (published as `@shopware/api-gen`) | 231 | `transform` re-enters `transformSchemaObjectWithComposition` with `metadata.ctx` | 7.13.0 |
| [OpenAPI-Qraft/openapi-qraft](https://github.com/OpenAPI-Qraft/openapi-qraft) (published as `@openapi-qraft/openapi-typescript-plugin`, ~28k downloads/week) | 98 | `transform` → `TransformObject` with `ts.factory` (`Blob`) | ^7.13.0 |
| [workleap/wl-openapi-typescript](https://github.com/workleap/wl-openapi-typescript/blob/6c9217adb8a7fdb86f3805133c67dbbb1ebf9b8a/packages/create-schemas/src/plugins/types-plugin.ts) | 2 | `stringToAST(code)` to parse the generated file back into `ts.Node[]` and walk it with `ts.is*` | 7.x |

### Published npm packages that call the Node API at runtime

These matter more than one-off scripts: their users cannot change the code, and they pin
`openapi-typescript` in `dependencies`.

| Package | Weekly downloads | Node API use |
|---|---:|---|
| `nuxt-open-fetch` 0.13.9 | 20,056 | `astToString(await openapiTS(schema, openAPITS))`. **Passes user options through**, so user `transform` callbacks written in `nuxt.config` reach us |
| `@openapi-qraft/openapi-typescript-plugin` 2.14.1 | 28,375 | `openapiTS` + `astToString`; own `transform` returning `TransformObject` built with `ts.factory` |
| `@shopware/api-gen` 1.5.3 | 8,528 | `transform` with generator re-entry via `ctx` |
| `@grafana/openapi-to-k6` 0.4.1 | 4,791 | depends on `^7.4.1`; no callback found in the published bundle |
| `fetch-frog` 0.1.0 | 1,247 | `openapiTS` + `astToString` |
| `chowbea-axios` 3.0.1 | 241 | `openapiTS` + `astToString`; **forwards user `postTransform` and `transformProperty` hooks** |
| `@bpinternal/opapi` 2.0.0 | 1,529 | v6 API (`6.7.6` pinned), `postTransform` on strings; not affected |

Download counts: `api.npmjs.org/downloads/point/last-week`, week 2026-10-23 … 2026-10-29.

## Representative snippets

1. The dominant pattern (826 repos), here with the `Blob` recipe built from raw `ts.factory` —
   [TabbyML/tabby](https://github.com/TabbyML/tabby/blob/21b29048d7bcf6b94f9f482f2d0fd05efadfd19f/clients/tabby-openapi/scripts/codegen.js):

   ```js
   const ast = await openapiTS.default(patched, {
     transform: (schemaObject, metadata) => {
       if (metadata.path === "#/components/schemas/ChatCompletionRequest") {
         return ts.factory.createTypeReferenceNode(ts.factory.createIdentifier("ChatCompletionRequest"));
       }
     },
   });
   const typeContents = openapiTS.astToString(ast);
   const contents = openapiTS.COMMENT_HEADER + "\n" + importContents + "\n" + typeContents;
   ```

2. Helper constant only, no `typescript` import —
   [supabase/mcp](https://github.com/supabase/mcp/blob/ed5084d1957541c5130f551d5f7e0fee5e3ddfeb/packages/mcp-server-supabase/scripts/generate-management-api-types.mjs):

   ```js
   import openapiTS, { astToString, UNKNOWN } from 'openapi-typescript';
   function replaceRecursiveJsonValueWithUnknown(_, options) {
     if (options.path?.endsWith('JsonValue_Output')) return UNKNOWN;
     return undefined;
   }
   const ast = await openapiTS(specUrl, { transform: replaceRecursiveJsonValueWithUnknown });
   ```

3. `TransformObject` with a helper and a `questionToken` override —
   [openmeterio/openmeter](https://github.com/openmeterio/openmeter/blob/24eece4506f1d7643e1def70e0dc6548b301e82b/api/client/javascript/scripts/generate.ts):

   ```ts
   transform(schemaObject, metadata) {
     if (metadata.path === '#/components/schemas/Event' && schemaObject.type === 'string') {
       return { questionToken: true, schema: STRING }
     }
     // ... `format: date-time` handled with `factory` from 'typescript'
   }
   ```

4. Re-entering the generator through `options.ctx` and editing the returned node —
   [compozy/compozy](https://github.com/compozy/compozy/blob/de5ab2f4d5703f933f3134d2cf6844d99eb39b9f/internal/codegen/openapits/generate.mjs)
   (same idea in `shopware/frontends`):

   ```js
   const baseType = transformSchemaObject(schemaObject, {
     ...options,
     schema: schemaObject,
     ctx: { ...options.ctx, transform: undefined },
   });
   return widenAdditionalPropertyIndexes(baseType); // ts.factory.update* + tsUnion(...)
   ```

5. `postTransform` reading the schema through `ctx.resolve` —
   [vriteio/andesine](https://github.com/vriteio/andesine/blob/68d99b13a00ea1675423b8f8ede0f27f21af716b/packages/public/sdk/scripts/generate.ts):

   ```ts
   postTransform(_type, { path, ctx }) {
     if (!path || !/\/responses\/[^/]+\/content\/[^/]+$/.test(path)) return;
     const schema = ctx.resolve<MediaTypeObject>(path)?.schema;
     // ... returns a ts.factory node for "empty" responses
   }
   ```

6. `stringToAST` used to avoid importing `typescript` at all —
   [fcjr/shiftapi](https://github.com/fcjr/shiftapi/blob/f78878e4750f4ccb670c57997eb51e5645965f2c/packages/shiftapi/src/generate.ts):

   ```ts
   // Importing typescript causes "Dynamic require of fs is not supported" when tsup bundles it into ESM.
   const BINARY = (stringToAST("type T = File | Blob | Uint8Array") as any)[0].type as import("typescript").TypeNode;
   ```

## Which callbacks receive or return `ts.Node`

From `packages/openapi-typesafe/src/types.ts` (inherited from upstream 7.x):

| API | Receives | Returns |
|---|---|---|
| `openapiTS(source, options)` | — | `Promise<ts.Node[]>` |
| `astToString(ast, options)` | `ts.Node \| ts.Node[] \| ts.TypeElement \| ts.TypeElement[]` | `string` |
| `stringToAST(source)` | `string` | `unknown[]` (in practice `ts.Node[]`; users cast it) |
| `transform(schemaObject, options)` | `SchemaObject`, `TransformNodeOptions` | `ts.TypeNode \| TransformObject \| undefined`; `TransformObject.schema` is `ts.TypeNode` |
| `postTransform(type, options)` | **`ts.TypeNode`**, `TransformNodeOptions` | `ts.TypeNode \| undefined` |
| `transformProperty(property, schemaObject, options)` | **`ts.PropertySignature`**, `SchemaObject`, `TransformNodeOptions` | `ts.PropertySignature \| undefined` |
| `TransformNodeOptions.ctx` | exposes the whole `GlobalContext`, including `injectFooter: ts.Node[]`, `resolve()`, and the user callbacks | — |
| Exported helpers (`tsUnion`, `tsLiteral`, `tsRecord`, `tsNullable`, `tsOmit`, `tsWithRequired`, `oapiRef`, …) | `ts.TypeNode` arguments | `ts.TypeNode` |
| Exported constants (`NULL`, `NEVER`, `UNKNOWN`, `STRING`, `NUMBER`, `BOOLEAN`, `TRUE`, `FALSE`, `UNDEFINED`, `QUESTION_TOKEN`) | — | shared `ts` node instances |
| Exported transformers (`transformSchemaObject`, …) | OpenAPI object + `TransformNodeOptions` | `ts.TypeNode` (or `ts.Node[]`) |

`transform` only returns a node; `postTransform` and `transformProperty` also **receive** one, so users
inspect it with `ts.is*` and rebuild it with `ts.factory.update*`. That direction (IR → `ts.Node` → IR) is
the hardest part of a bridge.

## Conclusions for ADR-004

**Must keep working, unchanged (no warning):**

1. `openapiTS(source, options)` + `astToString(result)` + `COMMENT_HEADER`. This is ~80% of all Node API use
   (826 of 1,010 sampled repos; ~1,780 code-search hits). `astToString` must accept whatever `openapiTS`
   returns (task 6.1).
2. Exported types: `OpenAPI3`, `SchemaObject`, `OperationObject`, `PathItemObject`, `OpenAPITSOptions`,
   `ReferenceObject`, `ParameterObject`, `TransformNodeOptions`, `TransformObject` (134 repos import types).
3. `transform` returning `TransformObject` / constants / helpers **without** a `typescript` import (supabase,
   openmeter's `STRING` case). These users touch only our exports, so if helpers and constants return IR
   nodes (task 6.2) they keep working with no bridge at all.

**Must keep working through the compatibility bridge (with a deprecation warning):**

4. `transform` returning a `ts.TypeNode` built with `ts.factory` (~176 v7 files in the sample, at least 3
   projects above 20k stars, and two published tools: `@openapi-qraft/openapi-typescript-plugin` and
   `nuxt-open-fetch`, which forwards user callbacks). Breaking this would break the most visible users.
   The bridge converts a returned `ts.TypeNode` to IR (one direction only: `ts` → IR). This direction is
   simple because we only need to print it: the bridge can call `ts.createPrinter()` on the node and store
   the result as a `raw` IR string.
5. Mixed use: `ts.factory` nodes passed into our helpers (`tsUnion([ts.factory.create…(), NULL])`; 60 files).
   Helpers must accept both IR nodes and `ts.TypeNode` and route the latter through the same converter.

**Can be deprecated (warning in 1.x, removal in 2.0), with a codemod or a documented recipe:**

6. `postTransform` receiving a `ts.TypeNode` (~14 repos, one above 1k stars; also forwarded from user
   config by the small `chowbea-axios` tool). Keeping it needs the reverse
   direction (IR → `ts.TypeNode`), for example by printing the IR and parsing it with `typescript`. That is
   doable in the bridge but costly; recommend: support through the bridge in 1.x with a warning, offer the
   new IR-based `postTransform` as the replacement.
7. `transformProperty` receiving a `ts.PropertySignature` (4 small repos). Same as 6, lowest priority; it is
   acceptable to support it only through the bridge and drop it in 2.0.
8. `stringToAST` (4 repos). Two use cases: build a small type node from a string (replace with the IR `raw`
   node, no `typescript` needed — this is exactly what fcjr/shiftapi wanted), and parse the generated output
   back into `ts.Node[]` (workleap; this is plain TypeScript parsing and can be done with `typescript`
   directly). Recommend: keep it in 1.x through the bridge with a warning, point to `raw` IR in the message.
9. Exported transformers (`transformSchemaObject`, `transformSchemaObjectWithComposition`, …) and the
   `options.ctx` re-entry pattern (7 repos, including compozy and shopware). Keep the functions exported with
   the same signatures returning IR; re-entry from inside `transform` then works if the callback returns the
   IR result. Editing that result with `ts.factory.update*` does not work without the reverse bridge; mark
   as deprecated and document the IR equivalent.
10. Rare helpers (`tsModifiers`, `tsPropertyIndex`, `tsEnum`, `tsEnumMember`, `tsArrayLiteralExpression`,
    `tsDedupe`, `tsIsPrimitive`, `tsReadonlyArray`, `addJSDocComment`, `oapiRef`, `QUESTION_TOKEN`) and
    internals (`enumCache`, `resolveRef`, `scanDiscriminators`, `walk`, logging helpers `c`, `debug`, `warn`,
    `error`): 0–1 real importers each. Keep the names exported in 1.x for drop-in safety (they cost little
    once re-implemented over IR), mark them `@deprecated` where they only make sense for `ts` nodes, and
    remove in 2.0. `enumCache` must stop being shared module state (plan §2); a deprecated, empty export
    is enough.

**Not in scope:** the ~100 repositories using the v6 string-returning callbacks. They already cannot
upgrade to 7.x without changes; the migration guide may mention them, but no compatibility code is needed.

**Evidence gaps to close before 1.0:** run the Phase 8 "real projects" check on TabbyML/tabby,
invoke-ai/InvokeAI, marimo-team/marimo, supabase/mcp, openmeterio/openmeter, compozy/compozy,
vriteio/andesine and `@openapi-qraft/openapi-typescript-plugin`; together they cover every callback style
found here.

## How `research/dependents.csv` was built (task 3.3)

See the header rows of the CSV. In short:

- **npm packages:** candidates from the ecosyste.ms `dependent_packages` API (345 packages, stale for
  `openapi-fetch`) plus npm registry text search (`/-/v1/search`, up to 1,000 results per query for the
  package names and related terms), 3,479 candidates in total. For every candidate we read the `latest`
  manifest and kept it only if it lists `openapi-typescript`, `openapi-fetch` or `openapi-typescript-helpers`
  in `dependencies`, `peerDependencies` or `devDependencies` (480 packages). The CSV has the top 60 by weekly
  downloads from `api.npmjs.org` (2026-10-23 … 2026-10-29).
  npm has no public "dependents" API, so packages that neither mention these names in their metadata nor
  appear in ecosyste.ms are missing.
- **GitHub repositories:** code search for `"<package>"` in `package.json` files (1,000-result cap per
  package; total counts: `openapi-typescript` 17,088 files, `openapi-fetch` 8,608, `openapi-react-query`
  798), plus the ecosyste.ms repository usage API (complete for `openapi-fetch`, a partial sample of
  ~4,300 rows for `openapi-typescript`, because the API cannot sort and has ~43k rows), plus the Node API users found in task
  3.1 (6,338 repositories). Stars from the GraphQL API. The top ~110 by stars were checked against the GitHub
  dependency graph (`/repos/{owner}/{repo}/dependency-graph/sbom`); repositories whose graph lists none of the
  packages (for example a hit in a docs `package.json`) were dropped unless they import the Node API in code.
  The CSV has the top 50 that remain. deps.dev reports 372 npm dependents for `openapi-typescript@7.13.0` and
  1,195 for `openapi-fetch@0.17.0` (586 direct).
