import { windowsSuffix } from "./command-roles.js";
import type { ShellWord } from "./shell-words.js";

/** A program word as a path, and its Windows suffix (`.cmd`), or "" for none. */
export interface ProgramPath {
  readonly path: string;
  readonly suffix: string;
}

const PATH_SEPARATOR = "/";
const WINDOWS_SEPARATOR_RE = /\\/g;
const QUOTE_RE = /["']/g;

/**
 * The path of a program word. A program with a Windows suffix runs in cmd.exe or PowerShell,
 * where `\` separates folders instead of escaping the next character, so its path is the word
 * as written, with `/` for each `\` (`node_modules\.bin\openapi-typescript.cmd`).
 */
export function programPath(word: ShellWord): ProgramPath {
  const suffix = windowsSuffix(word.value);
  const windowsPath = word.raw.replace(QUOTE_RE, "").replace(WINDOWS_SEPARATOR_RE, PATH_SEPARATOR);
  return { path: suffix === "" ? word.value : windowsPath, suffix };
}
