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
  | {
      readonly kind: "catalog-reference-kept";
      readonly field: string;
      readonly name: string;
      readonly catalog: string;
    }
  | {
      readonly kind: "catalog-entry-outside";
      readonly field: string;
      readonly name: string;
      readonly catalog: string;
    }
  /** A dependency on a catalog entry that no catalog of the workspace has. */
  | {
      readonly kind: "catalog-entry-missing";
      readonly field: string;
      readonly name: string;
      readonly catalog: string;
    }
  | { readonly kind: "catalog-entry-in-use"; readonly catalog: string; readonly name: string }
  | { readonly kind: "peer-dependency-renamed"; readonly name: string }
  | { readonly kind: "spec-kept"; readonly name: string; readonly spec: string }
  /** A dependency under an original name whose spec points at a local package. */
  | {
      readonly kind: "local-package";
      readonly field: string;
      readonly name: string;
      readonly spec: string;
    }
  | { readonly kind: "override-names-package"; readonly field: string; readonly name: string }
  /** A pattern of a config (Jest's `moduleNameMapper`) that names an old package. */
  | {
      readonly kind: "pattern-names-package";
      readonly location: string;
      readonly value: string;
      readonly name: string;
      readonly to: string;
    }
  /** A package manager setting (not an override) that names an old package. */
  | { readonly kind: "setting-names-package"; readonly field: string; readonly name: string }
  | { readonly kind: "versioned-command"; readonly location: string }
  | {
      readonly kind: "flags-in-variable";
      readonly location: string;
      readonly variable: string;
      /** The old flags in the variable's value. */
      readonly flags: readonly string[];
    }
  | {
      readonly kind: "variable-not-only-generator";
      readonly location: string;
      readonly variable: string;
      /** The old flags of the generator after the variable, or in a variable's value there. */
      readonly flags: readonly string[];
    }
  | { readonly kind: "pinned-package"; readonly location: string; readonly name: string }
  | { readonly kind: "old-package-file"; readonly location: string; readonly path: string }
  | { readonly kind: "old-name-in-command"; readonly location: string; readonly word: string }
  /** A CI step whose `shell` is a program the tool does not read (`shell: python`). */
  | { readonly kind: "script-not-shell"; readonly location: string; readonly shell: string }
  | { readonly kind: "command-string"; readonly line: number; readonly to: string }
  | { readonly kind: "config-unreadable"; readonly position: TextPosition | undefined }
  | { readonly kind: "manifest-not-read" }
  /** A patch file (patch-package, pnpm, Yarn) of an old package's code. */
  | { readonly kind: "old-package-patch"; readonly name: string; readonly to: string }
  /** A Deno config names an import map by a URL or a path outside the project. */
  | { readonly kind: "import-map-not-editable"; readonly reference: string }
  | { readonly kind: "options-not-inspected"; readonly line: number }
  | { readonly kind: "deep-import"; readonly line: number; readonly specifier: string }
  /** A module specifier that is a path into the installed files of an old package. */
  | {
      readonly kind: "old-package-import";
      readonly line: number;
      readonly specifier: string;
      readonly name: string;
      readonly to: string;
    }
  /** A specifier of a config (`imports`, `browser`) that reaches into a renamed package. */
  | { readonly kind: "deep-target"; readonly location: string; readonly specifier: string }
  /** A config path into the installed files of an old package, which the new one does not have. */
  | {
      readonly kind: "old-package-path";
      readonly location: string;
      readonly path: string;
      readonly to: string;
    }
  | {
      readonly kind: "dynamic-specifier";
      readonly line: number;
      readonly value: string;
      /** The new name of the package the specifier starts with. */
      readonly to: string;
    }
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
  | { readonly kind: "legacy-callback"; readonly line: number; readonly callback: string }
  | {
      readonly kind: "package-not-declared";
      readonly line: number;
      readonly name: string;
      /** The original packages that installed it as their own dependency. */
      readonly installers: readonly string[];
    };

/** Why a `transform` callback was left as it is. */
export type TransformKeepReason =
  | "other-callbacks"
  | "not-a-function"
  | "shared-function"
  | "shared-options"
  | "unknown-return"
  | "typed-options"
  | "spread-options"
  | "declared-type";

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

/**
 * Line numbers (1-based) of character offsets in `text`, for a migration that names many places
 * of one text. The line starts are found once and searched by halves, so naming every command of
 * a large file stays linear in its size (`lineAt` for each one was quadratic: 57 s on 4 MB).
 */
export function lineLocator(text: string): (offset: number) => number {
  const lineStarts = [0];
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) {
    lineStarts.push(index + 1);
  }
  return (offset) => {
    // The last line start at or before `offset`; a break at `offset` itself ends that line.
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((lineStarts[middle] as number) <= offset) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return low + 1;
  };
}

/** Column number (1-based) of a character offset. */
export function columnAt(text: string, offset: number): number {
  return offset - text.lastIndexOf("\n", offset - 1);
}
