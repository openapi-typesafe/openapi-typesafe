import { describe, expect, it } from "vitest";
import {
  type CoverRejection,
  coveringTemplateKeys,
  type PathKey,
  type PathKeyPart,
  type PathPlaceholder,
} from "../../src/application/transform/document/path-key-overlaps.js";

/** Which `--path-params-as-types` signatures cover another key (roadmap R10.2). */

const text = (value: string): PathKeyPart => ({ kind: "text", text: value });
const slot = (type: PathPlaceholder): PathKeyPart => ({ kind: "placeholder", type });
const literal = (url: string): PathKey => ({ kind: "literal", url });
const template = (...parts: PathKeyPart[]): PathKey => ({ kind: "template", parts });

describe("coveringTemplateKeys", () => {
  it("coveringTemplateKeys with a string placeholder covers a literal key under it", () => {
    expect(
      coveringTemplateKeys([template(text("/apps/"), slot("string")), literal("/apps/regions")]),
    ).toEqual(new Set([0]));
  });

  it("coveringTemplateKeys with a string placeholder covers a longer template, slashes included", () => {
    const longer = template(text("/apps/"), slot("string"), text("/restart"));

    expect(coveringTemplateKeys([longer, template(text("/apps/"), slot("string"))])).toEqual(
      new Set([1]),
    );
  });

  it("coveringTemplateKeys with two identical templates covers both, whatever the checks", () => {
    const keys = [
      template(text("/apps/"), slot("string")),
      template(text("/apps/"), slot("string")),
    ];
    const NONE: CoverRejection = () => false;

    expect(coveringTemplateKeys(keys, NONE)).toEqual(new Set([0, 1]));
  });

  it("coveringTemplateKeys with keys that do not overlap covers nothing", () => {
    const keys = [
      template(text("/apps/"), slot("string"), text("/restart")),
      literal("/apps/regions"),
    ];

    expect(coveringTemplateKeys(keys)).toEqual(new Set());
  });

  it("coveringTemplateKeys with a number placeholder covers a number and not a word", () => {
    const lines = template(text("/lines/"), slot("number"));

    expect(coveringTemplateKeys([lines, literal("/lines/1.5")])).toEqual(new Set([0]));
    expect(coveringTemplateKeys([lines, literal("/lines/last")])).toEqual(new Set());
    expect(coveringTemplateKeys([lines, literal("/lines/")])).toEqual(new Set());
  });

  it("coveringTemplateKeys with a boolean placeholder covers true and false only", () => {
    const flags = template(text("/flags/"), slot("boolean"), text("/"), slot("string"));

    expect(coveringTemplateKeys([flags, literal("/flags/false/a")])).toEqual(new Set([0]));
    expect(coveringTemplateKeys([flags, literal("/flags/yes/a")])).toEqual(new Set());
  });

  it("coveringTemplateKeys with only a boolean placeholder covers nothing, as it is no signature", () => {
    const flags = template(text("/flags/"), slot("boolean"));

    expect(coveringTemplateKeys([flags, literal("/flags/false")])).toEqual(new Set());
  });

  it("coveringTemplateKeys does not check a boolean-only template against a signature", () => {
    const flags = () => template(text("/flags/"), slot("boolean"));
    const any = template(text("/flags/"), slot("string"));

    expect(coveringTemplateKeys([any, flags()])).toEqual(new Set());
    // The checker still reports a repeated one (TS2374), so both move.
    expect(coveringTemplateKeys([flags(), flags()])).toEqual(new Set([0, 1]));
  });

  it("coveringTemplateKeys covers what TypeScript matches, at the first occurrence of a text", () => {
    const versioned = template(text("/v"), slot("number"), text("."), slot("string"));

    expect(coveringTemplateKeys([versioned, literal("/v1.2.x")])).toEqual(new Set([0]));
    // A regular expression matches "-.5" as the number; TypeScript reads "-" and rejects it.
    expect(coveringTemplateKeys([versioned, literal("/v-.5.x")])).toEqual(new Set());
  });

  it("coveringTemplateKeys does not cover a template by a shorter one it only overlaps", () => {
    const download = template(text("/files/"), slot("string"), text("/download"));
    const suffixed = template(text("/files/"), slot("string"), text("/download"), slot("string"));

    expect(coveringTemplateKeys([download, suffixed])).toEqual(new Set([1]));
  });

  it("coveringTemplateKeys does not backtrack where TypeScript does not", () => {
    // The checker matches "/" at its first occurrence, so "b/${number}" is no `${number}`.
    const any = template(text("/"), slot("string"), text("/"), slot("number"));
    const nested = template(text("/a/b/"), slot("number"));

    expect(coveringTemplateKeys([any, nested])).toEqual(new Set());
    expect(coveringTemplateKeys([any, literal("/a/b/1")])).toEqual(new Set());
    expect(coveringTemplateKeys([any, literal("/a/1")])).toEqual(new Set([0]));
  });

  it("coveringTemplateKeys moves a covering template only where the covered key is rejected", () => {
    const keys = [template(text("/apps/"), slot("string")), literal("/apps/regions")];

    expect(coveringTemplateKeys(keys, () => false)).toEqual(new Set());
    expect(
      coveringTemplateKeys(keys, (covering, covered) => covering === 0 && covered === 1),
    ).toEqual(new Set([0]));
  });

  it("coveringTemplateKeys compares templates with the same texts placeholder by placeholder", () => {
    const any = template(text("/a/"), slot("string"), text("/b"));
    const numbered = template(text("/a/"), slot("number"), text("/b"));

    expect(coveringTemplateKeys([any, numbered])).toEqual(new Set([0]));
    expect(
      coveringTemplateKeys([numbered, template(text("/a/"), slot("number"), text("/c"))]),
    ).toEqual(new Set());
  });

  it("coveringTemplateKeys covers a number placeholder by a number placeholder of another template", () => {
    const line = template(text("/l/"), slot("number"));

    expect(coveringTemplateKeys([line, template(text("/l/"), slot("number"), text(""))])).toEqual(
      new Set([0, 1]),
    );
    expect(coveringTemplateKeys([line, template(text("/l/"), slot("string"), text("x"))])).toEqual(
      new Set(),
    );
  });

  it("coveringTemplateKeys reads a number and a boolean placeholder of the other key", () => {
    const any = template(text("/a/"), slot("string"));

    expect(coveringTemplateKeys([any, template(text("/a/"), slot("number"))])).toEqual(
      new Set([0]),
    );
    expect(
      coveringTemplateKeys([
        template(text("/a/"), slot("number")),
        template(text("/a/"), slot("boolean")),
      ]),
    ).toEqual(new Set());
  });

  it("coveringTemplateKeys with two equal number or boolean templates covers both", () => {
    const line = () => template(text("/lines/"), slot("number"));
    const flag = () => template(text("/flags/"), slot("boolean"), text("/"), slot("string"));

    expect(coveringTemplateKeys([line(), line()])).toEqual(new Set([0, 1]));
    expect(coveringTemplateKeys([flag(), flag()])).toEqual(new Set([0, 1]));
  });

  it("coveringTemplateKeys does not cover a literal with text after the template's end", () => {
    const restart = template(text("/apps/"), slot("string"), text("/restart"));

    expect(coveringTemplateKeys([restart, literal("/apps/a/restart/now")])).toEqual(new Set());
  });

  it("coveringTemplateKeys does not compare a key with itself", () => {
    expect(coveringTemplateKeys([template(text("/apps/"), slot("string"))])).toEqual(new Set());
  });
});
