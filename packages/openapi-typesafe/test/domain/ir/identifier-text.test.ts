import ts from "typescript";
import { describe, expect, it } from "vitest";
import { hasIdentifierStart, withIdentifierParts } from "../../../src/domain/ir/identifier-text.js";

/**
 * A name the generator writes as an identifier must parse with TypeScript, whose identifier tables
 * follow an older Unicode version than recent Node.js releases (`ꟓ` upper-cases to `꟒`, which
 * Node.js 26 accepts and TypeScript 5.9 rejects as "Invalid character").
 */

const MAX_CODE_POINT = 0x10ffff;
const SURROGATES = { first: 0xd800, last: 0xdfff };

function codePoints(): number[] {
  const points: number[] = [];
  for (let point = 0; point <= MAX_CODE_POINT; point++) {
    if (point < SURROGATES.first || point > SURROGATES.last) {
      points.push(point);
    }
  }
  return points;
}

describe("identifier text", () => {
  const points = codePoints();

  it("hasIdentifierStart accepts exactly the characters TypeScript accepts", () => {
    const differences = points.filter(
      (point) =>
        hasIdentifierStart(String.fromCodePoint(point)) !==
        ts.isIdentifierStart(point, ts.ScriptTarget.ESNext),
    );

    expect(differences.map((point) => point.toString(16))).toEqual([]);
  });

  it("withIdentifierParts keeps exactly the characters TypeScript accepts", () => {
    const differences = points.filter((point) => {
      const text = String.fromCodePoint(point);
      return (
        (withIdentifierParts(text) === text) !== ts.isIdentifierPart(point, ts.ScriptTarget.ESNext)
      );
    });

    expect(differences.map((point) => point.toString(16))).toEqual([]);
  });

  it("withIdentifierParts replaces a letter newer than TypeScript's tables", () => {
    expect(withIdentifierParts("\u{A7D2}Name")).toBe("_Name");
  });
});
