import { describe, expect, it } from "vitest";
import { printNodes } from "../../../src/application/print/print-nodes.js";
import { generatedLocationOf } from "../../../src/application/transform/ref-pointer/generated-location.js";
import { generatedMember } from "../../../src/application/transform/ref-pointer/generated-shape.js";
import { hasInlineCycle } from "../../../src/application/transform/ref-pointer/inline-cycles.js";
import { originalIndexFails } from "../../../src/application/transform/ref-pointer/original-index.js";
import {
  isOptionalRequestBody,
  pointerNode,
  refPointerOf,
} from "../../../src/application/transform/ref-pointer/pointer-walk.js";
import { isNullableSchema } from "../../../src/application/transform/ref-pointer/property-shape.js";
import { typedWalk } from "../../../src/application/transform/ref-pointer/typed-walk.js";
import type {
  RefResolver,
  SchemaOptions,
} from "../../../src/application/transform/schema/schema-context.js";
import type { IrType } from "../../../src/domain/ir/nodes.js";
import { parseRefPointer } from "../../../src/domain/openapi/json-pointer.js";
import { DEFAULT_TRANSFORM_OPTIONS } from "../../fakes/transform-context.js";

/** In-memory resolver over one document, as the loader resolves local pointers. */
function resolverOf(document: unknown): RefResolver {
  return {
    resolve: (ref) =>
      parseRefPointer(ref).reduce<unknown>(
        (node, segment) =>
          typeof node === "object" && node !== null ? (node as never)[segment] : undefined,
        document,
      ),
  };
}

const OPTIONS: SchemaOptions = DEFAULT_TRANSFORM_OPTIONS;

const ITEM = { type: "object", properties: { time: { type: "string" } }, required: ["time"] };
const DOCUMENT = {
  paths: {
    "/items": {
      parameters: [{ name: "p", in: "query", schema: { type: "string" } }],
      get: {
        parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
        requestBody: { content: { "application/json": { schema: ITEM } } },
        responses: {
          200: {
            content: { "application/json": { schema: { type: "array", items: ITEM } } },
            headers: {
              "X-Open": { schema: { type: "object", additionalProperties: true } },
              "X-Ref": { $ref: "#/components/headers/Open" },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Item: ITEM,
      Open: { type: "object", additionalProperties: true },
      Map: { type: "object", additionalProperties: ITEM },
      Pattern: { type: "object", patternProperties: { "^x": ITEM } },
      Nullable: { type: ["object", "null"], properties: { id: { type: "string" } } },
      Tagged: {
        type: "object",
        properties: { kind: { type: "string" } },
        discriminator: { propertyName: "kind" },
      },
      Both: { allOf: [ITEM, { $ref: "#/components/schemas/Item" }] },
      Union: { anyOf: [ITEM, { type: "object", properties: { other: { type: "string" } } }] },
      Mixed: { anyOf: [ITEM], properties: { id: { type: "string" } } },
      Enum: { type: "string", enum: ["a"] },
      List: { type: "array", items: ITEM },
      Defs: { type: "object", $defs: { Code: { type: "string" } }, definitions: { Old: ITEM } },
      Optional: { type: "object", properties: { inner: ITEM } },
      Empty: { type: "object", additionalProperties: {} },
      Defaults: {
        type: "object",
        properties: {
          size: { type: "object", properties: { n: {} }, default: {} },
          old: { deprecated: true },
        },
      },
      Own: { allOf: [ITEM], properties: { id: { type: "string" } } },
      Text: { type: ["string", "null"] },
      Str: { type: "string" },
      Bin: { type: "string", format: "binary" },
      Blank: { type: "object", items: { type: "string" } },
      Hollow: { type: "object", properties: {}, allOf: [ITEM] },
      Words: { type: "string", items: { type: "number" }, properties: { a: {} } },
      Free: { type: "object", required: ["any"], properties: { any: { "x-inner": ITEM } } },
      Loop: {
        definitions: {
          Node: { properties: { next: { $ref: "#/components/schemas/Loop/definitions/Node" } } },
        },
      },
    },
    parameters: { Page: { name: "page", in: "query", schema: { type: "integer" } } },
    headers: { Open: { schema: { type: "object", additionalProperties: true } } },
  },
};
const REFS = resolverOf(DOCUMENT);

function pointer(ref: string) {
  const result = refPointerOf(ref);
  if (result === null) {
    throw new Error(`no pointer in ${ref}`);
  }
  return result;
}

function fails(ref: string, options: SchemaOptions = OPTIONS): boolean {
  return originalIndexFails({ pointer: pointer(ref), options, refs: REFS });
}

function print(type: IrType): string {
  const alias = { kind: "typeAlias", name: "T", isExported: false, comments: [] } as const;
  return printNodes([{ ...alias, type }]).slice("type T = ".length, -2);
}

function walked(ref: string): string {
  const result = typedWalk({ pointer: pointer(ref), options: OPTIONS, refs: REFS });
  return result.kind === "typed" ? print(result.walk.type) : `untyped at ${result.index}`;
}

const MEDIA = "#/paths/~1items/get/responses/200/content/application~1json";

/** A schema as a located node outside the document. */
function located(node: unknown) {
  return { node, location: undefined };
}

describe("generatedMember", () => {
  const member = (name: string, key: string, options = OPTIONS) =>
    generatedMember(located(DOCUMENT.components.schemas[name as "Item"]), key, options, REFS).kind;

  it("generatedMember reads properties, index signatures and missing keys", () => {
    expect(member("Item", "time")).toBe("property");
    expect(member("Item", "schema")).toBe("missing");
    expect(member("Item", "schema", { ...OPTIONS, additionalProperties: true })).toBe("index");
    expect(member("Open", "schema")).toBe("index");
    expect(member("Map", "schema")).toBe("index");
  });

  it("generatedMember counts shapes it does not model as opaque", () => {
    expect(member("Tagged", "kind")).toBe("opaque");
    expect(member("Enum", "x")).toBe("opaque");
    expect(member("Item", "toString")).toBe("opaque");
    expect(member("List", "0")).toBe("opaque");
  });

  it("generatedMember with --read-write-markers reads a property without a marker", () => {
    expect(member("Item", "time", { ...OPTIONS, readWriteMarkers: true })).toBe("property");
  });

  it("generatedMember misses keys of a nullable object, an array, an allOf and a union", () => {
    expect(member("Nullable", "id")).toBe("missing");
    expect(member("List", "items")).toBe("missing");
    expect(member("Both", "items")).toBe("missing");
    expect(member("Both", "time")).toBe("opaque");
    expect(member("Union", "time")).toBe("missing");
    expect(member("Mixed", "x")).toBe("missing");
  });

  it("generatedMember reads an index signature of unknown in an allOf as unknown & T", () => {
    const open = { ...OPTIONS, additionalProperties: true };

    // `unknown & unknown` is `unknown`, and `unknown & T` is `T`.
    expect(generatedMember(located(DOCUMENT.components.schemas.Both), "allOf", open, REFS)).toEqual(
      {
        kind: "index",
        node: undefined,
        location: undefined,
        isOtherType: false,
      },
    );
    expect(member("Own", "id", open)).toBe("property");
  });

  it("generatedMember misses every key of a schema typed unknown", () => {
    expect(generatedMember(located({ "x-inner": ITEM }), "x-inner", OPTIONS, REFS).kind).toBe(
      "missing",
    );
    expect(generatedMember(located({ $defs: { A: ITEM } }), "x", OPTIONS, REFS).kind).toBe(
      "opaque",
    );
    expect(generatedMember(located({ type: [] }), "x", OPTIONS, REFS).kind).toBe("opaque");
  });
});

describe("originalIndexFails", () => {
  it("originalIndexFails with a keyword the generated type has no member for is true", () => {
    expect(fails(`${MEDIA}/schema`)).toBe(true);
    expect(fails(`${MEDIA}/schema/items/properties/time`)).toBe(true);
    expect(fails("#/components/schemas/Defs/definitions/Old")).toBe(true);
    expect(fails("#/paths/~1items/get/parameters/0/schema")).toBe(true);
    expect(fails("#/components/parameters/Page/schema")).toBe(true);
  });

  it("originalIndexFails through an optional value or request body is true", () => {
    expect(fails("#/components/schemas/Optional/properties/inner/properties/time")).toBe(true);
    expect(fails("#/paths/~1items/get/requestBody/content/application~1json/schema")).toBe(true);
  });

  it("originalIndexFails with a key after a member typed unknown is true", () => {
    const open = { ...OPTIONS, additionalProperties: true };

    expect(fails("#/components/schemas/Both/allOf/0/properties/time", open)).toBe(true);
    expect(fails("#/components/schemas/Both/allOf/1", open)).toBe(true);
    expect(fails("#/components/schemas/Free/properties/any/x-inner")).toBe(true);
  });

  it("originalIndexFails with a type that compiles is false", () => {
    expect(fails("#/components/schemas/Item/properties/time")).toBe(false);
    expect(fails("#/components/schemas/Open/properties/schema")).toBe(false);
    expect(
      fails("#/components/schemas/Item/properties/schema", {
        ...OPTIONS,
        additionalProperties: true,
      }),
    ).toBe(false);
    expect(fails("#/components/schemas/Pattern/properties/x")).toBe(false);
    expect(fails("#/paths/~1missing/get")).toBe(false);
  });
});

describe("typedWalk", () => {
  it("typedWalk leaves out schema and indexes items by number", () => {
    expect(walked(`${MEDIA}/schema/items/properties/time`)).toBe(
      'paths["/items"]["get"]["responses"]["200"]["content"]["application/json"][number]["time"]',
    );
    expect(walked("#/components/parameters/Page/schema")).toBe('components["parameters"]["Page"]');
  });

  it("typedWalk wraps optional values and indexes additionalProperties by string", () => {
    expect(walked("#/components/schemas/Optional/properties/inner/properties/time")).toBe(
      'NonNullable<components["schemas"]["Optional"]["inner"]>["time"]',
    );
    expect(walked("#/components/schemas/Map/additionalProperties/properties/time")).toBe(
      'components["schemas"]["Map"][string]["time"]',
    );
    expect(walked("#/paths/~1items/get/requestBody/content/application~1json/schema")).toBe(
      'NonNullable<paths["/items"]["get"]["requestBody"]>["content"]["application/json"]',
    );
  });

  it("typedWalk reads $defs members and stops at a keyword with no type", () => {
    expect(walked("#/components/schemas/Defs/$defs/Code")).toBe(
      'NonNullable<components["schemas"]["Defs"]["$defs"]>["Code"]',
    );
    expect(walked("#/components/schemas/Defs/definitions/Old")).toBe("untyped at 2");
    expect(walked("#/paths/~1items/get/parameters/0/schema")).toBe("untyped at 2");
  });

  it("typedWalk and originalIndexFails read the parameters of a path item", () => {
    expect(walked("#/paths/~1items/parameters/0/schema")).toBe("untyped at 1");
    expect(fails("#/paths/~1items/parameters/0/schema")).toBe(true);
  });
});

describe("edge shapes", () => {
  const member = (name: string, key: string, options = OPTIONS) =>
    generatedMember(located(DOCUMENT.components.schemas[name as "Item"]), key, options, REFS).kind;

  it("generatedMember reads an empty additionalProperties, defaults and deprecated properties", () => {
    expect(member("Empty", "x")).toBe("index");
    // `--exclude-deprecated` leaves the property out of the generated type: no such key.
    expect(member("Defaults", "old", { ...OPTIONS, excludeDeprecated: true })).toBe("missing");
    expect(fails("#/components/schemas/Defaults/properties/size/properties/n")).toBe(false);
  });

  it("generatedMember reads allOf with own properties and a nullable scalar", () => {
    expect(member("Own", "id")).toBe("property");
    expect(member("Own", "time")).toBe("property");
    expect(member("Own", "other")).toBe("missing");
    expect(member("Text", "length")).toBe("opaque");
    expect(member("Str", "schema")).toBe("missing");
    expect(member("Str", "length")).toBe("opaque");
    expect(member("Bin", "schema")).toBe("missing");
    expect(member("Bin", "schema", { ...OPTIONS, binaryAsBlob: true })).toBe("opaque");
    expect(isNullableSchema("text")).toBe(false);
  });

  it("typedWalk and originalIndexFails accept pointers to nodes that are not there", () => {
    expect(walked("#/components/schemas/Nullable/properties/id")).toBe(
      'NonNullable<components["schemas"]["Nullable"]>["id"]',
    );
    expect(walked("#/components/schemas/Nope/properties/a/items/additionalProperties")).toBe(
      'NonNullable<components["schemas"]["Nope"]["a"]>[number][string]',
    );
    expect(walked("#/components/schemas/Nope/$defs/a")).toBe(
      'NonNullable<components["schemas"]["Nope"]["$defs"]>["a"]',
    );
    expect(walked("#/paths/~1nope/get/responses/200/content/application~1json/schema")).toBe(
      'paths["/nope"]["get"]["responses"]["200"]["content"]["application/json"]',
    );
    expect(fails("#/paths/~1items/get/nothing/x")).toBe(false);
    expect(pointerNode(pointer("#/components/schemas/Nope/a/b"), REFS)).toBeUndefined();
    expect(isOptionalRequestBody({}, REFS)).toBe(false);
  });
});

describe("keywords the generated type ignores", () => {
  const member = (name: string, key: string, options = OPTIONS) =>
    generatedMember(located(DOCUMENT.components.schemas[name as "Item"]), key, options, REFS).kind;

  it("generatedMember of an object without object keywords reads Record<string, never>", () => {
    expect(member("Blank", "items")).toBe("never");
    expect(member("Blank", "items", { ...OPTIONS, emptyObjectsUnknown: true })).toBe("missing");
    expect(member("Hollow", "allOf")).toBe("missing");
  });

  it("generatedMember of a primitive type ignores its object and array keywords", () => {
    expect(member("Words", "items")).toBe("missing");
    expect(member("Words", "a")).toBe("missing");
  });

  it("typedWalk stops at a keyword the owner's type has no member for", () => {
    expect(walked("#/components/schemas/Blank/items")).toBe("untyped at 2");
    expect(walked("#/components/schemas/Words/items")).toBe("untyped at 2");
    expect(walked("#/components/schemas/Words/properties/a")).toBe("untyped at 2");
  });
});

describe("response headers", () => {
  const HEADERS = "#/paths/~1items/get/responses/200/headers";

  it("originalIndexFails through a header that is not required is true", () => {
    expect(fails(`${HEADERS}/X-Open/schema`)).toBe(true);
    expect(fails(`${HEADERS}/X-Ref/schema`)).toBe(false);
    expect(fails("#/components/headers/Open/schema")).toBe(false);
  });

  it("typedWalk wraps a header that is not required in NonNullable", () => {
    expect(walked(`${HEADERS}/X-Open/schema/properties/a`)).toBe(
      'NonNullable<paths["/items"]["get"]["responses"]["200"]["headers"]["X-Open"]>["a"]',
    );
    expect(walked("#/components/headers/Open/schema/properties/a")).toBe(
      'components["headers"]["Open"]["a"]',
    );
  });
});

describe("generatedLocationOf", () => {
  const located = (ref: string) => generatedLocationOf(ref, REFS);

  it("generatedLocationOf leaves out the keywords typed at the parent's location", () => {
    expect(located("#/components/schemas/Both/allOf/0/properties/time").path).toBe(
      "#/components/schemas/Both/time",
    );
    expect(located("#/components/schemas/List/items/properties/time").path).toBe(
      "#/components/schemas/List/time",
    );
    expect(located("#/components/schemas/Union/anyOf/1/properties/other").path).toBe(
      "#/components/schemas/Union/anyOf/1/other",
    );
    expect(located("#/components/schemas/Map/additionalProperties")).toEqual({
      path: "#/components/schemas/Map",
      recordOwner: { node: DOCUMENT.components.schemas.Map, keyword: "additionalProperties" },
    });
    expect(located("#/components/schemas/Map").recordOwner).toBeNull();
  });

  it("generatedLocationOf names parameters and leaves out a container's schema", () => {
    expect(located("#/paths/~1items/get/parameters/0/schema").path).toBe(
      "#/paths/~1items/get/parameters/query/q",
    );
    expect(located("#/paths/~1items/parameters/0/schema").path).toBe(
      "#/paths/~1items/parameters/parameters/query/p",
    );
    expect(located(`${MEDIA}/schema/items/properties/time`).path).toBe(`${MEDIA}/time`);
  });

  it("generatedLocationOf continues at a crossed $ref and keeps a pointer it cannot map", () => {
    expect(located("#/components/schemas/Both/allOf/1/properties/time").path).toBe(
      "#/components/schemas/Item/time",
    );
    // The generator types nothing under `definitions`: such a node keeps its pointer.
    expect(located("#/components/schemas/Defs/definitions/Old/properties/time").path).toBe(
      "#/components/schemas/Defs/definitions/Old/properties/time",
    );
    expect(located("#/components/schemas/Optional/properties/inner/not").path).toBe(
      "#/components/schemas/Optional/properties/inner/not",
    );
    expect(located("no pointer").path).toBe("no pointer");
  });

  const PARAMETER = { name: "w", in: "header", schema: { type: "string" } };
  const LOCATIONS = resolverOf({
    webhooks: { hook: { parameters: [PARAMETER] } },
    components: {
      pathItems: { Shared: { parameters: [PARAMETER] } },
      headers: { Text: { content: { "text/plain": { schema: ITEM } } } },
      schemas: {
        Ring: { $ref: "#/components/schemas/Loop" },
        Loop: { $ref: "#/components/schemas/Ring" },
        Alias: { $ref: "#/components/schemas/Target" },
        Target: { $ref: "#/components/schemas/Item" },
        Item: ITEM,
        Via: { properties: { old: { $ref: "#/components/schemas/Old/definitions/Old" } } },
        Old: { definitions: { Old: ITEM } },
      },
    },
  });
  const locatedIn = (ref: string) => generatedLocationOf(ref, LOCATIONS).path;

  it("generatedLocationOf nests the parameters of a webhook and a shared path item", () => {
    expect(locatedIn("#/webhooks/hook/parameters/0/schema")).toBe(
      "#/webhooks/hook/parameters/parameters/header/w",
    );
    expect(locatedIn("#/components/pathItems/Shared/parameters/0/schema")).toBe(
      "#/components/pathItems/Shared/parameters/parameters/header/w",
    );
  });

  it("generatedLocationOf with a missing node keeps walking the pointer's own segments", () => {
    expect(locatedIn("#/webhooks/hook/parameters/9/schema")).toBe(
      "#/webhooks/hook/parameters/parameters",
    );
    expect(locatedIn("#/components/schemas/Nope/properties/a")).toBe("#/components/schemas/Nope/a");
  });

  it("generatedLocationOf types a header's content at its media type", () => {
    expect(locatedIn("#/components/headers/Text/content/text~1plain/schema/properties/time")).toBe(
      "#/components/headers/Text/text~1plain/time",
    );
    expect(locatedIn("#/components/headers/Text/content")).toBe("#/components/headers/Text");
  });

  it("generatedLocationOf follows a $ref chain and stops at a $ref cycle", () => {
    expect(locatedIn("#/components/schemas/Alias/properties/time")).toBe(
      "#/components/schemas/Item/time",
    );
    expect(locatedIn("#/components/schemas/Ring/properties/a")).toBe("#/components/schemas/Ring/a");
  });

  it("generatedLocationOf keeps the pointer when a crossed $ref has no location", () => {
    const ref = "#/components/schemas/Via/properties/old/properties/time";

    expect(locatedIn(ref)).toBe(ref);
  });
});

describe("hasInlineCycle", () => {
  it("hasInlineCycle with a target that points back at itself is true", () => {
    expect(hasInlineCycle("#/components/schemas/Loop/definitions/Node", OPTIONS, REFS)).toBe(true);
  });

  it("hasInlineCycle with a target without such $refs is false", () => {
    expect(hasInlineCycle("#/components/schemas/Defs/definitions/Old", OPTIONS, REFS)).toBe(false);
  });
});
