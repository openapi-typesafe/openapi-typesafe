import type { components } from "../../../../packages/openapi-typesafe/examples/array-length-tuples.js";

/** The `array-length-tuples` fix (ADR-021): `--array-length` tuples; checked, never run. */

type Tags = components["schemas"]["Tags"];
type Matrix = components["schemas"]["Matrix"];
type Rows = components["schemas"]["Rows"];

/** The first tag always exists: `minItems: 1`. */
export function firstTag(tags: Tags): string {
  return tags[0].toUpperCase();
}

export const threeTags: Tags = ["a", "b", "c"];

export const identity: Matrix = [
  [1, 0],
  [0, 1],
];

export const rows: Rows = [["a", "b"]];

// @ts-expect-error `minItems: 1` rejects an empty array.
export const noTags: Tags = [];

// @ts-expect-error `maxItems: 3` rejects a fourth tag.
export const fourTags: Tags = ["a", "b", "c", "d"];

// @ts-expect-error a row is a string array, not one more level of arrays.
export const nestedRows: Rows = [[["a"]]];
