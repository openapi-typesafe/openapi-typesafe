import { allLines, type MakefileText } from "./make-file-lines.js";
import {
  type MakeAssignment,
  type MakeConditional,
  type MakeInclude,
  readMakeLinesInRule,
} from "./make-lines.js";
import { makeTargets } from "./make-rules.js";
import { referencedNames, type ValueText, valueTextsOf } from "./make-value-texts.js";
import type { MakeFile } from "./make-values.js";

/**
 * The values of the variables where make reads each `include` line of a Makefile. The joined
 * text grows as the includes are put in (make-includes.ts), so the reader reads each new part of
 * it once: a part starts at an include line, where a line starts, in the rule the part before
 * ends in (an include that names no file leaves the rule open, as make does), so the lines of
 * the text before an include are the lines read so far and the lines of the new part. A variable's
 * values are read from its own assignments and those of the variables they reference, with all
 * conditionals and unread includes, which is what make-values.ts gives that variable; reading
 * every variable again at each include would take time that grows with the square of the file.
 * Text that `$(eval …)` reads may set any variable, so a text with an eval call is read whole.
 */

/** The values where make reads a line, given the text before it; they hold until the next call. */
export type IncludeValues = (source: MakefileText) => ValueText;

/** A call of make's eval function. */
const EVAL_CALL_RE = /\$[({]eval[\s)}]/;
const NO_TARGETS = makeTargets([]);

/** The lines read so far of the growing text. */
interface ReadSoFar {
  upTo: number;
  isInRule: boolean;
  hasEval: boolean;
  /** The assignments of each name, in order. */
  readonly byName: Map<string, MakeAssignment[]>;
  readonly lines: { readonly conditionals: MakeConditional[]; readonly includes: MakeInclude[] };
}

/** The names that `name` needs: it, and every name its assignments reference, however deep. */
function neededNames(name: string, read: ReadSoFar, text: string): ReadonlySet<string> {
  const needed = new Set([name]);
  for (const current of needed) {
    for (const assignment of read.byName.get(current) ?? []) {
      const value = text.slice(assignment.valueStart, assignment.valueEnd);
      for (const referenced of referencedNames(value)) {
        needed.add(referenced);
      }
    }
  }
  return needed;
}

/** The values of `name` and of the names it needs, read from the lines read so far. */
function neededValues(name: string, read: ReadSoFar, text: string): string | undefined {
  const needed = neededNames(name, read, text);
  const file: MakeFile = {
    assignments: [...needed].flatMap((one) => read.byName.get(one) ?? []),
    conditionals: read.lines.conditionals,
    unreadIncludes: read.lines.includes,
    targets: NO_TARGETS,
  };
  return valueTextsOf(text, file)(name);
}

/** Add assignments to the lists of their names. */
function addByName(found: Map<string, MakeAssignment[]>, assignments: readonly MakeAssignment[]) {
  for (const assignment of assignments) {
    const ofName = found.get(assignment.name) ?? [];
    ofName.push(assignment);
    found.set(assignment.name, ofName);
  }
  return found;
}

/** Add the lines of the text from where the reader stopped. */
function readNewPart(read: ReadSoFar, { text, fileStarts }: MakefileText): void {
  const options = { from: read.upTo, fileStarts, startsInRule: read.isInRule };
  const { lines, endsInRule } = readMakeLinesInRule(text, options);
  read.isInRule = endsInRule;
  read.hasEval ||= EVAL_CALL_RE.test(text.slice(read.upTo));
  addByName(read.byName, lines.assignments);
  read.lines.conditionals.push(...lines.conditionals);
  read.lines.includes.push(...lines.includes);
  read.upTo = text.length;
}

/** A reader of the values at each include line of one joined text, in order. */
export function includeValues(): IncludeValues {
  const read: ReadSoFar = {
    upTo: 0,
    isInRule: false,
    hasEval: false,
    byName: new Map(),
    lines: { conditionals: [], includes: [] },
  };
  return (source) => {
    readNewPart(read, source);
    const { text } = source;
    if (read.hasEval) {
      const { lines } = allLines(source);
      const whole = {
        ...read,
        byName: addByName(new Map(), lines.assignments),
        lines,
      };
      return (name) => neededValues(name, whole, text);
    }
    return (name) => neededValues(name, read, text);
  };
}
