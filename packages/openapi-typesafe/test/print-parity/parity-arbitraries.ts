import { pascalCase } from "change-case";
import fc from "fast-check";
import ts from "typescript";
import { irObject } from "../../src/domain/ir/constructors.js";
import type { IrMember, IrType, IrTypeAliasDeclaration } from "../../src/domain/ir/nodes.js";
import { astToString } from "../../src/index.js";
import type { GlobalContext, OpenAPITSOptions, TransformNodeOptions } from "../../src/types.js";
import { DEFAULT_CTX } from "../test-helpers.js";
import {
  enumCache,
  JS_PROPERTY_INDEX_INVALID_CHARS_RE,
  NULL,
  stringToAST,
  tsUnion,
} from "./original/lib/ts.js";

/**
 * Shared inputs of the parity tests (ENGINEERING_PLAN Phase 5): random schemas, option flags,
 * callbacks and documents, and a runner that prints what a legacy-signature transformer returns.
 * Set PARITY_RUNS to run more cases.
 */

export const RUNS = Number(process.env.PARITY_RUNS ?? 3_000);
/**
 * The slowest single-node parity test takes about 1.1 ms per run with coverage on (measured
 * 2026-11-02: 3351 ms for 3000 runs). The hosted Intel macOS runner is the slowest CI machine:
 * up to 7.8 ms per run (2026-11-04: 23376 ms for 3000 runs). 10 ms per run leaves room above it.
 */
const MS_PER_RUN_BUDGET = 10;
const MIN_TIMEOUT_MS = 5_000;
export const TIMEOUT_MS = Math.max(MIN_TIMEOUT_MS, RUNS * MS_PER_RUN_BUDGET);
export const KEYS = ["a", "b", "c-d", "1", "$x", "é"] as const;
export const REFS = [
  "#/components/schemas/A",
  "#/components/schemas/B",
  "#/components/schemas/C",
] as const;
export const PATHS = [
  "#/components/schemas/Root",
  "#/components/schemas/B",
  "#/paths/~1items/get/requestBody/content/application~1json/schema",
  "#/components/schemas/Root/properties/a/anyOf/0",
] as const;

export const DOCUMENTS: Readonly<Record<string, unknown>> = {
  "#/components/schemas/A": { type: "object", properties: { a: { type: "string" }, b: {} } },
  "#/components/schemas/B": {
    type: "object",
    properties: { kind: { type: "string" } },
    deprecated: true,
  },
  "#/components/schemas/C": { type: "string" },
  "#/components/parameters/Id": {
    name: "id",
    in: "path",
    required: true,
    schema: { type: "string" },
  },
  "#/components/parameters/Old": { name: "old", in: "query", deprecated: true },
  "#/components/parameters/Alias": { $ref: "#/components/parameters/Id", in: "path" },
  "#/components/parameters/Count": {
    name: "count",
    in: "path",
    required: true,
    schema: { type: "integer" },
  },
  "#/components/requestBodies/Body": {
    required: true,
    content: { "application/json": { schema: { type: "string" } } },
  },
  "#/components/requestBodies/Optional": { content: {} },
  "#/paths/~1old/get": {
    deprecated: true,
    parameters: [{ name: "flag", in: "path", schema: { type: "boolean" } }],
  },
  "#/paths/~1new/get": {
    operationId: "getNew",
    parameters: [{ $ref: "#/components/parameters/Count" }],
  },
};

export const text = fc.constantFrom("", "x", "Line one\nline two", "a */ b", "ünïcode");
// Task 7.4 fixes `--enum` output for an empty value and for line breaks in member descriptions on
// purpose (upstream #2807, #2838; test/api/enum-invalid-output.test.ts), so enums leave them out.
const enumValueText = fc.constantFrom("x", "Line one\nline two", "a */ b", "ünïcode");
const enumDescriptionText = fc.constantFrom("", "x", "a */ b", "ünïcode");
export const key = fc.constantFrom(...KEYS);

export function schemaArbitrary(): fc.Arbitrary<unknown> {
  const { schema } = fc.letrec((tie) => ({
    schema: fc.oneof(
      { depthSize: "small", withCrossShrink: true },
      // Invalid and boolean schemas are rare in documents; they only check that errors match.
      {
        weight: 1,
        arbitrary: fc.oneof(
          { weight: 8, arbitrary: fc.constant(true) },
          fc.constant(false),
          fc.constant(null),
        ),
      },
      { weight: 2, arbitrary: fc.record({ $ref: fc.constantFrom(...REFS) }) },
      { weight: 4, arbitrary: tie("primitive") },
      { weight: 3, arbitrary: tie("enum") },
      { weight: 2, arbitrary: tie("array") },
      { weight: 3, arbitrary: tie("object") },
      { weight: 2, arbitrary: tie("composition") },
    ),
    primitive: fc.record(
      {
        type: fc.oneof(
          fc.constantFrom("string", "number", "integer", "boolean", "null", "object"),
          fc.uniqueArray(fc.constantFrom("string", "number", "null", "boolean", "array"), {
            minLength: 1,
            maxLength: 3,
          }),
        ),
        format: fc.constantFrom("binary", "date-time", "int64"),
        description: text,
        title: text,
        default: fc.oneof(text, fc.integer(), fc.constant(null)),
        example: fc.oneof(text, fc.record({ a: fc.integer() })),
        nullable: fc.boolean(),
        deprecated: fc.boolean(),
        readOnly: fc.boolean(),
        writeOnly: fc.boolean(),
        const: fc.oneof(text, fc.integer(), fc.constant(null)),
        oneOf: fc.array(tie("schema"), { maxLength: 2 }),
      },
      { requiredKeys: ["type"] },
    ),
    enum: fc.record(
      {
        type: fc.constantFrom("string", "number", "object", undefined),
        enum: fc.array(
          fc.oneof(
            enumValueText,
            fc.integer({ min: -3, max: 3 }),
            fc.constant(null),
            fc.record({ a: fc.integer() }),
          ),
          {
            maxLength: 4,
          },
        ),
        nullable: fc.boolean(),
        additionalProperties: fc.boolean(),
        "x-enum-varnames": fc.array(fc.constantFrom("One", "Two"), { maxLength: 2 }),
        "x-enum-descriptions": fc.array(enumDescriptionText, { maxLength: 2 }),
      },
      { requiredKeys: ["enum"] },
    ),
    array: fc.record(
      {
        type: fc.constant("array"),
        items: fc.oneof(tie("schema"), fc.array(tie("schema"), { maxLength: 2 })),
        prefixItems: fc.array(tie("schema"), { maxLength: 2 }),
        minItems: fc.integer({ min: -1, max: 4 }),
        maxItems: fc.integer({ min: -1, max: 4 }),
        nullable: fc.boolean(),
      },
      { requiredKeys: ["type"] },
    ),
    // Objects have no `$defs`: the original printed it as a required member (legacy bug 17,
    // upstream #2664), and the fix makes it optional on purpose (test/api/defs-types.test.ts).
    object: fc.record(
      {
        type: fc.constantFrom("object", undefined),
        properties: fc.dictionary(key, tie("schema"), { maxKeys: 3 }),
        required: fc.uniqueArray(key, { maxLength: 3 }),
        additionalProperties: fc.oneof(fc.boolean(), fc.constant({}), tie("schema")),
        patternProperties: fc.dictionary(fc.constantFrom("^a", "^b"), tie("schema"), {
          maxKeys: 2,
        }),
        nullable: fc.boolean(),
        description: text,
      },
      { requiredKeys: [] },
    ),
    composition: fc.record(
      {
        type: fc.constantFrom("object", "string", undefined),
        allOf: fc.array(tie("schema"), { maxLength: 3 }),
        anyOf: fc.array(tie("schema"), { maxLength: 2 }),
        oneOf: fc.array(tie("schema"), { maxLength: 3 }),
        required: fc.uniqueArray(key, { maxLength: 2 }),
        discriminator: fc.record({ propertyName: fc.constantFrom("kind", "type") }),
        properties: fc.dictionary(key, tie("schema"), { maxKeys: 2 }),
        nullable: fc.boolean(),
      },
      { requiredKeys: [] },
    ),
  }));
  return schema;
}

const MEDIA_TYPES = ["application/json", "text/plain", "a/b~c", "*/*"] as const;
const nestedSchema = schemaArbitrary();

/** A media type object, or a `$ref` in its place. */
export const mediaTypeArbitrary = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.record(
      { schema: nestedSchema, description: text, deprecated: fc.boolean() },
      { requiredKeys: [] },
    ),
  },
  fc.record({ $ref: fc.constantFrom(...REFS) }),
);

/** A `content` map. */
export const contentArbitrary = fc.dictionary(fc.constantFrom(...MEDIA_TYPES), mediaTypeArbitrary, {
  maxKeys: 3,
});

export const headerArbitrary = fc.record(
  {
    schema: nestedSchema,
    content: contentArbitrary,
    required: fc.boolean(),
    deprecated: fc.boolean(),
    description: text,
  },
  { requiredKeys: [] },
);

/** Deterministic callbacks, each one exercising a different callback contract. */
function multiLineType(isParsed: boolean): ts.TypeNode {
  if (isParsed) {
    const [alias] = stringToAST("type X = {\n  a: string;\n  b: { c: `x` };\n};");
    return (alias as ts.TypeAliasDeclaration).type;
  }
  const member = ts.factory.createPropertySignature(undefined, "z", undefined, NULL);
  return ts.factory.createParenthesizedType(ts.factory.createTypeLiteralNode([member]));
}

export const CALLBACK_SETS: readonly Partial<OpenAPITSOptions>[] = [
  {},
  {
    transform(schema) {
      if (schema.format === "binary") {
        return ts.factory.createTypeReferenceNode("Blob");
      }
      if (schema.format === "date-time") {
        return { schema: ts.factory.createTypeReferenceNode("Date"), questionToken: true };
      }
      // Parsed and explicitly parenthesized multi-line nodes are kept as raw text.
      return schema.format === "int64" ? multiLineType(schema.nullable === true) : undefined;
    },
  },
  {
    postTransform(type, options) {
      return options.path?.endsWith("/a") ? tsUnion([type, NULL]) : undefined;
    },
  },
  {
    transformProperty(property, schema) {
      if (!schema || typeof schema !== "object" || !("readOnly" in schema)) {
        return undefined;
      }
      const updated = ts.factory.updatePropertySignature(
        property,
        [ts.factory.createModifier(ts.SyntaxKind.ReadonlyKeyword)],
        property.name,
        undefined,
        property.type,
      );
      ts.addSyntheticLeadingComment(
        updated,
        ts.SyntaxKind.MultiLineCommentTrivia,
        "* @readonly ",
        true,
      );
      return updated;
    },
  },
];

export const OPTION_KEYS = [
  "additionalProperties",
  "alphabetize",
  "arrayLength",
  "conditionalEnums",
  "dedupeEnums",
  "defaultNonNullable",
  "emptyObjectsUnknown",
  "enum",
  "enumValues",
  "excludeDeprecated",
  "immutable",
  "propertiesRequiredByDefault",
  "readWriteMarkers",
  "generatePathParams",
  "pathParamsAsTypes",
  "rootTypes",
  "rootTypesNoSchemaPrefix",
  "rootTypesKeepCasing",
  "exportType",
  "makePathsEnum",
] as const;

export const contextInput = fc.record({
  flags: fc.record(
    Object.fromEntries(OPTION_KEYS.map((name) => [name, fc.boolean()])) as Record<
      (typeof OPTION_KEYS)[number],
      fc.Arbitrary<boolean>
    >,
  ),
  callbacks: fc.integer({ min: 0, max: CALLBACK_SETS.length - 1 }),
  path: fc.constantFrom(...PATHS),
  isFromAdditionalProperties: fc.boolean(),
  hasDiscriminator: fc.boolean(),
  handledRefs: fc.subarray([...REFS, ...PATHS]),
});

export type ContextInput = typeof contextInput extends fc.Arbitrary<infer T> ? T : never;

export function createContext(input: ContextInput): GlobalContext {
  const callbacks = CALLBACK_SETS[input.callbacks] ?? {};
  return {
    ...DEFAULT_CTX,
    ...input.flags,
    ...callbacks,
    injectFooter: [],
    resolve: <T>(ref: string) => DOCUMENTS[ref] as T | undefined,
    discriminators: {
      objects: input.hasDiscriminator
        ? {
            "#/components/schemas/B": {
              propertyName: "kind",
              mapping: { b: "#/components/schemas/B" },
            },
            "#/components/schemas/Root": { propertyName: "type" },
          }
        : {},
      refsHandled: [...input.handledRefs],
    },
  } as GlobalContext;
}

/**
 * Start the original's module-level enum state fresh, as the ported code starts each run: the
 * dedupe cache and the `lastIndex` of the global regex its enum naming tests with.
 */
export function resetLegacyEnumState(): void {
  enumCache.clear();
  JS_PROPERTY_INDEX_INVALID_CHARS_RE.lastIndex = 0;
}

/** Print the type `build` returns with the footer it added, or the error message. */
/** IR nodes have a string `kind`; TypeScript nodes have a numeric `SyntaxKind`. */
function isIr(node: { kind: unknown }): boolean {
  return typeof node.kind === "string";
}

/** `type T = ...`: IR for a ported transformer, TypeScript for an original one. */
function aliasOf(type: IrType | ts.TypeNode): IrTypeAliasDeclaration | ts.TypeAliasDeclaration {
  if (isIr(type)) {
    return { kind: "typeAlias", name: "T", isExported: false, type: type as IrType, comments: [] };
  }
  return ts.factory.createTypeAliasDeclaration(undefined, "T", undefined, type as ts.TypeNode);
}

/** A member list as an object type, so it prints like any type (IR or TypeScript). */
export function objectOf(
  members: readonly IrMember[] | readonly ts.TypeElement[],
): IrType | ts.TypeNode {
  const [first] = members;
  if (first === undefined || isIr(first)) {
    return irObject(members as readonly IrMember[]);
  }
  return ts.factory.createTypeLiteralNode(members as readonly ts.TypeElement[]);
}

export function runLegacy(
  build: (options: TransformNodeOptions) => IrType | ts.TypeNode,
  input: ContextInput,
  path: string | undefined,
): string {
  resetLegacyEnumState();
  const ctx = createContext(input);
  try {
    return astToString([aliasOf(build({ path, ctx })), ...ctx.injectFooter]);
  } catch (error) {
    return `error: ${(error as Error).message}`;
  }
}

const DIGIT_START_RE = /^[0-9]/;
const NON_IDENTIFIER_CHARACTER_RE = /[^\p{ID_Continue}$]/u;

/** The component schemas of a components object or of a document. */
function schemasOf(value: unknown): Record<string, unknown> {
  const object = value as {
    schemas?: Record<string, unknown>;
    components?: { schemas?: Record<string, unknown> };
  } | null;
  return object?.schemas ?? object?.components?.schemas ?? {};
}

/** Whether a schema has an `enum` anywhere in it, which names an enum after the schema. */
function hasEnum(schema: unknown): boolean {
  return (JSON.stringify(schema) ?? "").includes('"enum":');
}

function hasDuplicates(names: readonly string[]): boolean {
  return new Set(names).size < names.length;
}

/**
 * Whether the input can reach legacy bug 15 or 16 (research/legacy-bugs.md), where the original
 * writes a declaration name or type reference that does not parse, reads as a number literal, or
 * replaces another alias. Enum and root alias names start with the schema name, so only schema
 * names matter: one that starts with a digit (with `--enum`, `--enum-values` or
 * `--root-types-no-schema-prefix`), one with characters that cannot be in an identifier (with
 * `--root-types-keep-casing`), or two with one PascalCase name (without the prefix). We build
 * valid, distinct names, so these inputs differ on purpose; enum-naming.test.ts and
 * components.test.ts cover them.
 */
export function reachesFixedLegacyBug(value: unknown, input: ContextInput): boolean {
  const { flags } = input;
  const schemas = schemasOf(value);
  const names = Object.keys(schemas);
  const isKeptCasing = flags.rootTypes && flags.rootTypesKeepCasing;
  const isUnprefixed = flags.rootTypes && flags.rootTypesNoSchemaPrefix;
  const rootNames = names.map((name) => (isKeptCasing ? name : pascalCase(name)));
  return (
    ((flags.enum || flags.enumValues) &&
      names.some((name) => DIGIT_START_RE.test(name) && hasEnum(schemas[name]))) ||
    (isKeptCasing && names.some((name) => NON_IDENTIFIER_CHARACTER_RE.test(name))) ||
    (isUnprefixed && rootNames.some((name) => DIGIT_START_RE.test(name))) ||
    (isUnprefixed && hasDuplicates(rootNames))
  );
}

const ENUM_BLOCK_RE = /^export (?:declare )?(?:const )?enum (\S+) \{\n([\s\S]*?)^\}/gm;
const ENUM_MEMBER_NAME_RE = /^\s+(\S+) = /gm;
const CONST_ARRAY_NAME_RE = /^export const (\S+): /gm;

/**
 * Whether the original output declares an `--enum-values` array twice (a schema typed twice):
 * that output does not compile (TS2451). The new footer adds the same array once.
 */
export function hasRedeclaredConstArrays(output: string): boolean {
  const names = [...output.matchAll(CONST_ARRAY_NAME_RE)].map((match) => match[1] ?? "");
  return new Set(names).size !== names.length;
}

/**
 * Whether an enum of the original output repeats a member name, also across declarations of the
 * same name, which TypeScript merges: that output does not compile. The new generator numbers
 * the repeats (`ApiPaths`, upstream #2194; `--enum`, roadmap R10.1) and declares an enum once.
 */
export function hasDuplicateEnumMembers(output: string): boolean {
  const membersByEnum = new Map<string, string[]>();
  for (const [, name = "", body = ""] of output.matchAll(ENUM_BLOCK_RE)) {
    const names = [...body.matchAll(ENUM_MEMBER_NAME_RE)].map((match) => match[1] ?? "");
    membersByEnum.set(name, [...(membersByEnum.get(name) ?? []), ...names]);
  }
  return [...membersByEnum.values()].some((names) => new Set(names).size !== names.length);
}

const REPEATED_PARAMETERS_RE =
  /^export const \S+: ReadonlyArray<(?:Extract<)*FlattenedDeepRequired<(?:paths>|webhooks>|components>\["pathItems"\])\["[^"]*"\]\["parameters"\]\["parameters"\]/m;

/**
 * Whether the original output types an `--enum-values` array of a path item parameter with
 * `["parameters"]["parameters"]`, which does not exist (TS2339), also inside the `Extract` of a
 * union member. The new one indexes it once.
 */
export function hasRepeatedParametersIndex(output: string): boolean {
  return REPEATED_PARAMETERS_RE.test(output);
}

const EXTRACT_PROBE_RE = /, \{\n\s+([^\n:]+): unknown;\n\s*\}>/g;
const PROBE_NAME_RE = /^(?:[A-Za-z_$][A-Za-z_$0-9]*|\d+|"[^"]*")$/;

/**
 * Whether the original output narrows a union with an `Extract` probe whose property name is not
 * an identifier and not quoted (`{ c-d: unknown }`): that output does not parse. The new generator
 * quotes the name.
 */
export function hasUnquotedExtractProbe(output: string): boolean {
  return [...output.matchAll(EXTRACT_PROBE_RE)].some(
    (match) => !PROBE_NAME_RE.test(match[1] ?? ""),
  );
}
