import fc from "fast-check";
import {
  contentArbitrary,
  headerArbitrary,
  key,
  schemaArbitrary,
  text,
} from "./parity-arbitraries.js";

/** Arbitrary OpenAPI document parts shared by the path, components and root parity tests. */

const schema = schemaArbitrary();
const parameter = fc.oneof(
  {
    weight: 3,
    arbitrary: fc.record(
      {
        name: fc.oneof(key, fc.constantFrom("id", "count", "flag")),
        in: fc.constantFrom("query", "path", "header"),
        required: fc.boolean(),
        deprecated: fc.boolean(),
        schema: fc.oneof(
          schema,
          fc.record({ type: fc.constantFrom("integer", "boolean", "number") }),
        ),
        description: text,
      },
      { requiredKeys: ["in"] },
    ),
  },
  fc.record({
    $ref: fc.constantFrom(
      "#/components/parameters/Id",
      "#/components/parameters/Count",
      "#/components/parameters/Missing",
    ),
  }),
);
const response = fc.record(
  {
    headers: fc.dictionary(key, headerArbitrary, { maxKeys: 2 }),
    content: contentArbitrary,
    description: text,
  },
  { requiredKeys: [] },
);
export const operationArbitrary = fc.record(
  {
    operationId: fc.constantFrom("listItems", "a#b", "", "getNew"),
    deprecated: fc.boolean(),
    description: text,
    parameters: fc.array(parameter, { maxLength: 3 }),
    requestBody: fc.oneof(
      fc.record(
        { required: fc.boolean(), content: contentArbitrary, description: text },
        { requiredKeys: [] },
      ),
      fc.record({
        $ref: fc.constantFrom(
          "#/components/requestBodies/Body",
          "#/components/requestBodies/Optional",
        ),
      }),
    ),
    responses: fc.dictionary(fc.constantFrom("200", "default"), response, { maxKeys: 2 }),
  },
  { requiredKeys: [] },
);
const operationOrReference = fc.oneof(
  { weight: 4, arbitrary: operationArbitrary },
  fc.record({ $ref: fc.constantFrom("#/paths/~1old/get", "#/paths/~1new/get") }),
);
export const pathItemArbitrary = fc.record(
  {
    parameters: fc.array(parameter, { maxLength: 3 }),
    get: operationOrReference,
    post: operationOrReference,
    trace: operationOrReference,
    description: text,
  },
  { requiredKeys: [] },
);
// No backtick URLs: task 6.6 escapes them on purpose (research/legacy-bugs.md #10, paths.test.ts).
export const pathsArbitrary = fc.dictionary(
  fc.constantFrom("/items", "/items/{id}", "/a/{count}/{flag}/{count}", "/b/{open", "/c/{id}$x"),
  fc.oneof(
    { weight: 6, arbitrary: pathItemArbitrary },
    fc.record({ $ref: fc.constant("#/components/pathItems/P") }),
    fc.constantFrom(null, "text"),
  ),
  { maxKeys: 3 },
);
export const webhooksArbitrary = fc.dictionary(
  key,
  fc.oneof({ weight: 4, arbitrary: pathItemArbitrary }, fc.constant(null)),
  {
    maxKeys: 2,
  },
);

const NAMES = ["Pet", "pet", "pet-store", "Pet_2", "1", "a b", "PetStore", "pet_store"] as const;
const name = fc.constantFrom(...NAMES);
export const componentsArbitrary = fc.record(
  {
    schemas: fc.dictionary(name, schema, { maxKeys: 4 }),
    responses: fc.dictionary(name, fc.record({ content: contentArbitrary, description: text }), {
      maxKeys: 2,
    }),
    parameters: fc.dictionary(
      name,
      fc.record({ name: fc.constant("q"), in: fc.constant("query"), schema }),
      {
        maxKeys: 2,
      },
    ),
    requestBodies: fc.dictionary(name, fc.record({ content: contentArbitrary }), { maxKeys: 2 }),
    headers: fc.dictionary(name, headerArbitrary, { maxKeys: 2 }),
    pathItems: fc.dictionary(name, fc.constant({}), { maxKeys: 1 }),
    examples: fc.constant({ Ignored: {} }),
  },
  { requiredKeys: [] },
);

/** A root value: usually a generated object, sometimes missing, empty or not an object. */
const root = <T>(arbitrary: fc.Arbitrary<T>) =>
  fc.oneof({ weight: 4, arbitrary }, fc.constantFrom(null, "text", {}));
export const documentArbitrary = fc.record(
  {
    paths: root(pathsArbitrary),
    webhooks: root(webhooksArbitrary),
    components: root(componentsArbitrary),
    $defs: root(schemaArbitrary()),
  },
  { requiredKeys: [] },
);

/** The Node API `inject` option: none, empty, or code with a comment between statements. */
/**
 * `inject` text in the layout the TypeScript printer gives it: task 6.6 prints the text as written,
 * while the original reprinted it (document-declarations.test.ts covers other layouts).
 */
export const injectArbitrary = fc.constantFrom(
  undefined,
  "",
  "   \n",
  "\ntype A = 1;\nexport const b = 2;\n",
);
