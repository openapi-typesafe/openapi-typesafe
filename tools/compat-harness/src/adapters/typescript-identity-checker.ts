import ts from "typescript";
import type { TypeDifferences, TypeIdentityChecker } from "../application/ports.ts";
import { HarnessError, HarnessErrorCode } from "../domain/errors.ts";

/** Exported declarations of one generated file, split by how they can be compared. */
interface ExportedDeclarations {
  /** Non-generic interfaces and type aliases: compared with the strict identity check. */
  readonly structural: ReadonlyMap<string, string>;
  /**
   * Enums (nominal, so two declarations are never identical) and generic types (a type parameter
   * cannot be passed to the check without arguments): compared by their printed declaration text
   * instead.
   */
  readonly textual: ReadonlyMap<string, string>;
}

const CHECK_FILE_NAME = "/__compat_harness__/type-identity-check.ts";

/**
 * Strict identity (ENGINEERING_PLAN 2.4): unlike mutual assignability it tells `readonly` apart and
 * does not treat `any` as equal to everything.
 */
const CHECK_PRELUDE = [
  "type __Identical<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)" +
    " ? true : false;",
  "type __Expect<T extends true> = T;",
];

const COMPILER_OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  allowImportingTsExtensions: true,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  target: ts.ScriptTarget.ES2022,
  types: [],
};

const printer = ts.createPrinter({ removeComments: true });

function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function readExportedDeclarations(path: string, text: string): ExportedDeclarations {
  const sourceFile = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.ES2022,
    false,
    ts.ScriptKind.TS,
  );
  const structural = new Map<string, string>();
  const textual = new Map<string, string>();
  for (const statement of sourceFile.statements) {
    const isTypeDeclaration =
      ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement);
    if (!isExported(statement) || !(isTypeDeclaration || ts.isEnumDeclaration(statement))) {
      continue;
    }
    const printed = printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile);
    const isGeneric = isTypeDeclaration && (statement.typeParameters?.length ?? 0) > 0;
    (isTypeDeclaration && !isGeneric ? structural : textual).set(statement.name.text, printed);
  }
  return { structural, textual };
}

/** Names whose identity check failed, read from the line of each diagnostic in the check file. */
function failedCheckNames(
  program: ts.Program,
  checkFile: ts.SourceFile,
  names: readonly string[],
): Set<string> {
  const failed = new Set<string>();
  for (const diagnostic of program.getSemanticDiagnostics(checkFile)) {
    if (diagnostic.start === undefined) {
      continue;
    }
    const line =
      checkFile.getLineAndCharacterOfPosition(diagnostic.start).line - CHECK_PRELUDE.length - 2;
    const name = names[line];
    if (name !== undefined) {
      failed.add(name);
    }
  }
  return failed;
}

function checkStructuralIdentity(
  goldenPath: string,
  candidatePath: string,
  names: readonly string[],
): Set<string> {
  if (names.length === 0) {
    return new Set();
  }
  const checkText = [
    `import type * as __Golden from ${JSON.stringify(goldenPath)};`,
    `import type * as __Candidate from ${JSON.stringify(candidatePath)};`,
    ...CHECK_PRELUDE,
    ...names.map(
      (name, index) =>
        `type __Check${index} = __Expect<__Identical<__Golden.${name}, __Candidate.${name}>>;`,
    ),
  ].join("\n");
  const host = ts.createCompilerHost(COMPILER_OPTIONS);
  const checkFile = ts.createSourceFile(CHECK_FILE_NAME, checkText, ts.ScriptTarget.ES2022, true);
  const readSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, ...rest) =>
    fileName === CHECK_FILE_NAME ? checkFile : readSourceFile(fileName, ...rest);
  const program = ts.createProgram([CHECK_FILE_NAME], COMPILER_OPTIONS, host);
  return failedCheckNames(program, checkFile, names);
}

function differentTextualNames(
  golden: ReadonlyMap<string, string>,
  candidate: ReadonlyMap<string, string>,
): string[] {
  return [...golden]
    .filter(([name, printed]) => candidate.get(name) !== printed)
    .map(([name]) => name);
}

function readExistingFile(path: string): string {
  const text = ts.sys.readFile(path);
  if (text === undefined) {
    throw new HarnessError(HarnessErrorCode.StoredFileInvalid, `Generated file not found: ${path}`);
  }
  return text;
}

/**
 * TypeIdentityChecker over the TypeScript compiler API. Exported names present in only one file
 * count as different. Diagnostics inside the generated files themselves are ignored: only the check
 * file is inspected.
 */
export class TypeScriptIdentityChecker implements TypeIdentityChecker {
  readonly #readText: (path: string) => string;

  constructor(readText: (path: string) => string = readExistingFile) {
    this.#readText = readText;
  }

  async findDifferentTypes(goldenPath: string, candidatePath: string): Promise<TypeDifferences> {
    const golden = readExportedDeclarations(goldenPath, this.#readText(goldenPath));
    const candidate = readExportedDeclarations(candidatePath, this.#readText(candidatePath));
    const goldenNames = new Set([...golden.structural.keys(), ...golden.textual.keys()]);
    const candidateNames = new Set([...candidate.structural.keys(), ...candidate.textual.keys()]);
    const shared = [...golden.structural.keys()].filter((name) => candidate.structural.has(name));
    const different = new Set([
      ...[...goldenNames].filter((name) => !candidateNames.has(name)),
      // Both directions, so a name that is generic in one file and not in the other is caught.
      ...differentTextualNames(golden.textual, candidate.textual),
      ...differentTextualNames(candidate.textual, golden.textual),
      ...checkStructuralIdentity(goldenPath, candidatePath, shared),
    ]);
    const added = [...candidateNames].filter((name) => !goldenNames.has(name));
    return {
      changed: [...different].filter((name) => goldenNames.has(name)).sort(),
      added: added.sort(),
    };
  }
}
