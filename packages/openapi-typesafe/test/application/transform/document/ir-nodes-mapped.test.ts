import { describe, expect, it } from "vitest";
import { mappedIrNodes } from "../../../../src/application/transform/document/ir-nodes-mapped.js";
import { irReference, irUnion } from "../../../../src/domain/ir/constructors.js";

const renameA = (node: Readonly<Record<string, unknown>>) =>
  node.kind === "reference" && node.name === "A" ? irReference("B") : node;

describe("mappedIrNodes", () => {
  it("mappedIrNodes maps the nodes inside a node", () => {
    const union = irUnion([irReference("A"), irReference("C")]);

    expect(mappedIrNodes(union, renameA)).toEqual(irUnion([irReference("B"), irReference("C")]));
  });

  it("mappedIrNodes keeps a node it changes nothing in", () => {
    const union = irUnion([irReference("C")]);

    expect(mappedIrNodes([union], renameA)).toEqual([union]);
    expect((mappedIrNodes([union], renameA) as unknown[])[0]).toBe(union);
  });

  it("mappedIrNodes keeps a list it changes nothing in", () => {
    const list = [irReference("C")];

    expect(mappedIrNodes(list, renameA)).toBe(list);
  });

  it("mappedIrNodes leaves the origin of a raw type unread", () => {
    const origin = { kind: "reference", name: "A" };
    const raw = { kind: "raw", text: "A", origin };

    expect((mappedIrNodes(raw, renameA) as { origin: unknown }).origin).toBe(origin);
  });
});
