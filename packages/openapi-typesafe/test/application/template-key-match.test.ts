import { describe, expect, it } from "vitest";
import {
  isAssignableToTemplate,
  isNumberText,
  type TemplatePlaceholder,
  type TemplateShape,
} from "../../src/application/transform/document/template-key-match.js";

/** TypeScript's assignability of key types to template literal types (upstream #1752). */

/** A shape from texts and placeholders in turn: `shape("/a/", "string", "")`. */
function shape(...parts: string[]): TemplateShape {
  const texts = parts.filter((_, index) => index % 2 === 0);
  const types = parts.filter((_, index) => index % 2 === 1) as TemplatePlaceholder[];
  return { texts, types };
}

const literal = (text: string): TemplateShape => ({ texts: [text], types: [] });

describe("isAssignableToTemplate", () => {
  it("isAssignableToTemplate with the same texts compares placeholder by placeholder", () => {
    const numbered = shape("/a/", "number", "/b");
    const any = shape("/a/", "string", "/b");

    expect(isAssignableToTemplate(numbered, any)).toBe(true);
    expect(isAssignableToTemplate(any, numbered)).toBe(false);
  });

  it("isAssignableToTemplate of a literal checks a number placeholder with the number rule", () => {
    const line = shape("/l/", "number", "");

    expect(isAssignableToTemplate(literal("/l/1.5"), line)).toBe(true);
    expect(isAssignableToTemplate(literal("/l/x"), line)).toBe(false);
  });

  it("isAssignableToTemplate matches a placeholder of the source to a number placeholder", () => {
    const target = shape("/", "string", "/", "number", "");

    expect(isAssignableToTemplate(shape("/a/", "number", ""), target)).toBe(true);
    expect(isAssignableToTemplate(shape("/a/x", "number", ""), target)).toBe(false);
    expect(isAssignableToTemplate(shape("/a/", "string", ""), target)).toBe(false);
  });

  it("isAssignableToTemplate fails when a text of the target is missing", () => {
    expect(isAssignableToTemplate(literal("/a"), shape("/", "string", "/", "string", ""))).toBe(
      false,
    );
  });

  it("isAssignableToTemplate gives adjacent placeholders one character, or the next text", () => {
    const adjacent = shape("/", "string", "", "string", "");

    expect(isAssignableToTemplate(literal("/ab"), adjacent)).toBe(true);
    expect(isAssignableToTemplate(shape("/", "string", ""), adjacent)).toBe(true);
    expect(isAssignableToTemplate(literal("/"), adjacent)).toBe(false);
  });

  it("isAssignableToTemplate fails a key without the target's first or last text", () => {
    const target = shape("/a/", "string", "/b");

    expect(isAssignableToTemplate(literal("/a"), target)).toBe(false);
    expect(isAssignableToTemplate(literal("/c/x/b"), target)).toBe(false);
    expect(isAssignableToTemplate(literal("/a/x/c"), target)).toBe(false);
  });

  it("isAssignableToTemplate reads a target text that starts in a later text of the source", () => {
    const target = shape("/", "string", "/end", "");

    expect(isAssignableToTemplate(shape("/a", "number", "/end"), target)).toBe(true);
  });
});

describe("isNumberText", () => {
  it("isNumberText accepts finite numbers and rejects an empty or other text", () => {
    expect(isNumberText("-1.5e3")).toBe(true);
    expect(isNumberText("")).toBe(false);
    expect(isNumberText("Infinity")).toBe(false);
  });
});
