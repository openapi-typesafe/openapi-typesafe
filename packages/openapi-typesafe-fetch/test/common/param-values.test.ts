import { describe, expect, it } from "vitest";
import createClient, {
  createQuerySerializer,
  defaultPathSerializer,
  type QuerySerializerOptions,
  serializeArrayParam,
  serializeObjectParam,
} from "../../src/index.js";

/** Dates and empty values in parameters (ADR-041). */

const BASE_URL = "https://api.example.com";
const EPOCH = new Date(0);
const EPOCH_ISO = "1970-01-01T00:00:00.000Z";
const EPOCH_ENCODED = encodeURIComponent(EPOCH_ISO);
const LATER = new Date(Date.UTC(2026, 10, 8, 12, 30));
const LATER_ENCODED = encodeURIComponent("2026-11-08T12:30:00.000Z");

type Paths = {
  "/items": {
    get: {
      parameters: { query?: Record<string, unknown> };
      responses: { 200: { content: { "application/json": object } } };
    };
  };
};

/** The search part of the URL a client sends for `query`. */
async function sentSearch(query: Record<string, unknown>, options?: QuerySerializerOptions) {
  const urls: string[] = [];
  const client = createClient<Paths>({
    baseUrl: BASE_URL,
    querySerializer: options,
    fetch: async (request: Request) => {
      urls.push(request.url);
      return Response.json({});
    },
  });
  await client.GET("/items", { params: { query } });
  return new URL(urls[0] as string).search;
}

describe("Date parameters", () => {
  it("a query Date is sent as ISO 8601", async () => {
    expect(await sentSearch({ since: EPOCH })).toBe(`?since=${EPOCH_ENCODED}`);
  });

  it("a query Date with allowReserved is sent as ISO 8601", async () => {
    expect(await sentSearch({ since: EPOCH }, { allowReserved: true })).toBe(`?since=${EPOCH_ISO}`);
  });

  it("an array of dates is sent as ISO 8601 in every array style", () => {
    const dates = [EPOCH, LATER];
    const exploded = createQuerySerializer();
    const joined = createQuerySerializer({ array: { style: "pipeDelimited", explode: false } });

    expect(exploded({ at: dates })).toBe(`at=${EPOCH_ENCODED}&at=${LATER_ENCODED}`);
    expect(joined({ at: dates })).toBe(`at=${EPOCH_ENCODED}|${LATER_ENCODED}`);
  });

  it("a Date in an object is sent as ISO 8601 in every object style", () => {
    const deep = createQuerySerializer();
    const form = createQuerySerializer({ object: { style: "form", explode: false } });

    expect(deep({ range: { from: EPOCH } })).toBe(`range[from]=${EPOCH_ENCODED}`);
    expect(form({ range: { from: EPOCH } })).toBe(`range=from,${EPOCH_ENCODED}`);
  });

  it("a Date in a path is sent as ISO 8601 in every path style", () => {
    const path = defaultPathSerializer("/a/{at}/b/{.at}/c/{;at}/d/{list}", {
      at: EPOCH,
      list: [EPOCH],
    });

    expect(path).toBe(
      `/a/${EPOCH_ENCODED}/b/.${EPOCH_ENCODED}/c/;at=${EPOCH_ENCODED}/d/${EPOCH_ENCODED}`,
    );
  });

  it("a Date from another realm is sent as ISO 8601", () => {
    const foreignDate = { toISOString: () => EPOCH_ISO };

    expect(createQuerySerializer()({ since: foreignDate })).toBe(`since=${EPOCH_ENCODED}`);
  });

  it("an invalid Date throws instead of sending Invalid Date", () => {
    expect(() => createQuerySerializer()({ since: new Date(Number.NaN) })).toThrow(RangeError);
  });
});

describe("empty query values", () => {
  it("an empty array or object between parameters adds no separator", async () => {
    const search = await sentSearch({ a: 1, list: [], range: {}, b: 2 });

    expect(search).toBe("?a=1&b=2");
  });

  it("only empty values send no query string", async () => {
    expect(await sentSearch({ list: [], range: {}, none: null })).toBe("");
  });

  it("null members of an exploded array or object add no separator", () => {
    const serialize = createQuerySerializer();

    expect(serialize({ a: [null, 1, undefined, 2], b: 3 })).toBe("a=1&a=2&b=3");
    expect(serialize({ o: { x: null, y: 1 }, b: 3 })).toBe("o[y]=1&b=3");
    expect(serialize({ a: [null], o: { x: undefined }, b: 3 })).toBe("b=3");
  });

  it("empty arrays and objects give an empty string in every style", () => {
    const styles = ["form", "simple", "label", "matrix", "spaceDelimited", "pipeDelimited"];
    for (const style of styles) {
      for (const explode of [true, false]) {
        const options = { style, explode } as never;
        expect(serializeArrayParam("a", [], options)).toBe("");
        expect(serializeObjectParam("a", {}, options)).toBe("");
      }
    }
    expect(serializeObjectParam("a", {}, { style: "deepObject", explode: true })).toBe("");
  });

  it("an empty array in an unexploded query style adds no separator", () => {
    const serialize = createQuerySerializer({ array: { style: "form", explode: false } });

    expect(serialize({ a: 1, list: [], b: 2 })).toBe("a=1&b=2");
  });

  it("empty strings and zero are values, not empty parameters", () => {
    expect(createQuerySerializer()({ a: "", b: 0, c: false })).toBe("a=&b=0&c=false");
  });

  it("label and matrix arrays keep their leading separator", () => {
    expect(serializeArrayParam("a", [1, 2], { style: "label", explode: true })).toBe(".1.2");
    expect(serializeArrayParam("a", [1, 2], { style: "matrix", explode: true })).toBe(";a=1;a=2");
    expect(serializeObjectParam("a", { x: 1 }, { style: "matrix", explode: true })).toBe(";x=1");
  });
});
