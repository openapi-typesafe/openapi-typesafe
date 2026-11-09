import { describe, expect, expectTypeOf, it } from "vitest";
import createClient, { defaultBodySerializer } from "../../src/index.js";

/**
 * `multipart/form-data` bodies and binary responses (roadmap R1, ADR-013 decision 10). An object
 * body was JSON-encoded under a multipart header, and a hand-set multipart header had no boundary,
 * so the server could not read the parts (upstream #1214).
 */

/** What `--binary-as-blob` generates for an upload and a download. */
type Paths = {
  "/avatars": {
    post: {
      requestBody: {
        content: {
          "multipart/form-data": {
            file: Blob;
            gallery?: Blob[];
            description?: string;
            tags?: string[];
            width?: number;
            isPublic?: boolean;
            note?: string | null;
          };
        };
      };
      responses: { 201: { content: { "application/json": { id: number } } } };
    };
  };
  "/avatars/{id}": {
    get: {
      parameters: { path: { id: number } };
      responses: { 200: { content: { "image/png": Blob } } };
    };
  };
};

const BASE_URL = "https://api.example.com";
const MULTIPART_HEADERS = { "Content-Type": "multipart/form-data" };

function recordingClient(response: () => Response) {
  const requests: Request[] = [];
  const client = createClient<Paths>({
    baseUrl: BASE_URL,
    fetch: async (request) => {
      requests.push(request);
      return response();
    },
  });
  return { client, requests };
}

function onlyRequest(requests: readonly Request[]): Request {
  const [request] = requests;
  if (!request || requests.length !== 1) {
    throw new Error(`expected one request, got ${requests.length}`);
  }
  return request;
}

describe("multipart/form-data bodies", () => {
  it("POST with an object body and a multipart header sends every field as a part", async () => {
    const { client, requests } = recordingClient(() => Response.json({ id: 1 }, { status: 201 }));
    const file = new File(["png bytes"], "avatar.png", { type: "image/png" });

    await client.POST("/avatars", {
      headers: MULTIPART_HEADERS,
      body: {
        file,
        gallery: [file, file],
        description: "Me",
        tags: ["a", "b"],
        width: 3,
        isPublic: false,
        note: null,
      },
    });

    const form = await onlyRequest(requests).formData();
    const sentFile = form.get("file");
    expect(sentFile).toBeInstanceOf(File);
    expect((sentFile as File).name).toBe("avatar.png");
    expect(await (sentFile as File).text()).toBe("png bytes");
    expect(form.getAll("gallery")).toHaveLength(2);
    expect(form.get("description")).toBe("Me");
    expect(form.getAll("tags")).toEqual(["a", "b"]);
    expect(form.get("width")).toBe("3");
    expect(form.get("isPublic")).toBe("false");
    expect(form.has("note")).toBe(false);
  });

  it("POST with a multipart header lets the platform set the boundary", async () => {
    const { client, requests } = recordingClient(() => Response.json({ id: 1 }, { status: 201 }));

    await client.POST("/avatars", {
      headers: { "content-type": "multipart/form-data; charset=utf-8" },
      body: { file: new Blob(["x"]) },
    });

    expect(onlyRequest(requests).headers.get("Content-Type")).toMatch(
      /^multipart\/form-data; boundary=/,
    );
  });

  it("POST with a FormData body and a multipart header without boundary sends a readable body", async () => {
    const { client, requests } = recordingClient(() => Response.json({ id: 1 }, { status: 201 }));
    const form = new FormData();
    form.append("description", "raw");

    await client.POST("/avatars", {
      headers: MULTIPART_HEADERS,
      // A prebuilt FormData is not the schema's object type; a bodySerializer or a cast passes it.
      body: form as unknown as { file: Blob },
    });

    expect((await onlyRequest(requests).formData()).get("description")).toBe("raw");
  });

  it("POST with an object body drops a hand-set boundary, so the parts can be split", async () => {
    const { client, requests } = recordingClient(() => Response.json({ id: 1 }, { status: 201 }));

    await client.POST("/avatars", {
      headers: { "Content-Type": "multipart/form-data; boundary=myboundary" },
      body: { file: new Blob(["x"]), description: "hi" },
    });

    const request = onlyRequest(requests);
    const declared = /boundary=(.+)$/.exec(request.headers.get("Content-Type") ?? "")?.[1];
    expect(declared).not.toBe("myboundary");
    expect((await request.formData()).get("description")).toBe("hi");
  });

  it("POST keeps a hand-set boundary for a FormData body the caller built", async () => {
    const requests: RequestInit[] = [];
    const header = "multipart/form-data; boundary=own";
    const client = createClient<Paths>({
      baseUrl: BASE_URL,
      // Records the init; a fetch of the caller's own may write the parts with the boundary it names.
      Request: class extends Request {
        constructor(input: RequestInfo | URL, init?: RequestInit) {
          super(input, init);
          requests.push(init ?? {});
        }
      },
      fetch: async () => Response.json({ id: 1 }, { status: 201 }),
    });
    const form = new FormData();
    form.append("description", "raw");

    await client.POST("/avatars", {
      headers: { "Content-Type": header },
      body: form as unknown as { file: Blob },
    });

    expect(new Headers(requests[0]?.headers).get("Content-Type")).toBe(header);
  });

  it("POST keeps a multipart header that names its own boundary", async () => {
    const { client, requests } = recordingClient(() => Response.json({ id: 1 }, { status: 201 }));
    const header = "multipart/form-data; boundary=custom";

    await client.POST("/avatars", {
      headers: { "Content-Type": header },
      bodySerializer: () => "--custom--\r\n",
      body: { file: new Blob(["x"]) },
    });

    expect(onlyRequest(requests).headers.get("Content-Type")).toBe(header);
  });

  it.each([
    ["a nested array", { m: [[1, 2], [3]] }],
    ["an array of objects", { tags: [{ id: 1 }] }],
  ])("defaultBodySerializer rejects %s in a multipart body", (_name, body) => {
    expect(() => defaultBodySerializer(body, MULTIPART_HEADERS)).toThrow(
      "Nested form values need your own `bodySerializer()`.",
    );
  });

  it("defaultBodySerializer with a multipart header returns FormData", () => {
    expect(defaultBodySerializer({ a: "1" }, MULTIPART_HEADERS)).toBeInstanceOf(FormData);
  });

  it("defaultBodySerializer sends a Date field as an ISO 8601 text part", () => {
    const at = new Date("2026-11-08T12:30:00.000Z");

    const form = defaultBodySerializer({ at, all: [at] }, MULTIPART_HEADERS) as FormData;

    expect(form.get("at")).toBe("2026-11-08T12:30:00.000Z");
    expect(form.getAll("all")).toEqual(["2026-11-08T12:30:00.000Z"]);
  });

  it("defaultBodySerializer with a null body and a multipart header keeps the JSON encoding", () => {
    expect(defaultBodySerializer(null, MULTIPART_HEADERS)).toBe("null");
  });

  it.each([
    ["a nested object", { meta: { a: 1 } }],
    ["an array of objects", { items: [{ a: 1 }] }],
  ])(
    "defaultBodySerializer with %s in a multipart body throws and names bodySerializer",
    (_name, body) => {
      expect(() => defaultBodySerializer(body, MULTIPART_HEADERS)).toThrow("bodySerializer");
    },
  );
});

describe("binary responses", () => {
  it("GET with parseAs blob returns the bytes as a Blob", async () => {
    const png = new Uint8Array([137, 80, 78, 71]);
    const { client } = recordingClient(
      () => new Response(png, { headers: { "Content-Type": "image/png" } }),
    );

    const { data } = await client.GET("/avatars/{id}", {
      params: { path: { id: 1 } },
      parseAs: "blob",
    });

    expectTypeOf(data).toEqualTypeOf<Blob | undefined>();
    expect(data).toBeInstanceOf(Blob);
    expect([...new Uint8Array(await (data as Blob).arrayBuffer())]).toEqual([...png]);
  });
});
