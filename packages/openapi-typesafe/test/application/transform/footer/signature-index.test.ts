import { describe, expect, it } from "vitest";
import type { TemplateShape } from "../../../../src/application/transform/document/template-key-match.js";
import {
  memberRead,
  type RawKeyTypes,
} from "../../../../src/application/transform/footer/signature-index.js";
import {
  irKeyword,
  irProperty,
  irRaw,
  irString,
  irStringIndexSignature,
} from "../../../../src/domain/ir/constructors.js";
import type { IrMember } from "../../../../src/domain/ir/nodes.js";

/** Which members `T[K]` reads, for the `--enum-values` check (ADR-027). */

const USERS = `\`/users/\${number}\``;
const ORDERS = `\`/orders/\${number}\``;
const ANY_PATH = `\`/\${string}\``;
const KEY_TYPES: RawKeyTypes = new Map([
  [USERS, [{ texts: ["/users/", ""], types: ["number"] }]],
  [ORDERS, [{ texts: ["/orders/", ""], types: ["number"] }]],
  [ANY_PATH, [{ texts: ["/", ""], types: ["string"] }]],
]);

const literal = (text: string): TemplateShape => ({ texts: [text], types: [] });

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

const PATHS = [signature(USERS, "users"), signature(ORDERS, "orders")];
const ORDERS_KEY = KEY_TYPES.get(ORDERS)?.[0] as TemplateShape;

describe("memberRead", () => {
  it("memberRead with a template key reads only the signature whose key type admits it", () => {
    expect(memberRead(PATHS, ORDERS_KEY, KEY_TYPES)).toEqual({
      kind: "types",
      types: [irString("orders", "json")],
    });
  });

  it("memberRead with a literal key reads the signature whose template matches it", () => {
    expect(memberRead(PATHS, literal("/orders/5"), KEY_TYPES)).toEqual({
      kind: "types",
      types: [irString("orders", "json")],
    });
  });

  it("memberRead with a key no signature admits is missing", () => {
    expect(memberRead(PATHS, literal("/orders/{id}"), KEY_TYPES)).toEqual({ kind: "missing" });
  });

  it("memberRead with a key two signatures admit reads both", () => {
    const members = [...PATHS, signature(ANY_PATH, "any")];

    expect(memberRead(members, literal("/orders/5"), KEY_TYPES)).toEqual({
      kind: "types",
      types: [irString("orders", "json"), irString("any", "json")],
    });
  });

  it("memberRead reads a string signature only where no other signature applies", () => {
    const string = irStringIndexSignature("key", irKeyword("unknown"));

    expect(memberRead([...PATHS, string], ORDERS_KEY, KEY_TYPES)).toEqual({
      kind: "types",
      types: [irString("orders", "json")],
    });
    expect(memberRead([...PATHS, string], literal("/other"), KEY_TYPES)).toEqual({
      kind: "types",
      types: [irKeyword("unknown")],
    });
  });

  it("memberRead with a literal key reads the property it names", () => {
    const members = [irProperty({ kind: "string", value: "/orders/5" }, irKeyword("number"))];

    expect(memberRead([...members, ...PATHS], literal("/orders/5"), KEY_TYPES)).toEqual({
      kind: "types",
      types: [irKeyword("number")],
    });
  });

  it("memberRead next to a signature of unknown key type is opaque", () => {
    const members = [signature(`\`/\${Lowercase<string>}\``, "other"), ...PATHS];

    expect(memberRead(members, ORDERS_KEY, KEY_TYPES)).toEqual({ kind: "opaque" });
  });

  it("memberRead with a key every object has is opaque, another missing key is missing", () => {
    expect(memberRead([], literal("toString"), KEY_TYPES)).toEqual({ kind: "opaque" });
    expect(memberRead([], literal("status"), KEY_TYPES)).toEqual({ kind: "missing" });
  });
});
