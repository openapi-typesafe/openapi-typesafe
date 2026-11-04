import { describe, expect, it } from "vitest";
import {
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
    const flags = template(text("/flags/"), slot("boolean"));

    expect(coveringTemplateKeys([flags, literal("/flags/false")])).toEqual(new Set([0]));
    expect(coveringTemplateKeys([flags, literal("/flags/yes")])).toEqual(new Set());
  });

  it("coveringTemplateKeys samples a number and a boolean placeholder of the other key", () => {
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
    const flag = () => template(text("/flags/"), slot("boolean"));

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
