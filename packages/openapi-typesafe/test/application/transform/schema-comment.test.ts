import { describe, expect, it } from "vitest";
import { schemaComment } from "../../../src/application/transform/schema-comment.js";

function commentText(schema: unknown): string | undefined {
  return schemaComment(schema)?.text;
}

describe("schemaComment", () => {
  it.each([null, undefined, "text", [], {}])("schemaComment(%j) is null", (schema) => {
    expect(schemaComment(schema)).toBeNull();
  });

  it("schemaComment with one short line keeps it on the opening line", () => {
    expect(schemaComment({ description: "Hello" })).toEqual({
      kind: "block",
      text: "* @description Hello ",
    });
  });

  it("schemaComment writes every field in the original order", () => {
    const schema = {
      title: " Title ",
      summary: "Summary",
      format: "uuid",
      deprecated: true,
      description: "Text",
      default: "",
      example: { a: 1 },
      examples: ["x", 2],
      const: 1,
      enum: [1],
      type: ["string", "null"],
      nullable: true,
    };

    expect(commentText(schema)).toBe(
      [
        "*",
        " * Title",
        " * Summary",
        " * Format: uuid",
        " * @deprecated",
        " * @description Text",
        " * @default ",
        ' * @example {\n *       "a": 1\n *     }',
        " * @example x",
        " * @example 2",
        " * @constant",
        " * @enum {string|null|null}",
        " ",
      ].join("\n"),
    );
  });

  it("schemaComment skips an empty description but keeps an empty default", () => {
    expect(commentText({ description: "", default: "" })).toBe("* @default  ");
  });

  it("schemaComment with a multi-line value writes a block", () => {
    expect(commentText({ description: "a\r\nb" })).toBe("*\n * @description a\n *     b\n ");
  });

  it("schemaComment escapes a comment end inside a value", () => {
    expect(commentText({ description: "a */ b" })).toBe("* @description a *\\/ b ");
  });

  it.each([
    [{ enum: [1] }, "* @enum {unknown} "],
    [{ enum: [1], type: "number" }, "* @enum {number} "],
  ])("schemaComment(%j) names the enum type", (schema, text) => {
    expect(commentText(schema)).toBe(text);
  });
});
