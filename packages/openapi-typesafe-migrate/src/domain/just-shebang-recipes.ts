import type { RecipeHeader } from "./just-recipe-parameters.js";
import { isCommandLineShell } from "./step-shells.js";

/**
 * A justfile recipe whose body starts with a shebang (`#!/usr/bin/env python3`) is a script for
 * that program: just writes the body to a file and runs it. A body for a program other than a
 * shell is code of that language, so the migration does not read it as commands.
 */

/** The body of a recipe that another program runs, and that program as its shebang names it. */
export interface ShebangRecipe {
  readonly start: number;
  readonly end: number;
  /** The offset of the shebang, after the blank lines that may start the body. */
  readonly shebang: number;
  readonly shell: string;
}

const LINE_BREAK = "\n";
const SHEBANG = "#!";
/** A line of a recipe body: indented, or blank inside the body. */
const BODY_LINE_RE = /^(?:[ \t][^\n]*|[ \t]*\r?)$/;

/** The offset after the line break that ends the line at `offset`, or the end of the text. */
function nextLineStart(text: string, offset: number): number {
  const lineBreak = text.indexOf(LINE_BREAK, offset);
  return lineBreak === -1 ? text.length : lineBreak + 1;
}

/** The end of the body that starts at `start`: before the first line that is not a body line. */
function bodyEnd(text: string, start: number): number {
  let end = start;
  while (end < text.length) {
    const lineEnd = nextLineStart(text, end);
    if (!BODY_LINE_RE.test(text.slice(end, lineEnd).replace(LINE_BREAK, ""))) {
      break;
    }
    end = lineEnd;
  }
  return end;
}

/** The body of the recipe of a header, when its first line is a shebang for another program. */
function shebangRecipe(text: string, header: RecipeHeader): ShebangRecipe[] {
  const start = nextLineStart(text, header.end);
  const end = bodyEnd(text, start);
  const firstLine = text
    .slice(start, end)
    .split(LINE_BREAK)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (firstLine === undefined || !firstLine.startsWith(SHEBANG)) {
    return [];
  }
  const shell = firstLine.slice(SHEBANG.length).trim();
  const shebang = text.indexOf(SHEBANG, start);
  return isCommandLineShell(shell) ? [] : [{ start, end, shebang, shell }];
}

/** The recipes of a justfile that a program other than a shell runs. */
export const shebangRecipes = (text: string, headers: readonly RecipeHeader[]): ShebangRecipe[] =>
  headers.flatMap((header) => shebangRecipe(text, header));
