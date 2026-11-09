import { describe, expect, it } from "vitest";
import { operationKeysWritten } from "../../../../src/application/transform/document/operation-keys-written.js";

describe("operationKeysWritten", () => {
  it("operationKeysWritten reads every operationId of the document, # replaced", () => {
    const cyclic: Record<string, unknown> = { operationId: "callback#on" };
    cyclic.self = cyclic;
    const document = {
      paths: { "/a": { get: { operationId: "listItems" } } },
      webhooks: { hook: { post: { operationId: "onHook" } } },
      components: { pathItems: { item: { put: { operationId: 1, callbacks: { c: cyclic } } } } },
    };

    expect([...operationKeysWritten(document)].sort()).toEqual([
      "callback/on",
      "listItems",
      "onHook",
    ]);
  });
});
