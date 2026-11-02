import type ts from "typescript";

/** The TypeScript module, passed in so that tests and the CLI share one compiler. */
export type TypeScriptModule = typeof ts;

/**
 * The size rules (ENGINEERING_PLAN §5.3) that Biome cannot check: line length and nesting depth.
 * Biome checks function length, parameter count and file length (see biome.json).
 */
export interface SizeLimits {
  readonly maxLineLength: number;
  readonly maxNestingDepth: number;
}

export const SIZE_LIMITS: SizeLimits = { maxLineLength: 100, maxNestingDepth: 3 };

export interface SizeViolation {
  readonly line: number;
  readonly message: string;
}

export interface SourceFile {
  readonly fileName: string;
  readonly text: string;
}

/** Lines longer than the limit, counted in UTF-16 code units like the formatter's line width. */
export function findLongLines(text: string, maxLineLength: number): SizeViolation[] {
  return text.split(/\r?\n/).flatMap((line, index) =>
    line.length > maxLineLength
      ? [
          {
            line: index + 1,
            message: `line has ${line.length} characters (max ${maxLineLength})`,
          },
        ]
      : [],
  );
}

function isNestingStatement(ts: TypeScriptModule, node: ts.Node): boolean {
  return (
    ts.isIfStatement(node) ||
    ts.isIterationStatement(node, false) ||
    ts.isSwitchStatement(node) ||
    ts.isTryStatement(node) ||
    ts.isWithStatement(node)
  );
}

/** `else if` continues the chain of its parent `if`, so it does not add a level. */
function isElseIf(ts: TypeScriptModule, node: ts.Node): boolean {
  return (
    ts.isIfStatement(node) && ts.isIfStatement(node.parent) && node.parent.elseStatement === node
  );
}

function nestingDepthOf(ts: TypeScriptModule, node: ts.Node, depth: number): number {
  if (ts.isFunctionLike(node) || ts.isClassLike(node)) {
    return 0;
  }
  return isNestingStatement(ts, node) && !isElseIf(ts, node) ? depth + 1 : depth;
}

/**
 * Statements nested deeper than the limit. A nested function starts again at depth 0, because
 * its body is a separate unit that can be read on its own.
 */
export function findDeepNesting(
  ts: TypeScriptModule,
  file: SourceFile,
  maxNestingDepth: number,
): SizeViolation[] {
  const source = ts.createSourceFile(file.fileName, file.text, ts.ScriptTarget.Latest, true);
  const violations: SizeViolation[] = [];
  const visit = (node: ts.Node, parentDepth: number): void => {
    const depth = nestingDepthOf(ts, node, parentDepth);
    if (depth > maxNestingDepth && depth > parentDepth) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      violations.push({
        line: line + 1,
        message: `nesting depth ${depth} (max ${maxNestingDepth})`,
      });
    }
    ts.forEachChild(node, (child) => visit(child, depth));
  };
  visit(source, 0);
  return violations;
}

/** Every line-length and nesting violation in one file, ordered by line. */
export function findSizeViolations(
  ts: TypeScriptModule,
  file: SourceFile,
  limits: SizeLimits,
): SizeViolation[] {
  return [
    ...findLongLines(file.text, limits.maxLineLength),
    ...findDeepNesting(ts, file, limits.maxNestingDepth),
  ].sort((left, right) => left.line - right.line);
}
