import { describe, expect, it } from "vitest";
import { toOpenApiLine } from "../../src/domain/openapi-version.ts";

describe("toOpenApiLine", () => {
  it.each([
    ["3.0.3", "3.0"],
    ["3.1.0", "3.1"],
    ["3.2", "3.2"],
    [" 3.1.1 ", "3.1"],
  ])("toOpenApiLine with %j returns %j", (version, line) => {
    expect(toOpenApiLine(version)).toBe(line);
  });

  it.each(["2.0", "4.0.0", "latest", ""])(
    "toOpenApiLine with unsupported %j returns undefined",
    (version) => {
      expect(toOpenApiLine(version)).toBeUndefined();
    },
  );
});
