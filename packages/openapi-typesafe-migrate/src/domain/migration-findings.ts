/**
 * What a migration found in one file: changes it made, and steps it leaves to the user. Both are
 * closed sets of facts, not text; the report turns them into messages (application/report.ts).
 * They go to the report and the log, so a version spec in them has its URL credentials hidden
 * (domain/url-credentials.ts).
 */

/** A place in a text, 1-based. */
export interface TextPosition {
  readonly line: number;
  readonly column: number;
}

export type Change =
  | {
      readonly kind: "dependency-renamed";
      readonly field: string;
      readonly from: string;
      readonly to: string;
      readonly spec: string;
    }
  | {
      readonly kind: "catalog-entry-renamed";
      readonly catalog: string;
      readonly from: string;
      readonly to: string;
      readonly spec: string;
    }
  | {
      readonly kind: "import-renamed";
      readonly field: string;
      readonly from: string;
      readonly to: string;
      readonly target: string;
    }
  | {
      readonly kind: "alias-renamed";
      readonly field: string;
      readonly name: string;
      readonly spec: string;
    }
  | { readonly kind: "command-renamed"; readonly location: string }
  | {
      readonly kind: "package-name-renamed";
      readonly location: string;
      readonly from: string;
      readonly to: string;
    }
  | {
      readonly kind: "flag-renamed";
      readonly location: string;
      readonly from: string;
      readonly to: string;
    }
  | {
      readonly kind: "specifier-renamed";
      readonly line: number;
      readonly from: string;
      readonly to: string;
    }
  | { readonly kind: "transform-rewritten"; readonly line: number }
  | { readonly kind: "declaration-removed"; readonly line: number; readonly name: string };

export type ManualStep =
  | { readonly kind: "entry-not-edited"; readonly field: string; readonly name: string }
  | {
      readonly kind: "name-collision";
      readonly field: string;
      readonly from: string;
      readonly to: string;
    }
  | { readonly kind: "peer-dependency-renamed"; readonly name: string }
  | { readonly kind: "spec-kept"; readonly name: string; readonly spec: string }
  | { readonly kind: "override-names-package"; readonly field: string; readonly name: string }
  | { readonly kind: "versioned-command"; readonly location: string }
  | { readonly kind: "pinned-package"; readonly location: string; readonly name: string }
  | { readonly kind: "old-package-file"; readonly location: string; readonly path: string }
  | { readonly kind: "command-string"; readonly line: number; readonly to: string }
  | { readonly kind: "config-unreadable"; readonly position: TextPosition | undefined }
  | { readonly kind: "options-not-inspected"; readonly line: number }
  | { readonly kind: "deep-import"; readonly line: number; readonly specifier: string }
  | {
      readonly kind: "string-names-package";
      readonly line: number;
      readonly value: string;
      readonly to: string;
    }
  | {
      readonly kind: "old-peer-needed";
      readonly dependent: string;
      readonly peer: string;
      readonly range: string;
    }
  | {
      readonly kind: "transform-not-rewritten";
      readonly line: number;
      readonly reason: TransformKeepReason;
    }
  | { readonly kind: "legacy-callback"; readonly line: number; readonly callback: string };

/** Why a `transform` callback was left as it is. */
export type TransformKeepReason =
  | "other-callbacks"
  | "not-a-function"
  | "shared-function"
  | "shared-options"
  | "unknown-return";

/** A file's new text and what was found in it. Unchanged text means nothing to write. */
export interface FileMigration {
  readonly text: string;
  readonly changes: readonly Change[];
  readonly manualSteps: readonly ManualStep[];
}

/** The result for a file that the migration does not touch. */
export function unchanged(text: string): FileMigration {
  return { text, changes: [], manualSteps: [] };
}

/** Line number (1-based) of a character offset. */
export function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let index = text.indexOf("\n"); index !== -1 && index < offset; ) {
    line++;
    index = text.indexOf("\n", index + 1);
  }
  return line;
}

/** Column number (1-based) of a character offset. */
export function columnAt(text: string, offset: number): number {
  return offset - text.lastIndexOf("\n", offset - 1);
}
