import { describe, expect, it } from "vitest";
import {
  documentBody,
  documentClosing,
} from "../../../../src/application/transform/document/document.js";
import type { IrDeclaration } from "../../../../src/domain/ir/nodes.js";
import { fakeTransformContext } from "../../../fakes/transform-context.js";

const PATHS = { "/items": { get: {} } };

function summary(declarations: readonly IrDeclaration[]): string[] {
  return declarations.map((declaration) =>
    declaration.kind === "rawDeclaration"
      ? `raw:${declaration.text.trim().slice(0, 13)}`
      : `${declaration.kind}:${declaration.name}`,
  );
}

describe("documentBody", () => {
  it("documentBody without roots has an empty alias per root", () => {
    const { context, diagnostics } = fakeTransformContext();

    const declarations = documentBody({}, context);

    expect(summary(declarations)).toEqual([
      "typeAlias:paths",
      "typeAlias:webhooks",
      "typeAlias:components",
      "typeAlias:$defs",
    ]);
    expect(diagnostics.messages[0]).toEqual({ message: "paths done (skipped)", durationMs: 0 });
  });

  it("documentBody starts with the read-write helpers and the injected code", () => {
    const options = { readWriteMarkers: true, inject: "type A = 1;" };
    const { context } = fakeTransformContext({ options });

    const declarations = documentBody({}, context);

    expect(summary(declarations).slice(0, 2)).toEqual(["raw:export type $", "raw:type A = 1;"]);
  });

  it("documentBody writes a root with members as an interface, timed", () => {
    const { context, diagnostics } = fakeTransformContext();

    const [paths] = documentBody({ paths: PATHS }, context);

    expect(paths).toMatchObject({ kind: "interface", name: "paths", isExported: true });
    expect(diagnostics.messages).toContainEqual(expect.objectContaining({ message: "paths done" }));
  });

  it("documentBody with --export-type writes a root as a type alias", () => {
    const { context } = fakeTransformContext({ options: { exportType: true } });

    const [paths] = documentBody({ paths: PATHS }, context);

    expect(paths).toMatchObject({ kind: "typeAlias", name: "paths" });
    expect(paths).toHaveProperty("type.kind", "object");
  });

  it("documentBody keeps an empty alias for a root whose type is not an object", () => {
    const { context } = fakeTransformContext();

    const declarations = documentBody({ $defs: { type: "string" } }, context);

    expect(declarations[3]).toMatchObject({ kind: "typeAlias", name: "$defs" });
    expect(declarations[3]).toHaveProperty("type.name", "Record");
  });

  it("documentBody follows the components type with its root type aliases", () => {
    const { context } = fakeTransformContext({ options: { rootTypes: true } });

    const declarations = documentBody({ components: { schemas: { Pet: {} } } }, context);

    expect(summary(declarations).slice(2)).toEqual([
      "interface:components",
      "typeAlias:SchemaPet",
      "typeAlias:$defs",
    ]);
  });

  it("documentBody keeps an empty alias for a root object without members", () => {
    const { context } = fakeTransformContext();

    const declarations = documentBody({ webhooks: {} }, context);

    expect(declarations[1]).toHaveProperty("type.name", "Record");
  });
});

describe("documentClosing", () => {
  it("documentClosing adds an empty operations type when the footer has none", () => {
    const { context } = fakeTransformContext();

    expect(summary(documentClosing({}, context, false))).toEqual(["typeAlias:operations"]);
    expect(documentClosing({}, context, true)).toEqual([]);
  });

  it("documentClosing with --make-paths-enum adds the ApiPaths enum", () => {
    const { context } = fakeTransformContext({ options: { makePathsEnum: true } });

    const declarations = documentClosing({ paths: PATHS }, context, true);

    expect(summary(declarations)).toEqual(["enum:ApiPaths"]);
  });
});
