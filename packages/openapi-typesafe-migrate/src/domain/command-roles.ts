import { INSTALLERS, LAUNCHERS, type Launcher } from "./command-launchers.js";
import { ASSIGNMENT_RE } from "./shell-assignments.js";
import type { ShellCommand, ShellWord } from "./shell-words.js";

/**
 * What the words of one shell command are: which word is the program it runs, after launchers
 * such as `npx`, `pnpm exec`, `cross-env` or `node`, and which words name packages to install.
 * The other words are arguments of whichever program owns them, and are never renamed for it.
 */

/** A word that names a package, and the package part of it (`--package=x` names `x`). */
export interface PackageWord {
  readonly word: ShellWord;
  readonly value: string;
}

export interface CommandRoles {
  /** The index of the program's word, or undefined for an install or an empty command. */
  readonly program: number | undefined;
  readonly packages: readonly PackageWord[];
}

const END_OF_OPTIONS = "--";

const isOption = (word: ShellWord): boolean => word.value.startsWith("-") && word.value.length > 1;

/** The first word after the `NAME=value` assignments that may start a command. */
function skipAssignments(words: ShellCommand, start: number): number {
  let index = start;
  while (index < words.length && ASSIGNMENT_RE.test((words[index] as ShellWord).raw)) {
    index++;
  }
  return index;
}

/** The first entry whose words start the command at `index`. */
function matchingPrefix<T extends { readonly words: readonly string[] }>(
  entries: readonly T[],
  words: ShellCommand,
  index: number,
): T | undefined {
  return entries.find((entry) =>
    entry.words.every((name, offset) => words[index + offset]?.value === name),
  );
}

/** An option with its value in the same word (`--package=x`): the package it names, if any. */
function inlineOptionPackage(word: ShellWord, launcher: Launcher): PackageWord | undefined {
  const equals = word.value.indexOf("=");
  const name = word.value.slice(0, equals);
  return launcher.packageOptions.has(name)
    ? { word, value: word.value.slice(equals + 1) }
    : undefined;
}

/**
 * The index of the program a launcher runs: the first word after its options. Options that take
 * a value skip it, and the values of package options are collected into `packages`.
 */
function launchedProgram(
  words: ShellCommand,
  start: number,
  launcher: Launcher,
  packages: PackageWord[],
): number {
  let index = start;
  while (index < words.length && isOption(words[index] as ShellWord)) {
    const option = words[index++] as ShellWord;
    if (option.value === END_OF_OPTIONS) {
      break;
    }
    const inline = option.value.includes("=") ? inlineOptionPackage(option, launcher) : undefined;
    if (inline !== undefined) {
      packages.push(inline);
    }
    const value = words[index];
    if (!option.value.includes("=") && launcher.valueOptions.has(option.value) && value) {
      if (launcher.packageOptions.has(option.value)) {
        packages.push({ word: value, value: value.value });
      }
      index++;
    }
  }
  return index;
}

/** The package arguments of an install command: every word that is not an option. */
const installArguments = (words: ShellCommand, start: number): PackageWord[] =>
  words
    .slice(start)
    .filter((word) => !isOption(word))
    .map((word) => ({ word, value: word.value }));

/** The roles of the words of one simple command. */
export function commandRoles(words: ShellCommand): CommandRoles {
  const packages: PackageWord[] = [];
  let index = skipAssignments(words, 0);
  while (index < words.length) {
    const installer = matchingPrefix(INSTALLERS, words, index);
    if (installer !== undefined) {
      packages.push(...installArguments(words, index + installer.words.length));
      return { program: undefined, packages };
    }
    const launcher = matchingPrefix(LAUNCHERS, words, index);
    if (launcher === undefined) {
      return { program: index, packages };
    }
    const start = index + launcher.words.length;
    const afterOptions = launchedProgram(words, start, launcher, packages);
    index = skipAssignments(words, afterOptions + launcher.operands);
  }
  return { program: undefined, packages };
}
