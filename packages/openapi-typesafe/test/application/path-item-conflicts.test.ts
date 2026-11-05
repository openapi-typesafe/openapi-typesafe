import { describe, expect, it } from "vitest";
import { declaredTypeLookup } from "../../src/application/transform/document/declared-types.js";
import { isCoveredPathItemRejected } from "../../src/application/transform/document/path-item-conflicts.js";
import {
  irIndexedAccess,
  irKeyword,
  irObject,
  irProperty,
  irRaw,
  irReference,
  irString,
} from "../../src/domain/ir/constructors.js";
import type { IrDeclaration, IrMember, IrType } from "../../src/domain/ir/nodes.js";
import { toPropertyName } from "../../src/domain/ir/property-name.js";

/** Which covered path item types the checker surely rejects for a signature (roadmap R10.2). */

const operationRef = (name: string): IrType =>
  irIndexedAccess(irReference("operations"), irString(name, "escaped"));
const OPERATION = operationRef("app");
const EMPTY = irKeyword("never");

const object = (...members: IrMember[]): IrType => irObject(members);
const required = (name: string, type: IrType = OPERATION) => irProperty(toPropertyName(name), type);
const optional = (name: string, type: IrType = OPERATION) =>
  irProperty(toPropertyName(name), type, { isOptional: true });
const empty = (name: string) => optional(name, EMPTY);

describe("isCoveredPathItemRejected", () => {
  it("isCoveredPathItemRejected with the same slots rejects nothing", () => {
    const item = object(required("get"), empty("put"));

    expect(isCoveredPathItemRejected(item, item)).toBe(false);
  });

  it("isCoveredPathItemRejected with a required slot the covered type leaves empty rejects it", () => {
    expect(isCoveredPathItemRejected(object(empty("get")), object(required("get")))).toBe(true);
  });

  it("isCoveredPathItemRejected with a required slot the covered type makes optional rejects it", () => {
    expect(isCoveredPathItemRejected(object(optional("get")), object(required("get")))).toBe(true);
  });

  it("isCoveredPathItemRejected with a required slot the covered type does not have rejects it", () => {
    expect(isCoveredPathItemRejected(object(), object(required("query")))).toBe(true);
  });

  it("isCoveredPathItemRejected with an empty slot the covered type fills rejects it", () => {
    expect(isCoveredPathItemRejected(object(required("post")), object(empty("post")))).toBe(true);
    expect(isCoveredPathItemRejected(object(optional("post")), object(empty("post")))).toBe(true);
  });

  it("isCoveredPathItemRejected with an empty or missing covered slot for an optional one rejects nothing", () => {
    expect(isCoveredPathItemRejected(object(empty("query")), object(optional("query")))).toBe(
      false,
    );
    expect(isCoveredPathItemRejected(object(), object(optional("query")))).toBe(false);
    expect(isCoveredPathItemRejected(object(), object(empty("query")))).toBe(false);
  });

  it("isCoveredPathItemRejected with an extra covered property rejects nothing", () => {
    expect(
      isCoveredPathItemRejected(object(required("get"), required("sub")), object(required("get"))),
    ).toBe(false);
  });

  it("isCoveredPathItemRejected compares nested objects", () => {
    const covering = object(required("get", object(required("path", object(required("id"))))));
    const covered = object(required("get", object(empty("path"))));

    expect(isCoveredPathItemRejected(covered, covering)).toBe(true);
  });

  it("isCoveredPathItemRejected compares an optional nested object too", () => {
    const covering = object(optional("query", object(required("page"))));
    const covered = object(optional("query", object(optional("page"))));

    expect(isCoveredPathItemRejected(covered, covering)).toBe(true);
  });

  it("isCoveredPathItemRejected with a type that is not an object decides nothing", () => {
    expect(isCoveredPathItemRejected(OPERATION, object(required("get")))).toBe(false);
    expect(isCoveredPathItemRejected(object(), OPERATION)).toBe(false);
  });

  it("isCoveredPathItemRejected with a required never, assignable to anything, decides nothing", () => {
    const covered = object(required("get", EMPTY));

    expect(isCoveredPathItemRejected(covered, object(required("get")))).toBe(false);
    expect(isCoveredPathItemRejected(object(required("get")), covered)).toBe(false);
  });

  it("isCoveredPathItemRejected with a value that may be undefined for an empty slot decides nothing", () => {
    const covering = object(empty("post"));

    expect(isCoveredPathItemRejected(object(required("post", irRaw("any"))), covering)).toBe(false);
    expect(
      isCoveredPathItemRejected(object(optional("post", irKeyword("undefined"))), covering),
    ).toBe(false);
  });

  it("isCoveredPathItemRejected reads quoted and numeric property names", () => {
    const covering = object(required("x-y"), required("200"));

    expect(isCoveredPathItemRejected(object(required("x-y")), covering)).toBe(true);
    expect(isCoveredPathItemRejected(object(required("x-z"), required("200")), covering)).toBe(
      true,
    );
    expect(isCoveredPathItemRejected(covering, covering)).toBe(false);
  });

  describe("with declared types", () => {
    const operations = (...members: IrMember[]): IrDeclaration => ({
      kind: "interface",
      name: "operations",
      isExported: true,
      members,
      comments: [],
    });
    const lookup = declaredTypeLookup([
      operations(
        required("getCase", object(required("case_name", irKeyword("string")))),
        required("getSummary", object(required("summary", irKeyword("string")))),
        required("getLonger", object(required("case_name"), required("summary"))),
        required("tree", object(optional("child", operationRef("tree")))),
        required("forest", object(optional("child", operationRef("forest")))),
      ),
    ]);
    const itemOf = (name: string) => object(required("get", operationRef(name)));

    it("isCoveredPathItemRejected compares the operations that references name", () => {
      expect(isCoveredPathItemRejected(itemOf("getSummary"), itemOf("getCase"), lookup)).toBe(true);
    });

    it("isCoveredPathItemRejected with an assignable referenced operation rejects nothing", () => {
      expect(isCoveredPathItemRejected(itemOf("getLonger"), itemOf("getCase"), lookup)).toBe(false);
    });

    it("isCoveredPathItemRejected with recursive referenced types terminates without a decision", () => {
      expect(isCoveredPathItemRejected(itemOf("forest"), itemOf("tree"), lookup)).toBe(false);
    });

    it("isCoveredPathItemRejected without the lookup leaves references undecided", () => {
      expect(isCoveredPathItemRejected(itemOf("getSummary"), itemOf("getCase"))).toBe(false);
    });
  });
});
