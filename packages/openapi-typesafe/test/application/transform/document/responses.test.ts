import { describe, expect, it } from "vitest";
import { printNodes } from "../../../../src/application/print/print-nodes.js";
import { requestBodyType } from "../../../../src/application/transform/document/request-body.js";
import { responseType } from "../../../../src/application/transform/document/response.js";
import { responsesType } from "../../../../src/application/transform/document/responses.js";
import type { IrType } from "../../../../src/domain/ir/nodes.js";
import { fakeTransformContext } from "../../../fakes/transform-context.js";

const LOCATION = { path: "#/paths/~1items/get" };

function print(type: IrType): string {
  const alias = { kind: "typeAlias", name: "T", isExported: false, comments: [] } as const;
  return printNodes([{ ...alias, type }]).slice("type T = ".length, -2);
}

describe("requestBodyType", () => {
  it("requestBodyType without media types has an optional never placeholder", () => {
    const { context } = fakeTransformContext({ options: { immutable: true } });

    expect(print(requestBodyType({}, LOCATION, context))).toBe(
      '{\n    readonly content: {\n        "*/*"?: never;\n    };\n}',
    );
  });

  it("requestBodyType lists media types and transforms a $ref entry as a schema $ref", () => {
    const { context } = fakeTransformContext();
    const body = {
      content: {
        "application/json": { schema: { type: "string" } },
        "text/plain": { $ref: "#/components/schemas/Text" },
      },
    } as const;

    expect(print(requestBodyType(body, LOCATION, context))).toBe(
      '{\n    content: {\n        "application/json": string;\n' +
        '        "text/plain": components["schemas"]["Text"];\n    };\n}',
    );
  });
});

describe("responseType", () => {
  it("responseType without headers or content allows any header and has no content", () => {
    const { context } = fakeTransformContext();

    expect(print(responseType({}, LOCATION, context))).toBe(
      "{\n    headers: {\n        [name: string]: unknown;\n    };\n    content?: never;\n}",
    );
  });

  it("responseType marks headers optional unless required or referenced", () => {
    const { context } = fakeTransformContext();
    const response = {
      headers: {
        "X-Optional": { schema: { type: "string" } },
        "X-Required": { required: true, schema: { type: "number" } },
        "X-Ref": { $ref: "#/components/headers/Ref" },
      },
    } as const;

    const text = print(responseType(response, LOCATION, context));

    expect(text).toContain('"X-Optional"?: string;');
    expect(text).toContain('"X-Required": number;');
    expect(text).toContain('"X-Ref": components["headers"]["Ref"];');
  });

  it("responseType reads a $ref content entry as a media type without schema", () => {
    const { context } = fakeTransformContext({ options: { immutable: true } });
    const response = { content: { "application/json": { $ref: "#/components/schemas/A" } } };

    const text = print(responseType(response, LOCATION, context));

    expect(text).toContain('readonly "application/json": unknown;');
    expect(text).toContain("readonly [name: string]: unknown;");
    expect(text).toContain("\n    headers: {");
  });
});

describe("responsesType", () => {
  it("responsesType without responses is never", () => {
    const { context } = fakeTransformContext();

    expect(print(responsesType({}, LOCATION, context))).toBe("never");
  });

  it("responsesType keys responses by code and keeps the response JSDoc", () => {
    const { context } = fakeTransformContext();
    const responses = {
      200: { description: "OK" },
      default: { $ref: "#/components/responses/Error" },
    } as const;

    const text = print(responsesType(responses, LOCATION, context));

    expect(text).toContain("/** @description OK */\n    200: {");
    expect(text).toContain('default: components["responses"]["Error"];');
  });
});
