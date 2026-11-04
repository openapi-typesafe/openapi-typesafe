# The generator: CLI and Node API

## CLI

```bash
npx openapi-typesafe ./openapi.yaml -o ./src/api/schema.d.ts
npx openapi-typesafe https://api.example.com/openapi.json -o ./src/api/schema.d.ts
npx openapi-typesafe --redocly ./redocly.yaml   # several APIs, outputs set in the config
```

Common flags (all default to off unless noted):

| Flag | Effect |
| :-- | :-- |
| `-o, --output <file>` | Write to a file instead of stdout |
| `--check` | Exit `1` if the file on disk differs from what would be generated |
| `--enum` | Real TS `enum`s instead of string unions |
| `--enum-values` | Also export the enum values as arrays |
| `--dedupe-enums` | Dedupe enums (with `--enum`) |
| `--root-types` | Export `components` as root aliases such as `SchemaPet` |
| `--root-types-no-schema-prefix` | Root aliases without the `Schema` prefix |
| `-t, --export-type` | `type` instead of `interface` |
| `--immutable` | `readonly` properties and arrays |
| `--alphabetize` | Sort keys |
| `--additional-properties` | Allow extra properties unless `additionalProperties: false` |
| `--empty-objects-unknown` | Objects with no properties accept anything |
| `--default-non-nullable` | On by default: a property with a `default` is required, also in `$ref`'d components used as request bodies (parameters and inline request bodies excepted); `--default-non-nullable=false` makes them all optional, the fix for "the client must send a field that has a default" |
| `--properties-required-by-default` | Properties without `required` are required |
| `--path-params-as-types` | Template-literal path keys: `paths[\`/pets/${string}\`]` |
| `--array-length` | Tuples from `minItems` / `maxItems` |
| `--binary-as-blob` | `format: binary` and binary `contentMediaType` strings become `Blob` (file uploads and downloads); needs the DOM lib or `@types/node` |
| `--fix <names>` | Opt-in fixes of valid-schema output, comma-separated, or `all` (`fix: [...]` in `redocly.yaml` and the Node API); unknown names fail. `allof-required`: an `allOf` member with only `required` (`Base & Record<string, never>`) becomes `WithRequired<Base, "key">`; `anyof-properties`: `anyOf` next to `properties` (`Props | A | B`) becomes `Props & (A | B)`; `array-length-tuples` (with `--array-length`): `minItems: 1, maxItems: 2` gives `[T] \| [T, T]`, not `[] \| [T]`; `allof-discriminated-union`: `allOf: [{ $ref: Union }]` gives the union, not `Omit<A \| B, "kind">` and `kind: "Schema"`; `discriminator-member-required`: `required` next to an `allOf` `$ref` to a discriminator member gives `WithRequired`; `discriminator-values`: a mapped schema in a `oneOf` without a mapping (`{ kind: "Cat" } & { kind: "cat" }`) gets `kind: "cat"` only, a schema's own `mapping` beats an inherited one, a member that declares `kind` gets no second one, and with `--enum` the value is `PetType.Cat`, not a new enum `CatPetType`; `root-type-numbering` (with `--root-types --root-types-no-schema-prefix`): of schemas `PetStore` and `pet_store`, the earlier gets `PetStore_2` instead of no alias; `unevaluated-properties`: `unevaluatedProperties: { type: string }` adds `& { [key: string]: string \| <declared property types> }` instead of being ignored |
| `--exclude-deprecated` | Drop deprecated fields |
| `--make-paths-enum` | Export an `ApiPaths` enum |
| `--read-write-markers` | Mark `readOnly` / `writeOnly` with `$Read<T>` / `$Write<T>`; the client strips them from request and response types |
| `--no-lint` | Skip the Redocly lint; bundling errors still fail |
| `--local-ref-root <dir>` | Local `$ref` files only from this directory (for documents you did not write) |
| `--remote-ref-hosts <a,b>` | Remote `$ref` documents only from these hosts; empty allows none |

Flags can also go under `x-openapi-ts` per API in `redocly.yaml`.

OpenAPI 3.2 needs no flag. A path item's `query` operation is a `query` member (only where
declared); `additionalOperations` keeps exact method names; `itemSchema` adds an `itemContent` map
next to `content` (read item types from there, not from `content`); an `in: querystring`
parameter is `parameters.query`; `components.mediaTypes` is a `components` member when present.

Exit codes: `0` ok, `1` stale with `--check`, `2` usage or configuration, `3` the document cannot
be read or converted, `4` an output file cannot be read or written, `70` unexpected (a bug).

## Node API

```ts
import fs from "node:fs";
import openapiTS, { astToString } from "openapi-typesafe";

const ast = await openapiTS(new URL("./openapi.yaml", import.meta.url));
fs.writeFileSync("./src/api/schema.d.ts", astToString(ast));
```

- Input: a `URL` (file or remote), a YAML/JSON string, a parsed object, a `Buffer` or a
  `Readable`.
- Options: the CLI flags in camelCase (`rootTypes`, `enum`, `immutable`, ...), plus `transform`,
  `postTransform`, `transformProperty`, `irCallbacks`, `inject` (text added at the top), `silent`,
  `lint`, `cwd`, `redocly`, `localRefRoot`, `remoteRefHosts`.
- The result is `IrDeclaration[]` (plain objects with a `kind`). Print it with `astToString`.

## IR callbacks

Use `irCallbacks: true` for every new callback. A result is TypeScript type text (printed as
written) or IR from the helpers; `undefined` keeps the generated type.

```ts
import openapiTS, { astToString, NULL, tsUnion } from "openapi-typesafe";

const ast = await openapiTS(source, {
  irCallbacks: true,
  transform(schemaObject, options) {
    if (schemaObject.format === "binary") {
      return options.path?.includes("/requestBody") ? "Blob" : "Blob | null";
    }
    if (schemaObject.format === "date-time") return "Date";
  },
  postTransform(type, options) {
    return options.path?.endsWith("/id") ? tsUnion([type, NULL]) : undefined;
  },
  transformProperty(property, schemaObject) {
    return schemaObject.deprecated ? { ...property, isReadonly: true } : undefined;
  },
});
```

- `transform(schemaObject, options)` runs before conversion. It may return
  `{ schema, questionToken: true }` to make the property optional.
- `postTransform(type, options)` receives the generated IR type.
- `transformProperty(property, schemaObject, options)` receives
  `{ name, type, isOptional, isReadonly, comments }`.
- Helpers: `tsUnion`, `tsIntersection`, `tsNullable`, `tsOmit`, `tsRecord`, `tsLiteral`,
  `tsWithRequired`, `oapiRef`, and the constants `STRING`, `NUMBER`, `BOOLEAN`, `NULL`, `UNKNOWN`,
  `NEVER`, `TRUE`, `FALSE`, `UNDEFINED`.
- Callbacks without `irCallbacks: true` that build `ts.factory` nodes are deprecated and need the
  TypeScript JavaScript API (see [migration.md](migration.md)).

## Errors

`openapiTS()` rejects with `OpenAPITypesafeError`. Decide by `code`, never by message.

```ts
import openapiTS, { isOpenAPITypesafeError } from "openapi-typesafe";

try {
  await openapiTS(source);
} catch (error) {
  if (isOpenAPITypesafeError(error) && error.code === "SCHEMA_INVALID") {
    console.error(error.details.problems);
  }
  throw error;
}
```

| Group | Codes |
| :-- | :-- |
| Usage / config | `CLI_FLAG_REMOVED`, `CLI_GLOB_UNSUPPORTED`, `CLI_CONFIG_NOT_FOUND`, `CLI_CONFIG_OUTPUT_MISSING`, `CLI_CHECK_OUTPUT_MISSING`, `TYPESCRIPT_NOT_FOUND`, `CALLBACK_RESULT_UNREADABLE` |
| Document | `SCHEMA_SOURCE_EMPTY`, `SCHEMA_SOURCE_INVALID`, `SCHEMA_LOAD_FAILED`, `SCHEMA_PARSE_FAILED`, `SCHEMA_VERSION_UNSUPPORTED`, `SCHEMA_INVALID`, `SCHEMA_REF_INVALID`, `SCHEMA_REF_FORBIDDEN`, `SCHEMA_OBJECT_INVALID`, `SCHEMA_PROPERTY_INVALID`, `SCHEMA_TOO_DEEP`, `SCHEMA_KEY_UNSUPPORTED`, `ENUM_NAME_EMPTY` |
| Output | `OUTPUT_STALE`, `OUTPUT_READ_FAILED`, `OUTPUT_WRITE_FAILED` |

`ERROR_CODES` exports them all. A lower-level error (file system, parser) is in `cause`.
