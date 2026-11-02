import { describe, expect, it } from "vitest";
import { lazyNode } from "../../../src/adapters/type-ast-bridge/lazy-node.js";

class Token {
  kind = 1;
}

describe("lazyNode", () => {
  it("creates the node once, on first use", () => {
    let created = 0;
    const node = lazyNode(() => {
      created += 1;
      return new Token();
    });

    expect(created).toBe(0);
    expect(node.kind).toBe(1);
    expect(node.kind).toBe(1);
    expect(created).toBe(1);
  });

  it("forwards writes, key checks, descriptors and the prototype to the node", () => {
    const node = lazyNode(() => new Token());

    node.kind = 2;

    expect(node.kind).toBe(2);
    expect("kind" in node).toBe(true);
    expect(Object.getOwnPropertyDescriptor(node, "kind")?.value).toBe(2);
    expect(Object.getOwnPropertyDescriptor(node, "missing")).toBeUndefined();
    expect(node instanceof Token).toBe(true);
  });
});
