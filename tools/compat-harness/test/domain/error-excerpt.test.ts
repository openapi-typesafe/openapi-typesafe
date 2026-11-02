import { describe, expect, it } from "vitest";
import { extractErrorExcerpt } from "../../src/domain/error-excerpt.ts";

describe("extractErrorExcerpt", () => {
  it("extractErrorExcerpt starts at the thrown error line and keeps five lines", () => {
    const stderr = [
      "✨ openapi-typescript 7.13.0",
      "/path/oas-types.js:61",
      "        throw new Error(`Unsupported`);",
      "",
      "Error: Unsupported OpenAPI version: 3.2.0",
      "    at a",
      "    at b",
      "    at c",
      "    at d",
      "    at e",
    ].join("\n");

    expect(extractErrorExcerpt(stderr)).toBe(
      [
        "Error: Unsupported OpenAPI version: 3.2.0",
        "    at a",
        "    at b",
        "    at c",
        "    at d",
      ].join("\n"),
    );
  });

  it("extractErrorExcerpt without a thrown error starts at the generator error line", () => {
    const stderr = "✨ openapi-typescript 7.13.0\n ✘  Can't resolve $ref at #/a\nmore";

    expect(extractErrorExcerpt(stderr)).toBe(" ✘  Can't resolve $ref at #/a\nmore");
  });

  it("extractErrorExcerpt without a known error line keeps the top", () => {
    expect(extractErrorExcerpt("\nsomething odd\n")).toBe("something odd");
  });
});
