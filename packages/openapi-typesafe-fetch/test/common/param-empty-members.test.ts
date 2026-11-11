import { describe, expect, it } from "vitest";
import createClient, {
  createQuerySerializer,
  defaultPathSerializer,
  serializeArrayParam,
  serializeObjectParam,
} from "../../src/index.js";

/**
 * `null` and `undefined` items and members of arrays and objects are left out in every style.
 * Non-exploded styles sent them as the text `undefined` or `null`, and headers as empty values.
 */

type Paths = {
  "/items": {
    get: {
      parameters: {
        query?: { id?: number[] };
        header?: { "X-Filter"?: Record<string, unknown>; "X-List"?: unknown[] };
      };
      responses: { 200: { content: { "application/json": string } } };
    };
  };
};

async function sentHeader(header: NonNullable<Paths["/items"]["get"]["parameters"]["header"]>) {
  const requests: Request[] = [];
  const client = createClient<Paths>({
    baseUrl: "https://api.example.com",
    fetch: async (request) => {
      requests.push(request);
      return Response.json("ok");
    },
  });
  await client.GET("/items", { params: { header } });
  return requests[0]?.headers ?? new Headers();
}

describe("null and undefined members", () => {
  it("an unexploded query array or object leaves them out", () => {
    const serialize = createQuerySerializer({
      array: { style: "form", explode: false },
      object: { style: "form", explode: false },
    });

    expect(serialize({ ids: [1, null, 2, undefined] })).toBe("ids=1,2");
    expect(serialize({ filter: { status: "open", owner: undefined, team: null } })).toBe(
      "filter=status,open",
    );
  });

  it("an unexploded array or object of only empty members gives an empty string", () => {
    const options = { style: "form", explode: false } as const;

    expect(serializeArrayParam("ids", [null, undefined], options)).toBe("");
    expect(serializeObjectParam("filter", { owner: undefined }, options)).toBe("");
    expect(createQuerySerializer({ array: options })({ ids: [null], b: 1 })).toBe("b=1");
  });

  it("a path array or object leaves them out in every path style", () => {
    const path = defaultPathSerializer("/a/{list}/b/{list*}/c/{.list*}/d/{object}", {
      list: [1, null, 2],
      object: { status: "open", owner: undefined },
    });

    expect(path).toBe("/a/1,2/b/1,2/c/.1.2/d/status,open");
  });

  it("a header array or object leaves them out", async () => {
    const headers = await sentHeader({ "X-Filter": { a: undefined, b: 1 }, "X-List": ["x", null] });

    expect(headers.get("X-Filter")).toBe("b,1");
    expect(headers.get("X-List")).toBe("x");
  });

  it("a header of only empty members is not sent", async () => {
    const headers = await sentHeader({ "X-Filter": { a: undefined }, "X-List": [null] });

    expect(headers.has("X-Filter")).toBe(false);
    expect(headers.has("X-List")).toBe(false);
  });
});

describe("query explode defaults", () => {
  it("a space-delimited array without explode joins the items", () => {
    const space = createQuerySerializer({ array: { style: "spaceDelimited" } });

    expect(space({ id: [3, 4, 5] })).toBe("id=3%204%205");
  });

  it("a client delimited style without explode joins the items", async () => {
    const urls: string[] = [];
    const client = createClient<Paths>({
      baseUrl: "https://api.example.com",
      querySerializer: { array: { style: "pipeDelimited" } },
      fetch: async (request) => {
        urls.push(request.url);
        return Response.json("ok");
      },
    });
    await client.GET("/items", { params: { query: { id: [3, 4] } } });

    expect(new URL(urls[0] as string).search).toBe("?id=3|4");
  });

  it("form arrays and objects stay exploded without explode", () => {
    const serialize = createQuerySerializer({ array: {}, object: { style: "form" } });

    expect(serialize({ id: [3, 4], range: { from: 1, to: 2 } })).toBe("id=3&id=4&from=1&to=2");
  });

  it("an explicit explode wins over the style default", () => {
    const serialize = createQuerySerializer({ array: { style: "pipeDelimited", explode: true } });

    expect(serialize({ id: [3, 4] })).toBe("id=3&id=4");
  });
});
