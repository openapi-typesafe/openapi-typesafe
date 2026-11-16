import {
  defineName,
  firstToken,
  type MakeAssignmentHead,
  type MakeDefinition,
} from "./make-definitions.js";
import { logicalLineEnd } from "./make-line-text.js";
import { assignmentOf, type Line, type Reader } from "./make-line-types.js";

/**
 * The assignment lines of a Makefile: `NAME = value` with its modifiers, `undefine NAME`, and
 * `define NAME [op]`, whose value is the body up to the `endef` that closes it.
 */

const RECIPE_PREFIX = "\t";
const DEFINE = "define";
const ENDEF = "endef";
const UNDEFINE_OPERATOR = "=";

/** Read an assignment, a `define` with its body; the result is where its last line ends. */
export function readAssignment(
  reader: Reader,
  head: MakeAssignmentHead,
  line: Line,
  start: number,
): number {
  const end = line.content.end;
  if (head.kind === "define") {
    return readDefine(reader, { head, line, start });
  }
  const fields =
    head.kind === "definition"
      ? definitionFields(reader.text, head.definition)
      : {
          name: reader.text.slice(head.restStart, end).trim(),
          operator: UNDEFINE_OPERATOR,
          valueStart: end,
        };
  reader.found.assignments.push(
    assignmentOf(reader, head, { ...fields, start, valueEnd: end, targets: undefined }),
  );
  return line.end;
}

/** The name, operator and value start of a definition. */
const definitionFields = (text: string, definition: MakeDefinition) => ({
  name: text.slice(definition.nameStart, definition.nameEnd),
  operator: definition.operator,
  valueStart: definition.valueStart,
});

/** A `define` line: its head, the logical line, and where the assignment starts. */
interface DefineLine {
  readonly head: Extract<MakeAssignmentHead, { kind: "define" }>;
  readonly line: Line;
  readonly start: number;
}

/** Read a `define` line and its body, the value; the result is where its `endef` line ends. */
function readDefine(reader: Reader, { head, line, start }: DefineLine): number {
  const named = { start: head.restStart, end: line.content.end };
  const valueStart = Math.min(line.end + 1, reader.to);
  const body = defineBody(reader, valueStart);
  const { name, operator } = defineName(reader.text, named);
  const fields = { name, operator, start, valueStart, valueEnd: body.valueEnd, targets: undefined };
  reader.found.assignments.push(assignmentOf(reader, head, fields));
  if (body.endef !== undefined) {
    reader.found.hidden.push(body.endef);
  }
  return body.endef?.end ?? reader.to;
}

/**
 * Where the body of a `define` ends: before the `endef` line that closes it, counting the
 * `define` lines in it. Make does not read a tab-started line as either.
 */
function defineBody(reader: Reader, bodyStart: number) {
  const { text, to } = reader;
  let depth = 1;
  for (let start = bodyStart; start < to; ) {
    const end = logicalLineEnd(text, start, to);
    const word = text[start] === RECIPE_PREFIX ? "" : firstToken(text, { start, end });
    depth += word === DEFINE ? 1 : 0;
    if (word === ENDEF && --depth === 0) {
      return { valueEnd: start - 1, endef: { start, end } };
    }
    start = end + 1;
  }
  return { valueEnd: to, endef: undefined };
}
