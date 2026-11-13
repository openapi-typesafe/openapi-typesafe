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
 * A `\` between two path segments and no `/` (`node_modules\.bin\openapi-typescript`): a path
 * of cmd.exe, which finds the `.cmd` of a bin by itself. A POSIX shell would read each `\` as an
 * escape and run a program that does not exist. A `\` at the start of a word
 * (`\openapi-typescript`, which skips an alias) or before a blank escapes a character, as the
 * shell reads it.
 */
const WINDOWS_PATH_RE = /^[^/]*[^\\/\s]\\[^\\/\s][^/]*$/;

/**
 * The path of a program word. A program with a Windows suffix runs in cmd.exe or PowerShell,
 * where `\` separates folders instead of escaping the next character, so its path is the word
 * as written, with `/` for each `\` (`node_modules\.bin\openapi-typescript.cmd`); so is a word
 * written as a Windows path without a suffix.
 */
export function programPath(word: ShellWord): ProgramPath {
  const suffix = windowsSuffix(word.value);
  const written = word.raw.replace(QUOTE_RE, "");
  const isWindowsPath = suffix !== "" || WINDOWS_PATH_RE.test(written);
  const windowsPath = written.replace(WINDOWS_SEPARATOR_RE, PATH_SEPARATOR);
  return { path: isWindowsPath ? windowsPath : word.value, suffix };
}
