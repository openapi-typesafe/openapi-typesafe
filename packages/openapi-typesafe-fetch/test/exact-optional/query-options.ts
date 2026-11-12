import createClient, { createQuerySerializer } from "../../src/index.js";

/**
 * Checked with `exactOptionalPropertyTypes` by `exact-optional.test.ts`: a wrapper passes its own
 * optional options on, which are `undefined` when left out; the client counts them as left out.
 */

type Paths = {
  "/items": {
    get: {
      parameters: { query?: { tags?: string[] } };
      responses: { 200: { headers: {}; content: { "application/json": string[] } } };
    };
  };
};

export type ListOptions = {
  style?: "form" | "spaceDelimited" | "pipeDelimited";
  objectStyle?: "form" | "deepObject";
  explode?: boolean;
  allowReserved?: boolean;
};

const client = createClient<Paths>({ querySerializer: { array: { style: "pipeDelimited" } } });

export function listItems(options: ListOptions) {
  return client.GET("/items", {
    querySerializer: {
      array: { style: options.style, explode: options.explode },
      object: { style: options.objectStyle, explode: options.explode },
      allowReserved: options.allowReserved,
    },
  });
}

export function serializeWith(options: ListOptions) {
  return createQuerySerializer({
    array: undefined,
    object: undefined,
    allowReserved: options.allowReserved,
  });
}
