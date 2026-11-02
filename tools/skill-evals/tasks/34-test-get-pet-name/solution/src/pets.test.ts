import createClient from "openapi-typesafe-fetch";
import { describe, expect, it } from "vitest";
import type { paths } from "./api/schema";
import { getPetName } from "./pets";

function clientAnswering(response: () => Response) {
  return createClient<paths>({ baseUrl: "https://api.test/v1", fetch: async () => response() });
}

describe("getPetName", () => {
  it("returns the name of a found pet", async () => {
    const client = clientAnswering(() =>
      Response.json({ id: 1, name: "Rex", status: "available", ownerId: null }),
    );

    expect(await getPetName(client, 1)).toBe("Rex");
  });

  it("throws on 404", async () => {
    const client = clientAnswering(() =>
      Response.json({ code: "not_found", message: "No pet" }, { status: 404 }),
    );

    await expect(getPetName(client, 9)).rejects.toThrow(Error);
  });

  it("throws on a 500 without a body", async () => {
    const client = clientAnswering(() => new Response(null, { status: 500 }));

    await expect(getPetName(client, 1)).rejects.toThrow(Error);
  });
});
