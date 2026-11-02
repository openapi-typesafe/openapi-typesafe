import { ERROR_CODES, OpenAPITypesafeError } from "../../../domain/errors.js";
import type { IrComment, IrEnumDeclaration } from "../../../domain/ir/nodes.js";

const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z_$0-9]*$/;
/** A run of invalid characters and the character after it, which starts the next word. */
const INVALID_RUN_THEN_CHARACTER_RE = /[^A-Za-z_$0-9]+(.)?/g;
const INVALID_RUN_RE = /[^A-Za-z_$0-9]+/;
const INVALID_RUNS_RE = /[^A-Za-z_$0-9]+/g;
const INVALID_CHARACTER_RE = /[^A-Za-z_$0-9]/;
/** Invalid character runs with a readable replacement; any other run becomes `_`. */
const SPECIAL_CHARACTERS: ReadonlyMap<string, string> = new Map([["+", "Plus"]]);
const NUMBER_PREFIX = "Value";
const NEGATIVE_PREFIX = "ValueMinus";

export class EmptyEnumNameError extends OpenAPITypesafeError {
  constructor(name: string) {
    super({
      code: ERROR_CODES.ENUM_NAME_EMPTY,
      message: `Cannot build an enum or enum values name from "${name}": no valid characters`,
      details: { name },
    });
    this.name = "EmptyEnumNameError";
  }
}

/** Metadata of one enum member (`x-enum-varnames`, `x-enum-descriptions`). */
export interface EnumMemberNaming {
  readonly name?: string | undefined;
  readonly description?: string | null | undefined;
}

/**
 * Names of `--enum` declarations, their members and `--enum-values` arrays, as the original
 * builds them. One instance per run.
 *
 * The original checks the character after an invalid run with a global regex and `.test()`,
 * which keeps `lastIndex`: after a check that finds an invalid character, the next check fails,
 * and a later member name with invalid characters resets it. `isNextCheckSkipped` keeps that
 * behavior within a run (research/legacy-bugs.md, item 2; fixed in Phase 7).
 */
export class EnumNaming {
  private isNextCheckSkipped = false;

  /** `my-status` → `MyStatus`. */
  enumName(name: string): string {
    const sanitized = this.sanitize(name);
    return `${firstCharacter(sanitized, name).toUpperCase()}${sanitized.substring(1)}`;
  }

  /** `MyStatusValues` → `myStatusValues`. */
  arrayName(name: string): string {
    const sanitized = this.sanitize(name);
    return `${firstCharacter(sanitized, name).toLowerCase()}${sanitized.substring(1)}`;
  }

  /** A member name: a valid identifier, a rewritten one, or a quoted name. */
  memberName(value: string | number, metadata: EnumMemberNaming = {}): string {
    const name = metadata.name ?? String(value);
    if (IDENTIFIER_RE.test(name)) {
      return name;
    }
    // The original runs a global `match` here, which resets the regex state.
    this.isNextCheckSkipped = false;
    const prefixed = prefixedMemberName(name);
    const invalidRun = INVALID_RUN_RE.exec(prefixed);
    if (!invalidRun) {
      return prefixed;
    }
    return invalidRun[0] === prefixed
      ? `"${prefixed}"`
      : prefixed.replace(INVALID_RUNS_RE, (run) => SPECIAL_CHARACTERS.get(run) ?? "_");
  }

  private sanitize(name: string): string {
    const sanitized = name.replace(INVALID_RUN_THEN_CHARACTER_RE, (run) => {
      const next = run.charAt(run.length - 1);
      return this.isInvalid(next) ? "" : next.toUpperCase();
    });
    // The original prefixes the unsanitized name.
    return Number(name[0]) >= 0 ? `${NUMBER_PREFIX}${name}` : sanitized;
  }

  private isInvalid(character: string): boolean {
    if (this.isNextCheckSkipped) {
      this.isNextCheckSkipped = false;
      return false;
    }
    this.isNextCheckSkipped = INVALID_CHARACTER_RE.test(character);
    return this.isNextCheckSkipped;
  }
}

function firstCharacter(sanitized: string, name: string): string {
  const first = sanitized[0];
  if (first === undefined) {
    throw new EmptyEnumNameError(name);
  }
  return first;
}

function prefixedMemberName(name: string): string {
  if (Number(name[0]) >= 0) {
    // Only the first dot: `1.5` → `Value1_5`.
    return `${NUMBER_PREFIX}${name}`.replace(".", "_");
  }
  return name[0] === "-" ? `${NEGATIVE_PREFIX}${name.slice(1)}` : name;
}

/** The member comment: the trimmed description as a line comment, as in the original. */
function enumMemberComments(metadata: EnumMemberNaming = {}): IrComment[] {
  const description = metadata.description?.trim();
  return description ? [{ kind: "line", text: ` ${description}` }] : [];
}

/** The members of an enum, by value, with optional metadata at the same index. */
export interface EnumMembers {
  readonly values: readonly (string | number)[];
  readonly metadata: readonly (EnumMemberNaming | undefined)[];
}

/** An exported enum with an already built `name`; member names advance the naming state. */
export function enumDeclaration(
  name: string,
  members: EnumMembers,
  naming: EnumNaming,
): IrEnumDeclaration {
  return {
    kind: "enum",
    name,
    isExported: true,
    members: members.values.map((value, index) => {
      const metadata = members.metadata[index];
      return {
        name: naming.memberName(value, metadata),
        value,
        comments: enumMemberComments(metadata),
      };
    }),
    comments: [],
  };
}
