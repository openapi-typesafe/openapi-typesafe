import { describe, expect, it } from "vitest";
import type { RawKeyTypes } from "../../../../src/application/transform/footer/signature-index.js";
import { TypeEvaluator } from "../../../../src/application/transform/footer/type-evaluation.js";
import {
  irIndexedAccess,
  irProperty,
  irRaw,
  irReference,
  irString,
} from "../../../../src/domain/ir/constructors.js";
import type { IrDeclaration, IrMember } from "../../../../src/domain/ir/nodes.js";

/** The evaluator of the `--enum-values` check indexing `paths` by templates and literals. */

const USERS = `\`/users/\${number}\``;
const ORDERS = `\`/orders/\${number}\``;
const FLAGS = '"/flags/true" | "/flags/false"';
const ANY_PATH = `\`/\${string}\``;
const BUILT_IN_OR_MISSING = '"toString" | "nope"';
const KEY_TYPES: RawKeyTypes = new Map([
  [USERS, [{ texts: ["/users/", ""], types: ["number"] }]],
  [ORDERS, [{ texts: ["/orders/", ""], types: ["number"] }]],
  [ANY_PATH, [{ texts: ["/", ""], types: ["string"] }]],
  [
    BUILT_IN_OR_MISSING,
    [
      { texts: ["toString"], types: [] },
      { texts: ["nope"], types: [] },
    ],
  ],
  [
    FLAGS,
    [
      { texts: ["/flags/true"], types: [] },
      { texts: ["/flags/false"], types: [] },
    ],
  ],
]);

function signature(keyType: string, value: string): IrMember {
  return {
    kind: "indexSignature",
    parameterName: "path",
    parameterType: irRaw(keyType),
    type: irString(value, "json"),
    isReadonly: false,
    comments: [],
  };
}

const PATHS: IrDeclaration = {
  kind: "interface",
  name: "paths",
  isExported: true,
  members: [
    signature(USERS, "users"),
    signature(ORDERS, "orders"),
    irProperty({ kind: "string", value: "/flags/true" }, irString("on", "json")),
    irProperty({ kind: "string", value: "/flags/false" }, irString("off", "json")),
  ],
  comments: [],
};

const OVERLAPPING: IrDeclaration = {
  kind: "interface",
  name: "overlapping",
  isExported: true,
  members: [signature(ORDERS, "orders"), signature(ANY_PATH, "any")],
  comments: [],
};

const evaluator = new TypeEvaluator([PATHS, OVERLAPPING], KEY_TYPES);
const pathsAt = (index: Parameters<typeof irIndexedAccess>[1]) =>
  evaluator.evaluate(irIndexedAccess(irReference("paths"), index));

describe("TypeEvaluator with templated paths", () => {
  it("TypeEvaluator indexes paths by a template, reading only its own signature", () => {
    expect(pathsAt(irRaw(ORDERS))).toMatchObject({
      kind: "type",
      type: irString("orders", "json"),
    });
  });

  it("TypeEvaluator indexes paths by a URL its template matches", () => {
    expect(pathsAt(irString("/orders/7", "json"))).toMatchObject({
      type: irString("orders", "json"),
    });
  });

  it("TypeEvaluator indexes paths by a union of keys as the union of their members", () => {
    expect(pathsAt(irRaw(FLAGS))).toMatchObject({
      type: { kind: "union", types: [irString("on", "json"), irString("off", "json")] },
    });
  });

  it("TypeEvaluator reads a URL no template matches as missing, an unknown raw key as opaque", () => {
    expect(pathsAt(irString("/orders/{id}", "json"))).toEqual({ kind: "missing" });
    expect(pathsAt(irRaw(`\`/other/\${number}\``))).toEqual({ kind: "opaque" });
  });

  it("TypeEvaluator reads a union index with a missing key as missing", () => {
    expect(pathsAt(irRaw(BUILT_IN_OR_MISSING))).toEqual({ kind: "missing" });
  });

  it("TypeEvaluator reads a key that two signatures admit as their intersection", () => {
    const both = irIndexedAccess(irReference("overlapping"), irString("/orders/7", "json"));

    expect(evaluator.evaluate(both)).toMatchObject({
      type: { kind: "intersection", types: [irString("orders", "json"), irString("any", "json")] },
    });
  });
});
