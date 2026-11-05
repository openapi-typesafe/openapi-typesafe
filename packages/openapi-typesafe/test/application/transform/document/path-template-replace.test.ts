import { describe, expect, it } from "vitest";
import type {
  PathKeyPart,
  PathPlaceholder,
} from "../../../../src/application/transform/document/path-key-overlaps.js";
import { replacedTemplateParts } from "../../../../src/application/transform/document/path-template-replace.js";

/** The `--path-params-as-types` key as the original replaces each `{name}` (ADR-021). */

const text = (value: string): PathKeyPart => ({ kind: "text", text: value });
const slot = (type: PathPlaceholder): PathKeyPart => ({ kind: "placeholder", type });

describe("replacedTemplateParts", () => {
  it("replacedTemplateParts gives each match its placeholder when no name is a type", () => {
    const matches = [
      { match: "{id}", type: "number" as const },
      { match: "{key}", type: "string" as const },
    ];

    expect(replacedTemplateParts("/a/{id}/{key}", matches)).toEqual([
      text("/a/"),
      slot("number"),
      text("/"),
      slot("string"),
      text(""),
    ]);
  });

  it("replacedTemplateParts replaces a name like a type inside the placeholder before it", () => {
    const matches = [
      { match: "{id}", type: "number" as const },
      { match: "{number}", type: "number" as const },
    ];

    expect(replacedTemplateParts("/i/{id}/l/{number}", matches)).toEqual([
      text("/i/$"),
      slot("number"),
      text("/l/{number}"),
    ]);
  });

  it("replacedTemplateParts replaces a repeated name at each of its places", () => {
    const matches = [
      { match: "{id}", type: "string" as const },
      { match: "{id}", type: "string" as const },
    ];

    expect(replacedTemplateParts("/{id}/{id}", matches)).toEqual([
      text("/"),
      slot("string"),
      text("/"),
      slot("string"),
      text(""),
    ]);
  });

  it("replacedTemplateParts hits a placeholder of another type only by its own name", () => {
    const matches = [
      { match: "{flag}", type: "boolean" as const },
      { match: "{boolean}", type: "string" as const },
    ];

    expect(replacedTemplateParts("/{flag}/{boolean}", matches)).toEqual([
      text("/$"),
      slot("string"),
      text("/{boolean}"),
    ]);
  });
});
