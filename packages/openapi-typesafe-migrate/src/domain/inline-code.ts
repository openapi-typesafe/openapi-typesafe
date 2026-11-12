import type { ShellCommand, ShellWord } from "./shell-word-parts.js";

/**
 * Code given to an interpreter on the command line: `python3 -c '…'`, `node -e "…"`,
 * `ruby -e '…'`. The word after the option is code of that language, not a command line, so the
 * migration does not read it as commands; it reports the code when it names an old package.
 */

/** The options whose next word is code, by interpreter. */
const CODE_OPTIONS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["python", new Set(["-c"])],
  ["node", new Set(["-e", "--eval", "-p", "--print"])],
  ["bun", new Set(["-e", "--eval", "-p", "--print"])],
  ["ruby", new Set(["-e"])],
  ["perl", new Set(["-e", "-E"])],
]);
/** A versioned Python program (`python3`, `python3.12`) and the Windows launcher `py`. */
const PYTHON_RE = /^(?:python[0-9.]*|py)$/;
const PYTHON = "python";
const PATH_SEPARATOR_RE = /[/\\]/;
const WINDOWS_EXECUTABLE_RE = /\.exe$/i;
const OPTION_START = "-";

/** The interpreter of a program word: `python` of `/usr/bin/python3.12`, `node` of `node.exe`. */
function interpreterOf(word: ShellWord): string {
  const name = (word.value.split(PATH_SEPARATOR_RE).at(-1) ?? "").replace(
    WINDOWS_EXECUTABLE_RE,
    "",
  );
  return PYTHON_RE.test(name) ? PYTHON : name;
}

/** Inline code of a command: the word that holds it, and the program that runs it. */
export interface InlineCode {
  readonly code: ShellWord;
  readonly program: ShellWord;
}

/**
 * The code word after the options of the interpreter at `program`: the word after a code option
 * that comes before the first argument (`node -e '…'`, not `node a.js -e '…'`, where the option
 * goes to the script).
 */
function codeAfter(command: ShellCommand, program: number): ShellWord | undefined {
  const options = CODE_OPTIONS.get(interpreterOf(command[program] as ShellWord));
  for (let index = program + 1; options !== undefined && index < command.length; index += 1) {
    const word = command[index] as ShellWord;
    if (!word.value.startsWith(OPTION_START)) {
      return undefined;
    }
    if (options.has(word.value)) {
      return command[index + 1];
    }
  }
  return undefined;
}

/**
 * The first inline code of a command. An interpreter is found at any word, since launchers run
 * one (`npx -p x node -e '…'`, `docker run python python3 -c '…'`), and `node` is a launcher too.
 */
export function inlineCode(command: ShellCommand): InlineCode | undefined {
  for (const [index, program] of command.entries()) {
    const code = codeAfter(command, index);
    if (code !== undefined) {
      return { code, program };
    }
  }
  return undefined;
}
