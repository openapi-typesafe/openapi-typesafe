import { astToString } from "../../../src/index.js";
import transformSchemaObject, { transformSchemaObjectWithComposition } from "../../../src/transform/schema-object.js";
import type { SchemaObject } from "../../../src/types.js";
import { DEFAULT_CTX } from "../../test-helpers.js";

const SCHEMA: SchemaObject = {
  type: "object",
  required: ["id"],
  properties: { id: { type: "string" } },
};

/** Options whose `postTransform` replaces every schema type with one marker type. */
const OPTIONS = {
  path: "#/components/schemas/Item",
  ctx: { ...DEFAULT_CTX, irCallbacks: true, postTransform: () => "Marker" },
};

describe("transformSchemaObjectWithComposition", () => {
  test("skips postTransform at the top level but applies it to nested schemas", () => {
    const result = astToString(transformSchemaObjectWithComposition(SCHEMA, OPTIONS));

    expect(result).toBe("{\n    id: Marker;\n}\n");
  });

  test("differs from transformSchemaObject, which applies postTransform at the top level", () => {
    const result = astToString(transformSchemaObject(SCHEMA, OPTIONS));

    expect(result).toBe("Marker\n");
  });

  test("accepts fromAdditionalProperties like transformSchemaObject", () => {
    const options = { ...OPTIONS, ctx: { ...DEFAULT_CTX } };

    const shape = transformSchemaObjectWithComposition({ type: "string" }, options, true);
    const full = transformSchemaObject({ type: "string" }, options, true);

    expect(astToString(shape)).toBe(astToString(full));
  });
});
