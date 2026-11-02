import { describe, expect, it } from "vitest";
import { printNodes } from "../../../../src/application/print/print-nodes.js";
import { headerType } from "../../../../src/application/transform/document/header.js";
import { mediaTypeType } from "../../../../src/application/transform/document/media-type.js";
import { parameterType } from "../../../../src/application/transform/document/parameter.js";
import { parametersMember } from "../../../../src/application/transform/document/parameters.js";
import { irObject } from "../../../../src/domain/ir/constructors.js";
import type { IrType } from "../../../../src/domain/ir/nodes.js";
import type { ParameterOrReference } from "../../../../src/domain/openapi/parameter-object.js";
import { type FakeContextInput, fakeTransformContext } from "../../../fakes/transform-context.js";

const ROOT = { path: "#/paths/~1items~1{id}/get" };
const ID_REF = "#/components/parameters/Id";
const DOCUMENTS = {
  [ID_REF]: { name: "id", in: "path", required: true, schema: { type: "string" } },
  "#/components/parameters/Old": { name: "old", in: "query", deprecated: true },
  "#/components/parameters/Alias": { $ref: ID_REF },
};

function print(type: IrType): string {
  const alias = { kind: "typeAlias", name: "T", isExported: false, comments: [] } as const;
  return printNodes([{ ...alias, type }]).slice("type T = ".length, -2);
}

function printParameters(
  parameters: readonly unknown[],
  input: FakeContextInput = {},
  location: { path?: string } = ROOT,
): string {
  const { context } = fakeTransformContext({ documents: DOCUMENTS, ...input });
  const member = parametersMember(parameters as ParameterOrReference[], location, context);
  return print(irObject([member]));
}

describe("mediaTypeType", () => {
  it("mediaTypeType without a schema is unknown", () => {
    const { context } = fakeTransformContext();

    expect(print(mediaTypeType({}, ROOT, context))).toBe("unknown");
    expect(print(mediaTypeType({ schema: { type: "number" } }, ROOT, context))).toBe("number");
  });
});

describe("parameterType", () => {
  it("parameterType without a schema is string", () => {
    const { context } = fakeTransformContext();

    expect(print(parameterType({ name: "q", in: "query" }, ROOT, context))).toBe("string");
  });
});

describe("headerType", () => {
  it("headerType with a schema uses it, and without schema or content is unknown", () => {
    const { context } = fakeTransformContext();

    expect(print(headerType({ schema: { type: "integer" } }, ROOT, context))).toBe("number");
    expect(print(headerType({}, ROOT, context))).toBe("unknown");
  });

  it("headerType with content has one property per media type", () => {
    const { context } = fakeTransformContext({ options: { immutable: true } });
    const header = {
      content: {
        "text/plain": { schema: { type: "string" }, description: "Plain" },
        "application/json": { $ref: "#/components/schemas/Json" },
      },
    };

    const text = print(headerType(header as never, ROOT, context));

    expect(text).toBe(
      '{\n    /** @description Plain */\n    readonly "text/plain": string;\n' +
        '    readonly "application/json": components["schemas"]["Json"];\n}',
    );
  });
});

describe("parametersMember", () => {
  it("parametersMember without parameters makes every location optional never", () => {
    expect(printParameters([])).toBe(
      "{\n    parameters: {\n        query?: never;\n        header?: never;\n" +
        "        path?: never;\n        cookie?: never;\n    };\n}",
    );
  });

  it("parametersMember groups parameters by location; path ones are always required", () => {
    const parameters = [
      { name: "q", in: "query" },
      { name: "id", in: "path" },
    ];

    const text = printParameters(parameters);

    expect(text).toContain("query?: {\n            q?: string;\n        };");
    expect(text).toContain("path: {\n            id: string;\n        };");
  });

  it("parametersMember with a $ref indexes the parameter by location and name", () => {
    const text = printParameters([{ $ref: ID_REF }]);

    expect(text).toContain('id: components["parameters"]["Id"];');
  });

  it("parametersMember with a $ref to a $ref indexes the plain path", () => {
    const text = printParameters([{ $ref: "#/components/parameters/Alias" }], {
      documents: { ...DOCUMENTS, "#/components/parameters/Alias": { $ref: ID_REF, in: "path" } },
    });

    expect(text).toContain('"undefined": components["parameters"]["Alias"];');
  });

  it("parametersMember with a missing name quotes it like the original", () => {
    const text = printParameters([{ in: "query" }]);

    expect(text).toContain('"undefined"?: string;');
  });

  it("parametersMember with --exclude-deprecated drops deprecated parameters and schemas", () => {
    const parameters = [
      { $ref: "#/components/parameters/Old" },
      { name: "s", in: "query", schema: { type: "string", deprecated: true } },
      { name: "kept", in: "query" },
    ];

    const text = printParameters(parameters, { options: { excludeDeprecated: true } });

    expect(text).toContain("query?: {\n            kept?: string;\n        };");
  });

  it("parametersMember with --alphabetize sorts by name", () => {
    const parameters = [
      { name: "b", in: "query" },
      { name: "a", in: "query" },
    ];

    const text = printParameters(parameters, { options: { alphabetize: true } });

    expect(text.indexOf("a?: string")).toBeLessThan(text.indexOf("b?: string"));
  });

  it("parametersMember with --generate-path-params adds undefined template parameters once", () => {
    const location = { path: "/items/{id}/{other}/{other}" };

    const text = printParameters(
      [{ $ref: ID_REF }],
      { options: { generatePathParams: true } },
      location,
    );

    expect(text).toContain(
      'path: {\n            id: components["parameters"]["Id"];\n            other: string;\n        };',
    );
  });

  it("parametersMember with --generate-path-params and no path adds nothing", () => {
    const text = printParameters([], { options: { generatePathParams: true } }, {});

    expect(text).toContain("path?: never;");
  });
});
