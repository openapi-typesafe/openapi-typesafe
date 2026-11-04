import { describe, expect, it } from "vitest";
import { isCoveredPathItemRejected } from "../../src/application/transform/document/path-item-conflicts.js";
import { irKeyword, irObject, irProperty, irRaw } from "../../src/domain/ir/constructors.js";
import type { IrMember, IrType } from "../../src/domain/ir/nodes.js";
import { toPropertyName } from "../../src/domain/ir/property-name.js";

/** Which covered path item types the checker surely rejects for a signature (roadmap R10.2). */

const OPERATION = irRaw('operations["app"]');
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

  it("isCoveredPathItemRejected reads quoted and numeric property names", () => {
    const covering = object(required("x-y"), required("200"));

    expect(isCoveredPathItemRejected(object(required("x-y")), covering)).toBe(true);
    expect(isCoveredPathItemRejected(object(required("x-z"), required("200")), covering)).toBe(
      true,
    );
    expect(isCoveredPathItemRejected(covering, covering)).toBe(false);
  });
});
