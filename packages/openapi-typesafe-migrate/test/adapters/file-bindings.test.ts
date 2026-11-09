import ts from "@typescript/typescript6";
import { describe, expect, it } from "vitest";
import {
  createFileBindings,
  singleFileHost,
} from "../../src/adapters/typescript-parser/file-bindings.js";

const parse = (text: string): ts.SourceFile =>
  ts.createSourceFile("gen.ts", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

/** The identifiers of a file with this spelling, in order. */
function identifiers(file: ts.SourceFile, name: string): ts.Identifier[] {
  const found: ts.Identifier[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === name) {
      found.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe("createFileBindings", () => {
  it("createFileBindings resolves a name to the module binding only where it is in scope", () => {
    const file = parse(
      [
        'import ts from "typescript";',
        "const DATE = ts.factory.createTypeReferenceNode('Date');",
        "function f(DATE: unknown) { return DATE; }",
        "export const all = { DATE };",
      ].join("\n"),
    );
    const bindings = createFileBindings(file);
    const [declared, parameter, local, shorthand] = identifiers(file, "DATE") as ts.Identifier[];

    expect(bindings.bindingOf(declared as ts.Identifier)?.kind).toBe("constant");
    expect(bindings.bindingOf(parameter as ts.Identifier)).toBeUndefined();
    expect(bindings.bindingOf(local as ts.Identifier)).toBeUndefined();
    expect(bindings.bindingOf(shorthand as ts.Identifier)?.kind).toBe("constant");
    expect(bindings.usesOf(bindings.declarationOf(declared as ts.Identifier) as ts.Node)).toEqual([
      shorthand,
    ]);
    expect(bindings.hasGenerator).toBe(false);
  });

  it("createFileBindings knows the generator by default, named default and namespace imports", () => {
    for (const statement of [
      'import openapiTS from "openapi-typesafe";',
      'import { default as generate } from "openapi-typescript";',
      'import * as oats from "openapi-typescript";',
    ]) {
      expect(createFileBindings(parse(statement)).hasGenerator).toBe(true);
    }
    expect(createFileBindings(parse('import { NULL } from "openapi-typesafe";')).hasGenerator).toBe(
      false,
    );
  });
});

describe("singleFileHost", () => {
  it("singleFileHost serves the parsed file and nothing else", () => {
    const file = parse("const a = 1;");
    const host = singleFileHost(file);

    expect(host.getSourceFile("gen.ts", ts.ScriptTarget.Latest)).toBe(file);
    expect(host.getSourceFile("other.ts", ts.ScriptTarget.Latest)).toBeUndefined();
    expect(host.fileExists("gen.ts")).toBe(true);
    expect(host.fileExists("lib.d.ts")).toBe(false);
    expect(host.readFile("gen.ts")).toBeUndefined();
    expect(host.getDefaultLibFileName({})).toBe("lib.d.ts");
    expect(host.writeFile("x", "", false)).toBeUndefined();
    expect(host.getCurrentDirectory()).toBe("");
    expect(host.getCanonicalFileName("A.ts")).toBe("A.ts");
    expect(host.useCaseSensitiveFileNames()).toBe(true);
    expect(host.getNewLine()).toBe("\n");
  });
});
