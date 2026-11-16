import fc from "fast-check";
import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type GeneratorOptions, type OpenAPI3 } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * A property test of the `--enum` owner invariant (ADR-021): requests that TypeScript intersects
 * share one enum, so each location admits the values both sides list, rejects a value one side
 * does not list, and every enum name is declared once, under every enum flag set.
 */

const VALUES = ["a", "b", "c"] as const;
const RUNS = 30;

const FLAG_SETS: [string, GeneratorOptions][] = [
  ["--enum", { enum: true }],
  ["--enum --enum-values", { enum: true, enumValues: true }],
  ["--enum --dedupe-enums", { enum: true, dedupeEnums: true }],
  ["--fix dedupe-enum-names", { enum: true, dedupeEnums: true, fix: ["dedupe-enum-names"] }],
  ["--fix all", { enum: true, dedupeEnums: true, fix: ["all"] }],
];

/** One wrapper around the enum: the schema it builds and the TypeScript path into it. */
interface Wrapper {
  readonly wrap: (inner: unknown) => unknown;
  readonly path: (outer: string) => string;
}

const WRAPPERS: Wrapper[] = [
  { wrap: (inner) => ({ type: "array", items: inner }), path: (outer) => `${outer}[number]` },
  { wrap: (inner) => ({ type: "object", additionalProperties: inner }), path: (outer) => `${outer}[string]` },
  {
    wrap: (inner) => ({ type: "object", patternProperties: { "^x": inner } }),
    path: (outer) => `${outer}[string]`,
  },
  {
    wrap: (inner) => ({ type: "array", prefixItems: [inner], minItems: 1 }),
    path: (outer) => `NonNullable<${outer}[0]>`,
  },
  {
    wrap: (inner) => ({ type: "object", properties: { mode: inner } }),
    path: (outer) => `NonNullable<${outer}["mode"]>`,
  },
];

interface Case {
  readonly wrappers: Wrapper[];
  readonly own: string[];
  readonly inherited: string[];
  readonly isNullable: boolean;
  readonly others: string[][];
  readonly hasMember: boolean;
  /** The inherited side is a `$ref` item's schema (`allOf: [$ref: Base, own]`), not inline. */
  readonly isInheritedByRef: boolean;
}

const valueSet = fc.subarray([...VALUES], { minLength: 1 });

/** Cases where both sides list a value; with none the location is `never` by the document. */
const caseArbitrary: fc.Arbitrary<Case> = fc
  .record({
    wrappers: fc.array(fc.constantFrom(...WRAPPERS), { maxLength: 2 }),
    own: valueSet,
    inherited: valueSet,
    isNullable: fc.boolean(),
    others: fc.array(valueSet, { maxLength: 3 }),
    hasMember: fc.boolean(),
    isInheritedByRef: fc.boolean(),
  })
  .filter((test) => test.own.some((value) => test.inherited.includes(value)));

function enumSchema(values: string[], isNullable: boolean): unknown {
  return isNullable ? { type: ["string", "null"], enum: [...values, null] } : { type: "string", enum: values };
}

function wrapped(test: Case, values: string[]): unknown {
  return test.wrappers.reduceRight((inner, wrapper) => wrapper.wrap(inner), enumSchema(values, test.isNullable));
}

function documentOf(test: Case): OpenAPI3 {
  const key = (values: string[]) => ({ type: "object", properties: { key: wrapped(test, values) } });
  const schemas: Record<string, unknown> = test.isInheritedByRef
    ? { Base: key(test.inherited), T: { allOf: [{ $ref: "#/components/schemas/Base" }, key(test.own)] } }
    : { T: { ...key(test.own), allOf: [key(test.inherited)] } };
  test.others.forEach((values, index) => {
    schemas[`Other${index}`] = key(values);
  });
  if (test.hasMember) {
    schemas.Member = { allOf: [{ $ref: "#/components/schemas/T" }, { type: "object" }] };
  }
  return { openapi: "3.1.0", info: { title: "t", version: "1" }, paths: {}, components: { schemas } } as OpenAPI3;
}

/** Lines that compile only when the enum of `schema` admits `admitted` and rejects `rejected`. */
function checksOf(test: Case, schema: string): string[] {
  const outer = `NonNullable<components["schemas"]["${schema}"]["key"]>`;
  const leaf = test.wrappers.reduce((path, wrapper) => wrapper.path(path), outer);
  const values = `${schema}Values`;
  const lines = [`type ${values} = \`\${Exclude<${leaf}, null | undefined>}\`;`];
  for (const value of VALUES) {
    const isAdmitted = test.own.includes(value) && test.inherited.includes(value);
    lines.push(`const ${schema}_${value}: "${value}" extends ${values} ? true : false = ${isAdmitted};`);
  }
  return lines;
}

function declaredEnumNames(output: string): string[] {
  return [...output.matchAll(/^export (?:const )?enum ([\w$]+)/gm)].map((match) => match[1] as string);
}

describe.each(FLAG_SETS)("%s owner invariant on random schemas", (_flags, options) => {
  it("openapiTS types each intersected enum by the values both sides list", async () => {
    await fc.assert(
      fc.asyncProperty(caseArbitrary, async (test) => {
        const output = astToString(await openapiTS(documentOf(test), { silent: true, ...options }));
        const checks = [...checksOf(test, "T"), ...(test.hasMember ? checksOf(test, "Member") : [])];
        const names = declaredEnumNames(output);

        expect(names.filter((name, index) => names.indexOf(name) !== index)).toEqual([]);
        expect(typeErrorsOf(`${output}\n${checks.join("\n")}`)).toEqual([]);
      }),
      { numRuns: RUNS },
    );
  }, 60_000);
});
